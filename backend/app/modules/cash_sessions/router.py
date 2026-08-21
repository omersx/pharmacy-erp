from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from uuid import UUID
from datetime import datetime

from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.auth.models import User
from app.modules.cash_sessions.models import CashSession
from app.modules.cash_sessions.schemas import CashSessionOpen, CashSessionClose, CashSessionResponse

router = APIRouter(tags=["cash-sessions"])

@router.post("/open", response_model=CashSessionResponse)
async def open_session(data: CashSessionOpen, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = select(CashSession).where(
        CashSession.cashier_id == current_user.id,
        CashSession.status == "OPEN"
    )
    result = await db.execute(query)
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="User already has an open cash session")
        
    session = CashSession(
        branch_id=data.branch_id,
        cashier_id=current_user.id,
        terminal_name=data.terminal_name,
        opening_amount=data.opening_amount,
        status="OPEN"
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session

@router.post("/{id}/close", response_model=CashSessionResponse)
async def close_session(id: UUID, data: CashSessionClose, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = await db.get(CashSession, id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    if session.status != "OPEN":
        raise HTTPException(status_code=400, detail="Session is not open")
        
    expected = session.opening_amount
    variance = data.closing_amount - expected
    
    session.closing_amount = data.closing_amount
    session.expected_amount = expected
    session.variance = variance
    session.status = "CLOSED"
    session.closed_at = datetime.utcnow()
    if data.notes:
        session.notes = data.notes
        
    await db.commit()
    await db.refresh(session)
    return session

@router.get("/active", response_model=CashSessionResponse)
async def get_active_session(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = select(CashSession).where(
        CashSession.cashier_id == current_user.id,
        CashSession.status == "OPEN"
    )
    result = await db.execute(query)
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="No active session found")
    return session

@router.get("/", response_model=List[CashSessionResponse])
async def list_sessions(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = select(CashSession).order_by(CashSession.opened_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/{id}", response_model=CashSessionResponse)
async def get_session(id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = await db.get(CashSession, id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session