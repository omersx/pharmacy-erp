import pytest
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import select
from fastapi import HTTPException

from app.modules.organizations.models import Branch
from app.modules.auth.models import User
from app.modules.medicines.models import Medicine, MedicineBatch
from app.modules.inventory.models import StockLocation, BatchLocationStock, InventoryMovement
from app.modules.inventory.schemas import (
    QuickRefillRequest, BulkRefillRequest, BulkRefillItem,
    StartCycleCountRequest, UpdateCycleCountRequest, CycleCountLineUpdate
)
from app.modules.inventory.location_service import (
    get_or_create_default_locations, transfer_stock_between_locations
)
from app.modules.inventory.router import (
    list_stock_locations, get_locations_stock_summary,
    get_refill_suggestions, quick_refill_shelf, bulk_refill_shelves,
    start_cycle_count, get_cycle_count_session, update_cycle_count_lines, reconcile_cycle_count_session
)
from app.modules.sales.schemas import SaleCreate, SaleItemCreate, PaymentEntryCreate
from app.modules.sales.service import create_sale

@pytest.mark.asyncio
async def test_default_locations_auto_created(test_db):
    branch = Branch(name="West Branch", code="WEST")
    test_db.add(branch)
    await test_db.commit()

    # Call get_or_create_default_locations
    shelf, warehouse = await get_or_create_default_locations(test_db, branch.id)
    await test_db.commit()

    assert shelf is not None
    assert warehouse is not None
    assert shelf.is_default_dispense is True
    assert warehouse.is_default_receive is True
    assert shelf.location_type == "DISPENSARY_SHELF"
    assert warehouse.location_type == "WAREHOUSE"

    # Idempotency check: calling again returns existing records
    shelf2, warehouse2 = await get_or_create_default_locations(test_db, branch.id)
    assert shelf.id == shelf2.id
    assert warehouse.id == warehouse2.id


@pytest.mark.asyncio
async def test_quick_refill_fefo_allocation(test_db):
    branch = Branch(name="Central Branch", code="CENTRAL")
    pharmacist = User(email="pharma@test.com", password_hash="pwd", full_name="Pharmacist Ali", role="pharmacist")
    test_db.add_all([branch, pharmacist])
    await test_db.commit()

    shelf, warehouse = await get_or_create_default_locations(test_db, branch.id)

    med = Medicine(
        sku="MED-PAN-01",
        name_en="Panadol Extra 500mg",
        base_unit="Pack",
        selling_price=10.0,
        reorder_level=5
    )
    test_db.add(med)
    await test_db.commit()

    now = datetime.now(timezone.utc)
    # Batch 1: expires in 30 days, 10 units in warehouse
    batch1 = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch.id,
        batch_number="BATCH-EARLY",
        expiry_date=now + timedelta(days=30),
        purchase_price=5.0,
        quantity_received=10.0,
        quantity_remaining=10.0,
        status="ACTIVE"
    )
    # Batch 2: expires in 120 days, 20 units in warehouse
    batch2 = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch.id,
        batch_number="BATCH-LATER",
        expiry_date=now + timedelta(days=120),
        purchase_price=5.0,
        quantity_received=20.0,
        quantity_remaining=20.0,
        status="ACTIVE"
    )
    test_db.add_all([batch1, batch2])
    await test_db.commit()

    # Assign both batches to warehouse location
    wh_stock1 = BatchLocationStock(batch_id=batch1.id, location_id=warehouse.id, quantity=10.0)
    wh_stock2 = BatchLocationStock(batch_id=batch2.id, location_id=warehouse.id, quantity=20.0)
    test_db.add_all([wh_stock1, wh_stock2])
    await test_db.commit()

    # Refill 15 units to shelf (should take 10 from batch1, 5 from batch2)
    req = QuickRefillRequest(
        medicine_id=med.id,
        quantity=Decimal('15.0'),
        branch_id=branch.id,
        from_location_id=warehouse.id,
        to_location_id=shelf.id,
        notes="Testing FEFO refill"
    )
    result = await quick_refill_shelf(req, test_db, pharmacist)

    assert result["success"] is True
    assert result["transferred_quantity"] == 15.0

    # Verify warehouse balances
    await test_db.refresh(wh_stock1)
    await test_db.refresh(wh_stock2)
    assert Decimal(str(wh_stock1.quantity)) == Decimal('0.0')
    assert Decimal(str(wh_stock2.quantity)) == Decimal('15.0')

    # Verify shelf balances
    shelf_res = await test_db.execute(
        select(BatchLocationStock).where(BatchLocationStock.location_id == shelf.id)
    )
    shelf_stocks = shelf_res.scalars().all()
    total_on_shelf = sum(Decimal(str(s.quantity)) for s in shelf_stocks)
    assert total_on_shelf == Decimal('15.0')

    # Verify movement logs
    mov_res = await test_db.execute(
        select(InventoryMovement).where(InventoryMovement.movement_type == "INTERNAL_TRANSFER")
    )
    movements = mov_res.scalars().all()
    assert len(movements) == 2  # 1 for batch1, 1 for batch2
    assert movements[0].from_location_id == warehouse.id
    assert movements[0].to_location_id == shelf.id


@pytest.mark.asyncio
async def test_quick_refill_insufficient_stock_fails(test_db):
    branch = Branch(name="North Branch", code="NORTH")
    pharmacist = User(email="pharma2@test.com", password_hash="pwd", full_name="Pharmacist Sara", role="pharmacist")
    test_db.add_all([branch, pharmacist])
    await test_db.commit()

    shelf, warehouse = await get_or_create_default_locations(test_db, branch.id)

    med = Medicine(
        sku="MED-AMOX-01",
        name_en="Amoxicillin 500mg",
        base_unit="Pack",
        selling_price=12.0
    )
    test_db.add(med)
    await test_db.commit()

    now = datetime.now(timezone.utc)
    batch = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch.id,
        batch_number="AMOX-BATCH-01",
        expiry_date=now + timedelta(days=90),
        purchase_price=6.0,
        quantity_received=5.0,
        quantity_remaining=5.0,
        status="ACTIVE"
    )
    test_db.add(batch)
    await test_db.commit()

    test_db.add(BatchLocationStock(batch_id=batch.id, location_id=warehouse.id, quantity=5.0))
    await test_db.commit()

    # Try to transfer 20 units (only 5 in warehouse)
    req = QuickRefillRequest(
        medicine_id=med.id,
        quantity=Decimal('20.0'),
        branch_id=branch.id,
        from_location_id=warehouse.id,
        to_location_id=shelf.id,
    )
    with pytest.raises(HTTPException) as exc_info:
        await quick_refill_shelf(req, test_db, pharmacist)

    assert exc_info.value.status_code == 400
    assert "Insufficient" in exc_info.value.detail


@pytest.mark.asyncio
async def test_refill_suggestions_and_bulk_refill(test_db):
    branch = Branch(name="South Branch", code="SOUTH")
    admin = User(email="admin@test.com", password_hash="pwd", full_name="Admin User", role="admin")
    test_db.add_all([branch, admin])
    await test_db.commit()

    shelf, warehouse = await get_or_create_default_locations(test_db, branch.id)

    # Med A: 0 on shelf, 25 in warehouse -> Needs refill (EMPTY_ON_SHELF)
    medA = Medicine(sku="MED-A", name_en="Medicine A", base_unit="Box", selling_price=15.0, reorder_level=5)
    # Med B: 10 on shelf, 50 in warehouse -> Normal (reorder is 5) -> No suggestion
    medB = Medicine(sku="MED-B", name_en="Medicine B", base_unit="Box", selling_price=20.0, reorder_level=5)
    test_db.add_all([medA, medB])
    await test_db.commit()

    now = datetime.now(timezone.utc)
    batchA = MedicineBatch(
        medicine_id=medA.id, branch_id=branch.id, batch_number="BA-01",
        expiry_date=now + timedelta(days=200), purchase_price=8.0,
        quantity_received=25.0, quantity_remaining=25.0, status="ACTIVE"
    )
    batchB = MedicineBatch(
        medicine_id=medB.id, branch_id=branch.id, batch_number="BB-01",
        expiry_date=now + timedelta(days=200), purchase_price=10.0,
        quantity_received=60.0, quantity_remaining=60.0, status="ACTIVE"
    )
    test_db.add_all([batchA, batchB])
    await test_db.commit()

    # Med A has 25 in warehouse, 0 on shelf
    test_db.add(BatchLocationStock(batch_id=batchA.id, location_id=warehouse.id, quantity=25.0))
    # Med B has 10 on shelf, 50 in warehouse
    test_db.add(BatchLocationStock(batch_id=batchB.id, location_id=shelf.id, quantity=10.0))
    test_db.add(BatchLocationStock(batch_id=batchB.id, location_id=warehouse.id, quantity=50.0))
    await test_db.commit()

    # Fetch refill suggestions
    suggestions = await get_refill_suggestions(branch.id, test_db, admin)
    assert len(suggestions) == 1
    sugA = suggestions[0]
    assert sugA.medicine_id == medA.id
    assert sugA.status == "EMPTY_ON_SHELF"
    assert sugA.shelf_stock == Decimal('0.0')
    assert sugA.warehouse_stock == Decimal('25.0')
    assert sugA.suggested_refill > Decimal('0.0')
    assert len(sugA.available_batches) == 1

    # Now perform bulk refill
    bulk_req = BulkRefillRequest(
        branch_id=branch.id,
        from_location_id=warehouse.id,
        to_location_id=shelf.id,
        items=[BulkRefillItem(medicine_id=medA.id, quantity=sugA.suggested_refill)]
    )
    bulk_res = await bulk_refill_shelves(bulk_req, test_db, admin)
    assert bulk_res["success"] is True
    assert bulk_res["items_count"] == 1

    # Verify suggestions now empty or reduced
    suggestions_after = await get_refill_suggestions(branch.id, test_db, admin)
    # Med A now has shelf_stock == suggested_refill (which is 10 > reorder_level 5), so no longer suggested!
    assert len(suggestions_after) == 0


@pytest.mark.asyncio
async def test_pos_sale_deducts_from_shelf_and_auto_pulls_warehouse(test_db):
    branch = Branch(name="POS Test Branch", code="POS-01")
    cashier = User(email="cashier@test.com", password_hash="pwd", full_name="Cashier John", role="cashier")
    test_db.add_all([branch, cashier])
    await test_db.commit()

    shelf, warehouse = await get_or_create_default_locations(test_db, branch.id)

    med = Medicine(sku="MED-POS-01", name_en="Aspirin 100mg", base_unit="Box", selling_price=20.0)
    test_db.add(med)
    await test_db.commit()

    now = datetime.now(timezone.utc)
    batch = MedicineBatch(
        medicine_id=med.id, branch_id=branch.id, batch_number="ASP-B1",
        expiry_date=now + timedelta(days=365), purchase_price=10.0,
        quantity_received=30.0, quantity_remaining=30.0, status="ACTIVE"
    )
    test_db.add(batch)
    await test_db.commit()

    # Scenario: 5 units on Shelf, 25 units in Warehouse
    shelf_stock = BatchLocationStock(batch_id=batch.id, location_id=shelf.id, quantity=5.0)
    wh_stock = BatchLocationStock(batch_id=batch.id, location_id=warehouse.id, quantity=25.0)
    test_db.add_all([shelf_stock, wh_stock])
    await test_db.commit()

    # Sale 1: Buy 3 units (less than shelf stock 5) -> Deducts purely from shelf
    sale_data1 = SaleCreate(
        items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal('3.0'), unit_price=Decimal('20.0'))],
        payments=[PaymentEntryCreate(payment_method="CASH", amount=Decimal('60.0'))]
    )
    sale1 = await create_sale(test_db, sale_data1, branch.id, cashier.id)
    await test_db.commit()

    await test_db.refresh(shelf_stock)
    await test_db.refresh(wh_stock)
    assert Decimal(str(shelf_stock.quantity)) == Decimal('2.0')
    assert Decimal(str(wh_stock.quantity)) == Decimal('25.0')

    # Sale 2: Buy 5 units (shelf only has 2, deficit of 3!) -> Auto-pulls 3 from warehouse to cover sale
    sale_data2 = SaleCreate(
        items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal('5.0'), unit_price=Decimal('20.0'))],
        payments=[PaymentEntryCreate(payment_method="CASH", amount=Decimal('100.0'))]
    )
    sale2 = await create_sale(test_db, sale_data2, branch.id, cashier.id)
    await test_db.commit()

    await test_db.refresh(shelf_stock)
    await test_db.refresh(wh_stock)
    assert Decimal(str(shelf_stock.quantity)) == Decimal('0.0')
    assert Decimal(str(wh_stock.quantity)) == Decimal('22.0')  # 25 - 3 auto-pulled = 22

    # Check auto-pull movement was recorded
    mov_stmt = select(InventoryMovement).where(InventoryMovement.reference_type == "AUTO_POS_REFILL")
    mov_res = await test_db.execute(mov_stmt)
    auto_refill_mov = mov_res.scalars().first()
    assert auto_refill_mov is not None
    assert auto_refill_mov.quantity == 3.0
    assert auto_refill_mov.from_location_id == warehouse.id
    assert auto_refill_mov.to_location_id == shelf.id


@pytest.mark.asyncio
async def test_location_cycle_count_lifecycle(test_db):
    branch = Branch(name="Cycle Branch", code="CYC-01")
    manager = User(email="manager@test.com", password_hash="pwd", full_name="Manager Bob", role="admin")
    test_db.add_all([branch, manager])
    await test_db.commit()

    shelf, warehouse = await get_or_create_default_locations(test_db, branch.id)

    med1 = Medicine(sku="CYC-MED-1", name_en="Vitamin C 1000mg", base_unit="Box", selling_price=15.0)
    med2 = Medicine(sku="CYC-MED-2", name_en="Zinc 50mg", base_unit="Bottle", selling_price=12.0)
    test_db.add_all([med1, med2])
    await test_db.commit()

    now = datetime.now(timezone.utc)
    batch1 = MedicineBatch(
        medicine_id=med1.id, branch_id=branch.id, batch_number="B-VIT-1",
        expiry_date=now + timedelta(days=180), purchase_price=8.0,
        quantity_received=20.0, quantity_remaining=20.0, status="ACTIVE"
    )
    batch2 = MedicineBatch(
        medicine_id=med2.id, branch_id=branch.id, batch_number="B-ZNC-1",
        expiry_date=now + timedelta(days=180), purchase_price=6.0,
        quantity_received=15.0, quantity_remaining=15.0, status="ACTIVE"
    )
    test_db.add_all([batch1, batch2])
    await test_db.commit()

    # Assign to shelf location: 20 Vit C, 15 Zinc
    shelf_b1 = BatchLocationStock(batch_id=batch1.id, location_id=shelf.id, quantity=20.0)
    shelf_b2 = BatchLocationStock(batch_id=batch2.id, location_id=shelf.id, quantity=15.0)
    test_db.add_all([shelf_b1, shelf_b2])
    await test_db.commit()

    # 1. Start Cycle Count for Shelf location
    start_req = StartCycleCountRequest(location_id=shelf.id, branch_id=branch.id, notes="Monthly shelf check")
    start_res = await start_cycle_count(start_req, test_db, manager)
    session_id = uuid.UUID(start_res["session_id"])
    assert start_res["success"] is True
    assert start_res["items_count"] == 2

    # 2. Inspect session
    sess_data = await get_cycle_count_session(session_id, test_db, manager)
    assert sess_data.status == "IN_PROGRESS"
    assert len(sess_data.lines) == 2

    # Find line IDs
    line1 = next(l for l in sess_data.lines if l.batch_id == batch1.id)
    line2 = next(l for l in sess_data.lines if l.batch_id == batch2.id)

    # 3. Physical count results:
    # Vit C: Expected 20, Counted 22 (+2 surplus)
    # Zinc: Expected 15, Counted 14 (-1 shortage)
    update_req = UpdateCycleCountRequest(lines=[
        CycleCountLineUpdate(line_id=line1.id, counted_quantity=Decimal('22.0'), variance_reason="Unrecorded pack return"),
        CycleCountLineUpdate(line_id=line2.id, counted_quantity=Decimal('14.0'), variance_reason="Damaged bottle discarded")
    ])
    update_res = await update_cycle_count_lines(session_id, update_req, test_db, manager)
    assert update_res["updated_lines"] == 2

    # 4. Reconcile
    reconcile_res = await reconcile_cycle_count_session(session_id, test_db, manager)
    assert reconcile_res["success"] is True
    assert reconcile_res["reconciled_lines"] == 2
    assert reconcile_res["net_variance"] == 1.0  # +2 - 1 = +1

    # 5. Verify balances updated
    await test_db.refresh(shelf_b1)
    await test_db.refresh(shelf_b2)
    await test_db.refresh(batch1)
    await test_db.refresh(batch2)

    assert Decimal(str(shelf_b1.quantity)) == Decimal('22.0')
    assert Decimal(str(batch1.quantity_remaining)) == Decimal('22.0')

    assert Decimal(str(shelf_b2.quantity)) == Decimal('14.0')
    assert Decimal(str(batch2.quantity_remaining)) == Decimal('14.0')

    # 6. Verify inventory movements
    mov_res = await test_db.execute(
        select(InventoryMovement).where(InventoryMovement.reference_type == "CYCLE_COUNT")
    )
    movements = mov_res.scalars().all()
    assert len(movements) == 2
    types = {m.movement_type for m in movements}
    assert "CYCLE_COUNT_SURPLUS" in types
    assert "CYCLE_COUNT_SHORTAGE" in types


