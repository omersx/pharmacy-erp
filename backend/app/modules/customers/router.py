from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func, desc
from typing import List, Optional
from uuid import UUID
from decimal import Decimal
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.auth.models import User
from app.modules.customers.models import Customer, CustomerPayment
from app.modules.customers.schemas import (
    CustomerCreate, CustomerUpdate, CustomerResponse,
    PaymentCreate, PaymentResponse, CreditLedgerEntry, NotesUpdate,
    CustomerStatementResponse, StatementSummary, StatementAgingSummary, StatementEntry,
)

router = APIRouter(tags=["customers"])


# ══════════════════════════════════════════════════════════════════════════
# CUSTOMER CRUD
# ══════════════════════════════════════════════════════════════════════════

@router.get("", response_model=List[CustomerResponse], include_in_schema=False)
@router.get("/", response_model=List[CustomerResponse])
async def list_customers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Customer).order_by(desc(Customer.created_at)))
    return result.scalars().all()


@router.get("/search", response_model=List[CustomerResponse])
async def search_customers(
    q: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Customer).where(
        or_(
            Customer.name.ilike(f"%{q}%"),
            Customer.name_ar.ilike(f"%{q}%"),
            Customer.phone.ilike(f"%{q}%"),
        )
    )
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{id}", response_model=CustomerResponse)
async def get_customer(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    customer = await db.get(Customer, str(id))
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.post("", response_model=CustomerResponse, include_in_schema=False)
@router.post("/", response_model=CustomerResponse)
async def create_customer(
    data: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    create_data = data.model_dump(exclude={"opening_balance"})
    customer = Customer(**create_data)
    # Set opening balance if provided
    if data.opening_balance and data.opening_balance > 0:
        customer.credit_balance = float(data.opening_balance)
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    return customer


@router.put("/{id}", response_model=CustomerResponse)
async def update_customer(
    id: UUID,
    data: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    customer = await db.get(Customer, str(id))
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(customer, key, value)

    await db.commit()
    await db.refresh(customer)
    return customer


@router.delete("/{id}")
async def delete_customer(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    customer = await db.get(Customer, str(id))
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    customer.is_active = False
    await db.commit()
    return {"message": "Customer deactivated successfully"}


# ══════════════════════════════════════════════════════════════════════════
# PURCHASE HISTORY
# ══════════════════════════════════════════════════════════════════════════

@router.get("/{id}/purchases")
async def get_customer_purchases(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all sales linked to this customer."""
    from app.modules.sales.models import Sale, SaleItem

    customer = await db.get(Customer, str(id))
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    result = await db.execute(
        select(Sale)
        .where(Sale.customer_id == str(id))
        .order_by(desc(Sale.created_at))
    )
    sales = result.scalars().all()

    purchases = []
    for sale in sales:
        # Get items count
        items_result = await db.execute(
            select(func.count()).where(SaleItem.sale_id == sale.id)
        )
        items_count = items_result.scalar() or 0

        purchases.append({
            "id": sale.id,
            "invoice_number": sale.invoice_number,
            "date": sale.created_at.isoformat(),
            "items_count": items_count,
            "total": float(sale.total_amount),
            "paid": float(sale.total_amount) if sale.status == "COMPLETED" else 0,
            "status": sale.status,
            "payment_method": sale.payment_method,
        })

    return purchases


# ══════════════════════════════════════════════════════════════════════════
# PAYMENTS
# ══════════════════════════════════════════════════════════════════════════

@router.get("/{id}/payments", response_model=List[PaymentResponse])
async def get_customer_payments(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    customer = await db.get(Customer, str(id))
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    result = await db.execute(
        select(CustomerPayment)
        .where(CustomerPayment.customer_id == str(id))
        .order_by(desc(CustomerPayment.created_at))
    )
    return result.scalars().all()


@router.post("/{id}/payments", response_model=PaymentResponse)
async def add_customer_payment(
    id: UUID,
    data: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    customer = await db.get(Customer, str(id))
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    if float(data.amount) <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive")

    # Create payment record
    payment = CustomerPayment(
        customer_id=str(id),
        amount=float(data.amount),
        payment_method=data.payment_method,
        reference=data.reference,
        notes=data.notes,
        created_by=current_user.id,
    )
    db.add(payment)

    # Reduce customer balance
    new_balance = float(customer.credit_balance or 0) - float(data.amount)
    customer.credit_balance = max(new_balance, 0)

    await db.commit()
    await db.refresh(payment)
    return payment


# ══════════════════════════════════════════════════════════════════════════
# CREDIT LEDGER
# ══════════════════════════════════════════════════════════════════════════

@router.get("/{id}/credit-ledger")
async def get_credit_ledger(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Build credit ledger from sales and payments, sorted by date."""
    from app.modules.sales.models import Sale

    customer = await db.get(Customer, str(id))
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    entries = []

    # Sales that charged to credit (customer_id linked sales)
    sales_result = await db.execute(
        select(Sale)
        .where(Sale.customer_id == str(id))
        .order_by(Sale.created_at)
    )
    for sale in sales_result.scalars().all():
        entries.append({
            "date": sale.created_at.isoformat(),
            "type": "SALE",
            "reference": sale.invoice_number or f"SALE-{str(sale.id)[:8]}",
            "debit": float(sale.total_amount),
            "credit": None,
            "sort_key": sale.created_at,
        })

    # Payments
    payments_result = await db.execute(
        select(CustomerPayment)
        .where(CustomerPayment.customer_id == str(id))
        .order_by(CustomerPayment.created_at)
    )
    for payment in payments_result.scalars().all():
        entries.append({
            "date": payment.created_at.isoformat(),
            "type": "PAYMENT",
            "reference": payment.reference or f"PAY-{str(payment.id)[:8]}",
            "debit": None,
            "credit": float(payment.amount),
            "sort_key": payment.created_at,
        })

    # Sort by date and calculate running balance
    entries.sort(key=lambda e: e["sort_key"])
    balance = Decimal("0")
    for entry in entries:
        if entry["debit"]:
            balance += Decimal(str(entry["debit"]))
        if entry["credit"]:
            balance -= Decimal(str(entry["credit"]))
        entry["balance"] = float(balance)
        del entry["sort_key"]

    return entries


# ══════════════════════════════════════════════════════════════════════════
# CUSTOMER STATEMENT OF ACCOUNT (كشف حساب عميل)
# ══════════════════════════════════════════════════════════════════════════

def _normalize_dt(dt: Optional[datetime]) -> Optional[datetime]:
    if not dt:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@router.get("/{id}/statement", response_model=CustomerStatementResponse)
async def get_customer_statement(
    id: UUID,
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    status_filter: Optional[str] = Query("ALL"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate an official Odoo/ERP parity Statement of Account (كشف حساب عميل).
    Includes opening balance calculation, debit/credit ledger, aging receivables,
    and official pharmacy profile branding.
    """
    from app.modules.invoicing.models import CustomerInvoice, InvoicePayment, PharmacyProfile
    from app.modules.sales.models import Sale

    cust_uuid = id if isinstance(id, UUID) else UUID(str(id))

    customer = await db.get(Customer, cust_uuid)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # 1. Fetch pharmacy profile branding
    profile_res = await db.execute(select(PharmacyProfile).limit(1))
    profile = profile_res.scalars().first()
    pharmacy_dict = {
        "name_en": profile.name_en if profile else "Grand Nile Pharmacy",
        "name_ar": profile.name_ar if profile else "صيدلية النيل الكبرى",
        "logo_url": profile.logo_url if profile else None,
        "tax_number": profile.tax_number if profile else "300123456700003",
        "cr_number": profile.cr_number if profile else "1010482910",
        "phone": profile.phone if profile else "+249 91 234 5678",
        "email": profile.email if profile else "info@grandnile-pharma.com",
        "address": profile.address if profile else "Al-Siteen Street, Khartoum",
        "bank_name": profile.bank_name if profile else "Bank of Khartoum (Bankak)",
        "bank_account_number": profile.bank_account_number if profile else "1234567",
        "invoice_terms": profile.invoice_terms if profile else None,
        "currency": profile.currency if profile else "SDG",
    }

    # 2. Fetch Customer Invoices (POSTED or PAID)
    inv_stmt = (
        select(CustomerInvoice)
        .where(CustomerInvoice.customer_id == cust_uuid, CustomerInvoice.status.in_(["POSTED", "PAID"]))
        .order_by(CustomerInvoice.invoice_date)
    )
    invoices = (await db.execute(inv_stmt)).scalars().all()

    # 3. Fetch POS Sales
    sales_stmt = (
        select(Sale)
        .where(Sale.customer_id == cust_uuid, Sale.status == "COMPLETED")
        .order_by(Sale.created_at)
    )
    sales = (await db.execute(sales_stmt)).scalars().all()

    # Exclude sales that have already been converted into CustomerInvoices
    invoiced_sale_ids = {inv.sale_id for inv in invoices if inv.sale_id}
    invoiced_sale_ids.update({s.id for s in sales if getattr(s, "is_invoiced", False) or getattr(s, "customer_invoice_id", None)})

    # 4. Fetch Direct Customer Payments
    pay_stmt = (
        select(CustomerPayment)
        .where(CustomerPayment.customer_id == cust_uuid)
        .order_by(CustomerPayment.created_at)
    )
    customer_payments = (await db.execute(pay_stmt)).scalars().all()

    # 5. Build unified timeline of transactions
    raw_events = []

    # Invoices and their payments
    for inv in invoices:
        inv_dt = _normalize_dt(inv.invoice_date or inv.created_at)
        raw_events.append({
            "id": f"inv-{inv.id}",
            "date": inv_dt,
            "type": "INVOICE",
            "reference": inv.invoice_number or f"INV-{str(inv.id)[:8]}",
            "description": f"Customer Invoice #{inv.invoice_number or str(inv.id)[:8]} ({len(inv.items) if inv.items else 0} items)",
            "status": inv.status,
            "due_date": _normalize_dt(inv.due_date),
            "debit": Decimal(str(inv.total_amount)),
            "credit": None,
        })

        for pmt in (inv.payments or []):
            pmt_dt = _normalize_dt(pmt.payment_date or pmt.created_at)
            raw_events.append({
                "id": f"invpmt-{pmt.id}",
                "date": pmt_dt,
                "type": "PAYMENT",
                "reference": pmt.reference or f"REC-{str(pmt.id)[:8]}",
                "description": f"Payment for #{inv.invoice_number or ''} ({pmt.payment_method})" + (f" - {pmt.notes}" if pmt.notes else ""),
                "status": "PAID",
                "due_date": None,
                "debit": None,
                "credit": Decimal(str(pmt.amount)),
            })

    # Direct POS sales (not invoiced via CustomerInvoice)
    for s in sales:
        if s.id in invoiced_sale_ids:
            continue
        s_dt = _normalize_dt(s.created_at)
        raw_events.append({
            "id": f"sale-{s.id}",
            "date": s_dt,
            "type": "POS_SALE",
            "reference": s.invoice_number or f"SALE-{str(s.id)[:8]}",
            "description": f"Counter POS Sale #{s.invoice_number or str(s.id)[:8]}",
            "status": s.status,
            "due_date": s_dt,
            "debit": Decimal(str(s.total_amount)),
            "credit": None,
        })
        # If immediate counter payment
        if (s.payment_method or "").upper() != "CREDIT":
            raw_events.append({
                "id": f"salepay-{s.id}",
                "date": s_dt,
                "type": "PAYMENT",
                "reference": f"CSH-{s.invoice_number or str(s.id)[:8]}",
                "description": f"Counter Settlement ({s.payment_method})",
                "status": "COMPLETED",
                "due_date": None,
                "debit": None,
                "credit": Decimal(str(s.total_amount)),
            })

    # Direct account payments
    for cp in customer_payments:
        cp_dt = _normalize_dt(cp.created_at)
        raw_events.append({
            "id": f"pay-{cp.id}",
            "date": cp_dt,
            "type": "PAYMENT",
            "reference": cp.reference or f"PAY-{str(cp.id)[:8]}",
            "description": f"Account Payment ({cp.payment_method})" + (f" - {cp.notes}" if cp.notes else ""),
            "status": "RECORDED",
            "due_date": None,
            "debit": None,
            "credit": Decimal(str(cp.amount)),
        })

    # Sort all events chronologically
    raw_events.sort(key=lambda ev: ev["date"])

    start_utc = _normalize_dt(start_date)
    end_utc = _normalize_dt(end_date)

    # Calculate Opening Balance for transactions prior to start_date
    opening_balance = Decimal("0.0")
    for ev in raw_events:
        if start_utc and ev["date"] < start_utc:
            if ev["debit"]:
                opening_balance += ev["debit"]
            if ev["credit"]:
                opening_balance -= ev["credit"]

    # Filter period events
    period_events = [
        ev for ev in raw_events
        if (not start_utc or ev["date"] >= start_utc) and (not end_utc or ev["date"] <= end_utc)
    ]

    # Calculate running balance across period entries
    running_balance = opening_balance
    total_debits = Decimal("0.0")
    total_credits = Decimal("0.0")
    statement_entries: List[StatementEntry] = []

    for ev in period_events:
        deb = ev["debit"] or Decimal("0.0")
        crd = ev["credit"] or Decimal("0.0")
        total_debits += deb
        total_credits += crd
        running_balance += (deb - crd)

        statement_entries.append(
            StatementEntry(
                id=ev["id"],
                date=ev["date"],
                type=ev["type"],
                reference=ev["reference"],
                description=ev["description"],
                status=ev["status"],
                due_date=ev["due_date"],
                debit=ev["debit"],
                credit=ev["credit"],
                running_balance=running_balance
            )
        )

    # 6. Aging Analysis (تحليل أعمار الديون)
    now_utc = datetime.now(timezone.utc)
    bucket_0_30 = Decimal("0.0")
    bucket_31_60 = Decimal("0.0")
    bucket_61_90 = Decimal("0.0")
    bucket_over_90 = Decimal("0.0")

    for inv in invoices:
        due = Decimal(str(inv.amount_due or 0.0))
        if due > Decimal("0.01") and inv.status == "POSTED":
            inv_dt = _normalize_dt(inv.invoice_date or inv.created_at)
            age_days = (now_utc.date() - inv_dt.date()).days
            if age_days <= 30:
                bucket_0_30 += due
            elif age_days <= 60:
                bucket_31_60 += due
            elif age_days <= 90:
                bucket_61_90 += due
            else:
                bucket_over_90 += due

    total_aging = bucket_0_30 + bucket_31_60 + bucket_61_90 + bucket_over_90
    cust_credit_bal = Decimal(str(customer.credit_balance or 0.0))
    if cust_credit_bal > total_aging:
        diff = cust_credit_bal - total_aging
        bucket_0_30 += diff
        total_aging = cust_credit_bal

    # Summary
    credit_limit = Decimal(str(customer.credit_limit or 0.0))
    closing_balance = running_balance
    available_credit = max(Decimal("0.0"), credit_limit - closing_balance) if credit_limit > Decimal("0.0") else Decimal("0.0")

    summary = StatementSummary(
        opening_balance=opening_balance,
        total_debits=total_debits,
        total_credits=total_credits,
        net_period_change=total_debits - total_credits,
        closing_balance=closing_balance,
        credit_limit=credit_limit,
        available_credit=available_credit,
    )

    aging = StatementAgingSummary(
        current_30_days=bucket_0_30,
        days_31_to_60=bucket_31_60,
        days_61_to_90=bucket_61_90,
        over_90_days=bucket_over_90,
        total_outstanding=total_aging,
    )

    return CustomerStatementResponse(
        customer=CustomerResponse.model_validate(customer),
        pharmacy_profile=pharmacy_dict,
        period_start=start_utc,
        period_end=end_utc,
        statement_date=now_utc,
        summary=summary,
        aging=aging,
        entries=statement_entries
    )


# ══════════════════════════════════════════════════════════════════════════
# NOTES
# ══════════════════════════════════════════════════════════════════════════

@router.patch("/{id}/notes", response_model=CustomerResponse)
async def update_notes(
    id: UUID,
    data: NotesUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    customer = await db.get(Customer, str(id))
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    customer.notes = data.notes
    await db.commit()
    await db.refresh(customer)
    return customer