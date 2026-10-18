from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.audit import log_action
from app.modules.auth.models import User
from app.modules.inventory.models import InventoryMovement
from app.modules.inventory.schemas import (
    StockAdjustment, InventoryMovementResponse,
    BatchStatusUpdate, ExpiryBatchItem, ExpiryDashboardSummary, ExpiryDashboardResponse
)
from app.modules.medicines.models import Medicine, MedicineBatch
from app.modules.organizations.models import Branch

router = APIRouter(tags=["inventory"])

@router.get("/stock")
async def get_stock(
    branch_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    join_condition = (
        (Medicine.id == MedicineBatch.medicine_id) & 
        (MedicineBatch.is_active == True) &
        (MedicineBatch.status.in_(["ACTIVE", "NEAR_EXPIRY"])) &
        (MedicineBatch.expiry_date > now)
    )
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
    now = datetime.now(timezone.utc)
    query = select(MedicineBatch).where(
        MedicineBatch.medicine_id == medicine_id, 
        MedicineBatch.quantity_remaining > 0,
        MedicineBatch.is_active == True,
        MedicineBatch.status.in_(["ACTIVE", "NEAR_EXPIRY"]),
        MedicineBatch.expiry_date > now
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

@router.get("/expiry-dashboard", response_model=ExpiryDashboardResponse)
async def get_expiry_dashboard(
    branch_id: Optional[UUID] = None,
    bucket_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Expiry & Recall Control Dashboard:
    Computes real-time expiry buckets (0-30d, 31-60d, 61-90d, Expired, Quarantined, Recalled)
    and lists all at-risk batches with financial valuation.
    """
    now = datetime.now(timezone.utc)
    
    query = (
        select(MedicineBatch, Medicine, Branch)
        .join(Medicine, MedicineBatch.medicine_id == Medicine.id)
        .outerjoin(Branch, MedicineBatch.branch_id == Branch.id)
        .where(
            MedicineBatch.is_active == True,
            or_(
                MedicineBatch.quantity_remaining > 0,
                MedicineBatch.status.in_(["QUARANTINED", "RECALLED", "EXPIRED"])
            )
        )
        .order_by(MedicineBatch.expiry_date.asc())
    )
    if branch_id:
        query = query.where(MedicineBatch.branch_id == branch_id)

    res = await db.execute(query)
    rows = res.all()

    summary = ExpiryDashboardSummary()
    batch_items: List[ExpiryBatchItem] = []

    for batch, med, branch in rows:
        exp_date = batch.expiry_date
        if exp_date.tzinfo is None:
            exp_date = exp_date.replace(tzinfo=timezone.utc)
        
        diff = exp_date - now
        days_left = diff.days

        rem_qty = Decimal(str(batch.quantity_remaining or 0))
        unit_price = Decimal(str(batch.purchase_price or 0))
        at_risk_value = rem_qty * unit_price

        cur_status = (batch.status or "ACTIVE").upper()

        if cur_status == "RECALLED":
            bucket = "RECALLED"
            summary.count_recalled += 1
            summary.value_recalled += at_risk_value
        elif cur_status == "QUARANTINED":
            bucket = "QUARANTINED"
            summary.count_quarantined += 1
            summary.value_quarantined += at_risk_value
        elif days_left < 0:
            bucket = "EXPIRED"
            if cur_status == "ACTIVE":
                cur_status = "EXPIRED"
            summary.count_expired += 1
            summary.value_expired += at_risk_value
        elif days_left <= 30:
            bucket = "0_30_DAYS"
            if cur_status == "ACTIVE":
                cur_status = "NEAR_EXPIRY"
            summary.count_0_30 += 1
            summary.value_0_30 += at_risk_value
        elif days_left <= 60:
            bucket = "31_60_DAYS"
            if cur_status == "ACTIVE":
                cur_status = "NEAR_EXPIRY"
            summary.count_31_60 += 1
            summary.value_31_60 += at_risk_value
        elif days_left <= 90:
            bucket = "61_90_DAYS"
            if cur_status == "ACTIVE":
                cur_status = "NEAR_EXPIRY"
            summary.count_61_90 += 1
            summary.value_61_90 += at_risk_value
        else:
            bucket = "SAFE"

        # Apply bucket filter
        if bucket_filter and bucket_filter != "ALL":
            if bucket_filter == "EXPIRING_SOON" and bucket not in ["0_30_DAYS", "31_60_DAYS", "61_90_DAYS"]:
                continue
            elif bucket_filter == "0_30" and bucket != "0_30_DAYS":
                continue
            elif bucket_filter == "31_60" and bucket != "31_60_DAYS":
                continue
            elif bucket_filter == "61_90" and bucket != "61_90_DAYS":
                continue
            elif bucket_filter == "EXPIRED" and bucket != "EXPIRED":
                continue
            elif bucket_filter == "QUARANTINED" and bucket != "QUARANTINED":
                continue
            elif bucket_filter == "RECALLED" and bucket != "RECALLED":
                continue
            elif bucket_filter == "AT_RISK" and bucket == "SAFE":
                continue

        # If no filter specified, only return at-risk batches
        if not bucket_filter and bucket == "SAFE":
            continue

        item = ExpiryBatchItem(
            batch_id=batch.id,
            batch_number=batch.batch_number,
            medicine_id=med.id,
            medicine_name=med.name_en,
            medicine_sku=med.sku,
            branch_id=batch.branch_id,
            branch_name=branch.name if branch else "Main Branch",
            expiry_date=batch.expiry_date,
            days_to_expiry=days_left,
            quantity_remaining=rem_qty,
            purchase_price=unit_price,
            total_value_at_risk=at_risk_value,
            status=cur_status,
            notes=batch.notes,
            bucket=bucket
        )
        batch_items.append(item)

    summary.total_batches_at_risk = (
        summary.count_0_30 + summary.count_31_60 + summary.count_61_90 + 
        summary.count_expired + summary.count_quarantined + summary.count_recalled
    )
    summary.total_value_at_risk = (
        summary.value_0_30 + summary.value_31_60 + summary.value_61_90 + 
        summary.value_expired + summary.value_quarantined + summary.value_recalled
    )

    return ExpiryDashboardResponse(
        summary=summary,
        batches=batch_items
    )

@router.post("/batches/{batch_id}/status")
async def update_batch_status(
    batch_id: UUID,
    status_update: BatchStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Control batch lifecycle: QUARANTINE, RECALL, RELEASE (ACTIVE), or DISPOSE / WRITE-OFF.
    Enforces audit logging, inventory movements, and immediate sale isolation.
    """
    target_status = status_update.status.upper()
    if target_status not in ["ACTIVE", "QUARANTINED", "RECALLED", "DISPOSED"]:
        raise HTTPException(status_code=400, detail=f"Invalid status: {status_update.status}")

    res = await db.execute(select(MedicineBatch).where(MedicineBatch.id == batch_id))
    batch = res.scalars().first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    med = await db.get(Medicine, batch.medicine_id)
    med_name = med.name_en if med else "Unknown"

    now = datetime.now(timezone.utc)
    exp_date = batch.expiry_date.replace(tzinfo=timezone.utc) if batch.expiry_date.tzinfo is None else batch.expiry_date
    qty_remaining = Decimal(str(batch.quantity_remaining or 0))

    if target_status == "QUARANTINED":
        batch.status = "QUARANTINED"
        batch.notes = f"Quarantined: {status_update.reason}" + (f" (Ref: {status_update.reference})" if status_update.reference else "")
        movement = InventoryMovement(
            medicine_id=batch.medicine_id,
            batch_id=batch.id,
            branch_id=batch.branch_id,
            movement_type="BATCH_QUARANTINED",
            quantity=0,
            unit_cost=batch.purchase_price,
            reference_type="QUARANTINE",
            reference_id=status_update.reference or str(batch.id),
            notes=status_update.reason,
            created_by=current_user.id
        )
        db.add(movement)
        await log_action(
            db=db, action="QUARANTINE_BATCH", module="Inventory",
            details=f"Quarantined batch {batch.batch_number} ({med_name}). Reason: {status_update.reason}",
            user=current_user, entity_type="MedicineBatch", entity_id=str(batch.id)
        )

    elif target_status == "RECALLED":
        batch.status = "RECALLED"
        batch.notes = f"Recalled: {status_update.reason}" + (f" (Ref: {status_update.reference})" if status_update.reference else "")
        movement = InventoryMovement(
            medicine_id=batch.medicine_id,
            batch_id=batch.id,
            branch_id=batch.branch_id,
            movement_type="BATCH_RECALLED",
            quantity=0,
            unit_cost=batch.purchase_price,
            reference_type="RECALL",
            reference_id=status_update.reference or str(batch.id),
            notes=status_update.reason,
            created_by=current_user.id
        )
        db.add(movement)
        await log_action(
            db=db, action="RECALL_BATCH", module="Inventory",
            details=f"Recalled batch {batch.batch_number} ({med_name}). Reason: {status_update.reason}",
            user=current_user, entity_type="MedicineBatch", entity_id=str(batch.id)
        )

    elif target_status == "ACTIVE":
        if exp_date < now:
            raise HTTPException(status_code=400, detail="Cannot release an expired batch back into active sellable stock.")
        batch.status = "ACTIVE"
        movement = InventoryMovement(
            medicine_id=batch.medicine_id,
            batch_id=batch.id,
            branch_id=batch.branch_id,
            movement_type="QUARANTINE_RELEASED",
            quantity=0,
            unit_cost=batch.purchase_price,
            reference_type="RELEASE",
            notes=status_update.reason or "Released from quarantine back to active stock",
            created_by=current_user.id
        )
        db.add(movement)
        await log_action(
            db=db, action="RELEASE_BATCH", module="Inventory",
            details=f"Released batch {batch.batch_number} ({med_name}) back to ACTIVE status",
            user=current_user, entity_type="MedicineBatch", entity_id=str(batch.id)
        )

    elif target_status == "DISPOSED":
        dispose_qty = status_update.quantity_to_dispose or qty_remaining
        if dispose_qty <= 0:
            raise HTTPException(status_code=400, detail="Disposal quantity must be greater than zero.")
        if dispose_qty > qty_remaining:
            raise HTTPException(status_code=400, detail=f"Cannot dispose {dispose_qty} units; only {qty_remaining} units remain in batch.")

        new_remaining = qty_remaining - dispose_qty
        batch.quantity_remaining = float(new_remaining)
        if new_remaining == 0:
            batch.status = "DISPOSED"

        mov_type = "EXPIRY_WRITEOFF" if exp_date < now else "DISPOSAL_WRITEOFF"
        movement = InventoryMovement(
            medicine_id=batch.medicine_id,
            batch_id=batch.id,
            branch_id=batch.branch_id,
            movement_type=mov_type,
            quantity=-dispose_qty,
            unit_cost=batch.purchase_price,
            reference_type="DISPOSAL",
            reference_id=status_update.reference or str(batch.id),
            notes=status_update.reason,
            created_by=current_user.id
        )
        db.add(movement)
        await log_action(
            db=db, action="DISPOSE_BATCH", module="Inventory",
            details=f"Wrote off / Disposed {dispose_qty} units of batch {batch.batch_number} ({med_name}). Reason: {status_update.reason}",
            user=current_user, entity_type="MedicineBatch", entity_id=str(batch.id)
        )

    await db.commit()
    await db.refresh(batch)

    return {
        "success": True,
        "message": f"Batch {batch.batch_number} status updated to {batch.status}",
        "batch_id": str(batch.id),
        "status": batch.status,
        "quantity_remaining": float(batch.quantity_remaining)
    }
