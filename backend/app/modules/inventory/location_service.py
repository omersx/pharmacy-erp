import uuid
from decimal import Decimal
from typing import Optional, List, Tuple
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from app.modules.inventory.models import StockLocation, BatchLocationStock, InventoryMovement
from app.modules.medicines.models import MedicineBatch, Medicine
from app.modules.organizations.models import Branch

async def get_or_create_default_locations(
    db: AsyncSession, branch_id: uuid.UUID
) -> Tuple[StockLocation, StockLocation]:
    """Ensure a branch has default dispense (Shelf) and default receive (Warehouse) locations."""
    # Find or create default dispense (Shelf)
    dispense_stmt = select(StockLocation).where(
        StockLocation.branch_id == branch_id,
        StockLocation.is_default_dispense == True,
        StockLocation.is_active == True,
    )
    res = await db.execute(dispense_stmt)
    shelf_loc = res.scalars().first()

    if not shelf_loc:
        shelf_loc = StockLocation(
            branch_id=branch_id,
            name_en="Front Shelf",
            name_ar="الرف الأمامي",
            location_type="DISPENSARY_SHELF",
            code="SHELF",
            is_default_dispense=True,
            is_default_receive=False,
            is_active=True,
        )
        db.add(shelf_loc)
        await db.flush()

    # Find or create default receive (Warehouse)
    receive_stmt = select(StockLocation).where(
        StockLocation.branch_id == branch_id,
        StockLocation.is_default_receive == True,
        StockLocation.is_active == True,
    )
    res = await db.execute(receive_stmt)
    wh_loc = res.scalars().first()

    if not wh_loc:
        wh_loc = StockLocation(
            branch_id=branch_id,
            name_en="Main Warehouse",
            name_ar="المستودع الرئيسي",
            location_type="WAREHOUSE",
            code="WAREHOUSE",
            is_default_dispense=False,
            is_default_receive=True,
            is_active=True,
        )
        db.add(wh_loc)
        await db.flush()

    return shelf_loc, wh_loc


async def ensure_batch_has_location(
    db: AsyncSession, batch: MedicineBatch, target_location_id: uuid.UUID
) -> BatchLocationStock:
    """Ensure a batch has at least one location stock entry, defaulting to target_location_id."""
    stmt = select(BatchLocationStock).where(BatchLocationStock.batch_id == batch.id)
    res = await db.execute(stmt)
    existing = res.scalars().all()

    if not existing:
        # Create initial location stock using batch's remaining quantity
        stock_entry = BatchLocationStock(
            batch_id=batch.id,
            location_id=target_location_id,
            quantity=Decimal(str(batch.quantity_remaining or 0)),
        )
        db.add(stock_entry)
        await db.flush()
        return stock_entry
    return existing[0]


async def transfer_stock_between_locations(
    db: AsyncSession,
    medicine_id: uuid.UUID,
    from_location_id: uuid.UUID,
    to_location_id: uuid.UUID,
    quantity: Decimal,
    user_id: uuid.UUID,
    batch_id: Optional[uuid.UUID] = None,
    notes: Optional[str] = None,
) -> List[InventoryMovement]:
    """
    Atomically transfer stock between two locations within a branch.
    If batch_id is provided, transfers specifically from that batch.
    If batch_id is None, automatically allocates using FEFO among batches in from_location.
    """
    if from_location_id == to_location_id:
        raise HTTPException(
            status_code=400,
            detail="Source and destination locations cannot be the same"
        )

    if quantity <= 0:
        raise HTTPException(
            status_code=400,
            detail="Transfer quantity must be greater than zero"
        )

    from_loc = await db.get(StockLocation, from_location_id)
    to_loc = await db.get(StockLocation, to_location_id)
    if not from_loc or not to_loc:
        raise HTTPException(status_code=404, detail="One or both locations not found")

    if from_loc.branch_id != to_loc.branch_id:
        raise HTTPException(
            status_code=400,
            detail="Internal transfers must be within the same branch"
        )

    branch_id = from_loc.branch_id

    # If specific batch requested
    movements: List[InventoryMovement] = []
    if batch_id:
        # Check source location stock
        stmt = select(BatchLocationStock).where(
            BatchLocationStock.batch_id == batch_id,
            BatchLocationStock.location_id == from_location_id,
        )
        res = await db.execute(stmt)
        src_stock = res.scalars().first()

        current_qty = Decimal(str(src_stock.quantity if src_stock else 0))
        if not src_stock or current_qty < quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient quantity in source location '{from_loc.name_en}'. Available: {current_qty}, Requested: {quantity}"
            )

        # Decrement source
        src_stock.quantity = float(current_qty - quantity)

        # Increment destination
        dest_stmt = select(BatchLocationStock).where(
            BatchLocationStock.batch_id == batch_id,
            BatchLocationStock.location_id == to_location_id,
        )
        dest_res = await db.execute(dest_stmt)
        dest_stock = dest_res.scalars().first()
        if not dest_stock:
            dest_stock = BatchLocationStock(
                batch_id=batch_id,
                location_id=to_location_id,
                quantity=float(quantity),
            )
            db.add(dest_stock)
        else:
            dest_stock.quantity = float(Decimal(str(dest_stock.quantity)) + quantity)

        # Log movement
        batch = await db.get(MedicineBatch, batch_id)
        unit_cost = float(batch.purchase_price if batch else 0)
        movement = InventoryMovement(
            medicine_id=medicine_id,
            batch_id=batch_id,
            branch_id=branch_id,
            movement_type="INTERNAL_TRANSFER",
            quantity=float(quantity),
            unit_cost=unit_cost,
            reference_type="INTERNAL_REFILL",
            reference_id=f"{from_loc.code or 'FROM'}->{to_loc.code or 'TO'}",
            notes=notes or f"Transferred from {from_loc.name_en} to {to_loc.name_en}",
            created_by=user_id,
            from_location_id=from_location_id,
            to_location_id=to_location_id,
        )
        db.add(movement)
        movements.append(movement)

    else:
        # FEFO allocation across batches in from_location
        stmt = (
            select(BatchLocationStock, MedicineBatch)
            .join(MedicineBatch, BatchLocationStock.batch_id == MedicineBatch.id)
            .where(
                MedicineBatch.medicine_id == medicine_id,
                BatchLocationStock.location_id == from_location_id,
                BatchLocationStock.quantity > 0,
                MedicineBatch.is_active == True,
            )
            .order_by(MedicineBatch.expiry_date.asc())
        )
        res = await db.execute(stmt)
        available_batches = res.all()

        total_avail = sum(Decimal(str(b_stock.quantity)) for b_stock, _ in available_batches)
        if total_avail < quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient total stock in source location '{from_loc.name_en}'. Available: {total_avail}, Requested: {quantity}"
            )

        remaining_to_transfer = quantity
        for b_stock, batch in available_batches:
            if remaining_to_transfer <= 0:
                break

            curr_b_qty = Decimal(str(b_stock.quantity))
            qty_from_this_batch = min(curr_b_qty, remaining_to_transfer)

            # Decrement source
            b_stock.quantity = float(curr_b_qty - qty_from_this_batch)

            # Increment destination
            dest_stmt = select(BatchLocationStock).where(
                BatchLocationStock.batch_id == batch.id,
                BatchLocationStock.location_id == to_location_id,
            )
            dest_res = await db.execute(dest_stmt)
            dest_stock = dest_res.scalars().first()
            if not dest_stock:
                dest_stock = BatchLocationStock(
                    batch_id=batch.id,
                    location_id=to_location_id,
                    quantity=float(qty_from_this_batch),
                )
                db.add(dest_stock)
            else:
                dest_stock.quantity = float(Decimal(str(dest_stock.quantity)) + qty_from_this_batch)

            # Movement log
            unit_cost = float(batch.purchase_price if batch else 0)
            movement = InventoryMovement(
                medicine_id=medicine_id,
                batch_id=batch.id,
                branch_id=branch_id,
                movement_type="INTERNAL_TRANSFER",
                quantity=float(qty_from_this_batch),
                unit_cost=unit_cost,
                reference_type="INTERNAL_REFILL",
                reference_id=f"{from_loc.code or 'FROM'}->{to_loc.code or 'TO'}",
                notes=notes or f"Transferred from {from_loc.name_en} to {to_loc.name_en} (Batch: {batch.batch_number})",
                created_by=user_id,
                from_location_id=from_location_id,
                to_location_id=to_location_id,
            )
            db.add(movement)
            movements.append(movement)

            remaining_to_transfer -= qty_from_this_batch

    await db.commit()
    return movements
