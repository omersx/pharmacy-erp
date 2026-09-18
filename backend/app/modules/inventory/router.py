from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from datetime import datetime, timedelta
from uuid import UUID

from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.auth.models import User
from app.modules.inventory.models import InventoryMovement
from app.modules.inventory.schemas import StockAdjustment, InventoryMovementResponse
from app.modules.medicines.models import Medicine, MedicineBatch
from app.modules.organizations.models import Branch

router = APIRouter(tags=["inventory"])

@router.get("/stock")
async def get_stock(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = select(
        Medicine,
        func.sum(MedicineBatch.quantity_remaining).label("total_quantity")
    ).outerjoin(MedicineBatch, Medicine.id == MedicineBatch.medicine_id)\
     .group_by(Medicine.id)
    result = await db.execute(query)
    
    return [
        {
            "medicine": med,
            "total_quantity": qty or 0
        }
        for med, qty in result.all()
    ]

@router.get("/stock/{medicine_id}")
async def get_medicine_stock(medicine_id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = select(MedicineBatch).where(MedicineBatch.medicine_id == medicine_id, MedicineBatch.quantity_remaining > 0)
    result = await db.execute(query)
    batches = result.scalars().all()
    return batches

@router.post("/adjustments")
async def create_stock_adjustment(
    adjustment: StockAdjustment, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    query = select(MedicineBatch).where(MedicineBatch.id == adjustment.batch_id, MedicineBatch.medicine_id == adjustment.medicine_id)
    result = await db.execute(query)
    batch = result.scalars().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
        
    branch_result = await db.execute(select(Branch))
    branch = branch_result.scalars().first()
    if not branch:
        raise HTTPException(status_code=400, detail="No branch found")
        
    movement = InventoryMovement(
        medicine_id=adjustment.medicine_id,
        batch_id=adjustment.batch_id,
        branch_id=branch.id,
        movement_type=adjustment.adjustment_type,
        quantity=adjustment.quantity,
        notes=adjustment.reason,
        created_by=current_user.id
    )
    
    if adjustment.adjustment_type in ["IN", "ADD"]:
        batch.quantity_remaining += adjustment.quantity
    elif adjustment.adjustment_type in ["OUT", "SUBTRACT", "REMOVE"]:
        if batch.quantity_remaining < adjustment.quantity:
            raise HTTPException(status_code=400, detail="Insufficient quantity in batch")
        batch.quantity_remaining -= adjustment.quantity
        
    db.add(movement)
    await db.commit()
    await db.refresh(movement)
    return movement

@router.get("/movements", response_model=List[InventoryMovementResponse])
async def list_movements(
    medicine_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    query = select(InventoryMovement).order_by(InventoryMovement.created_at.desc())
    if medicine_id:
        query = query.where(InventoryMovement.medicine_id == medicine_id)
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/alerts/low-stock")
async def get_low_stock_alerts(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    effective_reorder = func.coalesce(func.nullif(Medicine.reorder_level, 0), 10)
    query = select(
        Medicine,
        func.coalesce(func.sum(MedicineBatch.quantity_remaining), 0).label("total_quantity")
    ).outerjoin(MedicineBatch, Medicine.id == MedicineBatch.medicine_id)\
     .group_by(Medicine.id)\
     .having(func.coalesce(func.sum(MedicineBatch.quantity_remaining), 0) <= effective_reorder)\
     .having(func.coalesce(func.sum(MedicineBatch.quantity_remaining), 0) > 0)
    
    result = await db.execute(query)
    return [
        {
            "medicine": med,
            "total_quantity": qty or 0,
            "reorder_level": med.reorder_level if med.reorder_level and med.reorder_level > 0 else 10
        }
        for med, qty in result.all()
    ]

@router.get("/alerts/out-of-stock")
async def get_out_of_stock_alerts(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = select(
        Medicine,
        func.coalesce(func.sum(MedicineBatch.quantity_remaining), 0).label("total_quantity")
    ).outerjoin(MedicineBatch, Medicine.id == MedicineBatch.medicine_id)\
     .group_by(Medicine.id)\
     .having(func.coalesce(func.sum(MedicineBatch.quantity_remaining), 0) <= 0)
    
    result = await db.execute(query)
    return [
        {
            "medicine": med,
            "total_quantity": 0,
            "reorder_level": med.reorder_level
        }
        for med, qty in result.all()
    ]

@router.get("/alerts/expiring")
async def get_expiring_alerts(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    ninety_days_from_now = datetime.utcnow() + timedelta(days=90)
    query = select(MedicineBatch).where(
        MedicineBatch.expiry_date <= ninety_days_from_now,
        MedicineBatch.expiry_date >= datetime.utcnow(),
        MedicineBatch.quantity_remaining > 0
    )
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/alerts/expired")
async def get_expired_alerts(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = select(MedicineBatch).where(
        MedicineBatch.expiry_date < datetime.utcnow(),
        MedicineBatch.quantity_remaining > 0
    )
    result = await db.execute(query)
    return result.scalars().all()
