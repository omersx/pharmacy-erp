import pytest
from decimal import Decimal
from datetime import datetime, timedelta
import uuid

from app.modules.organizations.models import Branch
from app.modules.auth.models import User
from app.modules.medicines.models import Medicine, MedicineBatch
from app.modules.sales.schemas import SaleCreate, SaleItemCreate, PaymentEntryCreate
from app.modules.sales.service import create_sale
from app.modules.sales.models import Sale, SalePayment
from app.modules.cash_sessions.schemas import CashSessionOpen
from app.modules.cash_sessions.router import open_session, get_session_summary
from app.core.exceptions import ValidationError

@pytest.mark.asyncio
async def test_split_payment_success_and_ledger(test_db):
    branch = Branch(name="Split Branch", code="SPLIT-BR")
    cashier = User(email="split_cashier@pharmacy.com", password_hash="hash", full_name="Split Cashier", role="cashier")
    test_db.add_all([branch, cashier])
    await test_db.commit()

    med = Medicine(sku="MED-SPLIT-01", name_en="Amoxicillin 500mg", base_unit="Box", selling_price=25.0)
    test_db.add(med)
    await test_db.commit()

    now = datetime.utcnow()
    batch = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch.id,
        batch_number="BATCH-SPLIT-01",
        expiry_date=now + timedelta(days=180),
        purchase_price=10.0,
        quantity_received=100.0,
        quantity_remaining=100.0
    )
    test_db.add(batch)
    await test_db.commit()

    # Sale total: 2 * 25.0 = 50.0
    # Split payment: $20.00 Cash + $30.00 Card (e.g. Visa with ref)
    sale_in = SaleCreate(
        items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal("2"), unit_price=Decimal("25.0"))],
        payments=[
            PaymentEntryCreate(payment_method="cash", amount=Decimal("20.0")),
            PaymentEntryCreate(payment_method="card", amount=Decimal("30.0"), reference="TXN-VISA-9871")
        ]
    )

    sale = await create_sale(test_db, sale_in, branch.id, cashier.id)
    assert sale.status == "COMPLETED"
    assert sale.total_amount == 50.0
    assert sale.payment_method == "SPLIT"
    assert len(sale.payments) == 2

    cash_p = next(p for p in sale.payments if p.payment_method == "CASH")
    card_p = next(p for p in sale.payments if p.payment_method == "CARD")

    assert float(cash_p.amount) == 20.0
    assert float(card_p.amount) == 30.0
    assert card_p.reference == "TXN-VISA-9871"

@pytest.mark.asyncio
async def test_split_payment_shift_reconciliation(test_db):
    branch = Branch(name="Shift Branch", code="SHIFT-BR")
    cashier = User(email="shift_cashier@pharmacy.com", password_hash="hash", full_name="Shift Cashier", role="cashier")
    test_db.add_all([branch, cashier])
    await test_db.commit()

    med = Medicine(sku="MED-SPLIT-02", name_en="Augmentin 1g", base_unit="Box", selling_price=50.0)
    test_db.add(med)
    await test_db.commit()

    now = datetime.utcnow()
    batch = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch.id,
        batch_number="BATCH-SPLIT-02",
        expiry_date=now + timedelta(days=200),
        purchase_price=20.0,
        quantity_received=50.0,
        quantity_remaining=50.0
    )
    test_db.add(batch)
    await test_db.commit()

    # Open cash session with $100 opening float
    open_res = await open_session(
        CashSessionOpen(opening_amount=Decimal("100.0"), terminal_name="POS-1"),
        test_db,
        cashier
    )
    session_id = open_res.id

    # Sale total: 1 * 50.0 = 50.0
    # Split: $15 Cash + $35 Mobile Bankak (Mobile money)
    sale_in = SaleCreate(
        cash_session_id=session_id,
        items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal("1"), unit_price=Decimal("50.0"))],
        payments=[
            PaymentEntryCreate(payment_method="CASH", amount=Decimal("15.0")),
            PaymentEntryCreate(payment_method="BANKAK", amount=Decimal("35.0"), reference="MB-123456")
        ]
    )
    await create_sale(test_db, sale_in, branch.id, cashier.id)

    # Check shift summary
    summary = await get_session_summary(session_id, test_db, cashier)

    # ONLY the $15 cash portion should increase physical drawer cash!
    assert float(summary.total_cash_sales) == 15.0
    # Non-cash mobile portion ($35) is tracked under other sales
    assert float(summary.total_other_sales) == 35.0
    # Expected drawer amount = 100 opening + 15 cash sales = 115.0
    assert float(summary.expected_amount) == 115.0
    assert summary.total_sales_count == 1

@pytest.mark.asyncio
async def test_split_payment_insufficient_rejected(test_db):
    branch = Branch(name="Reject Branch", code="REJ-BR")
    cashier = User(email="rej_cashier@pharmacy.com", password_hash="hash", full_name="Rej Cashier", role="cashier")
    test_db.add_all([branch, cashier])
    await test_db.commit()

    med = Medicine(sku="MED-SPLIT-03", name_en="Paracetamol 500mg", base_unit="Box", selling_price=40.0)
    test_db.add(med)
    await test_db.commit()

    now = datetime.utcnow()
    batch = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch.id,
        batch_number="BATCH-SPLIT-03",
        expiry_date=now + timedelta(days=200),
        purchase_price=10.0,
        quantity_received=50.0,
        quantity_remaining=50.0
    )
    test_db.add(batch)
    await test_db.commit()

    # Sale total: 40.0, but only $25 provided across split
    sale_in = SaleCreate(
        items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal("1"), unit_price=Decimal("40.0"))],
        payments=[
            PaymentEntryCreate(payment_method="CASH", amount=Decimal("10.0")),
            PaymentEntryCreate(payment_method="CARD", amount=Decimal("15.0"))
        ]
    )

    with pytest.raises(ValidationError) as exc_info:
        await create_sale(test_db, sale_in, branch.id, cashier.id)

    assert "Insufficient payment" in str(exc_info.value)
