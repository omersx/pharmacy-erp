from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.audit import log_action
from app.modules.auth.models import User
from app.modules.inventory.models import InventoryMovement
from app.modules.inventory.schemas import StockAdjustment, InventoryMovementResponse
from app.modules.medicines.models import Medicine, MedicineBatch
from app.modules.organizations.models import Branch

router = APIRouter(tags=["inventory"])

@router.get("/stock")
async def get_stock(
    branch_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    join_condition = (Medicine.id == MedicineBatch.medicine_id) & (MedicineBatch.is_active == True)
    if branch_id:
        join_condition = join_condition & (MedicineBatch.branch_id == branch_id)
        
    query = select(
        Medicine,
        func.coalesce(func.sum(MedicineBatch.quantity_remaining), 0).label("total_quantity")
    ).outerjoin(MedicineBatch, join_condition)\
     .where(Medicine.is_active == True)\
     .group_by(Medicine.id)
    result = await db.execute(query)
    
    return [
        {
            "medicine": med,
            "total_quantity": float(qty or 0)
        }
        for med, qty in result.all()
    ]

@router.get("/stock/{medicine_id}")
async def get_medicine_stock(
    medicine_id: UUID, 
    branch_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    query = select(MedicineBatch).where(
        MedicineBatch.medicine_id == medicine_id, 
        MedicineBatch.quantity_remaining > 0,
        MedicineBatch.is_active == True
    )
    if branch_id:
        query = query.where(MedicineBatch.branch_id == branch_id)
    query = query.order_by(MedicineBatch.expiry_date.asc())
    result = await db.execute(query)
    batches = result.scalars().all()
    return batches

@router.post("/adjustments", response_model=InventoryMovementResponse)
async def create_stock_adjustment(
    adjustment: StockAdjustment, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Adjust batch stock via delta quantity or physical stock count, logging full audit movements."""
    med = await db.get(Medicine, adjustment.medicine_id)
    if not med:
        raise HTTPException(status_code=404, detail="Medicine not found")

    query = select(MedicineBatch).where(
        MedicineBatch.id == adjustment.batch_id, 
        MedicineBatch.medicine_id == adjustment.medicine_id
    )
    result = await db.execute(query)
    batch = result.scalars().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
        
    branch_id = adjustment.branch_id or batch.branch_id
    if not branch_id:
        branch_result = await db.execute(select(Branch).limit(1))
        branch = branch_result.scalars().first()
        branch_id = branch.id if branch else None

    current_qty = float(batch.quantity_remaining or 0)
    adj_type = (adjustment.adjustment_type or "CORRECTION").upper()

    # Determine target_qty and delta_qty
    if adjustment.new_quantity is not None:
        target_qty = float(adjustment.new_quantity)
        if target_qty < 0:
            raise HTTPException(status_code=400, detail="New quantity cannot be negative")
        delta = target_qty - current_qty
        if abs(delta) < 0.0001:
            raise HTTPException(status_code=400, detail="New physical count is identical to current remaining stock")
        
        if delta > 0:
            movement_type = "ADJUSTMENT_IN"
            delta_qty = delta
        else:
            delta_qty = abs(delta)
            if adj_type in ["DAMAGE", "DAMAGED"]:
                movement_type = "ADJUSTMENT_DAMAGE"
            elif adj_type in ["EXPIRED", "EXPIRY"]:
                movement_type = "ADJUSTMENT_EXPIRED"
            elif adj_type in ["THEFT_LOSS", "THEFT", "LOSS"]:
                movement_type = "ADJUSTMENT_THEFT_LOSS"
            elif adj_type in ["INTERNAL_USE"]:
                movement_type = "ADJUSTMENT_INTERNAL_USE"
            else:
                movement_type = "ADJUSTMENT_OUT"
    elif adjustment.quantity is not None:
        delta_qty = float(adjustment.quantity)
        if delta_qty <= 0:
            raise HTTPException(status_code=400, detail="Adjustment quantity must be greater than zero")
        
        if adj_type in ["IN", "ADD", "ADJUSTMENT_IN"]:
            movement_type = "ADJUSTMENT_IN"
            target_qty = current_qty + delta_qty
        elif adj_type in ["OUT", "SUBTRACT", "REMOVE", "ADJUSTMENT_OUT", "DAMAGE", "DAMAGED", "EXPIRED", "THEFT_LOSS", "INTERNAL_USE", "CORRECTION"]:
            if adj_type in ["DAMAGE", "DAMAGED"]:
                movement_type = "ADJUSTMENT_DAMAGE"
            elif adj_type in ["EXPIRED", "EXPIRY"]:
                movement_type = "ADJUSTMENT_EXPIRED"
            elif adj_type in ["THEFT_LOSS", "THEFT", "LOSS"]:
                movement_type = "ADJUSTMENT_THEFT_LOSS"
            elif adj_type in ["INTERNAL_USE"]:
                movement_type = "ADJUSTMENT_INTERNAL_USE"
            else:
                movement_type = "ADJUSTMENT_OUT"
                
            if current_qty < delta_qty:
                raise HTTPException(status_code=400, detail=f"Insufficient quantity in batch. Available: {current_qty}")
            target_qty = current_qty - delta_qty
        else:
            raise HTTPException(status_code=400, detail=f"Invalid adjustment type: {adjustment.adjustment_type}")
    else:
        raise HTTPException(status_code=400, detail="Must provide either 'quantity' or 'new_quantity'")

    # Update batch
    batch.quantity_remaining = target_qty
    if target_qty <= 0:
        batch.status = "OUT_OF_STOCK"
    elif batch.status == "OUT_OF_STOCK" and target_qty > 0:
        batch.status = "ACTIVE"

    unit_cost = float(batch.purchase_price or 0)
    ref_code = f"ADJ-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    note_text = f"[{adj_type}] {adjustment.reason} (Count: {current_qty} -> {target_qty})"

    movement = InventoryMovement(
        medicine_id=adjustment.medicine_id,
        batch_id=adjustment.batch_id,
        branch_id=branch_id,
        movement_type=movement_type,
        quantity=delta_qty if movement_type == "ADJUSTMENT_IN" else -delta_qty,
        unit_cost=unit_cost,
        notes=note_text,
        created_by=current_user.id,
        reference_type="STOCK_ADJUSTMENT",
        reference_id=ref_code
    )
    db.add(movement)
    
    # Audit log
    await log_action(
        db=db,
        action="STOCK_ADJUSTMENT",
        module="Inventory",
        details=f"Stock adjusted for {med.name_en} (Batch: {batch.batch_number}): {movement_type} {delta_qty} units ({current_qty} -> {target_qty}). Reason: {adjustment.reason}",
        user=current_user,
        entity_type="MedicineBatch",
        entity_id=str(batch.id)
    )

    await db.commit()
    await db.refresh(movement)

    signed_qty = Decimal(str(movement.quantity))
    unit_c = Decimal(str(movement.unit_cost or 0))

    return InventoryMovementResponse(
        id=movement.id,
        medicine_id=movement.medicine_id,
        medicine_name=med.name_en,
        medicine_sku=med.sku,
        batch_id=movement.batch_id,
        batch_number=batch.batch_number,
        branch_id=movement.branch_id,
        movement_type=movement.movement_type,
        quantity=signed_qty,
        unit_cost=unit_c,
        total_cost=abs(signed_qty) * unit_c,
        reference_type=movement.reference_type,
        reference_id=movement.reference_id,
        notes=movement.notes,
        user_name=current_user.full_name or current_user.email,
        created_at=movement.created_at
    )

@router.get("/movements", response_model=List[InventoryMovementResponse])
async def list_movements(
    medicine_id: Optional[UUID] = None,
    branch_id: Optional[UUID] = None,
    movement_type: Optional[str] = None,
    limit: int = 300,
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """List enriched inventory movements with medicine name, batch number, user, and valuation."""
    query = (
        select(
            InventoryMovement,
            Medicine.name_en.label("medicine_name"),
            Medicine.sku.label("medicine_sku"),
            MedicineBatch.batch_number.label("batch_number"),
            User.full_name.label("user_name"),
            User.email.label("user_email")
        )
        .join(Medicine, InventoryMovement.medicine_id == Medicine.id)
        .outerjoin(MedicineBatch, InventoryMovement.batch_id == MedicineBatch.id)
        .outerjoin(User, InventoryMovement.created_by == User.id)
        .order_by(InventoryMovement.created_at.desc())
        .limit(limit)
    )
    if medicine_id:
        query = query.where(InventoryMovement.medicine_id == medicine_id)
    if branch_id:
        query = query.where(InventoryMovement.branch_id == branch_id)
    if movement_type and movement_type != "ALL":
        query = query.where(InventoryMovement.movement_type == movement_type)

    result = await db.execute(query)
    rows = result.all()

    movements = []
    for mov, med_name, med_sku, batch_num, user_name, user_email in rows:
        unit_c = Decimal(str(mov.unit_cost or 0))
        qty = Decimal(str(mov.quantity))
        movements.append(
            InventoryMovementResponse(
                id=mov.id,
                medicine_id=mov.medicine_id,
                medicine_name=med_name,
                medicine_sku=med_sku,
                batch_id=mov.batch_id,
                batch_number=batch_num or "N/A",
                branch_id=mov.branch_id,
                movement_type=mov.movement_type,
                quantity=qty,
                unit_cost=unit_c,
                total_cost=abs(qty) * unit_c,
                reference_type=mov.reference_type,
                reference_id=mov.reference_id,
                notes=mov.notes,
                user_name=user_name or user_email or "System",
                created_at=mov.created_at
            )
        )
    return movements

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
    now = datetime.now(timezone.utc)
    ninety_days_from_now = now + timedelta(days=90)
    query = select(MedicineBatch).where(
        MedicineBatch.expiry_date <= ninety_days_from_now,
        MedicineBatch.expiry_date >= now,
        MedicineBatch.quantity_remaining > 0
    )
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/alerts/expired")
async def get_expired_alerts(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    query = select(MedicineBatch).where(
        MedicineBatch.expiry_date < now,
        MedicineBatch.quantity_remaining > 0
    )
    result = await db.execute(query)
    return result.scalars().all()
