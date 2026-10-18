import pytest
import uuid
from decimal import Decimal
from datetime import datetime, timedelta
from sqlalchemy import select

from app.modules.organizations.models import Branch
from app.modules.auth.models import User
from app.modules.medicines.models import Medicine, MedicineBatch
from app.modules.sales.schemas import SaleCreate, SaleItemCreate
from app.modules.sales.service import create_sale, return_sale
from app.modules.cash_sessions.models import CashSession, CashMovement
from app.modules.cash_sessions.schemas import (
    CashSessionOpen,
    CashSessionClose,
    CashMovementCreate
)
from app.modules.cash_sessions.router import (
    open_session,
    add_cash_movement,
    get_session_summary,
    close_session
)

@pytest.mark.asyncio
async def test_cash_session_lifecycle_and_variance(test_db):
    # 1. Setup Branch, Cashier, and Medicine
    branch = Branch(name="Main Pharmacy", code="MAIN-1")
    cashier = User(email="cashier_cs@pharmacy.com", password_hash="hash", full_name="Cashier Shift", role="cashier")
    test_db.add_all([branch, cashier])
    await test_db.commit()

    med = Medicine(sku="MED-CS-01", name_en="Panadol Extra", base_unit="Box", selling_price=25.0)
    test_db.add(med)
    await test_db.commit()

    now = datetime.utcnow()
    batch = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch.id,
        batch_number="BATCH-CS-01",
        expiry_date=now + timedelta(days=90),
        purchase_price=15.0,
        quantity_received=50.0,
        quantity_remaining=50.0
    )
    test_db.add(batch)
    await test_db.commit()

    # 2. Open Session WITHOUT branch_id (test optional branch feature)
    open_data = CashSessionOpen(
        opening_amount=Decimal("100.0"),
        terminal_name="Register 1"
    )
    session_resp = await open_session(open_data, test_db, cashier)
    assert session_resp.status == "OPEN"
    assert session_resp.opening_amount == 100.0
    assert session_resp.branch_id == branch.id  # Auto-resolved!

    # 3. Process Cash Sale of 2 units @ 25.0 = 50.0 (without passing cash_session_id -> auto-linked)
    sale_data = SaleCreate(
        payment_method="CASH",
        items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal("2.0"), unit_price=Decimal("25.0"))]
    )
    sale = await create_sale(test_db, sale_data, branch.id, cashier.id)
    assert sale.cash_session_id == session_resp.id
    assert sale.total_amount == 50.0

    # 4. Process Card Sale of 1 unit @ 25.0 = 25.0
    card_sale_data = SaleCreate(
        payment_method="CARD",
        items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal("1.0"), unit_price=Decimal("25.0"))]
    )
    card_sale = await create_sale(test_db, card_sale_data, branch.id, cashier.id)
    assert card_sale.cash_session_id == session_resp.id

    # 5. Add Cash-In (+20.0 for small change float)
    cin_data = CashMovementCreate(
        movement_type="CASH_IN",
        amount=Decimal("20.0"),
        reason="Small change added"
    )
    cin_resp = await add_cash_movement(session_resp.id, cin_data, test_db, cashier)
    assert cin_resp.amount == 20.0

    # 6. Add Cash-Out (-10.0 for courier payout)
    cout_data = CashMovementCreate(
        movement_type="CASH_OUT",
        amount=Decimal("10.0"),
        reason="Courier delivery fee"
    )
    cout_resp = await add_cash_movement(session_resp.id, cout_data, test_db, cashier)
    assert cout_resp.amount == 10.0

    # 7. Check Live Summary
    summary = await get_session_summary(session_resp.id, test_db, cashier)
    assert summary.opening_amount == 100.0
    assert summary.total_cash_sales == 50.0
    assert summary.total_card_sales == 25.0
    assert summary.total_sales_count == 2
    assert summary.total_cash_in == 20.0
    assert summary.total_cash_out == 10.0
    # Expected Cash: 100 (opening) + 50 (cash sale) + 20 (cash in) - 10 (cash out) = 160.0
    assert summary.expected_amount == 160.0

    # 8. Close session with actual counted cash = 158.0 (shortage of -2.0)
    close_data = CashSessionClose(
        closing_amount=Decimal("158.0"),
        notes="2 SAR shortage in coin change"
    )
    closed_resp = await close_session(session_resp.id, close_data, test_db, cashier)
    assert closed_resp.status == "CLOSED"
    assert closed_resp.closing_amount == 158.0
    assert closed_resp.expected_amount == 160.0
    assert closed_resp.variance == -2.0
    assert closed_resp.notes == "2 SAR shortage in coin change"
    assert closed_resp.closed_at is not None
