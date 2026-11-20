from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import List, Optional
from uuid import UUID
from datetime import datetime
from decimal import Decimal

from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.auth.models import User
from app.modules.organizations.models import Branch
from app.modules.sales.models import Sale, SaleReturn, SalePayment
from app.modules.cash_sessions.models import CashSession, CashMovement
from app.modules.cash_sessions.schemas import (
    CashSessionOpen,
    CashSessionClose,
    CashSessionResponse,
    CashMovementCreate,
    CashMovementResponse,
    CashSessionSummary,
    PaymentMethodBreakdown,
    PreviousSessionResponse
)

router = APIRouter(tags=["cash-sessions"])

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

async def calculate_session_totals(db: AsyncSession, session: CashSession):
    """Calculates all live financial aggregates for a cash session with split-payment accuracy."""
    # 1. Cash Sales (Gross Cash collected during shift)
    sp_cash = await db.execute(
        select(func.coalesce(func.sum(SalePayment.amount), 0))
        .join(Sale, Sale.id == SalePayment.sale_id)
        .where(
            Sale.cash_session_id == session.id,
            SalePayment.payment_method == "CASH",
            Sale.status.in_(["COMPLETED", "PARTIALLY_RETURNED", "RETURNED"])
        )
    )
    legacy_cash = await db.execute(
        select(func.coalesce(func.sum(Sale.total_amount), 0)).where(
            Sale.cash_session_id == session.id,
            Sale.payment_method == "CASH",
            Sale.status.in_(["COMPLETED", "PARTIALLY_RETURNED", "RETURNED"]),
            ~Sale.id.in_(select(SalePayment.sale_id))
        )
    )
    total_cash_sales = Decimal(str(sp_cash.scalar() or 0)) + Decimal(str(legacy_cash.scalar() or 0))

    # 2. Card / Bank Sales
    sp_card = await db.execute(
        select(func.coalesce(func.sum(SalePayment.amount), 0))
        .join(Sale, Sale.id == SalePayment.sale_id)
        .where(
            Sale.cash_session_id == session.id,
            SalePayment.payment_method.in_(["CARD", "BANK", "BANK_TRANSFER"]),
            Sale.status.in_(["COMPLETED", "PARTIALLY_RETURNED", "RETURNED"])
        )
    )
    legacy_card = await db.execute(
        select(func.coalesce(func.sum(Sale.total_amount), 0)).where(
            Sale.cash_session_id == session.id,
            Sale.payment_method.in_(["CARD", "BANK", "BANK_TRANSFER"]),
            Sale.status.in_(["COMPLETED", "PARTIALLY_RETURNED", "RETURNED"]),
            ~Sale.id.in_(select(SalePayment.sale_id))
        )
    )
    total_card_sales = Decimal(str(sp_card.scalar() or 0)) + Decimal(str(legacy_card.scalar() or 0))

    # 3. Other / Mobile Sales
    sp_other = await db.execute(
        select(func.coalesce(func.sum(SalePayment.amount), 0))
        .join(Sale, Sale.id == SalePayment.sale_id)
        .where(
            Sale.cash_session_id == session.id,
            ~SalePayment.payment_method.in_(["CASH", "CARD", "BANK", "BANK_TRANSFER"]),
            Sale.status.in_(["COMPLETED", "PARTIALLY_RETURNED", "RETURNED"])
        )
    )
    legacy_other = await db.execute(
        select(func.coalesce(func.sum(Sale.total_amount), 0)).where(
            Sale.cash_session_id == session.id,
            ~Sale.payment_method.in_(["CASH", "CARD", "BANK", "BANK_TRANSFER", "SPLIT"]),
            Sale.status.in_(["COMPLETED", "PARTIALLY_RETURNED", "RETURNED"]),
            ~Sale.id.in_(select(SalePayment.sale_id))
        )
    )
    total_other_sales = Decimal(str(sp_other.scalar() or 0)) + Decimal(str(legacy_other.scalar() or 0))

    # 4. Total Sales Count
    count_res = await db.execute(
        select(func.count(Sale.id)).where(Sale.cash_session_id == session.id)
    )
    total_sales_count = int(count_res.scalar() or 0)

    # 5. Cash Refunds (from SaleReturn records linked to this session, plus legacy full returns)
    ret_res = await db.execute(
        select(func.coalesce(func.sum(SaleReturn.total_refund), 0)).where(
            SaleReturn.cash_session_id == session.id,
            SaleReturn.refund_method == "CASH"
        )
    )
    total_cash_returns = Decimal(str(ret_res.scalar() or 0))

    legacy_res = await db.execute(
        select(func.coalesce(func.sum(Sale.total_amount), 0)).where(
            Sale.cash_session_id == session.id,
            Sale.payment_method == "CASH",
            Sale.status == "RETURNED",
            ~Sale.id.in_(select(SaleReturn.sale_id))
        )
    )
    total_cash_refunds = total_cash_returns + Decimal(str(legacy_res.scalar() or 0))

    # 6. Cash In movements
    cin_res = await db.execute(
        select(func.coalesce(func.sum(CashMovement.amount), 0)).where(
            CashMovement.session_id == session.id,
            CashMovement.movement_type == "CASH_IN"
        )
    )
    total_cash_in = Decimal(str(cin_res.scalar() or 0))

    # 7. Cash Out movements
    cout_res = await db.execute(
        select(func.coalesce(func.sum(CashMovement.amount), 0)).where(
            CashMovement.session_id == session.id,
            CashMovement.movement_type == "CASH_OUT"
        )
    )
    total_cash_out = Decimal(str(cout_res.scalar() or 0))

    opening = Decimal(str(session.opening_amount or 0))
    expected = opening + total_cash_sales - total_cash_refunds + total_cash_in - total_cash_out

    # 8. Dynamic Breakdown for ALL Payment Methods (Cash, Bankak, Fawry, O-Cash, etc.)
    pay_stmt = (
        select(
            SalePayment.payment_method,
            func.coalesce(func.sum(SalePayment.amount), 0).label("total_amount"),
            func.count(SalePayment.id).label("orders_count")
        )
        .join(Sale, Sale.id == SalePayment.sale_id)
        .where(
            Sale.cash_session_id == session.id,
            Sale.status.in_(["COMPLETED", "PARTIALLY_RETURNED", "RETURNED"])
        )
        .group_by(SalePayment.payment_method)
    )
    pay_rows = (await db.execute(pay_stmt)).all()
    
    breakdown_map = {}
    for pm, tot, cnt in pay_rows:
        key = (pm or "CASH").upper()
        breakdown_map[key] = {
            "expected_amount": Decimal(str(tot or 0)),
            "orders_count": int(cnt or 0)
        }

    legacy_stmt = (
        select(
            Sale.payment_method,
            func.coalesce(func.sum(Sale.total_amount), 0).label("total_amount"),
            func.count(Sale.id).label("orders_count")
        )
        .where(
            Sale.cash_session_id == session.id,
            Sale.status.in_(["COMPLETED", "PARTIALLY_RETURNED", "RETURNED"]),
            ~Sale.id.in_(select(SalePayment.sale_id))
        )
        .group_by(Sale.payment_method)
    )
    leg_rows = (await db.execute(legacy_stmt)).all()
    for pm, tot, cnt in leg_rows:
        key = (pm or "CASH").upper()
        if key in breakdown_map:
            breakdown_map[key]["expected_amount"] += Decimal(str(tot or 0))
            breakdown_map[key]["orders_count"] += int(cnt or 0)
        else:
            breakdown_map[key] = {
                "expected_amount": Decimal(str(tot or 0)),
                "orders_count": int(cnt or 0)
            }

    # Ensure standard POS methods (matching Odoo: Cash, Bankak, Fawry, O-Cash)
    standard_methods = ["CASH", "BANKAK", "FAWRY", "OCASH"]
    for sm in standard_methods:
        if sm not in breakdown_map:
            breakdown_map[sm] = {
                "expected_amount": Decimal(str(total_cash_sales)) if sm == "CASH" else Decimal("0.0"),
                "orders_count": 0
            }

    payments_breakdown = []
    preferred_order = ["CASH", "BANKAK", "FAWRY", "OCASH"]
    other_keys = sorted([k for k in breakdown_map.keys() if k not in preferred_order])
    ordered_keys = [k for k in preferred_order if k in breakdown_map] + other_keys
    gross_sales_amount = Decimal("0.0")
    for k in ordered_keys:
        item = breakdown_map[k]
        gross_sales_amount += item["expected_amount"]
        display_name = METHOD_NAMES.get(k, k.replace("_", " ").title())
        payments_breakdown.append(
            PaymentMethodBreakdown(
                payment_method=k,
                display_name=display_name,
                expected_amount=item["expected_amount"],
                orders_count=item["orders_count"]
            )
        )

    return {
        "opening_amount": opening,
        "total_cash_sales": total_cash_sales,
        "total_card_sales": total_card_sales,
        "total_other_sales": total_other_sales,
        "gross_sales_amount": gross_sales_amount,
        "total_sales_count": total_sales_count,
        "orders_count": total_sales_count,
        "total_cash_refunds": total_cash_refunds,
        "total_cash_in": total_cash_in,
        "total_cash_out": total_cash_out,
        "expected_amount": expected,
        "payments_breakdown": payments_breakdown
    }

@router.post("/open", response_model=CashSessionResponse)
async def open_session(
    data: CashSessionOpen, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Open a new cash session with sequential code and optional opening handover notes."""
    query = select(CashSession).where(
        CashSession.cashier_id == current_user.id,
        CashSession.status == "OPEN"
    )
    result = await db.execute(query)
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="User already has an open cash session")

    branch_id = data.branch_id
    if not branch_id:
        branch_res = await db.execute(select(Branch).limit(1))
        branch = branch_res.scalars().first()
        if not branch:
            branch = Branch(name="Main Branch", code="MAIN")
            db.add(branch)
            await db.flush()
        branch_id = branch.id

    terminal = data.terminal_name or "Main Register"

    # Sequential Session Code (e.g. REG/00001 or Main Register/00001)
    seq_res = await db.execute(select(func.count(CashSession.id)))
    count_all = int(seq_res.scalar() or 0)
    session_code = f"REG/{count_all + 1:05d}"

    session = CashSession(
        session_code=session_code,
        branch_id=branch_id,
        cashier_id=current_user.id,
        terminal_name=terminal,
        opening_amount=float(data.opening_amount),
        opening_notes=data.opening_notes,
        status="OPEN"
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    
    resp = CashSessionResponse.model_validate(session)
    resp.cashier_name = current_user.full_name or current_user.email
    resp.cashier_email = current_user.email
    return resp

@router.post("/{id}/movements", response_model=CashMovementResponse)
async def add_cash_movement(
    id: UUID, 
    data: CashMovementCreate, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Record Cash In (change/deposit) or Cash Out (expense/payout) for an active session."""
    session = await db.get(CashSession, id)
    if not session:
        raise HTTPException(status_code=404, detail="Cash session not found")
    if session.status != "OPEN":
        raise HTTPException(status_code=400, detail="Cannot record movements on a closed session")

    m_type = data.movement_type.upper()
    if m_type not in ["CASH_IN", "CASH_OUT"]:
        raise HTTPException(status_code=400, detail="Invalid movement type. Must be CASH_IN or CASH_OUT")

    movement = CashMovement(
        session_id=session.id,
        movement_type=m_type,
        amount=float(data.amount),
        reason=data.reason,
        performed_by=current_user.id
    )
    db.add(movement)
    await db.commit()
    await db.refresh(movement)
    return movement

@router.get("/last-closed", response_model=Optional[PreviousSessionResponse])
async def get_last_closed_session(
    terminal_name: Optional[str] = None,
    branch_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Retrieve the most recently closed cash session to populate opening float."""
    query = select(CashSession).where(CashSession.status == "CLOSED")
    if terminal_name:
        query = query.where(CashSession.terminal_name == terminal_name)
    if branch_id:
        query = query.where(CashSession.branch_id == branch_id)
    query = query.order_by(CashSession.closed_at.desc(), CashSession.opened_at.desc()).limit(1)
    result = await db.execute(query)
    prev = result.scalars().first()
    if not prev:
        return None
    return PreviousSessionResponse(
        id=prev.id,
        session_code=prev.session_code or f"REG/{str(prev.id)[:6].upper()}",
        terminal_name=prev.terminal_name,
        closing_amount=Decimal(str(prev.closing_amount or 0)),
        closed_at=prev.closed_at
    )

@router.get("/active", response_model=CashSessionResponse)
async def get_active_session(
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Get the current user's active open cash session, if any."""
    query = (
        select(CashSession, User.full_name.label("cashier_name"), User.email.label("cashier_email"))
        .outerjoin(User, CashSession.cashier_id == User.id)
        .where(
            CashSession.cashier_id == current_user.id,
            CashSession.status == "OPEN"
        )
    )
    result = await db.execute(query)
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="No active session found")
    session, c_name, c_email = row
    resp = CashSessionResponse.model_validate(session)
    resp.cashier_name = c_name or current_user.full_name or "Cashier"
    resp.cashier_email = c_email or current_user.email
    if not resp.session_code:
        resp.session_code = f"REG/{str(session.id)[:6].upper()}"
    return resp

@router.get("/{id}/summary", response_model=CashSessionSummary)
async def get_session_summary(
    id: UUID, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Get real-time financial summary of the cash session including multi-tender breakdown."""
    query = (
        select(CashSession, User.full_name.label("cashier_name"), User.email.label("cashier_email"))
        .outerjoin(User, CashSession.cashier_id == User.id)
        .where(CashSession.id == id)
    )
    result = await db.execute(query)
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    session, c_name, c_email = row

    totals = await calculate_session_totals(db, session)
    
    closing = Decimal(str(session.closing_amount)) if session.closing_amount is not None else None
    variance = Decimal(str(session.variance)) if session.variance is not None else None
    if variance is None and closing is not None:
        variance = closing - totals["expected_amount"]

    # Get movements
    mov_res = await db.execute(
        select(CashMovement).where(CashMovement.session_id == session.id).order_by(CashMovement.created_at.asc())
    )
    movements = mov_res.scalars().all()

    sess_resp = CashSessionResponse.model_validate(session)
    sess_resp.cashier_name = c_name or "Cashier"
    sess_resp.cashier_email = c_email
    if not sess_resp.session_code:
        sess_resp.session_code = f"REG/{str(session.id)[:6].upper()}"

    return CashSessionSummary(
        session=sess_resp,
        opening_amount=totals["opening_amount"],
        total_cash_sales=totals["total_cash_sales"],
        total_card_sales=totals["total_card_sales"],
        total_other_sales=totals["total_other_sales"],
        gross_sales_amount=totals["gross_sales_amount"],
        total_sales_count=totals["total_sales_count"],
        orders_count=totals["orders_count"],
        total_cash_refunds=totals["total_cash_refunds"],
        total_cash_in=totals["total_cash_in"],
        total_cash_out=totals["total_cash_out"],
        expected_amount=totals["expected_amount"],
        closing_amount=closing,
        variance=variance,
        payments_breakdown=totals["payments_breakdown"],
        movements=movements
    )

@router.post("/{id}/close", response_model=CashSessionResponse)
async def close_session(
    id: UUID, 
    data: CashSessionClose, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Close the cash session, computing variance against expected cash."""
    session = await db.get(CashSession, id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    if session.status != "OPEN":
        raise HTTPException(status_code=400, detail="Session is already closed")
        
    totals = await calculate_session_totals(db, session)
    expected = totals["expected_amount"]
    closing = Decimal(str(data.closing_amount))
    variance = closing - expected
    
    session.closing_amount = float(closing)
    session.expected_amount = float(expected)
    session.variance = float(variance)
    session.status = "CLOSED"
    session.closed_at = datetime.utcnow()
    if data.notes:
        session.notes = data.notes
        
    await db.commit()
    await db.refresh(session)
    
    resp = CashSessionResponse.model_validate(session)
    resp.cashier_name = current_user.full_name or current_user.email
    resp.cashier_email = current_user.email
    if not resp.session_code:
        resp.session_code = f"REG/{str(session.id)[:6].upper()}"
    return resp

@router.get("", response_model=List[CashSessionResponse], include_in_schema=False)
@router.get("/", response_model=List[CashSessionResponse])
async def list_sessions(
    status: Optional[str] = None,
    branch_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    query = (
        select(
            CashSession,
            User.full_name.label("cashier_name"),
            User.email.label("cashier_email")
        )
        .outerjoin(User, CashSession.cashier_id == User.id)
        .order_by(CashSession.opened_at.desc())
    )
    if status:
        query = query.where(CashSession.status == status)
    if branch_id:
        query = query.where(CashSession.branch_id == branch_id)
    result = await db.execute(query)
    rows = result.all()
    
    sessions_out = []
    for s, c_name, c_email in rows:
        resp = CashSessionResponse.model_validate(s)
        resp.cashier_name = c_name or "Cashier"
        resp.cashier_email = c_email
        if not resp.session_code:
            resp.session_code = f"REG/{str(s.id)[:6].upper()}"
        sessions_out.append(resp)
    return sessions_out

@router.get("/{id}", response_model=CashSessionResponse)
async def get_session(
    id: UUID, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    query = (
        select(
            CashSession,
            User.full_name.label("cashier_name"),
            User.email.label("cashier_email")
        )
        .outerjoin(User, CashSession.cashier_id == User.id)
        .where(CashSession.id == id)
    )
    result = await db.execute(query)
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    session, c_name, c_email = row
    resp = CashSessionResponse.model_validate(session)
    resp.cashier_name = c_name or "Cashier"
    resp.cashier_email = c_email
    if not resp.session_code:
        resp.session_code = f"REG/{str(session.id)[:6].upper()}"
    return resp