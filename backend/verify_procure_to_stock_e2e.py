import asyncio
import uuid
from decimal import Decimal
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select
from app.core.database import Base
from app.modules.auth.models import User
from app.modules.organizations.models import Branch
from app.modules.medicines.models import Medicine, MedicineBatch, MedicineCategory
from app.modules.suppliers.models import Supplier
from app.modules.inventory.models import InventoryMovement, StockLocation, BatchLocationStock, StockCountSession, StockCountLine
from app.modules.sales.models import Sale, SaleItem, HeldSale
from app.modules.customers.models import Customer, CustomerPayment
from app.modules.cash_sessions.models import CashSession, CashMovement
from app.modules.roles.models import Role, Permission
from app.modules.admin.models import AuditLog
from app.modules.notifications.models import Notification
from app.modules.invoicing.models import CustomerInvoice, InvoiceItem, InvoicePayment, PharmacyProfile
from app.modules.purchases.models import (
    SupplierProductTerm, PurchaseOrder, PurchaseOrderLine, GoodsReceipt,
    GoodsReceiptLine, SupplierReturn, SupplierReturnLine
)
from app.modules.purchases.schemas import (
    PurchaseOrderCreate, PurchaseOrderLineCreate, GoodsReceiptCreate, GoodsReceiptLineCreate
)
from app.modules.purchases.service import (
    create_purchase_order, submit_purchase_order, approve_purchase_order,
    create_goods_receipt, post_goods_receipt
)
from app.modules.inventory.location_service import (
    get_or_create_default_locations, transfer_stock_between_locations
)
from app.modules.sales.schemas import SaleCreate, SaleItemCreate, PaymentEntryCreate
from app.modules.sales.service import create_sale


async def verify_procure_to_stock():
    print("=" * 75)
    print("🚀 RUNNING PROCURE-TO-STOCK (PURCHASING) END-TO-END VERIFICATION")
    print("=" * 75)

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        # Step 1: Initialize Branch, Staff, and Supplier
        branch = Branch(name="Al-Amal Central Pharmacy", code="AMAL-01")
        pharmacist = User(
            email="manager@alamal.com",
            password_hash="pwd",
            full_name="Dr. Taha Procurement Lead",
            role="admin"
        )
        supplier = Supplier(
            name="Novartis Distribution Sudan",
            name_ar="شركة نوفارتس للتوزيع",
            contact_person="Dr. Kamal",
            phone="+249912000000",
            payment_terms="Net 30"
        )
        med = Medicine(
            sku="NOV-VOLT-50",
            name_en="Voltaren 50mg Tablets",
            name_ar="فولتارين 50 ملغ أقراص",
            base_unit="Tablet",
            selling_price=12.0,
            reorder_level=30
        )
        db.add_all([branch, pharmacist, supplier, med])
        await db.commit()
        print(f"✅ Step 1: Branch, Pharmacist, Supplier ('{supplier.name}'), & Medicine initialized.")

        # Step 2: Provision Sub-Locations (Shelf vs Warehouse)
        shelf, warehouse = await get_or_create_default_locations(db, branch.id)
        await db.commit()
        print(f"✅ Step 2: Auto-provisioned Locations:")
        print(f"   • Front Shelf:     {shelf.name_en} (Default Dispense: {shelf.is_default_dispense})")
        print(f"   • Main Warehouse:  {warehouse.name_en} (Default Receive: {warehouse.is_default_receive})")

        # Step 3: Create Purchase Order (RFQ) for 10 boxes (20 tablets per box = 200 tablets)
        print(f"✅ Step 3: Drafting Purchase Order (RFQ)...")
        po_in = PurchaseOrderCreate(
            supplier_id=supplier.id,
            branch_id=branch.id,
            payment_terms="Net 30",
            notes="Handle with care - keep in cool storage",
            lines=[
                PurchaseOrderLineCreate(
                    medicine_id=med.id,
                    pack_size=20,
                    packs_ordered=Decimal('10.0'),
                    unit_cost=Decimal('6.5')
                )
            ]
        )
        po = await create_purchase_order(db, po_in, pharmacist.id)
        print(f"   • Generated PO Number: {po.po_number}")
        print(f"   • Status:              {po.status}")
        print(f"   • Total Ordered:       10 packs × 20 = {po.lines[0].quantity_ordered} tablets")
        print(f"   • Total PO Value:      {po.total_amount} SDG")
        assert po.status == "DRAFT"
        assert po.total_amount == 1300.0

        # Step 4: Submit & Approve Purchase Order
        print(f"✅ Step 4: Submitting and Approving Purchase Order...")
        po = await submit_purchase_order(db, po.id, pharmacist.id)
        assert po.status == "SUBMITTED"
        po = await approve_purchase_order(db, po.id, pharmacist.id, notes="Director approval granted")
        assert po.status == "APPROVED"
        print(f"   • PO Status is now: {po.status} (Approved by: {pharmacist.full_name})")

        # Step 5: Goods Arrival & Inbound Goods Receipt (GRN) into Warehouse
        print(f"✅ Step 5: Delivery arrives at warehouse dock. Creating Goods Receipt (GRN)...")
        now = datetime.now(timezone.utc)
        grn_in = GoodsReceiptCreate(
            po_id=po.id,
            supplier_id=supplier.id,
            branch_id=branch.id,
            destination_location_id=warehouse.id,
            supplier_delivery_ref="DN-NOVARTIS-2026-881",
            notes="Temp check verified at 21°C",
            lines=[
                GoodsReceiptLineCreate(
                    po_line_id=po.lines[0].id,
                    medicine_id=med.id,
                    quantity_received=Decimal('200.0'),
                    quantity_accepted=Decimal('200.0'),
                    quantity_rejected=Decimal('0.0'),
                    batch_number="VOLT-LOT-99A",
                    expiry_date=now + timedelta(days=730),
                    unit_cost=Decimal('6.5')
                )
            ]
        )
        receipt = await create_goods_receipt(db, grn_in, pharmacist.id)
        print(f"   • Generated GRN: {receipt.receipt_number}")
        print(f"   • Status before posting: {receipt.status}")

        # Post the receipt (Atomic transaction: batch creation + warehouse allocation)
        posted_grn = await post_goods_receipt(db, receipt.id, pharmacist.id)
        assert posted_grn.status == "POSTED"

        # Verify PO status updated to RECEIVED
        await db.refresh(po)
        assert po.status == "RECEIVED"
        print(f"   • Receipt POSTED! Purchase Order status auto-updated to: {po.status}")

        # Verify batch created
        batch_id = posted_grn.lines[0].created_batch_id
        batch = await db.get(MedicineBatch, batch_id)
        print(f"   • Created Medicine Batch: {batch.batch_number} (Remaining: {batch.quantity_remaining})")
        assert batch.quantity_remaining == 200.0

        # Verify stock allocated into Main Warehouse
        wh_stock = await db.execute(
            select(BatchLocationStock.quantity).where(
                BatchLocationStock.batch_id == batch_id,
                BatchLocationStock.location_id == warehouse.id
            )
        )
        assert wh_stock.scalar() == 200.0
        print(f"   • Stock physically confirmed in Main Warehouse: 200 tablets")

        # Step 6: Restock Front Shelf via Internal Transfer (Shelf Refill)
        print(f"✅ Step 6: Transferring 50 tablets from Warehouse to Front Shelf...")
        await transfer_stock_between_locations(
            db=db,
            medicine_id=med.id,
            from_location_id=warehouse.id,
            to_location_id=shelf.id,
            quantity=Decimal('50.0'),
            user_id=pharmacist.id,
            batch_id=batch_id,
            notes="Morning front shelf refill"
        )
        await db.commit()

        wh_qty = (await db.execute(
            select(BatchLocationStock.quantity).where(
                BatchLocationStock.batch_id == batch_id,
                BatchLocationStock.location_id == warehouse.id
            )
        )).scalar()
        shelf_qty = (await db.execute(
            select(BatchLocationStock.quantity).where(
                BatchLocationStock.batch_id == batch_id,
                BatchLocationStock.location_id == shelf.id
            )
        )).scalar()
        print(f"   • Warehouse Balance: {wh_qty} tablets (200 - 50 = 150)")
        print(f"   • Front Shelf Balance: {shelf_qty} tablets")
        assert wh_qty == 150.0
        assert shelf_qty == 50.0

        # Step 7: POS Counter Sale (Dispensing from Front Shelf)
        print(f"✅ Step 7: Patient arrives at POS counter. Purchasing 10 tablets...")
        sale_req = SaleCreate(
            items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal('10.0'), unit_price=Decimal('12.0'))],
            payments=[PaymentEntryCreate(payment_method="CASH", amount=Decimal('120.0'))]
        )
        sale = await create_sale(db, sale_req, branch.id, pharmacist.id)
        await db.commit()

        final_shelf_qty = (await db.execute(
            select(BatchLocationStock.quantity).where(
                BatchLocationStock.batch_id == batch_id,
                BatchLocationStock.location_id == shelf.id
            )
        )).scalar()
        print(f"   • Sale Completed! Invoice: {sale.invoice_number}")
        print(f"   • Front Shelf Balance after sale: {final_shelf_qty} tablets (50 - 10 = 40)")
        assert final_shelf_qty == 40.0

    await engine.dispose()
    print("=" * 75)
    print("🎉 FULL PROCURE-TO-STOCK LIFECYCLE VERIFIED WITH 100% SUCCESS!")
    print("=" * 75)


if __name__ == "__main__":
    asyncio.run(verify_procure_to_stock())
