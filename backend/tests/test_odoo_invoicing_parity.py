import pytest
import uuid
from decimal import Decimal
from datetime import datetime, timezone, timedelta

from app.modules.organizations.models import Branch
from app.modules.auth.models import User
from app.modules.customers.models import Customer
from app.modules.medicines.models import Medicine, MedicineBatch
from app.modules.sales.schemas import SaleCreate, SaleItemCreate
from app.modules.sales.service import create_sale
from app.modules.invoicing.schemas import (
    CustomerInvoiceCreate, CustomerInvoiceUpdate, InvoiceItemCreate, InvoicePaymentCreate,
    PharmacyProfileCreateOrUpdate
)
from app.modules.invoicing.service import (
    get_or_create_pharmacy_profile, update_pharmacy_profile,
    create_draft_invoice, update_draft_invoice, confirm_invoice,
    register_invoice_payment, cancel_invoice, reset_invoice_to_draft,
    create_invoice_from_pos_sale, get_invoice_by_id
)

@pytest.mark.asyncio
async def test_odoo_invoicing_lifecycle_parity(test_db):
    # 1. Setup Branch, Cashier, Customer, Medicine, Batch
    branch = Branch(name="Grand Nile Central", code="GNC-1", currency="SDG")
    cashier = User(
        email="dr_amin@grandnile.com",
        password_hash="hashed_pw",
        full_name="Dr. Amin Accountant",
        role="ADMIN"
    )
    test_db.add_all([branch, cashier])
    await test_db.commit()

    customer = Customer(
        name="Al-Amal Medical Center",
        phone="+249912345678",
        credit_limit=500000.0,
        credit_balance=0.0,
        notes="Tax ID: 310988776600003"
    )
    test_db.add(customer)
    await test_db.commit()

    now = datetime.now(timezone.utc)
    med = Medicine(sku="MED-AMX-500", name_en="Amoxicillin 500mg Caps", base_unit="Box", selling_price=5000.0)
    test_db.add(med)
    await test_db.commit()

    batch = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch.id,
        batch_number="BAT-AMX-99",
        expiry_date=now + timedelta(days=365),
        purchase_price=3000.0,
        quantity_received=100.0,
        quantity_remaining=100.0,
        status="ACTIVE"
    )
    test_db.add(batch)
    await test_db.commit()

    # 2. Test Pharmacy Profile (Customization Settings)
    profile = await get_or_create_pharmacy_profile(test_db, branch.id)
    assert profile.name_en == "Grand Nile Pharmacy"
    assert profile.invoice_prefix == "INV"

    profile = await update_pharmacy_profile(
        test_db,
        PharmacyProfileCreateOrUpdate(
            name_en="Grand Nile Specialized Pharmacy",
            name_ar="صيدلية النيل التخصصية",
            tax_number="300999888100003",
            cr_number="CR-992817",
            phone="+249 91 234 5678",
            currency="SDG",
            invoice_prefix="INV",
            bank_name="Bank of Khartoum (Bankak)",
            bank_account_number="1234567"
        ),
        branch.id
    )
    assert profile.name_en == "Grand Nile Specialized Pharmacy"
    assert profile.tax_number == "300999888100003"

    # 3. Route B: Back-Office Invoicing Lifecycle
    # Step 3.1: Create Draft Invoice
    draft_data = CustomerInvoiceCreate(
        customer_id=customer.id,
        payment_terms="30 Days Net",
        currency="SDG",
        notes="Monthly supply contract",
        items=[
            InvoiceItemCreate(
                label="Amoxicillin 500mg Caps",
                medicine_id=med.id,
                batch_id=batch.id,
                quantity=Decimal("10"),
                unit_price=Decimal("5000.0"),
                discount_percent=Decimal("10.0"),
                tax_percent=Decimal("0.0")
            )
        ]
    )
    draft_inv = await create_draft_invoice(test_db, draft_data, branch.id, cashier.id)
    assert draft_inv.status == "DRAFT"
    assert draft_inv.invoice_number is None  # Odoo parity: no official number while in draft
    assert Decimal(str(draft_inv.total_amount)) == Decimal("45000.0")
    assert Decimal(str(draft_inv.amount_due)) == Decimal("45000.0")
    assert Decimal(str(draft_inv.amount_paid)) == Decimal("0.0")

    # Step 3.2: Edit Draft Invoice (Add another line)
    update_data = CustomerInvoiceUpdate(
        notes="Updated supply contract with delivery fee",
        items=[
            InvoiceItemCreate(
                label="Amoxicillin 500mg Caps",
                medicine_id=med.id,
                batch_id=batch.id,
                quantity=Decimal("10"),
                unit_price=Decimal("5000.0"),
                discount_percent=Decimal("0.0"),
                tax_percent=Decimal("0.0")
            ),
            InvoiceItemCreate(
                label="Cold-Chain Delivery Service",
                quantity=Decimal("1"),
                unit_price=Decimal("5000.0"),
                discount_percent=Decimal("0.0"),
                tax_percent=Decimal("0.0")
            )
        ]
    )
    updated_inv = await update_draft_invoice(test_db, draft_inv.id, update_data)
    assert Decimal(str(updated_inv.total_amount)) == Decimal("55000.0")
    assert len(updated_inv.items) == 2

    # Step 3.3: Confirm Invoice (Transition from DRAFT -> POSTED)
    posted_inv = await confirm_invoice(test_db, draft_inv.id)
    assert posted_inv.status == "POSTED"
    assert posted_inv.invoice_number.startswith(f"INV/{datetime.now().year}/")
    assert Decimal(str(posted_inv.amount_due)) == Decimal("55000.0")

    # Verify customer receivable was updated
    await test_db.refresh(customer)
    assert Decimal(str(customer.credit_balance)) == Decimal("55000.0")

    # Step 3.4: Register Partial Payment (25,000 SDG via Bankak)
    p1 = InvoicePaymentCreate(
        payment_method="BANKAK",
        amount=Decimal("25000.0"),
        reference="TXN-BANKAK-1029",
        notes="First payment installment"
    )
    inv_after_p1 = await register_invoice_payment(test_db, posted_inv.id, p1, cashier.id)
    assert inv_after_p1.status == "POSTED"  # Still posted / partially paid
    assert Decimal(str(inv_after_p1.amount_paid)) == Decimal("25000.0")
    assert Decimal(str(inv_after_p1.amount_due)) == Decimal("30000.0")
    assert len(inv_after_p1.payments) == 1

    await test_db.refresh(customer)
    assert Decimal(str(customer.credit_balance)) == Decimal("30000.0")

    # Step 3.5: Register Final Payment (30,000 SDG via Cash)
    p2 = InvoicePaymentCreate(
        payment_method="CASH",
        amount=Decimal("30000.0"),
        reference="CASH-RECEIPT-99",
        notes="Final settlement"
    )
    inv_after_p2 = await register_invoice_payment(test_db, posted_inv.id, p2, cashier.id)
    assert inv_after_p2.status == "PAID"  # Fully paid!
    assert Decimal(str(inv_after_p2.amount_paid)) == Decimal("55000.0")
    assert Decimal(str(inv_after_p2.amount_due)) == Decimal("0.0")
    assert len(inv_after_p2.payments) == 2

    await test_db.refresh(customer)
    assert Decimal(str(customer.credit_balance)) == Decimal("0.0")

    # 4. Route A: POS 1-Click Invoice Generation
    # Create POS sale with is_invoiced=True
    pos_sale_in = SaleCreate(
        payment_method="BANKAK",
        customer_id=customer.id,
        is_invoiced=True,
        items=[
            SaleItemCreate(
                medicine_id=med.id,
                quantity=Decimal("2"),
                unit_price=Decimal("5000.0")
            )
        ]
    )
    pos_sale = await create_sale(test_db, pos_sale_in, branch.id, cashier.id)
    assert pos_sale.is_invoiced is True
    assert pos_sale.invoice_status == "FULLY_INVOICED"
    assert pos_sale.customer_invoice_id is not None

    # Verify generated invoice in CustomerInvoice table
    pos_invoice = await get_invoice_by_id(test_db, pos_sale.customer_invoice_id)
    assert pos_invoice is not None
    assert pos_invoice.status == "PAID"
    assert pos_invoice.source_type == "POS"
    assert pos_invoice.sale_id == pos_sale.id
    assert Decimal(str(pos_invoice.total_amount)) == Decimal("10000.0")
    assert Decimal(str(pos_invoice.amount_paid)) == Decimal("10000.0")
    assert Decimal(str(pos_invoice.amount_due)) == Decimal("0.0")
    assert len(pos_invoice.payments) >= 1
    assert pos_invoice.payments[0].payment_method == "BANKAK"
