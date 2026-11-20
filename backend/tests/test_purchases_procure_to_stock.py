import pytest
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import select
from fastapi import HTTPException

from app.modules.organizations.models import Branch
from app.modules.auth.models import User
from app.modules.suppliers.models import Supplier
from app.modules.medicines.models import Medicine, MedicineBatch
from app.modules.inventory.models import StockLocation, BatchLocationStock, InventoryMovement
from app.modules.inventory.location_service import get_or_create_default_locations
from app.modules.purchases.models import (
    PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine,
    SupplierReturn, SupplierProductTerm
)
from app.modules.purchases.schemas import (
    PurchaseOrderCreate, PurchaseOrderLineCreate,
    GoodsReceiptCreate, GoodsReceiptLineCreate,
    SupplierReturnCreate, SupplierReturnLineCreate,
    SupplierProductTermCreate
)
from app.modules.purchases.service import (
    create_purchase_order, submit_purchase_order, approve_purchase_order,
    cancel_purchase_order, create_goods_receipt, post_goods_receipt,
    create_supplier_return, post_supplier_return
)
from app.modules.purchases.router import (
    list_purchase_orders, get_purchase_order, create_order,
    submit_order, approve_order, cancel_order,
    list_goods_receipts, create_receipt, post_receipt,
    list_supplier_returns, create_return, post_return,
    create_or_update_supplier_term, get_purchase_analytics
)


@pytest.fixture
async def purchase_setup(test_db):
    branch = Branch(name="Central City Pharmacy", code="CCP-01")
    user = User(
        email="purchaser@pharmacy.com",
        password_hash="hashed_pw",
        full_name="Sarah Purchasing Manager",
        role="admin"
    )
    supplier = Supplier(
        name="Global Pharma Distributors",
        name_ar="الموزع الدوائي العالمي",
        contact_person="Ahmed Mansoor",
        phone="+249912345678",
        payment_terms="Net 30"
    )
    med = Medicine(
        sku="MED-AMOX-500",
        name_en="Amoxicillin 500mg Caps",
        name_ar="اموكسيسيلين 500 ملغ",
        base_unit="Capsule",
        selling_price=5.0,
        reorder_level=20
    )
    test_db.add_all([branch, user, supplier, med])
    await test_db.commit()

    shelf, warehouse = await get_or_create_default_locations(test_db, branch.id)
    await test_db.commit()

    return {
        "branch": branch,
        "user": user,
        "supplier": supplier,
        "med": med,
        "shelf": shelf,
        "warehouse": warehouse
    }


@pytest.mark.asyncio
async def test_rfq_and_po_approval_lifecycle(test_db, purchase_setup):
    data = purchase_setup
    branch = data["branch"]
    user = data["user"]
    supplier = data["supplier"]
    med = data["med"]

    # 1. Create RFQ (Draft Purchase Order)
    po_in = PurchaseOrderCreate(
        supplier_id=supplier.id,
        branch_id=branch.id,
        payment_terms="Net 30",
        lines=[
            PurchaseOrderLineCreate(
                medicine_id=med.id,
                pack_size=20,
                packs_ordered=Decimal('10.0'),  # 10 packs * 20 = 200 capsules
                unit_cost=Decimal('2.5'),
                tax_percent=Decimal('0.0')
            )
        ]
    )
    po = await create_purchase_order(test_db, po_in, user.id)

    assert po.po_number.startswith("PO-")
    assert po.status == "DRAFT"
    assert po.subtotal == 500.0  # 200 * 2.5
    assert po.total_amount == 500.0
    assert len(po.lines) == 1
    assert po.lines[0].quantity_ordered == 200.0

    # 2. Submit PO
    po_sub = await submit_purchase_order(test_db, po.id, user.id)
    assert po_sub.status == "SUBMITTED"

    # 3. Approve PO
    po_app = await approve_purchase_order(test_db, po.id, user.id, notes="Approved by director")
    assert po_app.status == "APPROVED"
    assert po_app.approved_by_id == user.id
    assert po_app.approved_at is not None
    assert "Approved by director" in (po_app.notes or "")


@pytest.mark.asyncio
async def test_partial_and_full_goods_receipt_into_warehouse(test_db, purchase_setup):
    data = purchase_setup
    branch = data["branch"]
    user = data["user"]
    supplier = data["supplier"]
    med = data["med"]
    warehouse = data["warehouse"]

    # Create & Approve PO for 200 units
    po_in = PurchaseOrderCreate(
        supplier_id=supplier.id,
        branch_id=branch.id,
        lines=[
            PurchaseOrderLineCreate(
                medicine_id=med.id,
                pack_size=10,
                packs_ordered=Decimal('20.0'),
                quantity_ordered=Decimal('200.0'),
                unit_cost=Decimal('2.0')
            )
        ]
    )
    po = await create_purchase_order(test_db, po_in, user.id)
    await approve_purchase_order(test_db, po.id, user.id)
    po_line = po.lines[0]

    # --- Step 1: Partial Goods Receipt (100 units received) ---
    now = datetime.now(timezone.utc)
    receipt_in = GoodsReceiptCreate(
        po_id=po.id,
        supplier_id=supplier.id,
        branch_id=branch.id,
        destination_location_id=warehouse.id,
        supplier_delivery_ref="INV-GLO-9821",
        lines=[
            GoodsReceiptLineCreate(
                po_line_id=po_line.id,
                medicine_id=med.id,
                quantity_received=Decimal('100.0'),
                quantity_accepted=Decimal('100.0'),
                quantity_rejected=Decimal('0.0'),
                batch_number="BATCH-AMOX-P1",
                expiry_date=now + timedelta(days=365),
                unit_cost=Decimal('2.0')
            )
        ]
    )
    receipt1 = await create_goods_receipt(test_db, receipt_in, user.id)
    assert receipt1.status == "DRAFT"

    # Post Partial Receipt
    posted1 = await post_goods_receipt(test_db, receipt1.id, user.id)
    assert posted1.status == "POSTED"

    # Verify PO state -> PARTIALLY_RECEIVED
    await test_db.refresh(po)
    await test_db.refresh(po_line)
    assert po.status == "PARTIALLY_RECEIVED"
    assert po_line.quantity_received == 100.0

    # Verify stock in Main Warehouse
    loc_stock_res = await test_db.execute(
        select(BatchLocationStock).where(
            BatchLocationStock.batch_id == posted1.lines[0].created_batch_id,
            BatchLocationStock.location_id == warehouse.id
        )
    )
    loc_stock = loc_stock_res.scalar_one_or_none()
    assert loc_stock is not None
    assert loc_stock.quantity == 100.0

    # Verify InventoryMovement
    mv_res = await test_db.execute(
        select(InventoryMovement).where(
            InventoryMovement.reference_id == str(posted1.id),
            InventoryMovement.movement_type == "PURCHASE_RECEIPT"
        )
    )
    mv = mv_res.scalar_one_or_none()
    assert mv is not None
    assert mv.to_location_id == warehouse.id
    assert mv.quantity == 100.0

    # --- Step 2: Final Goods Receipt (remaining 100 units received) ---
    receipt2_in = GoodsReceiptCreate(
        po_id=po.id,
        supplier_id=supplier.id,
        branch_id=branch.id,
        destination_location_id=warehouse.id,
        supplier_delivery_ref="INV-GLO-9822",
        lines=[
            GoodsReceiptLineCreate(
                po_line_id=po_line.id,
                medicine_id=med.id,
                quantity_received=Decimal('100.0'),
                quantity_accepted=Decimal('100.0'),
                batch_number="BATCH-AMOX-P2",
                expiry_date=now + timedelta(days=500),
                unit_cost=Decimal('2.0')
            )
        ]
    )
    receipt2 = await create_goods_receipt(test_db, receipt2_in, user.id)
    posted2 = await post_goods_receipt(test_db, receipt2.id, user.id)
    assert posted2.status == "POSTED"

    # Verify PO state -> fully RECEIVED
    await test_db.refresh(po)
    await test_db.refresh(po_line)
    assert po.status == "RECEIVED"
    assert po_line.quantity_received == 200.0


@pytest.mark.asyncio
async def test_goods_receipt_idempotency_prevents_duplicate_stock(test_db, purchase_setup):
    data = purchase_setup
    branch = data["branch"]
    user = data["user"]
    supplier = data["supplier"]
    med = data["med"]
    warehouse = data["warehouse"]

    now = datetime.now(timezone.utc)
    receipt_in = GoodsReceiptCreate(
        supplier_id=supplier.id,
        branch_id=branch.id,
        destination_location_id=warehouse.id,
        lines=[
            GoodsReceiptLineCreate(
                medicine_id=med.id,
                quantity_received=Decimal('50.0'),
                quantity_accepted=Decimal('50.0'),
                batch_number="BATCH-IDEM-01",
                expiry_date=now + timedelta(days=200),
                unit_cost=Decimal('3.0')
            )
        ]
    )
    receipt = await create_goods_receipt(test_db, receipt_in, user.id)
    await post_goods_receipt(test_db, receipt.id, user.id)

    # Calling post_goods_receipt a second time must fail
    with pytest.raises(HTTPException) as exc:
        await post_goods_receipt(test_db, receipt.id, user.id)
    assert exc.value.status_code == 400
    assert "already POSTED" in exc.value.detail


@pytest.mark.asyncio
async def test_supplier_return_claim(test_db, purchase_setup):
    data = purchase_setup
    branch = data["branch"]
    user = data["user"]
    supplier = data["supplier"]
    med = data["med"]
    warehouse = data["warehouse"]

    # 1. Receive 40 units into warehouse
    now = datetime.now(timezone.utc)
    receipt_in = GoodsReceiptCreate(
        supplier_id=supplier.id,
        branch_id=branch.id,
        destination_location_id=warehouse.id,
        lines=[
            GoodsReceiptLineCreate(
                medicine_id=med.id,
                quantity_received=Decimal('40.0'),
                quantity_accepted=Decimal('40.0'),
                batch_number="BATCH-RET-TEST",
                expiry_date=now + timedelta(days=180),
                unit_cost=Decimal('4.0')
            )
        ]
    )
    rec = await create_goods_receipt(test_db, receipt_in, user.id)
    posted_rec = await post_goods_receipt(test_db, rec.id, user.id)
    batch_id = posted_rec.lines[0].created_batch_id

    # 2. Return 10 damaged units to supplier
    return_in = SupplierReturnCreate(
        receipt_id=posted_rec.id,
        supplier_id=supplier.id,
        branch_id=branch.id,
        from_location_id=warehouse.id,
        reason="Damaged carton found during storage",
        lines=[
            SupplierReturnLineCreate(
                medicine_id=med.id,
                batch_id=batch_id,
                quantity=Decimal('10.0'),
                unit_cost=Decimal('4.0'),
                reason="Water damage on outer package"
            )
        ]
    )
    ret = await create_supplier_return(test_db, return_in, user.id)
    assert ret.status == "DRAFT"
    assert ret.total_amount == 40.0

    posted_ret = await post_supplier_return(test_db, ret.id, user.id)
    assert posted_ret.status == "POSTED"

    # Verify batch quantity_remaining decreased to 30
    batch = await test_db.get(MedicineBatch, batch_id)
    assert batch.quantity_remaining == 30.0

    # Verify warehouse location stock decreased to 30
    loc_stock_res = await test_db.execute(
        select(BatchLocationStock).where(
            BatchLocationStock.batch_id == batch_id,
            BatchLocationStock.location_id == warehouse.id
        )
    )
    loc_stock = loc_stock_res.scalar_one_or_none()
    assert loc_stock.quantity == 30.0

    # Verify movement record
    mv_res = await test_db.execute(
        select(InventoryMovement).where(
            InventoryMovement.reference_id == str(posted_ret.id),
            InventoryMovement.movement_type == "PURCHASE_RETURN"
        )
    )
    mv = mv_res.scalar_one_or_none()
    assert mv is not None
    assert mv.from_location_id == warehouse.id
    assert mv.quantity == 10.0


@pytest.mark.asyncio
async def test_supplier_terms_and_analytics(test_db, purchase_setup):
    data = purchase_setup
    branch = data["branch"]
    user = data["user"]
    supplier = data["supplier"]
    med = data["med"]

    # 1. Add supplier term
    term_in = SupplierProductTermCreate(
        supplier_id=supplier.id,
        medicine_id=med.id,
        supplier_sku="GLO-AMOX-500",
        pack_size=24,
        lead_time_days=3,
        min_order_qty=5,
        last_cost=Decimal('1.8'),
        is_preferred=True
    )
    term = await create_or_update_supplier_term(term_in, test_db, user)
    assert term.pack_size == 24
    assert term.lead_time_days == 3
    assert term.is_preferred is True

    # 2. Analytics Check
    analytics = await get_purchase_analytics(branch.id, test_db, user)
    assert analytics.active_suppliers_count >= 1
