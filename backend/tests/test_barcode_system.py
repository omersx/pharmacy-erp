import pytest
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import select
from fastapi import HTTPException

from app.modules.organizations.models import Branch
from app.modules.auth.models import User
from app.modules.medicines.models import Medicine, MedicineBatch, MedicineBarcode
from app.modules.medicines.schemas import MedicineCreate, BatchCreate, BarcodeCreate
from app.modules.medicines.router import (
    create_medicine, add_batch, scan_barcode,
    add_medicine_barcode, check_barcode, search_medicines
)

class DummyRequest:
    client = None

@pytest.mark.asyncio
async def test_duplicate_primary_barcode_rejected(test_db):
    user = User(email="pharmacist_bar@pharmacy.com", password_hash="hash", full_name="Pharmacist Bar", role="pharmacist")
    test_db.add(user)
    await test_db.commit()

    req = DummyRequest()

    # 1. Create first medicine with barcode '6281001234567'
    med1_in = MedicineCreate(
        sku="BAR-MED-01",
        name_en="Panadol Extra",
        base_unit="Box",
        selling_price=Decimal("15.0"),
        barcode="6281001234567"
    )
    med1 = await create_medicine(med1_in, req, test_db, user)
    assert med1.barcode == "6281001234567"

    # 2. Try to create second medicine with duplicate barcode
    med2_in = MedicineCreate(
        sku="BAR-MED-02",
        name_en="Fevadol 500mg",
        base_unit="Box",
        selling_price=Decimal("12.0"),
        barcode="6281001234567"
    )
    with pytest.raises(HTTPException) as exc:
        await create_medicine(med2_in, req, test_db, user)
    assert exc.value.status_code == 409
    assert "already assigned as the primary barcode" in exc.value.detail

@pytest.mark.asyncio
async def test_alternate_and_packaging_barcode_registration(test_db):
    branch = Branch(name="Barcode Branch", code="BAR-BR")
    user = User(email="admin_bar@pharmacy.com", password_hash="hash", full_name="Admin Bar", role="admin")
    test_db.add_all([branch, user])
    await test_db.commit()

    req = DummyRequest()
    med = await create_medicine(
        MedicineCreate(
            sku="BAR-AMOX-01",
            name_en="Amoxicillin Capsules",
            base_unit="Capsule",
            selling_price=Decimal("2.5"),
            barcode="6282001111111"
        ),
        req, test_db, user
    )

    # 1. Register alternate blister strip barcode (Strip of 10 capsules)
    strip_in = BarcodeCreate(
        barcode="6282002222222",
        barcode_type="PACKAGING",
        packaging_type="STRIP",
        units_per_pack=10,
        notes="Blister foil strip of 10"
    )
    strip_bc = await add_medicine_barcode(med.id, strip_in, test_db, user)
    assert strip_bc.barcode == "6282002222222"
    assert strip_bc.units_per_pack == 10

    # 2. Duplicate barcode rejected for another medicine or same medicine
    with pytest.raises(HTTPException) as exc:
        await add_medicine_barcode(med.id, BarcodeCreate(barcode="6282002222222"), test_db, user)
    assert exc.value.status_code == 409

    # 3. Check-barcode endpoint returns conflict info
    check_res = await check_barcode("6282002222222", test_db)
    assert check_res.available is False
    assert check_res.assigned_to == "Amoxicillin Capsules"

@pytest.mark.asyncio
async def test_scan_barcode_resolves_batch_and_packaging(test_db):
    branch = Branch(name="Scan Branch", code="SCAN-BR")
    user = User(email="cashier_scan@pharmacy.com", password_hash="hash", full_name="Cashier Scan", role="cashier")
    test_db.add_all([branch, user])
    await test_db.commit()

    req = DummyRequest()
    med = await create_medicine(
        MedicineCreate(
            sku="SCAN-MED-01",
            name_en="Augmentin 625mg",
            base_unit="Tablet",
            selling_price=Decimal("4.0"),
            barcode="6283001000001"
        ),
        req, test_db, user
    )

    now = datetime.now(timezone.utc)

    # Add Batch 1: FEFO earliest expiry (30 days), qty 10, batch barcode 'BATCH-AUG-B1'
    b1 = await add_batch(
        med.id,
        BatchCreate(
            batch_number="AUG-BATCH-01",
            barcode="BATCH-AUG-B1",
            branch_id=branch.id,
            expiry_date=now + timedelta(days=30),
            purchase_price=Decimal("2.0"),
            quantity_received=Decimal("10.0")
        ),
        test_db, user
    )

    # Add packaging barcode for Box of 14 tablets: barcode '628300BOX14'
    box_bc = await add_medicine_barcode(
        med.id,
        BarcodeCreate(
            barcode="628300BOX14",
            barcode_type="PACKAGING",
            packaging_type="BOX",
            units_per_pack=14,
            notes="Full box pack of 14 tabs"
        ),
        test_db, user
    )

    # 1. Scan primary barcode '6283001000001' -> resolves medicine + best FEFO batch
    scan_prim = await scan_barcode(barcode="6283001000001", branch_id=branch.id, db=test_db)
    assert scan_prim.found is True
    assert scan_prim.match_type == "PRIMARY"
    assert scan_prim.medicine_name == "Augmentin 625mg"
    assert scan_prim.batch_number == "AUG-BATCH-01"
    assert scan_prim.units_multiplier == 1
    assert scan_prim.effective_price == Decimal("4.0")
    assert scan_prim.is_sellable is True

    # 2. Scan specific batch barcode 'BATCH-AUG-B1' -> matches exact batch
    scan_batch = await scan_barcode(barcode="BATCH-AUG-B1", branch_id=branch.id, db=test_db)
    assert scan_batch.found is True
    assert scan_batch.match_type == "BATCH"
    assert scan_batch.batch_number == "AUG-BATCH-01"
    assert scan_batch.is_sellable is True

    # 3. Scan box packaging barcode '628300BOX14' -> multiplier 14, effective price 4.0 * 14 = 56.0
    scan_box = await scan_barcode(barcode="628300BOX14", branch_id=branch.id, db=test_db)
    assert scan_box.found is True
    assert scan_box.match_type == "PACKAGING"
    assert scan_box.units_multiplier == 14
    assert scan_box.effective_price == Decimal("56.0")
    assert scan_box.packaging_type == "BOX"

    # 4. Search endpoint also finds medicine by box barcode
    search_res = await search_medicines(q="628300BOX14", db=test_db)
    assert len(search_res) == 1
    assert search_res[0].id == med.id
