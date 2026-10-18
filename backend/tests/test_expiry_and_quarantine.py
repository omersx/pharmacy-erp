import pytest
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import select

from app.modules.organizations.models import Branch
from app.modules.auth.models import User
from app.modules.medicines.models import Medicine, MedicineBatch
from app.modules.sales.schemas import SaleCreate, SaleItemCreate
from app.modules.sales.service import create_sale
from app.modules.inventory.models import InventoryMovement
from app.modules.inventory.schemas import BatchStatusUpdate
from app.modules.inventory.router import get_expiry_dashboard, update_batch_status
from app.core.exceptions import ValidationError
from fastapi import HTTPException

@pytest.mark.asyncio
async def test_expiry_dashboard_buckets_and_valuation(test_db):
    branch = Branch(name="Expiry Main Branch", code="EXP-MAIN")
    user = User(email="pharmacist_exp@pharmacy.com", password_hash="hash", full_name="Pharmacist Exp", role="pharmacist")
    test_db.add_all([branch, user])
    await test_db.commit()

    med1 = Medicine(sku="EXP-MED-01", name_en="Paracetamol 500mg", base_unit="Box", selling_price=10.0)
    med2 = Medicine(sku="EXP-MED-02", name_en="Ibuprofen 400mg", base_unit="Box", selling_price=15.0)
    test_db.add_all([med1, med2])
    await test_db.commit()

    now = datetime.now(timezone.utc)

    # 1. Urgent: 15 days left (0-30 days bucket) -> 10 units @ 5.0 cost = 50.0 value
    b_urgent = MedicineBatch(
        medicine_id=med1.id, branch_id=branch.id, batch_number="B-15D",
        expiry_date=now + timedelta(days=15), purchase_price=5.0,
        quantity_received=10, quantity_remaining=10, status="ACTIVE"
    )
    # 2. Medium: 45 days left (31-60 days bucket) -> 20 units @ 6.0 cost = 120.0 value
    b_med = MedicineBatch(
        medicine_id=med1.id, branch_id=branch.id, batch_number="B-45D",
        expiry_date=now + timedelta(days=45), purchase_price=6.0,
        quantity_received=20, quantity_remaining=20, status="ACTIVE"
    )
    # 3. Upcoming: 75 days left (61-90 days bucket) -> 30 units @ 4.0 cost = 120.0 value
    b_up = MedicineBatch(
        medicine_id=med2.id, branch_id=branch.id, batch_number="B-75D",
        expiry_date=now + timedelta(days=75), purchase_price=4.0,
        quantity_received=30, quantity_remaining=30, status="ACTIVE"
    )
    # 4. Expired: 10 days ago -> 5 units @ 8.0 cost = 40.0 value
    b_exp = MedicineBatch(
        medicine_id=med2.id, branch_id=branch.id, batch_number="B-EXPIRED",
        expiry_date=now - timedelta(days=10), purchase_price=8.0,
        quantity_received=5, quantity_remaining=5, status="EXPIRED"
    )
    # 5. Quarantined batch -> 8 units @ 7.0 cost = 56.0 value
    b_quar = MedicineBatch(
        medicine_id=med1.id, branch_id=branch.id, batch_number="B-QUAR",
        expiry_date=now + timedelta(days=120), purchase_price=7.0,
        quantity_received=8, quantity_remaining=8, status="QUARANTINED"
    )

    test_db.add_all([b_urgent, b_med, b_up, b_exp, b_quar])
    await test_db.commit()

    # Call get_expiry_dashboard
    response = await get_expiry_dashboard(branch_id=branch.id, bucket_filter=None, db=test_db, current_user=user)
    
    assert response.summary.count_0_30 >= 1
    assert response.summary.value_0_30 >= Decimal("50.0")
    assert response.summary.count_31_60 >= 1
    assert response.summary.value_31_60 >= Decimal("120.0")
    assert response.summary.count_61_90 >= 1
    assert response.summary.value_61_90 >= Decimal("120.0")
    assert response.summary.count_expired >= 1
    assert response.summary.value_expired >= Decimal("40.0")
    assert response.summary.count_quarantined >= 1
    assert response.summary.value_quarantined >= Decimal("56.0")

@pytest.mark.asyncio
async def test_quarantine_and_recall_batch_blocks_sale(test_db):
    branch = Branch(name="Safety Test Branch", code="SAFE-01")
    cashier = User(email="cashier_safety@pharmacy.com", password_hash="hash", full_name="Cashier Safety", role="cashier")
    test_db.add_all([branch, cashier])
    await test_db.commit()

    med = Medicine(sku="SAFE-MED-01", name_en="Ceftriaxone 1g", base_unit="Vial", selling_price=30.0)
    test_db.add(med)
    await test_db.commit()

    now = datetime.now(timezone.utc)
    batch = MedicineBatch(
        medicine_id=med.id, branch_id=branch.id, batch_number="BATCH-SUSPECT",
        expiry_date=now + timedelta(days=200), purchase_price=15.0,
        quantity_received=10, quantity_remaining=10, status="ACTIVE"
    )
    test_db.add(batch)
    await test_db.commit()

    # 1. Quarantine batch
    update_data = BatchStatusUpdate(
        status="QUARANTINED",
        reason="Precautionary hold: cloudy sediment reported by clinic",
        reference="INCIDENT-991"
    )
    res = await update_batch_status(batch_id=batch.id, status_update=update_data, db=test_db, current_user=cashier)
    assert res["status"] == "QUARANTINED"

    # Verify inventory movement logged
    mov_res = await test_db.execute(select(InventoryMovement).where(InventoryMovement.batch_id == batch.id, InventoryMovement.movement_type == "BATCH_QUARANTINED"))
    mov = mov_res.scalars().first()
    assert mov is not None
    assert "cloudy sediment" in mov.notes

    # 2. Try to sell this medicine -> must fail with ValidationError because batch is quarantined
    sale_payload = SaleCreate(
        payment_method="CASH",
        items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal("2"), unit_price=Decimal("30.0"))]
    )
    with pytest.raises(ValidationError) as exc:
        await create_sale(test_db, sale_payload, branch.id, cashier.id)
    assert "Insufficient stock" in str(exc.value)

@pytest.mark.asyncio
async def test_release_and_disposal_writeoff(test_db):
    branch = Branch(name="Disposal Branch", code="DISP-01")
    pharmacist = User(email="pharm_disp@pharmacy.com", password_hash="hash", full_name="Pharmacist Disp", role="pharmacist")
    test_db.add_all([branch, pharmacist])
    await test_db.commit()

    med = Medicine(sku="DISP-MED-01", name_en="Insulin Glargine", base_unit="Pen", selling_price=50.0)
    test_db.add(med)
    await test_db.commit()

    now = datetime.now(timezone.utc)
    batch = MedicineBatch(
        medicine_id=med.id, branch_id=branch.id, batch_number="BATCH-COLD-FAIL",
        expiry_date=now + timedelta(days=100), purchase_price=25.0,
        quantity_received=10, quantity_remaining=10, status="QUARANTINED"
    )
    test_db.add(batch)
    await test_db.commit()

    # 1. Partial write-off / disposal (e.g. 4 damaged pens written off)
    disp_update = BatchStatusUpdate(
        status="DISPOSED",
        reason="Fridge temperature spike spoiled 4 pens",
        reference="DISP-ACT-001",
        quantity_to_dispose=Decimal("4")
    )
    disp_res = await update_batch_status(batch_id=batch.id, status_update=disp_update, db=test_db, current_user=pharmacist)
    assert disp_res["quantity_remaining"] == 6.0
    assert disp_res["status"] == "QUARANTINED" # Still has 6 units quarantined

    # Verify writeoff movement
    mov_res = await test_db.execute(select(InventoryMovement).where(InventoryMovement.batch_id == batch.id, InventoryMovement.movement_type == "DISPOSAL_WRITEOFF"))
    mov = mov_res.scalars().first()
    assert mov is not None
    assert mov.quantity == Decimal("-4") # Deducted from inventory

    # 2. Lab confirmed remaining 6 pens were stored in backup fridge and are 100% safe -> Release to ACTIVE
    rel_update = BatchStatusUpdate(
        status="ACTIVE",
        reason="Backup cold-storage log verified remaining 6 units safe"
    )
    rel_res = await update_batch_status(batch_id=batch.id, status_update=rel_update, db=test_db, current_user=pharmacist)
    assert rel_res["status"] == "ACTIVE"
    assert rel_res["quantity_remaining"] == 6.0

    # 3. Now sale of 5 pens succeeds!
    sale_payload = SaleCreate(
        payment_method="CASH",
        items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal("5"), unit_price=Decimal("50.0"))]
    )
    sale = await create_sale(test_db, sale_payload, branch.id, pharmacist.id)
    assert sale.status == "COMPLETED"

    # Batch has 1 unit remaining
    await test_db.refresh(batch)
    assert batch.quantity_remaining == 1.0
