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
from app.modules.sales.models import Sale, SaleReturn
from app.modules.cash_sessions.models import CashSession, CashMovement
from app.modules.cash_sessions.schemas import (
    CashSessionOpen,
    CashSessionClose,
    CashSessionResponse,
    CashMovementCreate,
    CashMovementResponse,
    CashSessionSummary
)

router = APIRouter(tags=["cash-sessions"])

async def calculate_session_totals(db: AsyncSession, session: CashSession):
    """Calculates all live financial aggregates for a cash session."""
    # 1. Cash Sales (Gross Cash collected during shift)
    cash_res = await db.execute(
        select(func.coalesce(func.sum(Sale.total_amount), 0)).where(
            Sale.cash_session_id == session.id,
            Sale.payment_method == "CASH",
            Sale.status.in_(["COMPLETED", "PARTIALLY_RETURNED", "RETURNED"])
        )
    )
    total_cash_sales = Decimal(str(cash_res.scalar() or 0))

    # 2. Card / Bank Sales
    card_res = await db.execute(
        select(func.coalesce(func.sum(Sale.total_amount), 0)).where(
            Sale.cash_session_id == session.id,
            Sale.payment_method.in_(["CARD", "BANK"]),
            Sale.status.in_(["COMPLETED", "PARTIALLY_RETURNED", "RETURNED"])
        )
    )
    total_card_sales = Decimal(str(card_res.scalar() or 0))

    # 3. Other Sales
    other_res = await db.execute(
        select(func.coalesce(func.sum(Sale.total_amount), 0)).where(
            Sale.cash_session_id == session.id,
            ~Sale.payment_method.in_(["CASH", "CARD", "BANK"]),
            Sale.status.in_(["COMPLETED", "PARTIALLY_RETURNED", "RETURNED"])
        )
    )
    total_other_sales = Decimal(str(other_res.scalar() or 0))

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

    return {
        "opening_amount": opening,
        "total_cash_sales": total_cash_sales,
        "total_card_sales": total_card_sales,
        "total_other_sales": total_other_sales,
        "total_sales_count": total_sales_count,
        "total_cash_refunds": total_cash_refunds,
        "total_cash_in": total_cash_in,
        "total_cash_out": total_cash_out,
        "expected_amount": expected
    }

@router.post("/open", response_model=CashSessionResponse)
async def open_session(
    data: CashSessionOpen, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Open a new cash session. If branch_id is not passed, defaults to the primary branch."""
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

    session = CashSession(
        branch_id=branch_id,
        cashier_id=current_user.id,
        terminal_name=terminal,
        opening_amount=float(data.opening_amount),
        status="OPEN"
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session

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

@router.get("/{id}/summary", response_model=CashSessionSummary)
async def get_session_summary(
    id: UUID, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Get real-time financial summary of the cash session."""
    session = await db.get(CashSession, id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

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

    return CashSessionSummary(
        session=session,
        opening_amount=totals["opening_amount"],
        total_cash_sales=totals["total_cash_sales"],
        total_card_sales=totals["total_card_sales"],
        total_other_sales=totals["total_other_sales"],
        total_sales_count=totals["total_sales_count"],
        total_cash_refunds=totals["total_cash_refunds"],
        total_cash_in=totals["total_cash_in"],
        total_cash_out=totals["total_cash_out"],
        expected_amount=totals["expected_amount"],
        closing_amount=closing,
        variance=variance,
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
    return session

@router.get("/active", response_model=CashSessionResponse)
async def get_active_session(
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Get the current user's active open cash session, if any."""
    query = select(CashSession).where(
        CashSession.cashier_id == current_user.id,
        CashSession.status == "OPEN"
    )
    result = await db.execute(query)
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="No active session found")
    return session

@router.get("", response_model=List[CashSessionResponse], include_in_schema=False)
@router.get("/", response_model=List[CashSessionResponse])
async def list_sessions(
    status: Optional[str] = None,
    branch_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    query = select(CashSession).order_by(CashSession.opened_at.desc())
    if status:
        query = query.where(CashSession.status == status)
    if branch_id:
        query = query.where(CashSession.branch_id == branch_id)
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/{id}", response_model=CashSessionResponse)
async def get_session(
    id: UUID, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    session = await db.get(CashSession, id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session