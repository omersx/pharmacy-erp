import pytest
import uuid
from decimal import Decimal
from datetime import datetime, timedelta

from app.modules.organizations.models import Branch
from app.modules.auth.models import User
from app.modules.medicines.models import Medicine, MedicineBatch
from app.modules.sales.schemas import SaleCreate, SaleItemCreate, PaymentEntryCreate
from app.modules.sales.service import create_sale
from app.modules.sales.router import get_payments_ledger
from app.modules.cash_sessions.schemas import (
    CashSessionOpen,
    CashSessionClose
)
from app.modules.cash_sessions.router import (
    open_session,
    get_session_summary,
    close_session,
    get_last_closed_session
)

@pytest.mark.asyncio
async def test_odoo_pos_parity_flow(test_db):
    # 1. Setup Branch & Cashier
    branch = Branch(name="Odoo Parity Branch", code="ODOO-1")
    cashier = User(email="odoo_cashier@pharmacy.com", password_hash="hash", full_name="Ahmed Cashier", role="cashier")
    test_db.add_all([branch, cashier])
    await test_db.commit()

    # Setup Medicine
    med = Medicine(sku="MED-OD-01", name_en="Amoxicillin 500mg", base_unit="Box", selling_price=100.0)
    test_db.add(med)
    await test_db.commit()

    now = datetime.utcnow()
    batch = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch.id,
        batch_number="BATCH-OD-01",
        expiry_date=now + timedelta(days=180),
        purchase_price=60.0,
        quantity_received=100.0,
        quantity_remaining=100.0
    )
    test_db.add(batch)
    await test_db.commit()

    # 2. Open First Session with Opening Notes
    open_data = CashSessionOpen(
        opening_amount=Decimal("5000.0"),
        terminal_name="Main Register",
        opening_notes="Morning shift float verified: 1000x5 bills"
    )
    session_1 = await open_session(open_data, test_db, cashier)
    assert session_1.status == "OPEN"
    assert session_1.session_code is not None
    assert session_1.opening_notes == "Morning shift float verified: 1000x5 bills"
    assert session_1.cashier_name == "Ahmed Cashier"

    # 3. Create Multi-tender Sales (Bankak + Fawry + Cash)
    # Sale 1: Paid via Bankak (200.0)
    sale1_data = SaleCreate(
        payment_method="BANKAK",
        payments=[PaymentEntryCreate(payment_method="BANKAK", amount=Decimal("200.0"), reference="TXN-BANKAK-999")],
        items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal("2.0"), unit_price=Decimal("100.0"))]
    )
    await create_sale(test_db, sale1_data, branch.id, cashier.id)

    # Sale 2: Split payment (100.0 via Fawry + 100.0 via Cash)
    sale2_data = SaleCreate(
        payment_method="SPLIT",
        payments=[
            PaymentEntryCreate(payment_method="FAWRY", amount=Decimal("100.0"), reference="FAWRY-CODE-11"),
            PaymentEntryCreate(payment_method="CASH", amount=Decimal("100.0"))
        ],
        items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal("2.0"), unit_price=Decimal("100.0"))]
    )
    await create_sale(test_db, sale2_data, branch.id, cashier.id)

    # 4. Check Session Summary Multi-tender Breakdown
    summary = await get_session_summary(session_1.id, test_db, cashier)
    assert summary.session.session_code is not None
    assert summary.gross_sales_amount == Decimal("400.0")
    assert summary.total_sales_count == 2
    
    # Check payments_breakdown contains Cash, Bankak, Fawry
    breakdown_dict = {b.payment_method: b for b in summary.payments_breakdown}
    assert "CASH" in breakdown_dict
    assert breakdown_dict["CASH"].expected_amount == Decimal("100.0")
    assert "BANKAK" in breakdown_dict
    assert breakdown_dict["BANKAK"].expected_amount == Decimal("200.0")
    assert "FAWRY" in breakdown_dict
    assert breakdown_dict["FAWRY"].expected_amount == Decimal("100.0")

    # 5. Check Payments Ledger (Grouping by Payment Method like Odoo action-431)
    ledger = await get_payments_ledger(cash_session_id=session_1.id, db=test_db, current_user=cashier)
    ledger_dict = {grp.payment_method: grp for grp in ledger}
    assert "BANKAK" in ledger_dict
    assert ledger_dict["BANKAK"].total_amount == Decimal("200.0")
    assert ledger_dict["BANKAK"].payments[0].employee_name == "Ahmed Cashier"
    assert "FAWRY" in ledger_dict
    assert ledger_dict["FAWRY"].total_amount == Decimal("100.0")

    # 6. Close Session with Closing Notes & Count
    # Expected cash: 5000 (opening) + 100 (cash sale) = 5100.0
    close_data = CashSessionClose(
        closing_amount=Decimal("5100.0"),
        notes="Balanced drawer, all electronic slips reconciled."
    )
    closed = await close_session(session_1.id, close_data, test_db, cashier)
    assert closed.status == "CLOSED"
    assert closed.variance == 0.0

    # 7. Check Last Closed Session Endpoint (Pre-fills opening float for next session)
    prev = await get_last_closed_session(terminal_name="Main Register", db=test_db, current_user=cashier)
    assert prev is not None
    assert prev.closing_amount == Decimal("5100.0")
    assert prev.session_code == session_1.session_code
