import asyncio
import uuid
from decimal import Decimal
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
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
from app.modules.inventory.location_service import (
    get_or_create_default_locations, transfer_stock_between_locations
)
from app.modules.inventory.schemas import (
    QuickRefillRequest, StartCycleCountRequest, UpdateCycleCountRequest, CycleCountLineUpdate
)
from app.modules.inventory.router import (
    get_locations_stock_summary, get_refill_suggestions,
    quick_refill_shelf, start_cycle_count, get_cycle_count_session,
    update_cycle_count_lines, reconcile_cycle_count_session
)
from app.modules.sales.schemas import SaleCreate, SaleItemCreate, PaymentEntryCreate
from app.modules.sales.service import create_sale

async def verify_all():
    print("=" * 70)
    print("🚀 RUNNING COMPREHENSIVE END-TO-END VERIFICATION")
    print("=" * 70)

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        # Step 1: Create Branch & Users
        branch = Branch(name="Downtown City Pharmacy", code="DOWNTOWN")
        pharmacist = User(
            email="pharmacist@pharmacy.com",
            password_hash="hashed_pw",
            full_name="Dr. Sarah Pharmacist",
            role="pharmacist"
        )
        db.add_all([branch, pharmacist])
        await db.commit()
        print(f"✅ Step 1: Branch created: '{branch.name}' (ID: {branch.id})")

        # Step 2: Auto-creation of Default Locations
        shelf, warehouse = await get_or_create_default_locations(db, branch.id)
        await db.commit()
        print(f"✅ Step 2: Auto-created Default Locations:")
        print(f"   • Shelf:     {shelf.name_en} / {shelf.name_ar} (Default Dispense: {shelf.is_default_dispense})")
        print(f"   • Warehouse: {warehouse.name_en} / {warehouse.name_ar} (Default Receive: {warehouse.is_default_receive})")

        # Step 3: Add Medicines & Batches in the Warehouse
        med = Medicine(
            sku="PANADOL-EXTRA",
            name_en="Panadol Extra 500mg",
            name_ar="بنادول اكسترا",
            base_unit="Pack",
            selling_price=15.0,
            reorder_level=5
        )
        db.add(med)
        await db.commit()

        now = datetime.now(timezone.utc)
        batch = MedicineBatch(
            medicine_id=med.id,
            branch_id=branch.id,
            batch_number="BATCH-2026-A",
            expiry_date=now + timedelta(days=365),
            purchase_price=8.5,
            quantity_received=50.0,
            quantity_remaining=50.0,
            status="ACTIVE"
        )
        db.add(batch)
        await db.commit()

        # Place initial stock in Warehouse: 0 on shelf, 50 in warehouse
        wh_stock = BatchLocationStock(batch_id=batch.id, location_id=warehouse.id, quantity=50.0)
        db.add(wh_stock)
        await db.commit()
        print(f"✅ Step 3: Added Medicine '{med.name_en}' with 50 units in Warehouse, 0 on Shelf.")

        # Step 4: Verify Refill Suggestions API
        suggestions = await get_refill_suggestions(branch.id, db, pharmacist)
        assert len(suggestions) == 1, "Expected 1 suggestion for empty shelf!"
        sug = suggestions[0]
        print(f"✅ Step 4: Refill Suggestions API correctly detected:")
        print(f"   • Medicine:         {sug.medicine_name}")
        print(f"   • Status:           {sug.status} (Shelf: {sug.shelf_stock}, Warehouse: {sug.warehouse_stock})")
        print(f"   • Suggested Refill: {sug.suggested_refill} units")

        # Step 5: Execute Quick Refill of 10 units
        refill_req = QuickRefillRequest(
            medicine_id=med.id,
            quantity=Decimal('10.0'),
            branch_id=branch.id,
            from_location_id=warehouse.id,
            to_location_id=shelf.id,
            notes="Morning counter restock"
        )
        refill_res = await quick_refill_shelf(refill_req, db, pharmacist)
        assert refill_res["success"] is True

        summary = await get_locations_stock_summary(branch.id, None, db, pharmacist)
        med_summary = next(s for s in summary if s.medicine_id == med.id)
        print(f"✅ Step 5: Quick Refill executed (10 units):")
        print(f"   • Shelf Balance:     {med_summary.shelf_stock} units")
        print(f"   • Warehouse Balance: {med_summary.warehouse_stock} units")
        print(f"   • Total Stock:       {med_summary.total_stock} units")
        assert med_summary.shelf_stock == Decimal('10.0')
        assert med_summary.warehouse_stock == Decimal('40.0')

        # Step 6: Test POS Sale with "Never Block Sale" Auto-Pull (Customer buys 12 units)
        # Note: Shelf has 10 units, customer wants 12. Deficit = 2 units.
        # System should NOT block cashier! It sells 12, uses 10 from shelf, auto-pulls 2 from warehouse!
        print(f"✅ Step 6: Testing POS Sale: Customer purchasing 12 units (Shelf has only 10)...")
        sale_req = SaleCreate(
            items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal('12.0'), unit_price=Decimal('15.0'))],
            payments=[PaymentEntryCreate(payment_method="CASH", amount=Decimal('180.0'))]
        )
        sale = await create_sale(db, sale_req, branch.id, pharmacist.id)
        await db.commit()

        summary_after_sale = await get_locations_stock_summary(branch.id, None, db, pharmacist)
        s_after = next(s for s in summary_after_sale if s.medicine_id == med.id)
        print(f"   • Sale Completed Successfully! Invoice: {sale.invoice_number}")
        print(f"   • Shelf Balance after sale:     {s_after.shelf_stock} units (Clean 0)")
        print(f"   • Warehouse Balance after sale: {s_after.warehouse_stock} units (Auto-pulled 2: 40 -> 38)")
        print(f"   • Total Stock:                  {s_after.total_stock} units (50 - 12 = 38)")
        assert s_after.shelf_stock == Decimal('0.0')
        assert s_after.warehouse_stock == Decimal('38.0')
        assert s_after.total_stock == Decimal('38.0')

        # Step 7: Test Location Cycle Count (Physical Spot-Check)
        print(f"✅ Step 7: Testing Location Cycle Count for Front Shelf...")
        cc_start = await start_cycle_count(
            StartCycleCountRequest(location_id=shelf.id, branch_id=branch.id, notes="Shelf spot-check"),
            db, pharmacist
        )
        cc_session_id = uuid.UUID(cc_start["session_id"])
        cc_data = await get_cycle_count_session(cc_session_id, db, pharmacist)
        shelf_line = cc_data.lines[0]
        print(f"   • Count Session started: {cc_data.session_number}")
        print(f"   • Expected on shelf: {shelf_line.expected_quantity} units")

        # Staff counts 1 physical unit found behind the shelf counter
        print(f"   • Staff physically counts 1 unit (+1 surplus found)")
        await update_cycle_count_lines(
            cc_session_id,
            UpdateCycleCountRequest(lines=[
                CycleCountLineUpdate(line_id=shelf_line.id, counted_quantity=Decimal('1.0'), variance_reason="Found extra loose pack")
            ]),
            db, pharmacist
        )

        # Reconcile Cycle Count
        reconcile_res = await reconcile_cycle_count_session(cc_session_id, db, pharmacist)
        assert reconcile_res["success"] is True

        summary_final = await get_locations_stock_summary(branch.id, None, db, pharmacist)
        s_final = next(s for s in summary_final if s.medicine_id == med.id)
        print(f"   • Reconciled Cycle Count!")
        print(f"   • Final Shelf Balance:     {s_final.shelf_stock} unit (Reconciled from 0 to 1)")
        print(f"   • Final Warehouse Balance: {s_final.warehouse_stock} units")
        print(f"   • Final Total Stock:       {s_final.total_stock} units (38 + 1 = 39)")
        assert s_final.shelf_stock == Decimal('1.0')
        assert s_final.warehouse_stock == Decimal('38.0')
        assert s_final.total_stock == Decimal('39.0')

    await engine.dispose()
    print("=" * 70)
    print("🎉 ALL VERIFICATION CHECKS PASSED WITH 100% SUCCESS!")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(verify_all())
