import pytest
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import select

from app.modules.organizations.models import Branch
from app.modules.auth.models import User
from app.modules.medicines.models import Medicine, MedicineBatch
from app.modules.sales.schemas import SaleCreate, SaleItemCreate, SaleReturnCreate, SaleReturnItemCreate
from app.modules.sales.service import create_sale, return_sale
from app.modules.sales.models import Sale, SaleItem, SaleReturn
from app.modules.cash_sessions.models import CashSession
from app.modules.cash_sessions.router import calculate_session_totals
from app.modules.inventory.models import InventoryMovement
from app.core.exceptions import ValidationError

@pytest.mark.asyncio
async def test_partial_return_and_restock(test_db):
    branch = Branch(name="Return Branch", code="RET")
    cashier = User(email="cashier_ret@pharmacy.com", password_hash="hash", full_name="Cashier Ret", role="cashier")
    test_db.add_all([branch, cashier])
    await test_db.commit()

    med = Medicine(sku="MED-RET-01", name_en="Paracetamol 500mg", base_unit="Box", selling_price=10.0)
    test_db.add(med)
    await test_db.commit()

    batch = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch.id,
        batch_number="BATCH-RET-01",
        expiry_date=datetime.now(timezone.utc) + timedelta(days=120),
        purchase_price=5.0,
        quantity_received=50.0,
        quantity_remaining=50.0,
        status="ACTIVE"
    )
    test_db.add(batch)
    await test_db.commit()

    # 1. Sell 5 units
    sale = await create_sale(
        test_db,
        SaleCreate(
            payment_method="CASH",
            items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal('5.0'), unit_price=Decimal('10.0'))]
        ),
        branch_id=branch.id,
        cashier_id=cashier.id
    )
    await test_db.refresh(batch)
    assert float(batch.quantity_remaining) == 45.0
    sale_item = sale.items[0]

    # 2. Return 2 units with condition=GOOD and disposition=RESTOCK
    ret_data = SaleReturnCreate(
        items=[
            SaleReturnItemCreate(
                sale_item_id=sale_item.id,
                quantity=Decimal('2.0'),
                condition="GOOD",
                disposition="RESTOCK",
                reason="Customer bought too many"
            )
        ],
        refund_method="CASH",
        reason="Partial return request"
    )
    updated_sale = await return_sale(test_db, sale.id, cashier.id, ret_data)
    
    # Verify sale is now PARTIALLY_RETURNED
    assert updated_sale.status == "PARTIALLY_RETURNED"
    
    # Verify batch stock restored by 2 units (45 + 2 = 47)
    await test_db.refresh(batch)
    assert float(batch.quantity_remaining) == 47.0

    # Verify inventory movement recorded
    mov_res = await test_db.execute(
        select(InventoryMovement).where(
            InventoryMovement.medicine_id == med.id,
            InventoryMovement.movement_type == "RETURN_IN"
        )
    )
    mov = mov_res.scalars().first()
    assert mov is not None
    assert float(mov.quantity) == 2.0

    # 3. Return remaining 3 units -> Transitions to fully RETURNED
    ret_remaining = SaleReturnCreate(
        items=[
            SaleReturnItemCreate(
                sale_item_id=sale_item.id,
                quantity=Decimal('3.0'),
                condition="GOOD",
                disposition="RESTOCK"
            )
        ]
    )
    final_sale = await return_sale(test_db, sale.id, cashier.id, ret_remaining)
    assert final_sale.status == "RETURNED"
    await test_db.refresh(batch)
    assert float(batch.quantity_remaining) == 50.0

@pytest.mark.asyncio
async def test_damaged_return_diverted_from_stock(test_db):
    branch = Branch(name="Damage Branch", code="DAM")
    cashier = User(email="cashier_dam@pharmacy.com", password_hash="hash", full_name="Cashier Dam", role="cashier")
    test_db.add_all([branch, cashier])
    await test_db.commit()

    med = Medicine(sku="MED-DAM-01", name_en="Syrup 100ml", base_unit="Bottle", selling_price=12.0)
    test_db.add(med)
    await test_db.commit()

    batch = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch.id,
        batch_number="BATCH-DAM-01",
        expiry_date=datetime.now(timezone.utc) + timedelta(days=90),
        purchase_price=6.0,
        quantity_received=20.0,
        quantity_remaining=20.0,
        status="ACTIVE"
    )
    test_db.add(batch)
    await test_db.commit()

    # Sell 2 bottles
    sale = await create_sale(
        test_db,
        SaleCreate(
            payment_method="CASH",
            items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal('2.0'), unit_price=Decimal('12.0'))]
        ),
        branch_id=branch.id,
        cashier_id=cashier.id
    )
    await test_db.refresh(batch)
    assert float(batch.quantity_remaining) == 18.0
    sale_item = sale.items[0]

    # Return 1 bottle broken by customer (DAMAGED -> QUARANTINE)
    ret_damaged = SaleReturnCreate(
        items=[
            SaleReturnItemCreate(
                sale_item_id=sale_item.id,
                quantity=Decimal('1.0'),
                condition="DAMAGED",
                disposition="QUARANTINE",
                reason="Bottle arrived cracked"
            )
        ]
    )
    await return_sale(test_db, sale.id, cashier.id, ret_damaged)

    # Stock must NOT be added back to sellable batch! Still 18.0
    await test_db.refresh(batch)
    assert float(batch.quantity_remaining) == 18.0

    # Inventory movement must record RETURN_QUARANTINE with quantity 0
    mov_res = await test_db.execute(
        select(InventoryMovement).where(
            InventoryMovement.medicine_id == med.id,
            InventoryMovement.movement_type == "RETURN_QUARANTINE"
        )
    )
    mov = mov_res.scalars().first()
    assert mov is not None
    assert float(mov.quantity) == 0.0

@pytest.mark.asyncio
async def test_over_return_rejected(test_db):
    branch = Branch(name="Over Branch", code="OVR")
    cashier = User(email="cashier_ovr@pharmacy.com", password_hash="hash", full_name="Cashier Ovr", role="cashier")
    test_db.add_all([branch, cashier])
    await test_db.commit()

    med = Medicine(sku="MED-OVR-01", name_en="Drops 10ml", base_unit="Vial", selling_price=8.0)
    test_db.add(med)
    await test_db.commit()

    batch = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch.id,
        batch_number="BATCH-OVR-01",
        expiry_date=datetime.now(timezone.utc) + timedelta(days=60),
        purchase_price=4.0,
        quantity_received=10.0,
        quantity_remaining=10.0,
        status="ACTIVE"
    )
    test_db.add(batch)
    await test_db.commit()

    sale = await create_sale(
        test_db,
        SaleCreate(
            payment_method="CASH",
            items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal('2.0'), unit_price=Decimal('8.0'))]
        ),
        branch_id=branch.id,
        cashier_id=cashier.id
    )
    sale_item = sale.items[0]

    # Trying to return 5 units when only 2 were purchased
    with pytest.raises(ValidationError) as exc:
        await return_sale(
            test_db,
            sale.id,
            cashier.id,
            SaleReturnCreate(
                items=[SaleReturnItemCreate(sale_item_id=sale_item.id, quantity=Decimal('5.0'))]
            )
        )
    assert "Only 2.0 units available for return" in str(exc.value)

@pytest.mark.asyncio
async def test_cash_session_refund_integration(test_db):
    branch = Branch(name="Session Branch", code="SES")
    cashier = User(email="cashier_ses@pharmacy.com", password_hash="hash", full_name="Cashier Ses", role="cashier")
    test_db.add_all([branch, cashier])
    await test_db.commit()

    # Open cash session with $100 float
    session = CashSession(
        branch_id=branch.id,
        cashier_id=cashier.id,
        terminal_name="Register 1",
        opening_amount=100.0,
        status="OPEN"
    )
    test_db.add(session)
    await test_db.commit()

    med = Medicine(sku="MED-SES-01", name_en="Ointment 30g", base_unit="Tube", selling_price=30.0)
    test_db.add(med)
    await test_db.commit()

    batch = MedicineBatch(
        medicine_id=med.id,
        branch_id=branch.id,
        batch_number="BATCH-SES-01",
        expiry_date=datetime.now(timezone.utc) + timedelta(days=150),
        purchase_price=15.0,
        quantity_received=10.0,
        quantity_remaining=10.0,
        status="ACTIVE"
    )
    test_db.add(batch)
    await test_db.commit()

    # Cash sale of 2 units ($60.00)
    sale = await create_sale(
        test_db,
        SaleCreate(
            payment_method="CASH",
            items=[SaleItemCreate(medicine_id=med.id, quantity=Decimal('2.0'), unit_price=Decimal('30.0'))],
            cash_session_id=session.id
        ),
        branch_id=branch.id,
        cashier_id=cashier.id
    )

    # Return 1 unit ($30.00 cash refund)
    ret_item = sale.items[0]
    await return_sale(
        test_db,
        sale.id,
        cashier.id,
        SaleReturnCreate(
            items=[SaleReturnItemCreate(sale_item_id=ret_item.id, quantity=Decimal('1.0'))],
            refund_method="CASH",
            cash_session_id=session.id
        )
    )

    # Check cash session live totals:
    # Opening (100) + Cash Sales (60) - Cash Refund (30) = Expected (130)
    totals = await calculate_session_totals(test_db, session)
    assert totals["opening_amount"] == Decimal('100.0')
    assert totals["total_cash_sales"] == Decimal('60.0')
    assert totals["total_cash_refunds"] == Decimal('30.0')
    assert totals["expected_amount"] == Decimal('130.0')
