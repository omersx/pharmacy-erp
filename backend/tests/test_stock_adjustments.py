import pytest
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import select

from app.modules.organizations.models import Branch
from app.modules.auth.models import User
from app.modules.medicines.models import Medicine, MedicineBatch
from app.modules.inventory.models import InventoryMovement
from app.modules.inventory.schemas import StockAdjustment
from app.modules.inventory.router import create_stock_adjustment, list_movements
from fastapi import HTTPException

@pytest.mark.asyncio
async def test_physical_count_surplus_and_shortage(test_db):
    branch = Branch(name="Main Branch", code="MAIN")
    manager = User(email="manager@pharmacy.com", password_hash="hash", full_name="Store Manager", role="admin")
    test_db.add_all([branch, manager])
    await test_db.commit()

    med = Medicine(
        sku="MED-ADJ-01",
        name_en="Ibuprofen 400mg",
        base_unit="Pack",
        selling_price=15.0
    )
    test_db.add(med)
    await test_db.commit()

    now = datetime.now(timezone.utc)
    batch = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch.id,
        batch_number="IBU-BATCH-01",
        expiry_date=now + timedelta(days=180),
        purchase_price=8.0,
        quantity_received=80.0,
        quantity_remaining=80.0,
        status="ACTIVE"
    )
    test_db.add(batch)
    await test_db.commit()

    # 1. Adjust via Physical Count Surplus: 80 -> 100 (+20)
    adj_surplus = StockAdjustment(
        medicine_id=med.id,
        batch_id=batch.id,
        branch_id=branch.id,
        new_quantity=Decimal('100.0'),
        reason="Stock count correction found extra box",
        adjustment_type="CORRECTION"
    )
    res_surplus = await create_stock_adjustment(adj_surplus, db=test_db, current_user=manager)
    assert res_surplus.movement_type == "ADJUSTMENT_IN"
    assert res_surplus.quantity == Decimal('20.0')
    assert res_surplus.unit_cost == Decimal('8.0')
    assert res_surplus.total_cost == Decimal('160.0')
    assert res_surplus.medicine_name == "Ibuprofen 400mg"
    assert res_surplus.batch_number == "IBU-BATCH-01"

    # Verify batch is now 100
    await test_db.refresh(batch)
    assert float(batch.quantity_remaining) == 100.0

    # 2. Adjust via Physical Count Shortage / Damage: 100 -> 75 (-25)
    adj_damage = StockAdjustment(
        medicine_id=med.id,
        batch_id=batch.id,
        branch_id=branch.id,
        new_quantity=Decimal('75.0'),
        reason="Water leak damaged 25 packs",
        adjustment_type="DAMAGE"
    )
    res_damage = await create_stock_adjustment(adj_damage, db=test_db, current_user=manager)
    assert res_damage.movement_type == "ADJUSTMENT_DAMAGE"
    assert res_damage.quantity == Decimal('-25.0')
    assert res_damage.total_cost == Decimal('200.0')

    await test_db.refresh(batch)
    assert float(batch.quantity_remaining) == 75.0

    # 3. Test list_movements (Ledger)
    ledger = await list_movements(medicine_id=med.id, db=test_db, current_user=manager)
    assert len(ledger) == 2
    types = [m.movement_type for m in ledger]
    assert "ADJUSTMENT_DAMAGE" in types
    assert "ADJUSTMENT_IN" in types

@pytest.mark.asyncio
async def test_adjustment_validation_rules(test_db):
    branch = Branch(name="Validation Branch", code="VAL")
    manager = User(email="manager2@pharmacy.com", password_hash="hash", full_name="Manager 2", role="admin")
    test_db.add_all([branch, manager])
    await test_db.commit()

    med = Medicine(sku="MED-VAL-01", name_en="Paracetamol 500mg", base_unit="Strip", selling_price=5.0)
    test_db.add(med)
    await test_db.commit()

    batch = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch.id,
        batch_number="PARA-01",
        expiry_date=datetime.now(timezone.utc) + timedelta(days=90),
        purchase_price=2.0,
        quantity_received=10.0,
        quantity_remaining=10.0,
        status="ACTIVE"
    )
    test_db.add(batch)
    await test_db.commit()

    # 1. Negative new_quantity should fail
    with pytest.raises(HTTPException) as exc:
        await create_stock_adjustment(
            StockAdjustment(
                medicine_id=med.id,
                batch_id=batch.id,
                new_quantity=Decimal('-1.0'),
                reason="Negative test"
            ),
            db=test_db,
            current_user=manager
        )
    assert exc.value.status_code == 400

    # 2. Subtracting more than available should fail
    with pytest.raises(HTTPException) as exc:
        await create_stock_adjustment(
            StockAdjustment(
                medicine_id=med.id,
                batch_id=batch.id,
                quantity=Decimal('50.0'),
                adjustment_type="OUT",
                reason="Excess reduction"
            ),
            db=test_db,
            current_user=manager
        )
    assert exc.value.status_code == 400
    assert "Insufficient quantity" in exc.value.detail
