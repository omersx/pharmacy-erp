from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.modules.medicines.models import MedicineBatch
from app.modules.sales.models import Sale, SaleItem
from app.modules.inventory.models import InventoryMovement
from app.core.exceptions import ValidationError
import uuid
from datetime import datetime

async def create_sale(db: AsyncSession, sale_data, branch_id: uuid.UUID, cashier_id: uuid.UUID):
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
        query = (
            select(MedicineBatch)
            .where(MedicineBatch.medicine_id == item.medicine_id)
            .where(MedicineBatch.branch_id == branch_id)
            .where(MedicineBatch.quantity_remaining > 0)
            .where(MedicineBatch.is_active == True)
            .where(MedicineBatch.expiry_date > datetime.utcnow())
            .where(MedicineBatch.status.in_(["ACTIVE", "NEAR_EXPIRY"]))
            .order_by(MedicineBatch.expiry_date.asc())
        )
        
        if not is_sqlite:
            query = query.with_for_update()

        result = await db.execute(query)
        batches = result.scalars().all()

        qty_needed = Decimal(str(item.quantity))
        
        for batch in batches:
            if qty_needed <= 0:
                break
                
            available = Decimal(str(batch.quantity_remaining))
            if available <= Decimal('0.0'):
                continue

            take = min(available, qty_needed)
            new_remaining = available - take
            batch.quantity_remaining = float(new_remaining)
            if new_remaining <= Decimal('0.0'):
                batch.status = "OUT_OF_STOCK"
                
            qty_needed -= take
            
            unit_price = Decimal(str(item.unit_price))
            unit_cost = Decimal(str(batch.purchase_price or 0))
            line_total = take * unit_price
            line_profit = (unit_price - unit_cost) * take
            
            sale_items.append(SaleItem(
                medicine_id=item.medicine_id,
                batch_id=batch.id,
                quantity=float(take),
                unit_price=float(unit_price),
                unit_cost=float(unit_cost),
                discount_percent=0.0,
                line_total=float(line_total),
                profit=float(line_profit)
            ))
            total_amount += line_total
            total_profit += line_profit
            
            movements.append(InventoryMovement(
                medicine_id=item.medicine_id,
                batch_id=batch.id,
                branch_id=branch_id,
                movement_type="SALE_OUT",
                quantity=float(-take),
                unit_cost=float(unit_cost),
                created_by=cashier_id
            ))
            
        if qty_needed > Decimal('0.0'):
            raise ValidationError(f"Insufficient stock for medicine {item.medicine_id} in branch {branch_id}")

    invoice_number = f"INV-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    # Auto-link active cash session for cashier if not provided
    session_id = sale_data.cash_session_id
    if not session_id:
        from app.modules.cash_sessions.models import CashSession
        sess_query = select(CashSession.id).where(
            CashSession.cashier_id == cashier_id,
            CashSession.status == "OPEN"
        ).order_by(CashSession.opened_at.desc()).limit(1)
        sess_res = await db.execute(sess_query)
        session_id = sess_res.scalar_one_or_none()

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
        payment_method=sale_data.payment_method,
        customer_id=sale_data.customer_id,
        cash_session_id=session_id
    )
    db.add(sale)
    await db.flush()

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

async def return_sale(db: AsyncSession, sale_id: uuid.UUID, cashier_id: uuid.UUID):
    result = await db.execute(select(Sale).where(Sale.id == sale_id))
    sale = result.scalars().first()
    
    if not sale:
        raise ValidationError(f"Sale {sale_id} not found")
        
    if sale.status == "RETURNED":
        raise ValidationError(f"Sale {sale_id} is already returned")
        
    items_result = await db.execute(select(SaleItem).where(SaleItem.sale_id == sale_id))
    sale_items = items_result.scalars().all()
    
    for item in sale_items:
        # Restore stock to corresponding batch
        batch_result = await db.execute(select(MedicineBatch).where(MedicineBatch.id == item.batch_id))
        batch = batch_result.scalars().first()
        if batch:
            batch.quantity_remaining = float(Decimal(str(batch.quantity_remaining)) + Decimal(str(item.quantity)))
            if batch.status == "OUT_OF_STOCK" and batch.quantity_remaining > 0:
                batch.status = "ACTIVE"
            
        # Create return movement in ledger
        mv = InventoryMovement(
            medicine_id=item.medicine_id,
            batch_id=item.batch_id,
            branch_id=sale.branch_id,
            movement_type="RETURN_IN",
            quantity=float(item.quantity),
            unit_cost=float(item.unit_cost or 0),
            created_by=cashier_id,
            reference_id=str(sale.id),
            reference_type="SALE_RETURN",
            notes=f"Return of invoice {sale.invoice_number}"
        )
        db.add(mv)
        
    sale.status = "RETURNED"
    await db.commit()
    await db.refresh(sale)
    return sale
