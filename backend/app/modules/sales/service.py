from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.modules.medicines.models import MedicineBatch
from app.modules.sales.models import Sale, SaleItem, SaleReturn, SaleReturnItem, SalePayment
from app.modules.sales.schemas import SaleCreate, SaleReturnCreate
from app.modules.cash_sessions.models import CashSession
from app.modules.inventory.models import InventoryMovement
from app.core.exceptions import ValidationError
from typing import Optional
import uuid
from datetime import datetime, timezone

async def create_sale(db: AsyncSession, sale_data: SaleCreate, branch_id: uuid.UUID, cashier_id: uuid.UUID):
    total_amount = Decimal('0.0')
    total_profit = Decimal('0.0')
    sale_items = []
    movements = []

    # Check if DB dialect supports row locking
    is_sqlite = False
    try:
        bind = db.bind or (db.sync_session.bind if hasattr(db, "sync_session") else None)
        if bind and "sqlite" in getattr(bind.dialect, "name", ""):
            is_sqlite = True
    except Exception:
        pass

    for item in sale_data.items:
        required_qty = Decimal(str(item.quantity))
        
        # Dialect-aware locking: with_for_update() on PostgreSQL/MySQL, standard select on SQLite
        batch_query = (
            select(MedicineBatch)
            .where(
                MedicineBatch.medicine_id == item.medicine_id,
                MedicineBatch.branch_id == branch_id,
                MedicineBatch.is_active == True,
                MedicineBatch.status.in_(["ACTIVE", "NEAR_EXPIRY"]),
                MedicineBatch.quantity_remaining > 0
            )
            .where(MedicineBatch.expiry_date > datetime.now(timezone.utc))
            .order_by(MedicineBatch.expiry_date.asc())
        )
        if not is_sqlite:
            batch_query = batch_query.with_for_update()

        result = await db.execute(batch_query)
        batches = result.scalars().all()

        available_qty = sum(Decimal(str(b.quantity_remaining)) for b in batches)
        if available_qty < required_qty:
            raise ValidationError(f"Insufficient stock for medicine {item.medicine_id} in selected branch. Required: {required_qty}, Available: {available_qty}")

        remaining_to_fulfill = required_qty
        for batch in batches:
            if remaining_to_fulfill <= 0:
                break
            
            batch_qty = Decimal(str(batch.quantity_remaining))
            take_qty = min(batch_qty, remaining_to_fulfill)
            
            # Decrement batch remaining quantity
            new_batch_qty = batch_qty - take_qty
            batch.quantity_remaining = float(new_batch_qty)
            if new_batch_qty == 0:
                batch.status = "OUT_OF_STOCK"

            # Financial snapshots
            line_total = take_qty * Decimal(str(item.unit_price))
            unit_cost = Decimal(str(batch.purchase_price or 0))
            line_cogs = take_qty * unit_cost
            line_profit = line_total - line_cogs

            total_amount += line_total
            total_profit += line_profit

            # Immutable sale item snapshot
            sale_item = SaleItem(
                medicine_id=item.medicine_id,
                batch_id=batch.id,
                quantity=float(take_qty),
                quantity_returned=0.0,
                unit_price=float(item.unit_price),
                unit_cost=float(unit_cost),
                discount_percent=0.0,
                line_total=float(line_total),
                profit=float(line_profit)
            )
            sale_items.append(sale_item)

            # Immutable inventory movement
            movement = InventoryMovement(
                medicine_id=item.medicine_id,
                batch_id=batch.id,
                branch_id=branch_id,
                movement_type="SALE_OUT",
                quantity=-float(take_qty),
                unit_cost=float(unit_cost),
                created_by=cashier_id
            )
            movements.append(movement)

            remaining_to_fulfill -= take_qty

    invoice_number = f"INV-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    
    # Auto-link active cash session if not provided
    session_id = sale_data.cash_session_id
    if not session_id:
        active_sess = await db.execute(
            select(CashSession).where(
                CashSession.cashier_id == cashier_id,
                CashSession.status == "OPEN"
            )
        )
        found_session = active_sess.scalars().first()
        if found_session:
            session_id = found_session.id

    # Process payments (split payments or single payment)
    payments_to_record = []
    if sale_data.payments and len(sale_data.payments) > 0:
        total_payments = sum(Decimal(str(p.amount)) for p in sale_data.payments)
        if total_payments < total_amount - Decimal('0.01'):
            raise ValidationError(
                f"Insufficient payment for sale. Total due: {total_amount:.2f}, Total provided: {total_payments:.2f}"
            )
        
        methods_set = {p.payment_method.strip().upper() for p in sale_data.payments}
        if len(methods_set) == 1:
            overall_payment_method = list(methods_set)[0]
        else:
            overall_payment_method = "SPLIT"

        for p in sale_data.payments:
            p_method = p.payment_method.strip().upper()
            payments_to_record.append(
                SalePayment(
                    cash_session_id=session_id if p_method == "CASH" or session_id else None,
                    payment_method=p_method,
                    amount=float(Decimal(str(p.amount))),
                    reference=p.reference.strip() if p.reference else None
                )
            )
    else:
        # Legacy single payment fallback
        p_method = (sale_data.payment_method or "CASH").strip().upper()
        overall_payment_method = p_method
        payments_to_record.append(
            SalePayment(
                cash_session_id=session_id,
                payment_method=p_method,
                amount=float(total_amount),
                reference=None
            )
        )

    sale = Sale(
        invoice_number=invoice_number,
        branch_id=branch_id,
        cashier_id=cashier_id,
        status="COMPLETED",
        subtotal=float(total_amount),
        discount_amount=0.0,
        tax_amount=0.0,
        profit_amount=float(total_profit),
        total_amount=float(total_amount),
        payment_method=overall_payment_method,
        customer_id=sale_data.customer_id,
        cash_session_id=session_id
    )
    db.add(sale)
    await db.flush()

    for p in payments_to_record:
        p.sale_id = sale.id
        db.add(p)

    for si in sale_items:
        si.sale_id = sale.id
        db.add(si)

    for mv in movements:
        mv.reference_id = str(sale.id)
        mv.reference_type = "SALE"
        mv.notes = f"Sale invoice {invoice_number}"
        db.add(mv)

    await db.commit()
    await db.refresh(sale)
    return sale

async def return_sale(
    db: AsyncSession, 
    sale_id: uuid.UUID, 
    cashier_id: uuid.UUID,
    return_data: Optional[SaleReturnCreate] = None
) -> Sale:
    """Process a partial or full return with condition inspection, disposition routing, and cash sync."""
    result = await db.execute(select(Sale).where(Sale.id == sale_id))
    sale = result.scalars().first()
    
    if not sale:
        raise ValidationError(f"Sale {sale_id} not found")
        
    if sale.status == "RETURNED":
        raise ValidationError(f"Invoice {sale.invoice_number} is already fully returned")
        
    items_result = await db.execute(select(SaleItem).where(SaleItem.sale_id == sale_id))
    sale_items = items_result.scalars().all()
    sale_items_by_id = {item.id: item for item in sale_items}

    # Determine cashier's active session for cash refunds
    session_id = return_data.cash_session_id if return_data else None
    if not session_id:
        open_session_res = await db.execute(
            select(CashSession).where(
                CashSession.cashier_id == cashier_id,
                CashSession.status == "OPEN"
            )
        )
        open_session = open_session_res.scalars().first()
        if open_session:
            session_id = open_session.id

    refund_method = return_data.refund_method.upper() if return_data and return_data.refund_method else sale.payment_method
    reason = return_data.reason if return_data and return_data.reason else "Customer return"
    return_number = f"RET-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    sale_return = SaleReturn(
        sale_id=sale.id,
        return_number=return_number,
        branch_id=sale.branch_id,
        cashier_id=cashier_id,
        cash_session_id=session_id,
        refund_method=refund_method,
        total_refund=0.0,
        reason=reason
    )
    db.add(sale_return)
    await db.flush()

    total_refund_amount = Decimal('0.0')

    # Case A: Itemized Partial Return specified by caller
    if return_data and return_data.items and len(return_data.items) > 0:
        for ret_in in return_data.items:
            sale_item = sale_items_by_id.get(ret_in.sale_item_id)
            if not sale_item:
                raise ValidationError(f"Sale item {ret_in.sale_item_id} does not belong to invoice {sale.invoice_number}")

            qty_requested = Decimal(str(ret_in.quantity))
            if qty_requested <= 0:
                continue

            available_to_return = Decimal(str(sale_item.quantity)) - Decimal(str(sale_item.quantity_returned or 0))
            if qty_requested > available_to_return:
                raise ValidationError(f"Cannot return {qty_requested} units of medicine. Only {available_to_return} units available for return.")

            unit_price = Decimal(str(sale_item.unit_price))
            line_refund = qty_requested * unit_price
            total_refund_amount += line_refund

            # Update returned quantity snapshot on sale item
            sale_item.quantity_returned = float(Decimal(str(sale_item.quantity_returned or 0)) + qty_requested)

            # Inspect condition & disposition
            cond = (ret_in.condition or "GOOD").upper()
            disp = (ret_in.disposition or "RESTOCK").upper()

            # Batch restoration check
            batch_result = await db.execute(select(MedicineBatch).where(MedicineBatch.id == sale_item.batch_id))
            batch = batch_result.scalars().first()

            if disp in ["RESTOCK", "SALEABLE"]:
                # Item is intact and saleable: restore batch stock
                if batch:
                    batch.quantity_remaining = float(Decimal(str(batch.quantity_remaining)) + qty_requested)
                    if batch.status == "OUT_OF_STOCK" and batch.quantity_remaining > 0:
                        batch.status = "ACTIVE"

                # Log restock movement
                mv = InventoryMovement(
                    medicine_id=sale_item.medicine_id,
                    batch_id=sale_item.batch_id,
                    branch_id=sale.branch_id,
                    movement_type="RETURN_IN",
                    quantity=float(qty_requested),
                    unit_cost=float(sale_item.unit_cost or 0),
                    created_by=cashier_id,
                    reference_id=str(sale.id),
                    reference_type="SALE_RETURN",
                    notes=f"Return of {qty_requested} units from invoice {sale.invoice_number} (Condition: {cond})"
                )
                db.add(mv)
            else:
                # Item is damaged, expired, or quarantined: DO NOT restore to sellable stock!
                mv = InventoryMovement(
                    medicine_id=sale_item.medicine_id,
                    batch_id=sale_item.batch_id,
                    branch_id=sale.branch_id,
                    movement_type=f"RETURN_{disp}",
                    quantity=0.0,
                    unit_cost=float(sale_item.unit_cost or 0),
                    created_by=cashier_id,
                    reference_id=str(sale.id),
                    reference_type="SALE_RETURN",
                    notes=f"Returned {qty_requested} units diverted to {disp} ({cond}) from invoice {sale.invoice_number}"
                )
                db.add(mv)

            # Create return item record
            ret_item = SaleReturnItem(
                return_id=sale_return.id,
                sale_item_id=sale_item.id,
                medicine_id=sale_item.medicine_id,
                batch_id=sale_item.batch_id,
                quantity=float(qty_requested),
                unit_price=float(unit_price),
                refund_amount=float(line_refund),
                condition=cond,
                disposition=disp,
                notes=ret_in.reason or reason
            )
            db.add(ret_item)

    # Case B: Full Legacy Return (all items, all remaining returnable quantities)
    else:
        for item in sale_items:
            available_to_return = Decimal(str(item.quantity)) - Decimal(str(item.quantity_returned or 0))
            if available_to_return <= 0:
                continue

            unit_price = Decimal(str(item.unit_price))
            line_refund = available_to_return * unit_price
            total_refund_amount += line_refund

            item.quantity_returned = float(Decimal(str(item.quantity_returned or 0)) + available_to_return)

            batch_result = await db.execute(select(MedicineBatch).where(MedicineBatch.id == item.batch_id))
            batch = batch_result.scalars().first()
            if batch:
                batch.quantity_remaining = float(Decimal(str(batch.quantity_remaining)) + available_to_return)
                if batch.status == "OUT_OF_STOCK" and batch.quantity_remaining > 0:
                    batch.status = "ACTIVE"

            mv = InventoryMovement(
                medicine_id=item.medicine_id,
                batch_id=item.batch_id,
                branch_id=sale.branch_id,
                movement_type="RETURN_IN",
                quantity=float(available_to_return),
                unit_cost=float(item.unit_cost or 0),
                created_by=cashier_id,
                reference_id=str(sale.id),
                reference_type="SALE_RETURN",
                notes=f"Full return of invoice {sale.invoice_number}"
            )
            db.add(mv)

            ret_item = SaleReturnItem(
                return_id=sale_return.id,
                sale_item_id=item.id,
                medicine_id=item.medicine_id,
                batch_id=item.batch_id,
                quantity=float(available_to_return),
                unit_price=float(unit_price),
                refund_amount=float(line_refund),
                condition="GOOD",
                disposition="RESTOCK",
                notes=reason
            )
            db.add(ret_item)

    sale_return.total_refund = float(total_refund_amount)

    # Check overall sale status: are all items completely returned?
    remaining_total_units = sum(
        Decimal(str(i.quantity)) - Decimal(str(i.quantity_returned or 0))
        for i in sale_items
    )
    if remaining_total_units <= 0:
        sale.status = "RETURNED"
    else:
        sale.status = "PARTIALLY_RETURNED"

    await db.commit()
    await db.refresh(sale)
    return sale
