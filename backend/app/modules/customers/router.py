from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func, desc
from typing import List
from uuid import UUID
from decimal import Decimal

from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.auth.models import User
from app.modules.customers.models import Customer, CustomerPayment
from app.modules.customers.schemas import (
    CustomerCreate, CustomerUpdate, CustomerResponse,
    PaymentCreate, PaymentResponse, CreditLedgerEntry, NotesUpdate,
)

router = APIRouter(tags=["customers"])


# ══════════════════════════════════════════════════════════════════════════
# CUSTOMER CRUD
# ══════════════════════════════════════════════════════════════════════════

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