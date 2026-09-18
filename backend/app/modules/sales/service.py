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
    sale_items = []
    movements = []

    for item in sale_data.items:
        result = await db.execute(
            select(MedicineBatch)
            .where(MedicineBatch.medicine_id == item.medicine_id)
            .where(MedicineBatch.quantity_remaining > 0)
            .where(MedicineBatch.is_active == True)
            .where(MedicineBatch.expiry_date > datetime.utcnow())
            .where(MedicineBatch.status.in_(["ACTIVE", "NEAR_EXPIRY"]))
            .order_by(MedicineBatch.expiry_date.asc())
        )
        batches = result.scalars().all()

        qty_needed = Decimal(str(item.quantity))
        
        for batch in batches:
            if qty_needed <= 0:
                break
                
            available = Decimal(str(batch.quantity_remaining))
            take = min(available, qty_needed)
            
            batch.quantity_remaining = float(available - take)
            qty_needed -= take
            
            line_total = take * Decimal(str(item.unit_price))
            sale_items.append(SaleItem(
                medicine_id=item.medicine_id,
                batch_id=batch.id,
                quantity=float(take),
                unit_price=float(item.unit_price),
                line_total=float(line_total)
            ))
            total_amount += line_total
            
            movements.append(InventoryMovement(
                medicine_id=item.medicine_id,
                batch_id=batch.id,
                branch_id=branch_id,
                movement_type="SALE_OUT",
                quantity=float(-take),
                created_by=cashier_id
            ))
            
        if qty_needed > 0:
            raise ValidationError(f"Insufficient stock for medicine {item.medicine_id}")

    invoice_number = f"INV-{uuid.uuid4().hex[:8].upper()}"

    sale = Sale(
        invoice_number=invoice_number,
        branch_id=branch_id,
        cashier_id=cashier_id,
        status="COMPLETED",
        subtotal=float(total_amount),
        total_amount=float(total_amount),
        payment_method=sale_data.payment_method,
        customer_id=sale_data.customer_id,
        cash_session_id=sale_data.cash_session_id
    )
    db.add(sale)
    await db.flush()

    for si in sale_items:
        si.sale_id = sale.id
        db.add(si)

    for mv in movements:
        mv.reference_id = str(sale.id)
        mv.reference_type = "SALE"
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
    
    from decimal import Decimal
    for item in sale_items:
        # Restore stock
        batch_result = await db.execute(select(MedicineBatch).where(MedicineBatch.id == item.batch_id))
        batch = batch_result.scalars().first()
        if batch:
            batch.quantity_remaining = float(Decimal(str(batch.quantity_remaining)) + Decimal(str(item.quantity)))
            
        # Create return movement
        mv = InventoryMovement(
            medicine_id=item.medicine_id,
            batch_id=item.batch_id,
            branch_id=sale.branch_id,
            movement_type="RETURN_IN",
            quantity=float(item.quantity),
            created_by=cashier_id,
            reference_id=str(sale.id),
            reference_type="SALE_RETURN"
        )
        db.add(mv)
        
    sale.status = "RETURNED"
    await db.commit()
    await db.refresh(sale)
    return sale
