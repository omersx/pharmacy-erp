import pytest
import uuid
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from app.modules.customers.models import Customer, CustomerPayment
from app.modules.invoicing.models import CustomerInvoice, InvoiceItem, InvoicePayment, PharmacyProfile
from app.modules.invoicing.service import confirm_invoice, register_invoice_payment
from app.modules.invoicing.schemas import InvoicePaymentCreate
from app.modules.organizations.models import Branch
from app.modules.auth.models import User


@pytest.mark.asyncio
async def test_customer_statement_generation_and_aging(test_db):
    db = test_db
    # 1. Setup user & branch
    user = User(
        email=f"statement_admin_{uuid.uuid4().hex[:6]}@example.com",
        full_name="Statement Admin",
        password_hash="hashed_pw_test",
        role="ADMIN"
    )
    db.add(user)
    await db.flush()

    branch = Branch(
        name="Statement Nile Branch",
        code=f"SN-{uuid.uuid4().hex[:4]}",
        address="Khartoum Siteen",
        is_active=True
    )
    db.add(branch)
    await db.flush()

    # 2. Pharmacy Profile
    profile = PharmacyProfile(
        branch_id=branch.id,
        name_en="Nile Test Pharmacy",
        name_ar="صيدلية النيل التجريبية",
        tax_number="300999888777",
        cr_number="10109988",
        bank_name="Bank of Khartoum",
        bank_account_number="99887766"
    )
    db.add(profile)
    await db.flush()

    # 3. Create Customer with credit limit
    customer = Customer(
        name="Al-Amal Clinic",
        name_ar="عيادة الأمل",
        phone="+249911223344",
        email="amal@clinic.sd",
        credit_limit=100000.0,
        credit_balance=0.0
    )
    db.add(customer)
    await db.flush()

    # 4. Create Back-office Customer Invoice
    now = datetime.now(timezone.utc)
    inv = CustomerInvoice(
        customer_id=customer.id,
        branch_id=branch.id,
        cashier_id=user.id,
        status="DRAFT",
        currency="SDG",
        subtotal=15000.0,
        total_amount=15000.0,
        amount_paid=0.0,
        amount_due=15000.0,
        invoice_date=now - timedelta(days=15),
        due_date=now - timedelta(days=5)
    )
    db.add(inv)
    await db.flush()

    item = InvoiceItem(
        invoice_id=inv.id,
        label="Antibiotic Amoxicillin 500mg (10 boxes)",
        quantity=10.0,
        unit_price=1500.0,
        line_total=15000.0
    )
    db.add(item)
    await db.flush()

    # Confirm invoice -> becomes POSTED with sequential number
    confirmed_inv = await confirm_invoice(db, inv.id)
    assert confirmed_inv.status == "POSTED"
    assert confirmed_inv.invoice_number is not None

    # 5. Register partial payment of 5,000 SDG
    pay_in = InvoicePaymentCreate(
        payment_method="BANKAK",
        amount=5000.0,
        payment_date=now - timedelta(days=10),
        reference="TXN-BANKAK-8877",
        notes="Partial bank transfer"
    )
    paid_inv = await register_invoice_payment(db, confirmed_inv.id, pay_in, user.id)
    assert paid_inv.amount_due == 10000.0

    # Also add a direct customer account payment of 1,000 SDG
    cust_pay = CustomerPayment(
        customer_id=customer.id,
        amount=1000.0,
        payment_method="CASH",
        reference="CSH-REC-01",
        notes="Direct cash at counter",
        created_by=user.id
    )
    db.add(cust_pay)
    await db.commit()

    # 6. Test the statement endpoint function directly
    from app.modules.customers.router import get_customer_statement
    
    statement_resp = await get_customer_statement(
        id=customer.id,
        start_date=None,
        end_date=None,
        status_filter="ALL",
        db=db,
        current_user=user
    )

    assert statement_resp.customer.name == "Al-Amal Clinic"
    assert statement_resp.pharmacy_profile["name_en"] == "Nile Test Pharmacy"
    assert statement_resp.pharmacy_profile["tax_number"] == "300999888777"

    # Check Summary
    # Total debits = 15,000 (Invoice)
    # Total credits = 5,000 (Invoice payment) + 1,000 (Customer payment) = 6,000
    # Closing balance = 9,000
    assert statement_resp.summary.opening_balance == Decimal("0.0")
    assert statement_resp.summary.total_debits == Decimal("15000.0")
    assert statement_resp.summary.total_credits == Decimal("6000.0")
    assert statement_resp.summary.closing_balance == Decimal("9000.0")

    # Check Aging: Invoice is 15 days old -> in current_30_days bucket
    assert statement_resp.aging.current_30_days >= Decimal("9000.0")
    assert statement_resp.aging.over_90_days == Decimal("0.0")

    # Check entries count
    assert len(statement_resp.entries) == 3  # Invoice + Invoice Payment + Customer Payment
    types = [e.type for e in statement_resp.entries]
    assert "INVOICE" in types
    assert "PAYMENT" in types

    # 7. Test Date Filter & Opening Balance
    # Filter starting after the invoice (5 days ago)
    filter_start = now - timedelta(days=5)
    filtered_stmt = await get_customer_statement(
        id=customer.id,
        start_date=filter_start,
        end_date=None,
        status_filter="ALL",
        db=db,
        current_user=user
    )
    # Transactions prior to filter_start:
    # Invoice (+15,000) and invoice payment (-5,000) -> opening balance = 10,000
    # Customer payment (-1,000) occurred today -> inside the period
    assert filtered_stmt.summary.opening_balance == Decimal("10000.00")
    assert len(filtered_stmt.entries) == 1
    assert filtered_stmt.summary.closing_balance == Decimal("9000.00")
