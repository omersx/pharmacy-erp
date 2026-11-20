from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from decimal import Decimal
from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.auth.models import User
from app.modules.sales.schemas import (
    SaleCreate, SaleResponse, SaleReturnCreate, SaleReturnResponse,
    SalePaymentDetailResponse, PaymentGroupSummary
)
from app.modules.sales.service import create_sale, return_sale, get_sale_by_id, sale_eager_options
from app.modules.sales.models import Sale, SaleReturn, SaleReturnItem, SalePayment
import uuid
from typing import List, Optional, Dict

from app.modules.organizations.models import Branch
from datetime import datetime

router = APIRouter(tags=["Sales"])

METHOD_NAMES = {
    "CASH": "Cash",
    "BANKAK": "Bankak",
    "FAWRY": "Fawry",
    "OCASH": "O-Cash",
    "O_CASH": "O-Cash",
    "AMIN": "Amin",
    "CARD": "Card / POS Terminal",
    "BANK": "Bank Transfer",
    "BANK_TRANSFER": "Bank Transfer",
}

@router.get("/payments/ledger", response_model=List[PaymentGroupSummary])
async def get_payments_ledger(
    payment_method: Optional[str] = None,
    cash_session_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns all individual sale payments grouped by payment method matching Odoo Payments View."""
    query = (
        select(
            SalePayment,
            Sale.invoice_number,
            Sale.created_at.label("sale_date"),
            User.full_name.label("employee_name"),
            User.email.label("employee_email")
        )
        .join(Sale, Sale.id == SalePayment.sale_id)
        .outerjoin(User, Sale.cashier_id == User.id)
        .order_by(Sale.created_at.desc())
    )
    if payment_method and payment_method != "ALL":
        query = query.where(SalePayment.payment_method == payment_method.upper())
    if cash_session_id:
        query = query.where(SalePayment.cash_session_id == cash_session_id)
    if branch_id:
        query = query.where(Sale.branch_id == branch_id)
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            query = query.where(Sale.created_at >= start_dt)
        except Exception:
            pass
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            query = query.where(Sale.created_at <= end_dt)
        except Exception:
            pass

    result = await db.execute(query)
    rows = result.all()

    # Legacy sales without SalePayment rows
    legacy_query = (
        select(
            Sale,
            User.full_name.label("employee_name"),
            User.email.label("employee_email")
        )
        .outerjoin(User, Sale.cashier_id == User.id)
        .where(~Sale.id.in_(select(SalePayment.sale_id)))
        .order_by(Sale.created_at.desc())
    )
    if payment_method and payment_method != "ALL":
        legacy_query = legacy_query.where(Sale.payment_method == payment_method.upper())
    if cash_session_id:
        legacy_query = legacy_query.where(Sale.cash_session_id == cash_session_id)
    if branch_id:
        legacy_query = legacy_query.where(Sale.branch_id == branch_id)
    leg_result = await db.execute(legacy_query)
    leg_rows = leg_result.all()

    groups: Dict[str, List[SalePaymentDetailResponse]] = {}

    for sp, inv, s_date, emp_name, emp_email in rows:
        pm_key = (sp.payment_method or "CASH").upper()
        if pm_key not in groups:
            groups[pm_key] = []
        d_name = METHOD_NAMES.get(pm_key, pm_key.replace("_", " ").title())
        groups[pm_key].append(
            SalePaymentDetailResponse(
                id=sp.id,
                sale_id=sp.sale_id,
                invoice_number=inv,
                cash_session_id=sp.cash_session_id,
                payment_method=pm_key,
                display_name=d_name,
                amount=Decimal(str(sp.amount)),
                reference=sp.reference,
                employee_name=emp_name or emp_email or "Administrator",
                created_at=s_date or sp.created_at
            )
        )

    for s, emp_name, emp_email in leg_rows:
        pm_key = (s.payment_method or "CASH").upper()
        if pm_key not in groups:
            groups[pm_key] = []
        d_name = METHOD_NAMES.get(pm_key, pm_key.replace("_", " ").title())
        groups[pm_key].append(
            SalePaymentDetailResponse(
                id=s.id,
                sale_id=s.id,
                invoice_number=s.invoice_number,
                cash_session_id=s.cash_session_id,
                payment_method=pm_key,
                display_name=d_name,
                amount=Decimal(str(s.total_amount)),
                reference=None,
                employee_name=emp_name or emp_email or "Administrator",
                created_at=s.created_at
            )
        )

    output = []
    for k in sorted(groups.keys()):
        p_list = groups[k]
        tot = sum(p.amount for p in p_list)
        d_name = METHOD_NAMES.get(k, k.replace("_", " ").title())
        output.append(
            PaymentGroupSummary(
                payment_method=k,
                display_name=d_name,
                total_amount=tot,
                transaction_count=len(p_list),
                payments=p_list
            )
        )
    return output

@router.get("/payments", response_model=List[SalePaymentDetailResponse])
async def list_payments(
    payment_method: Optional[str] = None,
    cash_session_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ledger = await get_payments_ledger(
        payment_method=payment_method,
        cash_session_id=cash_session_id,
        branch_id=branch_id,
        db=db,
        current_user=current_user
    )
    all_payments = []
    for grp in ledger:
        all_payments.extend(grp.payments)
    all_payments.sort(key=lambda p: p.created_at, reverse=True)
    return all_payments

@router.post("", response_model=SaleResponse, include_in_schema=False)
@router.post("/", response_model=SaleResponse)
async def process_sale(sale_in: SaleCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    branch_res = await db.execute(select(Branch).limit(1))
    branch = branch_res.scalars().first()
    if not branch:
        branch = Branch(name="Main Branch", code="MAIN")
        db.add(branch)
        await db.commit()
        await db.refresh(branch)
    branch_id = branch.id
    sale = await create_sale(db, sale_in, branch_id, current_user.id)
    return sale

@router.get("", response_model=List[SaleResponse], include_in_schema=False)
@router.get("/", response_model=List[SaleResponse])
async def list_sales(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    branch_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    query = select(Sale).options(*sale_eager_options()).order_by(desc(Sale.created_at))
    
    if branch_id:
        query = query.where(Sale.branch_id == branch_id)
    if status and status != 'ALL':
        query = query.where(Sale.status == status)
    if search:
        query = query.where(Sale.invoice_number.ilike(f"%{search}%"))
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            query = query.where(Sale.created_at >= start_dt)
        except Exception:
            pass
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            query = query.where(Sale.created_at <= end_dt)
        except Exception:
            pass
        
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/{sale_id}", response_model=SaleResponse)
async def get_sale(sale_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    sale = await get_sale_by_id(db, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    return sale

@router.post("/{sale_id}/return", response_model=SaleResponse)
async def process_return(
    sale_id: uuid.UUID, 
    return_in: Optional[SaleReturnCreate] = None,
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    sale = await return_sale(db, sale_id, current_user.id, return_in)
    return sale

@router.get("/{sale_id}/returns", response_model=List[SaleReturnResponse])
async def get_sale_returns(
    sale_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = (
        select(SaleReturn)
        .where(SaleReturn.sale_id == sale_id)
        .options(
            selectinload(SaleReturn.items).selectinload(SaleReturnItem.medicine),
            selectinload(SaleReturn.items).selectinload(SaleReturnItem.batch),
        )
        .order_by(SaleReturn.created_at.desc())
    )
    result = await db.execute(query)
    return result.scalars().all()
