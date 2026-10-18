import pytest
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from sqlalchemy import select

from app.modules.organizations.models import Branch
from app.modules.auth.models import User
from app.modules.medicines.models import Medicine, MedicineBatch
from app.modules.sales.schemas import SaleCreate, SaleItemCreate
from app.modules.sales.service import create_sale, return_sale
from app.modules.sales.models import Sale, SaleItem
from app.modules.inventory.models import InventoryMovement
from app.core.exceptions import ValidationError

@pytest.mark.asyncio
async def test_fefo_and_branch_isolation(test_db):
    # 1. Setup Branch A and Branch B
    branch_a = Branch(name="Branch A", code="BRA")
    branch_b = Branch(name="Branch B", code="BRB")
    cashier = User(email="cashier_test@pharmacy.com", password_hash="hash", full_name="Cashier Test", role="cashier")
    test_db.add_all([branch_a, branch_b, cashier])
    await test_db.commit()

    # 2. Setup Medicine
    med = Medicine(
        sku="MED-FEFO-01",
        name_en="Amoxicillin 500mg",
        base_unit="Pack",
        selling_price=20.0
    )
    test_db.add(med)
    await test_db.commit()

    now = datetime.utcnow()

    # 3. Add Batches:
    # - Batch 1 in Branch A: expires in 30 days, qty 5, cost 10
    # - Batch 2 in Branch A: expires in 90 days, qty 10, cost 12
    # - Batch 3 in Branch B: expires in 15 days, qty 20, cost 11
    batch_1 = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch_a.id,
        batch_number="BATCH-A-EARLY",
        expiry_date=now + timedelta(days=30),
        purchase_price=10.0,
        quantity_received=5.0,
        quantity_remaining=5.0
    )
    batch_2 = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch_a.id,
        batch_number="BATCH-A-LATE",
        expiry_date=now + timedelta(days=90),
        purchase_price=12.0,
        quantity_received=10.0,
        quantity_remaining=10.0
    )
    batch_3 = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch_b.id,
        batch_number="BATCH-B-EARLIEST",
        expiry_date=now + timedelta(days=15),
        purchase_price=11.0,
        quantity_received=20.0,
        quantity_remaining=20.0
    )
    test_db.add_all([batch_1, batch_2, batch_3])
    await test_db.commit()

    # 4. Attempt to sell 8 units in Branch A:
    # Expected:
    # - Batch 1 (earlier expiry in Branch A) is exhausted: 5 units taken, remaining = 0
    # - Batch 2 (later expiry in Branch A) supplies 3 units: remaining = 7
    # - Batch 3 (Branch B) is untouched: remaining = 20
    sale_data = SaleCreate(
        payment_method="CASH",
        items=[
            SaleItemCreate(
                medicine_id=med.id,
                quantity=Decimal("8.0"),
                unit_price=Decimal("25.0")
            )
        ]
    )

    sale = await create_sale(test_db, sale_data, branch_a.id, cashier.id)
    assert sale is not None
    assert sale.status == "COMPLETED"
    assert sale.total_amount == 200.0  # 8 * 25.0
    
    # Expected profit:
    # 5 units @ (25 - 10) = 75
    # 3 units @ (25 - 12) = 39
    # Total profit = 114.0
    assert sale.profit_amount == 114.0

    # Verify batches in DB
    await test_db.refresh(batch_1)
    await test_db.refresh(batch_2)
    await test_db.refresh(batch_3)

    assert batch_1.quantity_remaining == 0.0
    assert batch_1.status == "OUT_OF_STOCK"
    assert batch_2.quantity_remaining == 7.0
    assert batch_2.status == "ACTIVE"
    assert batch_3.quantity_remaining == 20.0  # Untouched in Branch B!

    # Verify inventory ledger movements
    mov_res = await test_db.execute(
        select(InventoryMovement).where(InventoryMovement.reference_id == str(sale.id))
    )
    movements = mov_res.scalars().all()
    assert len(movements) == 2
    assert sum(m.quantity for m in movements) == -8.0

@pytest.mark.asyncio
async def test_expired_batches_never_sold(test_db):
    branch = Branch(name="Main", code="M1")
    cashier = User(email="cashier2@pharmacy.com", password_hash="hash", full_name="Cashier 2", role="cashier")
    med = Medicine(sku="MED-EXP-01", name_en="Expired Med Test", base_unit="Box", selling_price=10.0)
    test_db.add_all([branch, cashier, med])
    await test_db.commit()

    now = datetime.utcnow()
    # Batch is expired yesterday
    expired_batch = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch.id,
        batch_number="BATCH-EXPIRED",
        expiry_date=now - timedelta(days=1),
        purchase_price=5.0,
        quantity_received=100.0,
        quantity_remaining=100.0
    )
    test_db.add(expired_batch)
    await test_db.commit()

    sale_data = SaleCreate(
        payment_method="CASH",
        items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal("1.0"), unit_price=Decimal("10.0"))]
    )

    with pytest.raises(ValidationError, match="Insufficient stock"):
        await create_sale(test_db, sale_data, branch.id, cashier.id)

@pytest.mark.asyncio
async def test_sale_return_restores_stock_and_ledger(test_db):
    branch = Branch(name="Main Return", code="MR1")
    cashier = User(email="cashier3@pharmacy.com", password_hash="hash", full_name="Cashier 3", role="cashier")
    med = Medicine(sku="MED-RET-01", name_en="Return Med Test", base_unit="Box", selling_price=30.0)
    test_db.add_all([branch, cashier, med])
    await test_db.commit()

    now = datetime.utcnow()
    batch = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch.id,
        batch_number="BATCH-RET-01",
        expiry_date=now + timedelta(days=100),
        purchase_price=15.0,
        quantity_received=10.0,
        quantity_remaining=10.0
    )
    test_db.add(batch)
    await test_db.commit()

    sale_data = SaleCreate(
        payment_method="CASH",
        items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal("4.0"), unit_price=Decimal("30.0"))]
    )
    sale = await create_sale(test_db, sale_data, branch.id, cashier.id)
    await test_db.refresh(batch)
    assert batch.quantity_remaining == 6.0

    # Now return the sale
    returned_sale = await return_sale(test_db, sale.id, cashier.id)
    assert returned_sale.status == "RETURNED"

    await test_db.refresh(batch)
    assert batch.quantity_remaining == 10.0

    # Check return movement in ledger
    ret_mov_res = await test_db.execute(
        select(InventoryMovement).where(
            InventoryMovement.reference_id == str(sale.id),
            InventoryMovement.movement_type == "RETURN_IN"
        )
    )
    ret_movement = ret_mov_res.scalars().first()
    assert ret_movement is not None
    assert ret_movement.quantity == 4.0
    assert ret_movement.unit_cost == 15.0

@pytest.mark.asyncio
async def test_profit_snapshot_immutability(test_db):
    branch = Branch(name="Main Profit", code="MP1")
    cashier = User(email="cashier_p@pharmacy.com", password_hash="hash", full_name="Cashier P", role="cashier")
    med = Medicine(sku="MED-PROF-01", name_en="Profit Med Test", base_unit="Box", selling_price=50.0)
    test_db.add_all([branch, cashier, med])
    await test_db.commit()

    now = datetime.utcnow()
    batch = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch.id,
        batch_number="BATCH-PROF-01",
        expiry_date=now + timedelta(days=120),
        purchase_price=30.0,
        quantity_received=10.0,
        quantity_remaining=10.0
    )
    test_db.add(batch)
    await test_db.commit()

    sale_data = SaleCreate(
        payment_method="CARD",
        items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal("2.0"), unit_price=Decimal("50.0"))]
    )
    sale = await create_sale(test_db, sale_data, branch.id, cashier.id)
    
    # 2 units @ 50 = 100 revenue, cost = 2 @ 30 = 60, profit = 40
    assert sale.profit_amount == 40.0
    
    # Now simulate a batch purchase cost change later (e.g. supplier update)
    batch.purchase_price = 45.0
    await test_db.commit()

    # The past sale's item profit and unit_cost must remain unchanged!
    item_res = await test_db.execute(select(SaleItem).where(SaleItem.sale_id == sale.id))
    sale_item = item_res.scalars().first()
    assert sale_item.unit_cost == 30.0
    assert sale_item.profit == 40.0

