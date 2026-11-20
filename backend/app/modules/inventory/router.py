from fastapi import APIRouter, Depends, HTTPException, Query, Response, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, case, and_
from typing import List, Optional
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID
import io
import csv
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.audit import log_action
from app.modules.auth.models import User
from app.modules.inventory.models import (
    InventoryMovement, StockLocation, BatchLocationStock,
    StockCountSession, StockCountLine
)
from app.modules.inventory.schemas import (
    StockAdjustment, InventoryMovementResponse,
    BatchStatusUpdate, ExpiryBatchItem, ExpiryDashboardSummary, ExpiryDashboardResponse,
    StockLocationCreate, StockLocationUpdate, StockLocationResponse,
    BatchLocationStockResponse, QuickRefillRequest, BulkRefillRequest,
    MoveToWarehouseRequest, ConsolidateStockRequest,
    RefillSuggestionItem, RefillSuggestionBatch, LocationStockSummaryItem,
    StartCycleCountRequest, UpdateCycleCountRequest, CycleCountSessionResponse, CycleCountLineResponse
)
from app.modules.inventory.location_service import (
    get_or_create_default_locations, transfer_stock_between_locations
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


# =========================================================================
# Location Management & Shelf-Warehouse Refill Endpoints
# =========================================================================

async def _seed_branch_batches_to_locations(db: AsyncSession, branch_id: UUID, shelf_loc_id: UUID):
    """Seed any unallocated batch quantities in this branch to the default shelf location."""
    unallocated_stmt = (
        select(MedicineBatch)
        .outerjoin(BatchLocationStock, BatchLocationStock.batch_id == MedicineBatch.id)
        .where(
            MedicineBatch.branch_id == branch_id,
            MedicineBatch.quantity_remaining > 0,
            MedicineBatch.is_active == True,
            BatchLocationStock.id == None
        )
    )
    b_res = await db.execute(unallocated_stmt)
    unallocated_batches = b_res.scalars().all()
    if unallocated_batches:
        for batch in unallocated_batches:
            db.add(BatchLocationStock(
                batch_id=batch.id,
                location_id=shelf_loc_id,
                quantity=Decimal(str(batch.quantity_remaining or 0))
            ))
        await db.flush()


@router.get("/locations", response_model=List[StockLocationResponse])
async def list_stock_locations(
    branch_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all stock locations for a branch (auto-creates default Shelf and Warehouse if missing)."""
    target_branch_id = branch_id or getattr(current_user, "branch_id", None)
    if not target_branch_id:
        b_res = await db.execute(select(Branch).limit(1))
        first_branch = b_res.scalars().first()
        if first_branch:
            target_branch_id = first_branch.id

    if target_branch_id:
        shelf_loc, wh_loc = await get_or_create_default_locations(db, target_branch_id)
        await _seed_branch_batches_to_locations(db, target_branch_id, shelf_loc.id)
        await db.commit()

    query = select(StockLocation).where(StockLocation.is_active == True)
    if target_branch_id:
        query = query.where(StockLocation.branch_id == target_branch_id)
    query = query.order_by(
        StockLocation.is_default_dispense.desc(),
        StockLocation.is_default_receive.desc(),
        StockLocation.name_en.asc()
    )
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/locations", response_model=StockLocationResponse)
async def create_stock_location(
    location_in: StockLocationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new custom stock location (e.g. Fridge, Narcotics Locker, Shelf B)."""
    loc = StockLocation(
        branch_id=location_in.branch_id,
        name_en=location_in.name_en,
        name_ar=location_in.name_ar,
        location_type=location_in.location_type,
        code=location_in.code,
        is_default_dispense=location_in.is_default_dispense,
        is_default_receive=location_in.is_default_receive,
        is_active=location_in.is_active,
    )
    db.add(loc)
    await db.commit()
    await db.refresh(loc)
    return loc


@router.get("/locations/stock-summary", response_model=List[LocationStockSummaryItem])
async def get_locations_stock_summary(
    branch_id: Optional[UUID] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get stock breakdown per medicine between Shelf, Warehouse, and Other locations."""
    target_branch_id = branch_id or getattr(current_user, "branch_id", None)
    if not target_branch_id:
        b_res = await db.execute(select(Branch).limit(1))
        first_branch = b_res.scalars().first()
        if first_branch:
            target_branch_id = first_branch.id

    if not target_branch_id:
        return []

    shelf_loc, wh_loc = await get_or_create_default_locations(db, target_branch_id)
    await _seed_branch_batches_to_locations(db, target_branch_id, shelf_loc.id)
    await db.commit()

    med_query = select(Medicine).where(Medicine.is_active == True)
    if search:
        search_filter = f"%{search}%"
        med_query = med_query.where(
            or_(
                Medicine.name_en.ilike(search_filter),
                Medicine.name_ar.ilike(search_filter),
                Medicine.sku.ilike(search_filter),
                Medicine.barcode.ilike(search_filter),
            )
        )
    med_res = await db.execute(med_query)
    medicines = med_res.scalars().all()

    now = datetime.now(timezone.utc)

    # Optimized single aggregation query for all medicines in branch
    stock_agg_stmt = (
        select(
            MedicineBatch.medicine_id,
            func.coalesce(func.sum(
                case((StockLocation.is_default_dispense == True, BatchLocationStock.quantity), else_=Decimal('0.0'))
            ), Decimal('0.0')).label("shelf_qty"),
            func.coalesce(func.sum(
                case((StockLocation.is_default_receive == True, BatchLocationStock.quantity), else_=Decimal('0.0'))
            ), Decimal('0.0')).label("warehouse_qty"),
            func.coalesce(func.sum(
                case(
                    (and_(StockLocation.is_default_dispense == False, StockLocation.is_default_receive == False), BatchLocationStock.quantity),
                    else_=Decimal('0.0')
                )
            ), Decimal('0.0')).label("other_qty"),
        )
        .join(MedicineBatch, BatchLocationStock.batch_id == MedicineBatch.id)
        .join(StockLocation, BatchLocationStock.location_id == StockLocation.id)
        .where(
            MedicineBatch.branch_id == target_branch_id,
            MedicineBatch.is_active == True,
            MedicineBatch.status.in_(["ACTIVE", "NEAR_EXPIRY"]),
            MedicineBatch.expiry_date > now
        )
        .group_by(MedicineBatch.medicine_id)
    )
    stock_res = await db.execute(stock_agg_stmt)
    stock_map = {row.medicine_id: row for row in stock_res.all()}

    summary_items = []
    for med in medicines:
        stock_row = stock_map.get(med.id)
        shelf_qty = Decimal(str(stock_row.shelf_qty)) if stock_row else Decimal('0.0')
        warehouse_qty = Decimal(str(stock_row.warehouse_qty)) if stock_row else Decimal('0.0')
        other_qty = Decimal(str(stock_row.other_qty)) if stock_row else Decimal('0.0')

        total_qty = shelf_qty + warehouse_qty + other_qty
        reorder_threshold = Decimal(str(med.reorder_level if med.reorder_level is not None else 10))
        needs_refill = bool((shelf_qty <= reorder_threshold) and (warehouse_qty > 0))

        summary_items.append(LocationStockSummaryItem(
            medicine_id=med.id,
            medicine_name=med.name_en or med.name_ar or "",
            medicine_sku=med.sku or "",
            dosage_form=med.dosage_form,
            strength=med.strength,
            unit=med.base_unit or "Units",
            shelf_stock=shelf_qty,
            warehouse_stock=warehouse_qty,
            other_locations_stock=other_qty,
            total_stock=total_qty,
            reorder_level=int(reorder_threshold),
            needs_refill=needs_refill,
        ))

    return summary_items


@router.get("/export")
async def export_inventory_stock(
    format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
    branch_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Export full inventory balances breakdown (Shelf Stock, Warehouse Stock, Total, Valuation)
    as high-fidelity Excel (.xlsx) or UTF-8 CSV.
    """
    target_branch_id = branch_id or getattr(current_user, "branch_id", None)
    if not target_branch_id:
        b_res = await db.execute(select(Branch).limit(1))
        first_branch = b_res.scalars().first()
        if first_branch:
            target_branch_id = first_branch.id

    if not target_branch_id:
        raise HTTPException(status_code=400, detail="Branch required")

    shelf_loc, wh_loc = await get_or_create_default_locations(db, target_branch_id)
    await _seed_branch_batches_to_locations(db, target_branch_id, shelf_loc.id)

    med_query = select(Medicine).where(Medicine.is_active == True).order_by(Medicine.name_en.asc())
    med_res = await db.execute(med_query)
    medicines = med_res.scalars().all()

    now = datetime.now(timezone.utc)
    stock_agg_stmt = (
        select(
            MedicineBatch.medicine_id,
            func.coalesce(func.sum(
                case((StockLocation.is_default_dispense == True, BatchLocationStock.quantity), else_=Decimal('0.0'))
            ), Decimal('0.0')).label("shelf_qty"),
            func.coalesce(func.sum(
                case((StockLocation.is_default_receive == True, BatchLocationStock.quantity), else_=Decimal('0.0'))
            ), Decimal('0.0')).label("warehouse_qty"),
        )
        .join(MedicineBatch, BatchLocationStock.batch_id == MedicineBatch.id)
        .join(StockLocation, BatchLocationStock.location_id == StockLocation.id)
        .where(
            MedicineBatch.branch_id == target_branch_id,
            MedicineBatch.is_active == True,
            MedicineBatch.status.in_(["ACTIVE", "NEAR_EXPIRY"]),
            MedicineBatch.expiry_date > now
        )
        .group_by(MedicineBatch.medicine_id)
    )
    stock_res = await db.execute(stock_agg_stmt)
    stock_map = {row.medicine_id: row for row in stock_res.all()}

    headers = [
        "SKU / الكود",
        "Barcode / الباركود",
        "Medicine Name (EN) / اسم الدواء",
        "Arabic Name / الاسم بالعربية",
        "Dosage Form / الشكل الدوائي",
        "Strength / العيار",
        "Base Unit / الوحدة",
        "Shelf Stock / مخزون الرف",
        "Warehouse Stock / مخزون المستودع",
        "Total Stock / إجمالي المخزون",
        "Reorder Level / حد إعادة الطلب",
        "Selling Price / سعر البيع",
        "Shelf Valuation / قيمة مخزون الرف",
        "Warehouse Valuation / قيمة مخزون المستودع",
        "Total Valuation / القيمة الإجمالية",
        "Status / الحالة"
    ]

    rows = []
    for m in medicines:
        stk = stock_map.get(m.id)
        shelf_qty = float(stk.shelf_qty) if stk else 0.0
        wh_qty = float(stk.warehouse_qty) if stk else 0.0
        total_qty = shelf_qty + wh_qty
        reorder = m.reorder_level if m.reorder_level is not None else 10
        price = float(m.selling_price or 0.0)

        shelf_val = round(shelf_qty * price, 2)
        wh_val = round(wh_qty * price, 2)
        total_val = round(total_qty * price, 2)

        if total_qty == 0:
            status_text = "Out of Stock / نفاد المخزون"
        elif shelf_qty == 0 and wh_qty > 0:
            status_text = "Needs Refill / بحاجة لتعبئة الرف"
        elif shelf_qty <= reorder and wh_qty > 0:
            status_text = "Low on Shelf / منخفض على الرف"
        else:
            status_text = "Normal / طبيعي"

        rows.append([
            m.sku or "",
            m.barcode or "",
            m.name_en or "",
            m.name_ar or "",
            m.dosage_form or "",
            m.strength or "",
            m.base_unit or "Units",
            shelf_qty,
            wh_qty,
            total_qty,
            reorder,
            price,
            shelf_val,
            wh_val,
            total_val,
            status_text
        ])

    timestamp_str = datetime.now().strftime("%Y-%m-%d")

    if format == "csv":
        output = io.StringIO()
        output.write('\ufeff')  # UTF-8 BOM
        writer = csv.writer(output)
        writer.writerow(headers)
        writer.writerows(rows)
        csv_bytes = output.getvalue().encode('utf-8')
        return Response(
            content=csv_bytes,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename=inventory_stock_{timestamp_str}.csv"}
        )

    # Format == "xlsx"
    wb = Workbook()
    ws = wb.active
    ws.title = "Inventory Stock"

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    zebra_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    thin_border = Border(
        left=Side(style='thin', color='E2E8F0'),
        right=Side(style='thin', color='E2E8F0'),
        top=Side(style='thin', color='E2E8F0'),
        bottom=Side(style='thin', color='E2E8F0')
    )

    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    ws.row_dimensions[1].height = 28

    for row_idx, row_data in enumerate(rows, start=2):
        ws.append(row_data)
        is_even = (row_idx % 2 == 0)
        for col_idx, val in enumerate(row_data, start=1):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.border = thin_border
            if is_even:
                cell.fill = zebra_fill
            
            if col_idx in [8, 9, 10, 11]:
                cell.alignment = Alignment(horizontal="right")
                cell.number_format = '#,##0.00'
            elif col_idx in [12, 13, 14, 15]:
                cell.alignment = Alignment(horizontal="right")
                cell.number_format = '#,##0.00'
            elif col_idx in [1, 2, 7]:
                cell.alignment = Alignment(horizontal="center")

    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col[:50]:
            val_str = str(cell.value or '')
            max_len = max(max_len, len(val_str))
        ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 40)

    ws.freeze_panes = "A2"

    bio = io.BytesIO()
    wb.save(bio)
    bio.seek(0)

    return Response(
        content=bio.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=inventory_stock_{timestamp_str}.xlsx"}
    )


@router.post("/restore-stock")
async def restore_inventory_stock(
    file: UploadFile = File(...),
    branch_id: Optional[UUID] = None,
    inventory_mode: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Restore or reconcile inventory stock balances from an exported Excel (.xlsx) or CSV file.
    Updates Shelf Stock and Warehouse Stock per medicine, reconciles batches, and logs audit movements.
    Supports Simple Mode (Single Shelf) where all stock is directed to Dispensary Shelf.
    """
    filename = (file.filename or "").lower()
    if not (filename.endswith(".xlsx") or filename.endswith(".xls") or filename.endswith(".csv")):
        raise HTTPException(status_code=400, detail="Only Excel (.xlsx) or CSV (.csv) files are supported")

    contents = await file.read()
    if not contents or len(contents) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    header_row = []
    data_rows = []

    if filename.endswith(".csv"):
        try:
            text = contents.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = contents.decode("latin-1", errors="replace")
        reader = list(csv.reader(io.StringIO(text)))
        if not reader or len(reader) < 2:
            raise HTTPException(status_code=400, detail="CSV file must contain a header row and at least one data row")
        header_row = [str(c or "").strip() for c in reader[0]]
        data_rows = reader[1:]
    else:
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
            sheet = wb.active
            sheet_rows = list(sheet.iter_rows(values_only=True))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse Excel file: {str(e)}")

        if not sheet_rows or len(sheet_rows) < 2:
            raise HTTPException(status_code=400, detail="Excel file must contain a header row and at least one data row")
        header_row = [str(c or "").strip() for c in sheet_rows[0]]
        data_rows = sheet_rows[1:]

    col_indices = {}
    for idx, h in enumerate(header_row):
        hl = h.lower().strip()
        if "barcode" in hl or "باركود" in hl:
            col_indices["barcode"] = idx
        elif "sku" in hl or ("كود" in hl and "بار" not in hl):
            col_indices["sku"] = idx
        elif "shelf" in hl or "رف" in hl:
            col_indices["shelf_stock"] = idx
        elif "warehouse" in hl or "مستودع" in hl or "مخزن" in hl or "back store" in hl:
            col_indices["warehouse_stock"] = idx
        elif ("total" in hl and "stock" in hl) or "إجمالي المخزون" in hl or "initial" in hl or hl in ["stock", "qty", "quantity", "مخزون", "الكمية", "كمية"]:
            if "total_stock" not in col_indices:
                col_indices["total_stock"] = idx
        elif "reorder" in hl or "إعادة الطلب" in hl:
            col_indices["reorder_level"] = idx
        elif ("selling" in hl and "price" in hl) or "سعر البيع" in hl:
            col_indices["selling_price"] = idx

    if "sku" not in col_indices and "barcode" not in col_indices:
        raise HTTPException(status_code=400, detail="File must contain an 'SKU' or 'Barcode' column to identify medicines")

    target_branch_id = branch_id or getattr(current_user, "branch_id", None)
    if not target_branch_id:
        b_res = await db.execute(select(Branch).limit(1))
        first_branch = b_res.scalars().first()
        if first_branch:
            target_branch_id = first_branch.id
    if not target_branch_id:
        raise HTTPException(status_code=400, detail="Branch required for stock restoration")

    shelf_loc, wh_loc = await get_or_create_default_locations(db, target_branch_id)

    med_res = await db.execute(select(Medicine).where(Medicine.is_active == True))
    all_meds = med_res.scalars().all()
    sku_map = {m.sku.strip().upper(): m for m in all_meds if m.sku}
    barcode_map = {m.barcode.strip(): m for m in all_meds if m.barcode}

    # Pre-fetch all batches and location stock entries for this branch in ONE single query
    batches_q = await db.execute(
        select(MedicineBatch)
        .where(MedicineBatch.branch_id == target_branch_id)
        .order_by(MedicineBatch.expiry_date.asc().nullslast(), MedicineBatch.created_at.desc())
    )
    all_branch_batches = batches_q.scalars().all()
    batches_by_med = defaultdict(list)
    for b in all_branch_batches:
        batches_by_med[b.medicine_id].append(b)

    all_batch_ids = [b.id for b in all_branch_batches]
    loc_stock_by_batch_loc = {}
    if all_batch_ids:
        loc_stocks_q = await db.execute(
            select(BatchLocationStock)
            .where(
                BatchLocationStock.batch_id.in_(all_batch_ids),
                BatchLocationStock.location_id.in_([shelf_loc.id, wh_loc.id])
            )
        )
        for entry in loc_stocks_q.scalars().all():
            loc_stock_by_batch_loc[(entry.batch_id, entry.location_id)] = entry

    def parse_num(val, default=0.0):
        if val is None or val == "":
            return default
        try:
            cleaned = str(val).replace(",", "").replace("$", "").replace("SDG", "").strip()
            return max(0.0, float(cleaned))
        except (ValueError, TypeError):
            return default

    updated_count = 0
    skipped = []
    now_utc = datetime.now(timezone.utc)

    for row_idx, r in enumerate(data_rows, start=2):
        if not r or not any(r):
            continue

        sku_val = ""
        if "sku" in col_indices and col_indices["sku"] < len(r) and r[col_indices["sku"]] is not None:
            sku_val = str(r[col_indices["sku"]]).strip()

        barcode_val = ""
        if "barcode" in col_indices and col_indices["barcode"] < len(r) and r[col_indices["barcode"]] is not None:
            barcode_val = str(r[col_indices["barcode"]]).strip()

        med = None
        if sku_val:
            med = sku_map.get(sku_val.upper())
        if not med and barcode_val:
            med = barcode_map.get(barcode_val)

        if not med:
            skipped.append({
                "row": row_idx,
                "sku": sku_val,
                "barcode": barcode_val,
                "reason": "Medicine not found in catalog"
            })
            continue

        target_shelf = 0.0
        target_wh = 0.0
        has_shelf = "shelf_stock" in col_indices and col_indices["shelf_stock"] < len(r)
        has_wh = "warehouse_stock" in col_indices and col_indices["warehouse_stock"] < len(r)

        if has_shelf:
            target_shelf = parse_num(r[col_indices["shelf_stock"]], 0.0)
        if has_wh:
            target_wh = parse_num(r[col_indices["warehouse_stock"]], 0.0)

        if not has_shelf and not has_wh and "total_stock" in col_indices and col_indices["total_stock"] < len(r):
            target_shelf = parse_num(r[col_indices["total_stock"]], 0.0)
            target_wh = 0.0

        # If Simple Mode is active or requested, consolidate all stock into Dispensary Shelf (no warehouse)
        if inventory_mode == "simple":
            target_shelf = target_shelf + target_wh
            target_wh = 0.0

        # Guard against accidental barcode/identifier values placed in stock columns (e.g. 13-digit EAN > 10,000,000)
        MAX_SAFE_BATCH_STOCK = 10_000_000.0
        if target_shelf > MAX_SAFE_BATCH_STOCK:
            target_shelf = 0.0
        if target_wh > MAX_SAFE_BATCH_STOCK:
            target_wh = 0.0

        if "reorder_level" in col_indices and col_indices["reorder_level"] < len(r):
            reorder_val = r[col_indices["reorder_level"]]
            if reorder_val is not None and str(reorder_val).strip() != "":
                try:
                    med.reorder_level = int(parse_num(reorder_val, med.reorder_level or 10))
                except Exception:
                    pass

        if "selling_price" in col_indices and col_indices["selling_price"] < len(r):
            price_val = r[col_indices["selling_price"]]
            if price_val is not None and str(price_val).strip() != "":
                try:
                    parsed_p = parse_num(price_val, 0.0)
                    if parsed_p > 0:
                        med.selling_price = Decimal(str(parsed_p))
                except Exception:
                    pass

        med_batches = batches_by_med.get(med.id, [])

        if not med_batches:
            if (target_shelf + target_wh) > 0:
                new_batch = MedicineBatch(
                    medicine_id=med.id,
                    branch_id=target_branch_id,
                    batch_number=f"RESTORE-{med.sku or 'STK'}",
                    purchase_price=float(med.selling_price or 0.0) * 0.7,
                    quantity_received=target_shelf + target_wh,
                    quantity_remaining=target_shelf + target_wh,
                    expiry_date=(now_utc + timedelta(days=365)).date(),
                    received_date=now_utc,
                    status="ACTIVE",
                    is_active=True
                )
                db.add(new_batch)
                await db.flush()
                batches_by_med[med.id].append(new_batch)

                if target_shelf > 0:
                    shelf_entry = BatchLocationStock(batch_id=new_batch.id, location_id=shelf_loc.id, quantity=target_shelf)
                    db.add(shelf_entry)
                    loc_stock_by_batch_loc[(new_batch.id, shelf_loc.id)] = shelf_entry
                if target_wh > 0:
                    wh_entry = BatchLocationStock(batch_id=new_batch.id, location_id=wh_loc.id, quantity=target_wh)
                    db.add(wh_entry)
                    loc_stock_by_batch_loc[(new_batch.id, wh_loc.id)] = wh_entry

                db.add(InventoryMovement(
                    medicine_id=med.id,
                    batch_id=new_batch.id,
                    branch_id=target_branch_id,
                    movement_type="STOCK_RECEIPT",
                    quantity=target_shelf + target_wh,
                    unit_cost=float(new_batch.purchase_price or 0.0),
                    reference_type="EXCEL_STOCK_RESTORE",
                    reference_id=f"RESTORE-{med.sku}",
                    notes="Stock restored from Excel import",
                    created_by=current_user.id,
                    to_location_id=shelf_loc.id
                ))
                updated_count += 1
                continue
            else:
                updated_count += 1
                continue

        primary_batch = med_batches[0]

        all_loc_entries = []
        for b in med_batches:
            s_e = loc_stock_by_batch_loc.get((b.id, shelf_loc.id))
            if s_e:
                all_loc_entries.append(s_e)
            w_e = loc_stock_by_batch_loc.get((b.id, wh_loc.id))
            if w_e:
                all_loc_entries.append(w_e)

        current_shelf = sum(float(e.quantity or 0.0) for e in all_loc_entries if e.location_id == shelf_loc.id)
        current_wh = sum(float(e.quantity or 0.0) for e in all_loc_entries if e.location_id == wh_loc.id)

        diff_shelf = target_shelf - current_shelf
        diff_wh = target_wh - current_wh

        p_shelf_entry = loc_stock_by_batch_loc.get((primary_batch.id, shelf_loc.id))
        if not p_shelf_entry:
            p_shelf_entry = BatchLocationStock(batch_id=primary_batch.id, location_id=shelf_loc.id, quantity=0.0)
            db.add(p_shelf_entry)
            loc_stock_by_batch_loc[(primary_batch.id, shelf_loc.id)] = p_shelf_entry
            all_loc_entries.append(p_shelf_entry)

        for e in all_loc_entries:
            if e.location_id == shelf_loc.id and e.batch_id != primary_batch.id:
                e.quantity = 0.0
        p_shelf_entry.quantity = float(target_shelf)

        p_wh_entry = loc_stock_by_batch_loc.get((primary_batch.id, wh_loc.id))
        if not p_wh_entry:
            p_wh_entry = BatchLocationStock(batch_id=primary_batch.id, location_id=wh_loc.id, quantity=0.0)
            db.add(p_wh_entry)
            loc_stock_by_batch_loc[(primary_batch.id, wh_loc.id)] = p_wh_entry
            all_loc_entries.append(p_wh_entry)

        for e in all_loc_entries:
            if e.location_id == wh_loc.id and e.batch_id != primary_batch.id:
                e.quantity = 0.0
        p_wh_entry.quantity = float(target_wh)

        primary_batch.quantity_remaining = float(target_shelf + target_wh)

        if abs(diff_shelf) > 0.001:
            db.add(InventoryMovement(
                medicine_id=med.id,
                batch_id=primary_batch.id,
                branch_id=target_branch_id,
                movement_type="STOCK_AUDIT",
                quantity=float(diff_shelf),
                unit_cost=float(primary_batch.purchase_price or 0.0),
                reference_type="EXCEL_STOCK_RESTORE",
                reference_id=f"SHELF:{current_shelf}->{target_shelf}",
                notes=f"Stock restored from Excel: Shelf adjusted from {current_shelf} to {target_shelf}",
                created_by=current_user.id,
                to_location_id=shelf_loc.id if diff_shelf > 0 else None,
                from_location_id=shelf_loc.id if diff_shelf < 0 else None
            ))

        if abs(diff_wh) > 0.001:
            db.add(InventoryMovement(
                medicine_id=med.id,
                batch_id=primary_batch.id,
                branch_id=target_branch_id,
                movement_type="STOCK_AUDIT",
                quantity=float(diff_wh),
                unit_cost=float(primary_batch.purchase_price or 0.0),
                reference_type="EXCEL_STOCK_RESTORE",
                reference_id=f"WH:{current_wh}->{target_wh}",
                notes=f"Stock restored from Excel: Warehouse adjusted from {current_wh} to {target_wh}",
                created_by=current_user.id,
                to_location_id=wh_loc.id if diff_wh > 0 else None,
                from_location_id=wh_loc.id if diff_wh < 0 else None
            ))

        updated_count += 1

    await db.commit()
    return {
        "success": True,
        "total_processed": len(data_rows),
        "updated_count": updated_count,
        "skipped_count": len(skipped),
        "skipped": skipped[:20],
        "message": f"Successfully updated stock balances for {updated_count} medicines."
    }


@router.get("/locations/refill-suggestions", response_model=List[RefillSuggestionItem])
async def get_refill_suggestions(
    branch_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get items that are empty or low on the front shelf and have stock in the warehouse.
    Provides suggested refill quantities and available batches.
    """
    target_branch_id = branch_id or getattr(current_user, "branch_id", None)
    if not target_branch_id:
        b_res = await db.execute(select(Branch).limit(1))
        first_branch = b_res.scalars().first()
        if first_branch:
            target_branch_id = first_branch.id

    if not target_branch_id:
        return []

    shelf_loc, wh_loc = await get_or_create_default_locations(db, target_branch_id)
    await _seed_branch_batches_to_locations(db, target_branch_id, shelf_loc.id)
    await db.commit()

    now = datetime.now(timezone.utc)
    med_res = await db.execute(select(Medicine).where(Medicine.is_active == True))
    medicines = {m.id: m for m in med_res.scalars().all()}

    # Single aggregation query for shelf and warehouse quantities per medicine
    stock_agg_stmt = (
        select(
            MedicineBatch.medicine_id,
            func.coalesce(func.sum(
                case((StockLocation.is_default_dispense == True, BatchLocationStock.quantity), else_=Decimal('0.0'))
            ), Decimal('0.0')).label("shelf_qty"),
            func.coalesce(func.sum(
                case((StockLocation.is_default_receive == True, BatchLocationStock.quantity), else_=Decimal('0.0'))
            ), Decimal('0.0')).label("warehouse_qty"),
        )
        .join(MedicineBatch, BatchLocationStock.batch_id == MedicineBatch.id)
        .join(StockLocation, BatchLocationStock.location_id == StockLocation.id)
        .where(
            MedicineBatch.branch_id == target_branch_id,
            MedicineBatch.is_active == True,
            MedicineBatch.status.in_(["ACTIVE", "NEAR_EXPIRY"]),
            MedicineBatch.expiry_date > now
        )
        .group_by(MedicineBatch.medicine_id)
    )
    stock_res = await db.execute(stock_agg_stmt)
    candidate_med_ids = []
    med_stock_info = {}

    for row in stock_res.all():
        med = medicines.get(row.medicine_id)
        if not med:
            continue
        shelf_qty = Decimal(str(row.shelf_qty or 0))
        warehouse_qty = Decimal(str(row.warehouse_qty or 0))
        reorder = Decimal(str(med.reorder_level if med.reorder_level is not None else 10))

        if shelf_qty <= reorder and warehouse_qty > 0:
            candidate_med_ids.append(med.id)
            med_stock_info[med.id] = {
                "med": med,
                "shelf_qty": shelf_qty,
                "warehouse_qty": warehouse_qty,
                "reorder": reorder,
            }

    if not candidate_med_ids:
        return []

    # Fetch warehouse batches for candidate medicines in ONE query
    batches_stmt = (
        select(MedicineBatch, BatchLocationStock.quantity)
        .join(BatchLocationStock, BatchLocationStock.batch_id == MedicineBatch.id)
        .where(
            MedicineBatch.medicine_id.in_(candidate_med_ids),
            MedicineBatch.branch_id == target_branch_id,
            BatchLocationStock.location_id == wh_loc.id,
            BatchLocationStock.quantity > 0,
            MedicineBatch.is_active == True,
            MedicineBatch.status.in_(["ACTIVE", "NEAR_EXPIRY"]),
            MedicineBatch.expiry_date > now,
        )
        .order_by(MedicineBatch.expiry_date.asc())
    )
    batches_res = await db.execute(batches_stmt)
    batches_by_med = defaultdict(list)
    for batch, qty in batches_res.all():
        batches_by_med[batch.medicine_id].append(
            RefillSuggestionBatch(
                batch_id=batch.id,
                batch_number=batch.batch_number,
                expiry_date=batch.expiry_date,
                warehouse_quantity=Decimal(str(qty or 0))
            )
        )

    suggestions: List[RefillSuggestionItem] = []
    for med_id, info in med_stock_info.items():
        med = info["med"]
        shelf_qty = info["shelf_qty"]
        warehouse_qty = info["warehouse_qty"]
        reorder = info["reorder"]

        target_shelf = max(reorder * 2, Decimal('10.0'))
        suggested = min(warehouse_qty, max(Decimal('1.0'), target_shelf - shelf_qty))
        status = "EMPTY_ON_SHELF" if shelf_qty <= 0 else "LOW_ON_SHELF"

        suggestions.append(RefillSuggestionItem(
            medicine_id=med.id,
            medicine_name=med.name_en or med.name_ar or "",
            medicine_sku=med.sku or "",
            unit=med.base_unit or "Units",
            shelf_stock=shelf_qty,
            warehouse_stock=warehouse_qty,
            total_stock=shelf_qty + warehouse_qty,
            reorder_level=int(reorder),
            suggested_refill=suggested,
            status=status,
            shelf_location_name=shelf_loc.name_en,
            warehouse_location_name=wh_loc.name_en,
            available_batches=batches_by_med[med.id],
        ))

    suggestions.sort(key=lambda s: (0 if s.status == "EMPTY_ON_SHELF" else 1, -s.warehouse_stock))
    return suggestions


@router.post("/transfers/quick-refill")
async def quick_refill_shelf(
    req: QuickRefillRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Quickly refill a medicine to the front shelf from the warehouse."""
    target_branch_id = req.branch_id or getattr(current_user, "branch_id", None)
    if not target_branch_id:
        b_res = await db.execute(select(Branch).limit(1))
        first_branch = b_res.scalars().first()
        if first_branch:
            target_branch_id = first_branch.id

    if not target_branch_id:
        raise HTTPException(status_code=400, detail="Branch ID required")

    shelf_loc, wh_loc = await get_or_create_default_locations(db, target_branch_id)
    from_loc_id = req.from_location_id or wh_loc.id
    to_loc_id = req.to_location_id or shelf_loc.id

    movements = await transfer_stock_between_locations(
        db=db,
        medicine_id=req.medicine_id,
        from_location_id=from_loc_id,
        to_location_id=to_loc_id,
        quantity=req.quantity,
        user_id=current_user.id,
        batch_id=req.batch_id,
        notes=req.notes,
    )

    med = await db.get(Medicine, req.medicine_id)
    med_name = (med.name_en or med.name_ar) if med else "Medicine"

    await log_action(
        db=db,
        action="QUICK_SHELF_REFILL",
        module="Inventory",
        details=f"Refilled {req.quantity} units of {med_name} from Warehouse to Shelf",
        user=current_user,
        entity_type="Medicine",
        entity_id=str(req.medicine_id)
    )

    return {
        "success": True,
        "message": f"Successfully refilled {req.quantity} units of {med_name} to shelf",
        "transferred_quantity": float(req.quantity),
        "movements_count": len(movements)
    }


@router.post("/transfers/bulk-refill")
async def bulk_refill_shelves(
    req: BulkRefillRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Bulk refill multiple medicines to the front shelf (e.g. morning restock)."""
    if not req.items:
        raise HTTPException(status_code=400, detail="No items provided for refill")

    target_branch_id = req.branch_id or getattr(current_user, "branch_id", None)
    if not target_branch_id:
        b_res = await db.execute(select(Branch).limit(1))
        first_branch = b_res.scalars().first()
        if first_branch:
            target_branch_id = first_branch.id

    if not target_branch_id:
        raise HTTPException(status_code=400, detail="Branch ID required")

    shelf_loc, wh_loc = await get_or_create_default_locations(db, target_branch_id)
    from_loc_id = req.from_location_id or wh_loc.id
    to_loc_id = req.to_location_id or shelf_loc.id

    total_units = Decimal('0.0')
    successful_items = 0

    for item in req.items:
        if item.quantity <= 0:
            continue
        await transfer_stock_between_locations(
            db=db,
            medicine_id=item.medicine_id,
            from_location_id=from_loc_id,
            to_location_id=to_loc_id,
            quantity=item.quantity,
            user_id=current_user.id,
            batch_id=item.batch_id,
            notes=req.notes or "Bulk morning shelf refill",
        )
        total_units += item.quantity
        successful_items += 1

    await log_action(
        db=db,
        action="BULK_SHELF_REFILL",
        module="Inventory",
        details=f"Bulk refilled {successful_items} items ({total_units} units) to shelf",
        user=current_user,
        entity_type="StockLocation",
        entity_id=str(to_loc_id)
    )

    return {
        "success": True,
        "message": f"Successfully refilled {successful_items} items ({total_units} total units) to shelf",
        "items_count": successful_items,
        "total_units": float(total_units)
    }


@router.post("/transfers/shelf-to-warehouse")
async def move_stock_to_warehouse(
    req: MoveToWarehouseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Move stock from the front shelf into the back store (warehouse).
    Used when stocking the warehouse from existing dispensary shelf stock.
    """
    target_branch_id = req.branch_id or getattr(current_user, "branch_id", None)
    if not target_branch_id:
        b_res = await db.execute(select(Branch).limit(1))
        first_branch = b_res.scalars().first()
        if first_branch:
            target_branch_id = first_branch.id

    if not target_branch_id:
        raise HTTPException(status_code=400, detail="Branch ID required")

    shelf_loc, wh_loc = await get_or_create_default_locations(db, target_branch_id)
    await _seed_branch_batches_to_locations(db, target_branch_id, shelf_loc.id)

    movements = await transfer_stock_between_locations(
        db=db,
        medicine_id=req.medicine_id,
        from_location_id=shelf_loc.id,
        to_location_id=wh_loc.id,
        quantity=req.quantity,
        user_id=current_user.id,
        batch_id=req.batch_id,
        notes=req.notes or "Moved surplus shelf stock to back store",
    )

    await log_action(
        db=db,
        action="SHELF_TO_WAREHOUSE_TRANSFER",
        module="Inventory",
        details=f"Moved {req.quantity} units of medicine {req.medicine_id} from Shelf to Warehouse",
        user=current_user,
        entity_type="StockLocation",
        entity_id=str(wh_loc.id)
    )

    return {
        "success": True,
        "message": f"Successfully moved {req.quantity} units from Shelf to Back Store",
        "transferred_quantity": float(req.quantity)
    }


@router.post("/locations/consolidate-to-shelf")
async def consolidate_stock_to_shelf(
    req: ConsolidateStockRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Consolidate all stock for a branch to the Front Shelf and reset Warehouse stock to 0.
    Executed when transitioning from Simple Mode to Multi-Location Mode so the warehouse
    starts cleanly at 0 and all existing inventory is preserved on shelves.
    """
    target_branch_id = req.branch_id or getattr(current_user, "branch_id", None)
    if not target_branch_id:
        b_res = await db.execute(select(Branch).limit(1))
        first_branch = b_res.scalars().first()
        if first_branch:
            target_branch_id = first_branch.id

    if not target_branch_id:
        raise HTTPException(status_code=400, detail="Branch ID required")

    shelf_loc, wh_loc = await get_or_create_default_locations(db, target_branch_id)

    # 1. Fetch all batches for this branch
    batches_res = await db.execute(
        select(MedicineBatch).where(MedicineBatch.branch_id == target_branch_id)
    )
    batches = batches_res.scalars().all()
    batch_ids = [b.id for b in batches]

    if not batch_ids:
        return {
            "success": True,
            "message": "No batches found to consolidate",
            "batches_count": 0,
            "total_shelf_stock": 0.0
        }

    # 2. Fetch all existing batch_location_stock records
    loc_stocks_res = await db.execute(
        select(BatchLocationStock).where(BatchLocationStock.batch_id.in_(batch_ids))
    )
    existing_stocks = loc_stocks_res.scalars().all()

    # Map by (batch_id, location_id)
    stock_map = {(s.batch_id, s.location_id): s for s in existing_stocks}

    total_shelf = Decimal('0.0')
    consolidated_count = 0

    for batch in batches:
        qty = Decimal(str(batch.quantity_remaining or 0))
        total_shelf += qty
        consolidated_count += 1

        # Front Shelf stock should be 100% of batch remaining
        shelf_entry = stock_map.get((batch.id, shelf_loc.id))
        if shelf_entry:
            shelf_entry.quantity = qty
        else:
            db.add(BatchLocationStock(
                batch_id=batch.id,
                location_id=shelf_loc.id,
                quantity=qty
            ))

        # Warehouse stock should be 0
        wh_entry = stock_map.get((batch.id, wh_loc.id))
        if wh_entry:
            wh_entry.quantity = Decimal('0.0')
        else:
            db.add(BatchLocationStock(
                batch_id=batch.id,
                location_id=wh_loc.id,
                quantity=Decimal('0.0')
            ))

    await db.commit()

    await log_action(
        db=db,
        action="CONSOLIDATE_TO_SHELF",
        module="Inventory",
        details=f"Consolidated {consolidated_count} batches to Front Shelf (total: {total_shelf} units). Warehouse initialized to 0.",
        user=current_user,
        entity_type="StockLocation",
        entity_id=str(shelf_loc.id)
    )

    return {
        "success": True,
        "message": f"Successfully consolidated {consolidated_count} batches to Front Shelf. Back Store stock is now 0.",
        "batches_count": consolidated_count,
        "total_shelf_stock": float(total_shelf)
    }


# =========================================================================
# Location-based Cycle Counts Endpoints
# =========================================================================

@router.post("/cycle-counts/start")
async def start_cycle_count(
    req: StartCycleCountRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Start a new cycle count session for a specific shelf or warehouse location."""
    loc = await db.get(StockLocation, req.location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Stock location not found")

    branch_id = req.branch_id or loc.branch_id
    session_number = f"CC-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"

    session = StockCountSession(
        branch_id=branch_id,
        location_id=loc.id,
        session_number=session_number,
        status="IN_PROGRESS",
        notes=req.notes,
        counted_by=current_user.id
    )
    db.add(session)
    await db.flush()

    # Snapshot all batch stocks present in this location
    b_stmt = (
        select(BatchLocationStock, MedicineBatch, Medicine)
        .join(MedicineBatch, BatchLocationStock.batch_id == MedicineBatch.id)
        .join(Medicine, MedicineBatch.medicine_id == Medicine.id)
        .where(
            BatchLocationStock.location_id == loc.id,
            MedicineBatch.is_active == True,
            Medicine.is_active == True
        )
    )
    b_res = await db.execute(b_stmt)
    records = b_res.all()

    for b_stock, batch, med in records:
        expected = Decimal(str(b_stock.quantity or 0))
        line = StockCountLine(
            session_id=session.id,
            medicine_id=med.id,
            batch_id=batch.id,
            expected_quantity=float(expected),
            counted_quantity=float(expected),
            variance_quantity=0.0
        )
        db.add(line)

    await db.commit()
    await db.refresh(session)

    await log_action(
        db=db,
        action="START_CYCLE_COUNT",
        module="Inventory",
        details=f"Started cycle count session {session_number} for location {loc.name_en} ({len(records)} batches snapshotted)",
        user=current_user,
        entity_type="StockCountSession",
        entity_id=str(session.id)
    )

    return {
        "success": True,
        "session_id": str(session.id),
        "session_number": session_number,
        "location_id": str(loc.id),
        "location_name": loc.name_en,
        "items_count": len(records)
    }


@router.get("/cycle-counts/{session_id}", response_model=CycleCountSessionResponse)
async def get_cycle_count_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve full details of a cycle count session including lines and variances."""
    session = await db.get(StockCountSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Cycle count session not found")

    loc = await db.get(StockLocation, session.location_id)

    lines_query = (
        select(StockCountLine, Medicine, MedicineBatch)
        .join(Medicine, StockCountLine.medicine_id == Medicine.id)
        .join(MedicineBatch, StockCountLine.batch_id == MedicineBatch.id)
        .where(StockCountLine.session_id == session.id)
    )
    res = await db.execute(lines_query)
    rows = res.all()

    line_responses: List[CycleCountLineResponse] = []
    total_exp = Decimal('0.0')
    total_cnt = Decimal('0.0')
    total_var = Decimal('0.0')

    for line, med, batch in rows:
        exp_qty = Decimal(str(line.expected_quantity or 0))
        cnt_qty = Decimal(str(line.counted_quantity or 0))
        var_qty = Decimal(str(line.variance_quantity or 0))

        total_exp += exp_qty
        total_cnt += cnt_qty
        total_var += var_qty

        line_responses.append(CycleCountLineResponse(
            id=line.id,
            medicine_id=line.medicine_id,
            medicine_name=med.name_en or med.name_ar,
            medicine_sku=med.sku,
            batch_id=line.batch_id,
            batch_number=batch.batch_number,
            expiry_date=batch.expiry_date,
            expected_quantity=exp_qty,
            counted_quantity=cnt_qty,
            variance_quantity=var_qty,
            variance_reason=line.variance_reason,
        ))

    return CycleCountSessionResponse(
        id=session.id,
        branch_id=session.branch_id,
        location_id=session.location_id,
        location_name=loc.name_en if loc else None,
        session_number=session.session_number,
        status=session.status,
        notes=session.notes,
        counted_by=session.counted_by,
        reconciled_by=session.reconciled_by,
        reconciled_at=session.reconciled_at,
        created_at=session.created_at,
        lines=line_responses,
        total_expected=total_exp,
        total_counted=total_cnt,
        total_variance=total_var,
    )


@router.put("/cycle-counts/{session_id}/lines")
async def update_cycle_count_lines(
    session_id: UUID,
    req: UpdateCycleCountRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update physical counted quantities for lines in a cycle count session."""
    session = await db.get(StockCountSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Cycle count session not found")

    if session.status != "IN_PROGRESS":
        raise HTTPException(status_code=400, detail="Cannot update a reconciled or cancelled session")

    updated_count = 0
    for line_update in req.lines:
        line = await db.get(StockCountLine, line_update.line_id)
        if line and line.session_id == session.id:
            expected = Decimal(str(line.expected_quantity or 0))
            counted = line_update.counted_quantity
            variance = counted - expected

            line.counted_quantity = float(counted)
            line.variance_quantity = float(variance)
            if line_update.variance_reason:
                line.variance_reason = line_update.variance_reason
            updated_count += 1

    await db.commit()
    return {"success": True, "updated_lines": updated_count}


@router.post("/cycle-counts/{session_id}/reconcile")
async def reconcile_cycle_count_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reconcile all variances in a cycle count session and post atomic inventory adjustments."""
    session = await db.get(StockCountSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Cycle count session not found")

    if session.status != "IN_PROGRESS":
        raise HTTPException(status_code=400, detail="Session is already finalized")

    loc = await db.get(StockLocation, session.location_id)
    lines_stmt = select(StockCountLine).where(StockCountLine.session_id == session.id)
    lines_res = await db.execute(lines_stmt)
    lines = lines_res.scalars().all()

    reconciled_lines = 0
    total_net_variance = Decimal('0.0')

    for line in lines:
        variance = Decimal(str(line.variance_quantity or 0))
        if abs(variance) < Decimal('0.0001'):
            continue

        batch = await db.get(MedicineBatch, line.batch_id)
        if not batch:
            continue

        # 1. Update location stock
        loc_stock_stmt = select(BatchLocationStock).where(
            BatchLocationStock.batch_id == line.batch_id,
            BatchLocationStock.location_id == session.location_id
        )
        loc_res = await db.execute(loc_stock_stmt)
        loc_stock = loc_res.scalars().first()
        if loc_stock:
            loc_stock.quantity = float(Decimal(str(loc_stock.quantity or 0)) + variance)
        else:
            loc_stock = BatchLocationStock(
                batch_id=line.batch_id,
                location_id=session.location_id,
                quantity=float(line.counted_quantity)
            )
            db.add(loc_stock)

        # 2. Update batch total stock
        new_batch_qty = Decimal(str(batch.quantity_remaining or 0)) + variance
        batch.quantity_remaining = float(max(Decimal('0.0'), new_batch_qty))
        if batch.quantity_remaining == 0:
            batch.status = "OUT_OF_STOCK"
        elif batch.status == "OUT_OF_STOCK" and batch.quantity_remaining > 0:
            batch.status = "ACTIVE"

        # 3. Post Inventory Movement
        mov_type = "CYCLE_COUNT_SURPLUS" if variance > 0 else "CYCLE_COUNT_SHORTAGE"
        unit_cost = float(batch.purchase_price or 0)
        movement = InventoryMovement(
            medicine_id=line.medicine_id,
            batch_id=line.batch_id,
            branch_id=session.branch_id,
            movement_type=mov_type,
            quantity=float(variance),
            unit_cost=unit_cost,
            reference_type="CYCLE_COUNT",
            reference_id=session.session_number,
            notes=line.variance_reason or f"Cycle count adjustment ({session.session_number}) at {loc.name_en if loc else 'Location'}",
            created_by=current_user.id,
            from_location_id=session.location_id if variance < 0 else None,
            to_location_id=session.location_id if variance > 0 else None
        )
        db.add(movement)

        reconciled_lines += 1
        total_net_variance += variance

    # Finalize session
    session.status = "RECONCILED"
    session.reconciled_by = current_user.id
    session.reconciled_at = datetime.now(timezone.utc)

    await db.commit()

    await log_action(
        db=db,
        action="RECONCILE_CYCLE_COUNT",
        module="Inventory",
        details=f"Reconciled cycle count session {session.session_number} with {reconciled_lines} adjustments (Net: {total_net_variance})",
        user=current_user,
        entity_type="StockCountSession",
        entity_id=str(session.id)
    )

    return {
        "success": True,
        "message": f"Cycle count {session.session_number} successfully reconciled",
        "reconciled_lines": reconciled_lines,
        "net_variance": float(total_net_variance)
    }


