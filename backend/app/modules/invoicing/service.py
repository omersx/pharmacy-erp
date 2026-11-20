from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from app.modules.invoicing.models import CustomerInvoice, InvoiceItem, InvoicePayment, PharmacyProfile
from app.modules.invoicing.schemas import (
    CustomerInvoiceCreate, CustomerInvoiceUpdate, InvoicePaymentCreate, PharmacyProfileCreateOrUpdate
)
from app.modules.sales.models import Sale, SaleItem, SalePayment
from app.modules.customers.models import Customer
from app.modules.organizations.models import Branch
from app.core.exceptions import ValidationError, NotFoundError
import uuid
from datetime import datetime, timezone
from typing import Optional, List

def invoice_eager_options():
    return [
        selectinload(CustomerInvoice.items).selectinload(InvoiceItem.medicine),
        selectinload(CustomerInvoice.items).selectinload(InvoiceItem.batch),
        selectinload(CustomerInvoice.payments),
        selectinload(CustomerInvoice.customer),
        selectinload(CustomerInvoice.branch),
        selectinload(CustomerInvoice.cashier),
        selectinload(CustomerInvoice.sale),
    ]

async def get_or_create_pharmacy_profile(db: AsyncSession, branch_id: Optional[uuid.UUID] = None) -> PharmacyProfile:
    query = select(PharmacyProfile)
    if branch_id:
        query = query.where(PharmacyProfile.branch_id == branch_id)
    result = await db.execute(query.limit(1))
    profile = result.scalars().first()
    if not profile:
        profile = PharmacyProfile(
            branch_id=branch_id,
            name_en="Grand Nile Pharmacy",
            name_ar="صيدلية النيل الكبرى",
            tax_number="300123456700003",
            cr_number="1010482910",
            phone="+249 91 234 5678",
            email="info@grandnile-pharma.com",
            address="Al-Siteen Street, Khartoum",
            city="Khartoum",
            currency="SDG",
            bank_name="Bank of Khartoum (Bankak)",
            bank_account_number="1234567",
            invoice_terms="Medicines cannot be returned without original invoice within 3 days. / البضاعة المباعة لا ترد ولا تستبدل بعد 3 أيام إلا بالفاتورة الأصلية",
            invoice_prefix="INV"
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile

async def update_pharmacy_profile(
    db: AsyncSession, 
    data: PharmacyProfileCreateOrUpdate, 
    branch_id: Optional[uuid.UUID] = None
) -> PharmacyProfile:
    profile = await get_or_create_pharmacy_profile(db, branch_id)
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(profile, field, val)
    await db.commit()
    await db.refresh(profile)
    return profile

async def generate_next_invoice_number(db: AsyncSession, branch_id: uuid.UUID, prefix: str = "INV") -> str:
    current_year = datetime.now(timezone.utc).year
    year_prefix = f"{prefix}/{current_year}/"

    query = (
        select(CustomerInvoice.invoice_number)
        .where(
            CustomerInvoice.branch_id == branch_id,
            CustomerInvoice.invoice_number.like(f"{year_prefix}%")
        )
        .order_by(desc(CustomerInvoice.invoice_number))
        .limit(1)
    )
    result = await db.execute(query)
    last_code = result.scalar_one_or_none()

    if last_code:
        try:
            parts = last_code.split("/")
            num_part = parts[-1]
            next_num = int(num_part) + 1
        except Exception:
            next_num = 1
    else:
        next_num = 1

    return f"{year_prefix}{next_num:05d}"

async def get_invoice_by_id(db: AsyncSession, invoice_id: uuid.UUID) -> Optional[CustomerInvoice]:
    stmt = (
        select(CustomerInvoice)
        .where(CustomerInvoice.id == invoice_id)
        .options(*invoice_eager_options())
        .execution_options(populate_existing=True)
    )
    result = await db.execute(stmt)
    return result.scalars().first()

async def create_draft_invoice(
    db: AsyncSession,
    invoice_in: CustomerInvoiceCreate,
    branch_id: uuid.UUID,
    cashier_id: uuid.UUID
) -> CustomerInvoice:
    # Verify customer exists
    customer = await db.get(Customer, invoice_in.customer_id)
    if not customer:
        raise NotFoundError(f"Customer with id {invoice_in.customer_id} not found")

    invoice_date = invoice_in.invoice_date or datetime.now(timezone.utc)
    due_date = invoice_in.due_date or invoice_date

    subtotal = Decimal("0.0")
    total_tax = Decimal("0.0")
    total_discount = Decimal("0.0")
    items_to_add = []

    for item_data in invoice_in.items:
        qty = Decimal(str(item_data.quantity))
        u_price = Decimal(str(item_data.unit_price))
        disc_pct = Decimal(str(item_data.discount_percent))
        tax_pct = Decimal(str(item_data.tax_percent))

        base_amount = qty * u_price
        disc_val = (base_amount * disc_pct) / Decimal("100")
        after_disc = base_amount - disc_val
        tax_val = (after_disc * tax_pct) / Decimal("100")
        line_tot = after_disc + tax_val

        subtotal += after_disc
        total_discount += disc_val
        total_tax += tax_val

        items_to_add.append(
            InvoiceItem(
                medicine_id=item_data.medicine_id,
                batch_id=item_data.batch_id,
                label=item_data.label,
                quantity=float(qty),
                unit_price=float(u_price),
                discount_percent=float(disc_pct),
                tax_percent=float(tax_pct),
                line_total=float(line_tot)
            )
        )

    grand_total = subtotal + total_tax

    invoice = CustomerInvoice(
        invoice_number=None,  # In draft state, number is not assigned (displays as "/" or "Draft")
        invoice_type="OUT_INVOICE",
        source_type="BACK_OFFICE",
        customer_id=invoice_in.customer_id,
        branch_id=branch_id,
        cashier_id=cashier_id,
        status="DRAFT",
        invoice_date=invoice_date,
        due_date=due_date,
        currency=invoice_in.currency or "SDG",
        subtotal=float(subtotal),
        discount_amount=float(total_discount),
        tax_amount=float(total_tax),
        total_amount=float(grand_total),
        amount_paid=0.0,
        amount_due=float(grand_total),
        payment_terms=invoice_in.payment_terms,
        notes=invoice_in.notes
    )

    db.add(invoice)
    await db.flush()

    for itm in items_to_add:
        itm.invoice_id = invoice.id
        db.add(itm)

    await db.commit()
    return await get_invoice_by_id(db, invoice.id)

async def update_draft_invoice(
    db: AsyncSession,
    invoice_id: uuid.UUID,
    update_in: CustomerInvoiceUpdate
) -> CustomerInvoice:
    invoice = await get_invoice_by_id(db, invoice_id)
    if not invoice:
        raise NotFoundError("Invoice not found")
    if invoice.status != "DRAFT":
        raise ValidationError("Only DRAFT invoices can be edited")

    if update_in.customer_id:
        customer = await db.get(Customer, update_in.customer_id)
        if not customer:
            raise NotFoundError("Customer not found")
        invoice.customer_id = update_in.customer_id

    if update_in.invoice_date:
        invoice.invoice_date = update_in.invoice_date
    if update_in.due_date:
        invoice.due_date = update_in.due_date
    if update_in.payment_terms is not None:
        invoice.payment_terms = update_in.payment_terms
    if update_in.currency:
        invoice.currency = update_in.currency
    if update_in.notes is not None:
        invoice.notes = update_in.notes

    if update_in.items is not None:
        from sqlalchemy import delete
        await db.execute(delete(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id))
        await db.flush()

        subtotal = Decimal("0.0")
        total_tax = Decimal("0.0")
        total_discount = Decimal("0.0")

        for item_data in update_in.items:
            qty = Decimal(str(item_data.quantity))
            u_price = Decimal(str(item_data.unit_price))
            disc_pct = Decimal(str(item_data.discount_percent))
            tax_pct = Decimal(str(item_data.tax_percent))

            base_amount = qty * u_price
            disc_val = (base_amount * disc_pct) / Decimal("100")
            after_disc = base_amount - disc_val
            tax_val = (after_disc * tax_pct) / Decimal("100")
            line_tot = after_disc + tax_val

            subtotal += after_disc
            total_discount += disc_val
            total_tax += tax_val

            db.add(
                InvoiceItem(
                    invoice_id=invoice.id,
                    medicine_id=item_data.medicine_id,
                    batch_id=item_data.batch_id,
                    label=item_data.label,
                    quantity=float(qty),
                    unit_price=float(u_price),
                    discount_percent=float(disc_pct),
                    tax_percent=float(tax_pct),
                    line_total=float(line_tot)
                )
            )

        grand_total = subtotal + total_tax
        invoice.subtotal = float(subtotal)
        invoice.discount_amount = float(total_discount)
        invoice.tax_amount = float(total_tax)
        invoice.total_amount = float(grand_total)
        invoice.amount_due = float(grand_total) - float(invoice.amount_paid)

    await db.commit()
    return await get_invoice_by_id(db, invoice.id)

async def confirm_invoice(db: AsyncSession, invoice_id: uuid.UUID) -> CustomerInvoice:
    invoice = await get_invoice_by_id(db, invoice_id)
    if not invoice:
        raise NotFoundError("Invoice not found")
    if invoice.status != "DRAFT":
        raise ValidationError(f"Invoice is already {invoice.status}")

    # Generate sequential invoice number (e.g. INV/2026/00001)
    profile = await get_or_create_pharmacy_profile(db, invoice.branch_id)
    prefix = profile.invoice_prefix or "INV"
    next_num = await generate_next_invoice_number(db, invoice.branch_id, prefix=prefix)

    invoice.invoice_number = next_num
    invoice.status = "POSTED"

    # Update customer credit balance (receivable)
    if invoice.customer_id:
        cust = await db.get(Customer, invoice.customer_id)
        if cust:
            current_bal = Decimal(str(cust.credit_balance or 0))
            cust.credit_balance = float(current_bal + Decimal(str(invoice.amount_due)))

    await db.commit()
    return await get_invoice_by_id(db, invoice.id)

async def register_invoice_payment(
    db: AsyncSession,
    invoice_id: uuid.UUID,
    payment_in: InvoicePaymentCreate,
    user_id: uuid.UUID
) -> CustomerInvoice:
    invoice = await get_invoice_by_id(db, invoice_id)
    if not invoice:
        raise NotFoundError("Invoice not found")
    if invoice.status not in ["POSTED", "PAID"]:
        raise ValidationError("Cannot register payment on a DRAFT or CANCELLED invoice. Confirm invoice first.")

    pay_amount = Decimal(str(payment_in.amount))
    if pay_amount <= 0:
        raise ValidationError("Payment amount must be greater than zero")

    due = Decimal(str(invoice.amount_due))
    if pay_amount > due + Decimal("0.01"):
        raise ValidationError(f"Payment amount ({pay_amount}) cannot exceed amount due ({due})")

    pay_date = payment_in.payment_date or datetime.now(timezone.utc)

    inv_payment = InvoicePayment(
        invoice_id=invoice.id,
        payment_method=payment_in.payment_method.upper(),
        amount=float(pay_amount),
        payment_date=pay_date,
        reference=payment_in.reference,
        notes=payment_in.notes,
        recorded_by=user_id
    )
    db.add(inv_payment)

    new_paid = Decimal(str(invoice.amount_paid)) + pay_amount
    new_due = Decimal(str(invoice.total_amount)) - new_paid
    if new_due < Decimal("0.01"):
        new_due = Decimal("0.0")
        invoice.status = "PAID"

    invoice.amount_paid = float(new_paid)
    invoice.amount_due = float(new_due)

    # Deduct customer credit balance
    if invoice.customer_id:
        cust = await db.get(Customer, invoice.customer_id)
        if cust:
            current_bal = Decimal(str(cust.credit_balance or 0))
            cust.credit_balance = max(0.0, float(current_bal - pay_amount))

    await db.commit()
    return await get_invoice_by_id(db, invoice.id)

async def cancel_invoice(db: AsyncSession, invoice_id: uuid.UUID) -> CustomerInvoice:
    invoice = await get_invoice_by_id(db, invoice_id)
    if not invoice:
        raise NotFoundError("Invoice not found")
    if invoice.status == "PAID" and len(invoice.payments) > 0:
        raise ValidationError("Cannot cancel an invoice with payments. Issue a Credit Note instead.")
    if invoice.status == "CANCELLED":
        return invoice

    # If POSTED, reverse the customer credit balance
    if invoice.status == "POSTED" and invoice.customer_id:
        cust = await db.get(Customer, invoice.customer_id)
        if cust:
            current_bal = Decimal(str(cust.credit_balance or 0))
            due_to_reverse = Decimal(str(invoice.amount_due))
            cust.credit_balance = max(0.0, float(current_bal - due_to_reverse))

    invoice.status = "CANCELLED"
    await db.commit()
    return await get_invoice_by_id(db, invoice.id)

async def reset_invoice_to_draft(db: AsyncSession, invoice_id: uuid.UUID) -> CustomerInvoice:
    invoice = await get_invoice_by_id(db, invoice_id)
    if not invoice:
        raise NotFoundError("Invoice not found")
    if invoice.status not in ["POSTED", "CANCELLED"]:
        raise ValidationError(f"Cannot reset invoice in state {invoice.status} to draft")
    if len(invoice.payments) > 0:
        raise ValidationError("Cannot reset to draft an invoice that has recorded payments.")

    # Reverse customer balance if it was posted
    if invoice.status == "POSTED" and invoice.customer_id:
        cust = await db.get(Customer, invoice.customer_id)
        if cust:
            current_bal = Decimal(str(cust.credit_balance or 0))
            due = Decimal(str(invoice.amount_due))
            cust.credit_balance = max(0.0, float(current_bal - due))

    invoice.status = "DRAFT"
    invoice.invoice_number = None
    await db.commit()
    return await get_invoice_by_id(db, invoice.id)

async def create_invoice_from_pos_sale(
    db: AsyncSession,
    sale_id: uuid.UUID,
    cashier_id: uuid.UUID,
    customer_id: Optional[uuid.UUID] = None
) -> CustomerInvoice:
    """Route A: Instant creation of a POSTED & PAID invoice directly from a POS transaction."""
    sale_stmt = (
        select(Sale)
        .where(Sale.id == sale_id)
        .options(
            selectinload(Sale.items).selectinload(SaleItem.medicine),
            selectinload(Sale.items).selectinload(SaleItem.batch),
            selectinload(Sale.payments),
            selectinload(Sale.customer)
        )
    )
    res = await db.execute(sale_stmt)
    sale = res.scalars().first()
    if not sale:
        raise NotFoundError("POS Sale not found")

    # If already invoiced, return the existing invoice
    if sale.customer_invoice_id:
        existing = await get_invoice_by_id(db, sale.customer_invoice_id)
        if existing:
            return existing

    target_customer_id = customer_id or sale.customer_id
    if not target_customer_id:
        # Check if a Walk-in or default customer exists
        cust_res = await db.execute(select(Customer).limit(1))
        default_cust = cust_res.scalars().first()
        if not default_cust:
            default_cust = Customer(name="Cash Customer (عميل نقدي)", phone="-")
            db.add(default_cust)
            await db.flush()
        target_customer_id = default_cust.id

    profile = await get_or_create_pharmacy_profile(db, sale.branch_id)
    prefix = profile.invoice_prefix or "INV"
    next_num = await generate_next_invoice_number(db, sale.branch_id, prefix=prefix)

    total_amt = Decimal(str(sale.total_amount))
    sub_amt = Decimal(str(sale.subtotal or sale.total_amount))
    tax_amt = Decimal(str(sale.tax_amount or 0))
    disc_amt = Decimal(str(sale.discount_amount or 0))

    invoice = CustomerInvoice(
        invoice_number=next_num,
        invoice_type="OUT_INVOICE",
        source_type="POS",
        sale_id=sale.id,
        customer_id=target_customer_id,
        branch_id=sale.branch_id,
        cashier_id=cashier_id,
        status="PAID",
        invoice_date=sale.created_at,
        due_date=sale.created_at,
        currency="SDG",
        subtotal=float(sub_amt),
        discount_amount=float(disc_amt),
        tax_amount=float(tax_amt),
        total_amount=float(total_amt),
        amount_paid=float(total_amt),
        amount_due=0.0,
        payment_terms="Immediate Payment",
        notes=f"Generated from POS Order {sale.invoice_number}"
    )
    db.add(invoice)
    await db.flush()

    # Replicate items
    for item in sale.items:
        med_label = item.medicine_name or (item.medicine.name_en if item.medicine else "Medicine Item")
        db.add(
            InvoiceItem(
                invoice_id=invoice.id,
                medicine_id=item.medicine_id,
                batch_id=item.batch_id,
                label=med_label,
                quantity=float(item.quantity),
                unit_price=float(item.unit_price),
                discount_percent=float(item.discount_percent or 0),
                tax_percent=0.0,
                line_total=float(item.line_total)
            )
        )

    # Replicate payments
    if sale.payments and len(sale.payments) > 0:
        for p in sale.payments:
            db.add(
                InvoicePayment(
                    invoice_id=invoice.id,
                    payment_method=p.payment_method,
                    amount=float(p.amount),
                    payment_date=sale.created_at,
                    reference=p.reference,
                    notes=f"POS Sale Payment ({p.payment_method})",
                    recorded_by=cashier_id
                )
            )
    else:
        db.add(
            InvoicePayment(
                invoice_id=invoice.id,
                payment_method=sale.payment_method or "CASH",
                amount=float(total_amt),
                payment_date=sale.created_at,
                notes=f"POS Counter Payment ({sale.payment_method})",
                recorded_by=cashier_id
            )
        )

    # Link sale back to invoice
    sale.is_invoiced = True
    sale.invoice_status = "FULLY_INVOICED"
    sale.customer_invoice_id = invoice.id

    await db.commit()
    return await get_invoice_by_id(db, invoice.id)
