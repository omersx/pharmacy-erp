import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc
from fastapi import HTTPException

from app.modules.purchases.models import (
    PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine,
    SupplierReturn, SupplierReturnLine, SupplierProductTerm
)
from app.modules.purchases.schemas import (
    PurchaseOrderCreate, PurchaseOrderUpdate, GoodsReceiptCreate,
    SupplierReturnCreate, SupplierProductTermCreate, SupplierProductTermUpdate
)
from app.modules.suppliers.models import Supplier
from app.modules.medicines.models import Medicine, MedicineBatch
from app.modules.inventory.models import StockLocation, BatchLocationStock, InventoryMovement
from app.modules.inventory.location_service import get_or_create_default_locations
from app.modules.organizations.models import Branch
from app.modules.auth.models import User


# --- Number Generator Helpers ---
async def generate_po_number(db: AsyncSession) -> str:
    today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = f"PO-{today_str}-"
    result = await db.execute(
        select(PurchaseOrder.po_number)
        .where(PurchaseOrder.po_number.like(f"{prefix}%"))
        .order_by(desc(PurchaseOrder.po_number))
        .limit(1)
    )
    last_num = result.scalar_one_or_none()
    if last_num:
        try:
            seq = int(last_num.split("-")[-1]) + 1
        except ValueError:
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


async def generate_grn_number(db: AsyncSession) -> str:
    today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = f"GRN-{today_str}-"
    result = await db.execute(
        select(GoodsReceipt.receipt_number)
        .where(GoodsReceipt.receipt_number.like(f"{prefix}%"))
        .order_by(desc(GoodsReceipt.receipt_number))
        .limit(1)
    )
    last_num = result.scalar_one_or_none()
    if last_num:
        try:
            seq = int(last_num.split("-")[-1]) + 1
        except ValueError:
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


async def generate_return_number(db: AsyncSession) -> str:
    today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    prefix = f"PRET-{today_str}-"
    result = await db.execute(
        select(SupplierReturn.return_number)
        .where(SupplierReturn.return_number.like(f"{prefix}%"))
        .order_by(desc(SupplierReturn.return_number))
        .limit(1)
    )
    last_num = result.scalar_one_or_none()
    if last_num:
        try:
            seq = int(last_num.split("-")[-1]) + 1
        except ValueError:
            seq = 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


# --- Purchase Order Service ---
async def create_purchase_order(db: AsyncSession, data: PurchaseOrderCreate, user_id: uuid.UUID) -> PurchaseOrder:
    po_number = await generate_po_number(db)
    
    subtotal = Decimal('0.0')
    tax_amount = Decimal('0.0')

    po = PurchaseOrder(
        po_number=po_number,
        supplier_id=data.supplier_id,
        branch_id=data.branch_id,
        status="DRAFT",
        order_date=data.order_date or datetime.now(timezone.utc),
        expected_delivery_date=data.expected_delivery_date,
        payment_terms=data.payment_terms,
        currency=data.currency,
        notes=data.notes,
        created_by_id=user_id,
        subtotal=0.0,
        tax_amount=0.0,
        total_amount=0.0
    )
    db.add(po)
    await db.flush()

    for line_data in data.lines:
        pack_size = max(1, line_data.pack_size)
        packs = line_data.packs_ordered
        qty_ordered = line_data.quantity_ordered if line_data.quantity_ordered is not None else (packs * pack_size)
        unit_cost = line_data.unit_cost
        tax_pct = line_data.tax_percent
        line_base = qty_ordered * unit_cost
        line_tax = line_base * (tax_pct / Decimal('100.0'))
        line_total = line_base + line_tax

        subtotal += line_base
        tax_amount += line_tax

        line = PurchaseOrderLine(
            po_id=po.id,
            medicine_id=line_data.medicine_id,
            pack_size=pack_size,
            packs_ordered=float(packs),
            quantity_ordered=float(qty_ordered),
            unit_cost=float(unit_cost),
            tax_percent=float(tax_pct),
            line_total=float(line_total),
            quantity_received=0.0,
            quantity_cancelled=0.0
        )
        db.add(line)

    po.subtotal = float(subtotal)
    po.tax_amount = float(tax_amount)
    po.total_amount = float(subtotal + tax_amount)

    await db.commit()
    await db.refresh(po)
    return po


async def submit_purchase_order(db: AsyncSession, po_id: uuid.UUID, user_id: uuid.UUID) -> PurchaseOrder:
    po = await db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status != "DRAFT":
        raise HTTPException(status_code=400, detail=f"Cannot submit PO in status {po.status}")
    
    po.status = "SUBMITTED"
    await db.commit()
    await db.refresh(po)
    return po


async def approve_purchase_order(db: AsyncSession, po_id: uuid.UUID, user_id: uuid.UUID, notes: Optional[str] = None) -> PurchaseOrder:
    po = await db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status not in ("DRAFT", "SUBMITTED"):
        raise HTTPException(status_code=400, detail=f"Cannot approve PO in status {po.status}")

    po.status = "APPROVED"
    po.approved_by_id = user_id
    po.approved_at = datetime.now(timezone.utc)
    if notes:
        po.notes = f"{po.notes}\n[Approval Note]: {notes}" if po.notes else f"[Approval Note]: {notes}"

    await db.commit()
    await db.refresh(po)
    return po


async def cancel_purchase_order(db: AsyncSession, po_id: uuid.UUID, user_id: uuid.UUID, reason: str) -> PurchaseOrder:
    po = await db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status in ("RECEIVED", "CANCELLED"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel PO in status {po.status}")

    po.status = "CANCELLED"
    po.cancelled_reason = reason
    await db.commit()
    await db.refresh(po)
    return po


# --- Goods Receipt Service ---
async def create_goods_receipt(db: AsyncSession, data: GoodsReceiptCreate, receiver_id: uuid.UUID) -> GoodsReceipt:
    # Verify destination location or default to Branch's Main Warehouse
    dest_loc_id = data.destination_location_id
    if not dest_loc_id:
        _, warehouse = await get_or_create_default_locations(db, data.branch_id)
        dest_loc_id = warehouse.id

    grn_number = await generate_grn_number(db)
    receipt = GoodsReceipt(
        receipt_number=grn_number,
        po_id=data.po_id,
        supplier_id=data.supplier_id,
        branch_id=data.branch_id,
        destination_location_id=dest_loc_id,
        received_date=data.received_date or datetime.now(timezone.utc),
        supplier_delivery_ref=data.supplier_delivery_ref,
        status="DRAFT",
        receiver_id=receiver_id,
        notes=data.notes
    )
    db.add(receipt)
    await db.flush()

    for line_in in data.lines:
        line = GoodsReceiptLine(
            receipt_id=receipt.id,
            po_line_id=line_in.po_line_id,
            medicine_id=line_in.medicine_id,
            quantity_received=float(line_in.quantity_received),
            quantity_accepted=float(line_in.quantity_accepted),
            quantity_rejected=float(line_in.quantity_rejected),
            rejection_reason=line_in.rejection_reason,
            batch_number=line_in.batch_number.strip().upper(),
            expiry_date=line_in.expiry_date,
            production_date=line_in.production_date,
            unit_cost=float(line_in.unit_cost)
        )
        db.add(line)

    await db.commit()
    await db.refresh(receipt)
    return receipt


async def post_goods_receipt(db: AsyncSession, receipt_id: uuid.UUID, user_id: uuid.UUID) -> GoodsReceipt:
    receipt = await db.get(GoodsReceipt, receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Goods receipt not found")
    if receipt.status != "DRAFT":
        raise HTTPException(status_code=400, detail=f"Goods receipt is already {receipt.status}")

    # Ensure destination location exists
    dest_loc_id = receipt.destination_location_id
    if not dest_loc_id:
        _, warehouse = await get_or_create_default_locations(db, receipt.branch_id)
        dest_loc_id = warehouse.id
        receipt.destination_location_id = dest_loc_id

    for line in receipt.lines:
        accepted_qty = Decimal(str(line.quantity_accepted))
        if accepted_qty <= 0:
            continue

        unit_cost = Decimal(str(line.unit_cost))

        # 1. Check or create MedicineBatch
        batch_res = await db.execute(
            select(MedicineBatch).where(
                MedicineBatch.medicine_id == line.medicine_id,
                MedicineBatch.branch_id == receipt.branch_id,
                MedicineBatch.batch_number == line.batch_number,
                MedicineBatch.expiry_date == line.expiry_date
            )
        )
        batch = batch_res.scalar_one_or_none()

        if batch:
            batch.quantity_remaining = float(Decimal(str(batch.quantity_remaining)) + accepted_qty)
            batch.quantity_received = float(Decimal(str(batch.quantity_received)) + accepted_qty)
            if unit_cost > 0:
                batch.purchase_price = float(unit_cost)
        else:
            batch = MedicineBatch(
                medicine_id=line.medicine_id,
                branch_id=receipt.branch_id,
                supplier_id=receipt.supplier_id,
                batch_number=line.batch_number,
                expiry_date=line.expiry_date,
                purchase_price=float(unit_cost),
                quantity_received=float(accepted_qty),
                quantity_remaining=float(accepted_qty),
                status="ACTIVE"
            )
            db.add(batch)
            await db.flush()

        line.created_batch_id = batch.id

        # 2. Add stock to Destination Stock Location (Main Warehouse)
        loc_stock_res = await db.execute(
            select(BatchLocationStock).where(
                BatchLocationStock.batch_id == batch.id,
                BatchLocationStock.location_id == dest_loc_id
            )
        )
        loc_stock = loc_stock_res.scalar_one_or_none()
        if loc_stock:
            loc_stock.quantity = float(Decimal(str(loc_stock.quantity)) + accepted_qty)
        else:
            loc_stock = BatchLocationStock(
                batch_id=batch.id,
                location_id=dest_loc_id,
                quantity=float(accepted_qty)
            )
            db.add(loc_stock)

        # 3. Create InventoryMovement for the inbound stock
        movement = InventoryMovement(
            branch_id=receipt.branch_id,
            medicine_id=line.medicine_id,
            batch_id=batch.id,
            movement_type="PURCHASE_RECEIPT",
            from_location_id=None,
            to_location_id=dest_loc_id,
            quantity=float(accepted_qty),
            unit_cost=float(unit_cost),
            reference_type="GOODS_RECEIPT",
            reference_id=str(receipt.id),
            created_by=user_id,
            notes=f"Goods Receipt {receipt.receipt_number} from supplier"
        )
        db.add(movement)

        # 4. If linked to a PO line, update quantity_received
        if line.po_line_id:
            po_line = await db.get(PurchaseOrderLine, line.po_line_id)
            if po_line:
                po_line.quantity_received = float(Decimal(str(po_line.quantity_received)) + accepted_qty)

        # 5. Update Supplier Product Term & Medicine purchase price
        med = await db.get(Medicine, line.medicine_id)
        if med and unit_cost > 0:
            med.purchase_price = float(unit_cost)

        term_res = await db.execute(
            select(SupplierProductTerm).where(
                SupplierProductTerm.supplier_id == receipt.supplier_id,
                SupplierProductTerm.medicine_id == line.medicine_id
            )
        )
        term = term_res.scalar_one_or_none()
        if term and unit_cost > 0:
            term.last_cost = float(unit_cost)

    receipt.status = "POSTED"

    # 6. Update Purchase Order Status if linked
    if receipt.po_id:
        po = await db.get(PurchaseOrder, receipt.po_id)
        if po:
            all_received = True
            any_received = False
            for pl in po.lines:
                if pl.quantity_received > 0:
                    any_received = True
                if pl.quantity_received < pl.quantity_ordered:
                    all_received = False
            
            if all_received:
                po.status = "RECEIVED"
            elif any_received:
                po.status = "PARTIALLY_RECEIVED"

    await db.commit()
    await db.refresh(receipt)
    return receipt


# --- Supplier Returns Service ---
async def create_supplier_return(db: AsyncSession, data: SupplierReturnCreate, user_id: uuid.UUID) -> SupplierReturn:
    from_loc_id = data.from_location_id
    if not from_loc_id:
        _, warehouse = await get_or_create_default_locations(db, data.branch_id)
        from_loc_id = warehouse.id

    ret_num = await generate_return_number(db)
    ret = SupplierReturn(
        return_number=ret_num,
        receipt_id=data.receipt_id,
        supplier_id=data.supplier_id,
        branch_id=data.branch_id,
        from_location_id=from_loc_id,
        status="DRAFT",
        reason=data.reason,
        notes=data.notes,
        created_by_id=user_id,
        total_amount=0.0
    )
    db.add(ret)
    await db.flush()

    total_amount = Decimal('0.0')
    for line_in in data.lines:
        line_total = line_in.quantity * line_in.unit_cost
        total_amount += line_total

        line = SupplierReturnLine(
            return_id=ret.id,
            medicine_id=line_in.medicine_id,
            batch_id=line_in.batch_id,
            quantity=float(line_in.quantity),
            unit_cost=float(line_in.unit_cost),
            total_cost=float(line_total),
            reason=line_in.reason
        )
        db.add(line)

    ret.total_amount = float(total_amount)
    await db.commit()
    await db.refresh(ret)
    return ret


async def post_supplier_return(db: AsyncSession, return_id: uuid.UUID, user_id: uuid.UUID) -> SupplierReturn:
    ret = await db.get(SupplierReturn, return_id)
    if not ret:
        raise HTTPException(status_code=404, detail="Supplier return not found")
    if ret.status != "DRAFT":
        raise HTTPException(status_code=400, detail=f"Supplier return is already {ret.status}")

    for line in ret.lines:
        qty_to_return = Decimal(str(line.quantity))
        batch = await db.get(MedicineBatch, line.batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail=f"Batch {line.batch_id} not found")

        current_batch_qty = Decimal(str(batch.quantity_remaining))
        if current_batch_qty < qty_to_return:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient batch quantity remaining for {batch.batch_number}: available {current_batch_qty}, requested {qty_to_return}"
            )

        # Deduct from location
        loc_stock_res = await db.execute(
            select(BatchLocationStock).where(
                BatchLocationStock.batch_id == batch.id,
                BatchLocationStock.location_id == ret.from_location_id
            )
        )
        loc_stock = loc_stock_res.scalar_one_or_none()
        if not loc_stock or Decimal(str(loc_stock.quantity)) < qty_to_return:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock in location for batch {batch.batch_number}"
            )

        loc_stock.quantity = float(Decimal(str(loc_stock.quantity)) - qty_to_return)
        batch.quantity_remaining = float(current_batch_qty - qty_to_return)

        # Record movement
        mv = InventoryMovement(
            branch_id=ret.branch_id,
            medicine_id=line.medicine_id,
            batch_id=batch.id,
            movement_type="PURCHASE_RETURN",
            from_location_id=ret.from_location_id,
            to_location_id=None,
            quantity=float(qty_to_return),
            unit_cost=float(line.unit_cost),
            reference_type="SUPPLIER_RETURN",
            reference_id=str(ret.id),
            created_by=user_id,
            notes=f"Return {ret.return_number} to supplier: {ret.reason}"
        )
        db.add(mv)

    ret.status = "POSTED"
    await db.commit()
    await db.refresh(ret)
    return ret
