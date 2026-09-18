from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.auth.models import User
from app.modules.sales.schemas import SaleCreate, SaleResponse
from app.modules.sales.service import create_sale, return_sale
from app.modules.sales.models import Sale
import uuid
from typing import List, Optional

from app.modules.organizations.models import Branch
from datetime import datetime

router = APIRouter(tags=["Sales"])

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
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    query = select(Sale).order_by(desc(Sale.created_at))
    
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
    result = await db.execute(select(Sale).where(Sale.id == sale_id))
    sale = result.scalars().first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    return sale

@router.post("/{sale_id}/return", response_model=SaleResponse)
async def process_return(sale_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    sale = await return_sale(db, sale_id, current_user.id)
    return sale

