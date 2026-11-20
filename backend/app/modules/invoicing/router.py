from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.auth.models import User
from app.modules.organizations.models import Branch
from app.modules.invoicing.models import CustomerInvoice, InvoiceItem, InvoicePayment, PharmacyProfile
from app.modules.invoicing.schemas import (
    CustomerInvoiceCreate, CustomerInvoiceUpdate, CustomerInvoiceResponse,
    InvoicePaymentCreate, InvoicePaymentResponse, InvoiceItemResponse,
    PharmacyProfileCreateOrUpdate, PharmacyProfileResponse
)
from app.modules.invoicing.service import (
    invoice_eager_options, get_or_create_pharmacy_profile, update_pharmacy_profile,
    get_invoice_by_id, create_draft_invoice, update_draft_invoice,
    confirm_invoice, register_invoice_payment, cancel_invoice, reset_invoice_to_draft,
    create_invoice_from_pos_sale
)
import uuid
from typing import List, Optional
from datetime import datetime

router = APIRouter(tags=["Invoicing"])

def format_invoice_response(inv: CustomerInvoice) -> CustomerInvoiceResponse:
    cust = inv.customer
    br = inv.branch
    cash = inv.cashier

    items_resp = []
    for itm in inv.items:
        b_num = itm.batch.batch_number if itm.batch else None
        items_resp.append(
            InvoiceItemResponse(
                id=itm.id,
                invoice_id=itm.invoice_id,
                label=itm.label,
                medicine_id=itm.medicine_id,
                batch_id=itm.batch_id,
                batch_number=b_num,
                quantity=itm.quantity,
                unit_price=itm.unit_price,
                discount_percent=itm.discount_percent,
                tax_percent=itm.tax_percent,
                line_total=itm.line_total
            )
        )

    payments_resp = []
    for p in inv.payments:
        rec_name = p.recorder.full_name if p.recorder else None
        payments_resp.append(
            InvoicePaymentResponse(
                id=p.id,
                invoice_id=p.invoice_id,
                payment_method=p.payment_method,
                display_name=p.payment_method.replace("_", " ").title(),
                amount=p.amount,
                payment_date=p.payment_date,
                reference=p.reference,
                notes=p.notes,
                recorder_name=rec_name
            )
        )

    return CustomerInvoiceResponse(
        id=inv.id,
        invoice_number=inv.invoice_number,
        invoice_type=inv.invoice_type,
        source_type=inv.source_type,
        sale_id=inv.sale_id,
        customer_id=inv.customer_id,
        customer_name=cust.name if cust else "Walk-in Customer",
        customer_phone=cust.phone if cust else None,
        customer_tax_id=getattr(cust, 'notes', None) if cust else None,
        customer_address=cust.address if cust else None,
        branch_id=inv.branch_id,
        branch_name=br.name if br else "Main Branch",
        cashier_id=inv.cashier_id,
        cashier_name=cash.full_name if cash else "Administrator",
        status=inv.status,
        invoice_date=inv.invoice_date,
        due_date=inv.due_date,
        currency=inv.currency,
        subtotal=inv.subtotal,
        discount_amount=inv.discount_amount,
        tax_amount=inv.tax_amount,
        total_amount=inv.total_amount,
        amount_paid=inv.amount_paid,
        amount_due=inv.amount_due,
        payment_terms=inv.payment_terms,
        notes=inv.notes,
        created_at=inv.created_at,
        updated_at=inv.updated_at,
        items=items_resp,
        payments=payments_resp
    )

# --- Pharmacy Profile / Invoice Settings ---

@router.get("/profile", response_model=PharmacyProfileResponse)
async def get_profile(
    branch_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    profile = await get_or_create_pharmacy_profile(db, branch_id)
    return profile

@router.put("/profile", response_model=PharmacyProfileResponse)
async def save_profile(
    data: PharmacyProfileCreateOrUpdate,
    branch_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    profile = await update_pharmacy_profile(db, data, branch_id)
    return profile

# --- Invoices Management ---

@router.post("/invoices", response_model=CustomerInvoiceResponse)
async def create_invoice(
    data: CustomerInvoiceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Retrieve default branch
    branch_res = await db.execute(select(Branch).limit(1))
    branch = branch_res.scalars().first()
    if not branch:
        branch = Branch(name="Main Branch", code="MAIN")
        db.add(branch)
        await db.commit()
        await db.refresh(branch)

    invoice = await create_draft_invoice(db, data, branch.id, current_user.id)
    return format_invoice_response(invoice)

@router.get("/invoices", response_model=List[CustomerInvoiceResponse])
async def list_invoices(
    status: Optional[str] = None,
    customer_id: Optional[uuid.UUID] = None,
    search: Optional[str] = None,
    source_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(CustomerInvoice).options(*invoice_eager_options()).order_by(desc(CustomerInvoice.created_at))

    if branch_id:
        query = query.where(CustomerInvoice.branch_id == branch_id)
    if status and status != "ALL":
        query = query.where(CustomerInvoice.status == status.upper())
    if customer_id:
        query = query.where(CustomerInvoice.customer_id == customer_id)
    if source_type and source_type != "ALL":
        query = query.where(CustomerInvoice.source_type == source_type.upper())
    if search:
        search_filter = f"%{search}%"
        query = query.where(
            (CustomerInvoice.invoice_number.ilike(search_filter)) |
            (CustomerInvoice.notes.ilike(search_filter))
        )
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            query = query.where(CustomerInvoice.invoice_date >= start_dt)
        except Exception:
            pass
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            query = query.where(CustomerInvoice.invoice_date <= end_dt)
        except Exception:
            pass

    result = await db.execute(query)
    invoices = result.scalars().all()
    return [format_invoice_response(inv) for inv in invoices]

@router.get("/invoices/{invoice_id}", response_model=CustomerInvoiceResponse)
async def get_invoice(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    inv = await get_invoice_by_id(db, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return format_invoice_response(inv)

@router.put("/invoices/{invoice_id}", response_model=CustomerInvoiceResponse)
async def update_invoice(
    invoice_id: uuid.UUID,
    data: CustomerInvoiceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    inv = await update_draft_invoice(db, invoice_id, data)
    return format_invoice_response(inv)

@router.post("/invoices/{invoice_id}/confirm", response_model=CustomerInvoiceResponse)
async def confirm_draft(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    inv = await confirm_invoice(db, invoice_id)
    return format_invoice_response(inv)

@router.post("/invoices/{invoice_id}/pay", response_model=CustomerInvoiceResponse)
async def pay_invoice(
    invoice_id: uuid.UUID,
    payment_in: InvoicePaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    inv = await register_invoice_payment(db, invoice_id, payment_in, current_user.id)
    return format_invoice_response(inv)

@router.post("/invoices/{invoice_id}/cancel", response_model=CustomerInvoiceResponse)
async def cancel_inv(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    inv = await cancel_invoice(db, invoice_id)
    return format_invoice_response(inv)

@router.post("/invoices/{invoice_id}/reset-draft", response_model=CustomerInvoiceResponse)
async def reset_draft(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    inv = await reset_invoice_to_draft(db, invoice_id)
    return format_invoice_response(inv)

@router.delete("/invoices/{invoice_id}")
async def delete_draft_invoice(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    inv = await get_invoice_by_id(db, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.status != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT invoices can be deleted")
    await db.delete(inv)
    await db.commit()
    return {"status": "deleted", "id": str(invoice_id)}

# --- Route A: Generate from POS Sale ---

@router.post("/from-pos/{sale_id}", response_model=CustomerInvoiceResponse)
async def generate_from_pos_sale(
    sale_id: uuid.UUID,
    customer_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    inv = await create_invoice_from_pos_sale(db, sale_id, current_user.id, customer_id=customer_id)
    return format_invoice_response(inv)
