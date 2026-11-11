from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.auth.models import User
from app.modules.sync.models import SyncReceipt
from app.modules.sync.schemas import (
    SyncSalesRequest,
    SyncSalesResponse,
    SyncSaleResult,
    SyncSaleItem,
)
from app.modules.sales.schemas import SaleCreate, SaleItemCreate, PaymentEntryCreate
from app.modules.sales.service import create_sale
from app.modules.medicines.models import Medicine
import hashlib
import json
from uuid import UUID
from decimal import Decimal
from typing import List

router = APIRouter(tags=["PWA Sales Sync"])

def compute_item_hash(item: SyncSaleItem) -> str:
    raw = json.dumps(
        {
            "id": str(item.client_sale_id),
            "lines": [l.model_dump(mode="json") for l in item.lines],
            "totals": item.totals.model_dump(mode="json"),
            "payments": [p.model_dump(mode="json") for p in item.payments],
        },
        sort_keys=True,
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

@router.post("/sales", response_model=SyncSalesResponse)
async def sync_offline_sales(
    payload: SyncSalesRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Batch syncs offline sales from PWA terminals with strict idempotency and per-item savepoints.
    Preserves ordering and returns individual statuses (created, duplicate, needs_review, rejected).
    """
    results: List[SyncSaleResult] = []

    for item in payload.items:
        payload_hash = compute_item_hash(item)

        # 1. Idempotency Check
        existing_receipt = await db.execute(
            select(SyncReceipt).where(
                and_(
                    SyncReceipt.branch_id == item.branch_id,
                    SyncReceipt.client_sale_id == item.client_sale_id,
                )
            )
        )
        existing = existing_receipt.scalar_one_or_none()
        if existing:
            results.append(
                SyncSaleResult(
                    client_sale_id=item.client_sale_id,
                    status="duplicate",
                    invoice_no=existing.invoice_no,
                    warnings=["Sale was previously received and synchronized."],
                )
            )
            continue

        # 2. Check for Controlled Medicines (prohibited offline per regulation)
        has_controlled = False
        warnings = []
        for line in item.lines:
            med_res = await db.execute(select(Medicine).where(Medicine.id == line.medicine_id))
            med = med_res.scalar_one_or_none()
            if med and med.is_controlled:
                has_controlled = True
                break

        if has_controlled:
            receipt = SyncReceipt(
                branch_id=item.branch_id,
                client_sale_id=item.client_sale_id,
                device_id=payload.device_id,
                status="rejected",
                payload_hash=payload_hash,
                warnings="CONTROLLED_ITEM_NOT_ALLOWED_OFFLINE",
            )
            db.add(receipt)
            await db.commit()
            results.append(
                SyncSaleResult(
                    client_sale_id=item.client_sale_id,
                    status="rejected",
                    reason="CONTROLLED_ITEM_NOT_ALLOWED_OFFLINE",
                )
            )
            continue

        # 3. Process Sale in a Nested Transaction / Savepoint
        try:
            sale_create = SaleCreate(
                items=[
                    SaleItemCreate(
                        medicine_id=line.medicine_id,
                        quantity=Decimal(line.qty),
                        unit_price=Decimal(line.unit_price) - Decimal(line.discount),
                    )
                    for line in item.lines
                ],
                payments=[
                    PaymentEntryCreate(
                        payment_method=p.method.upper(),
                        amount=Decimal(p.amount),
                        reference=p.reference,
                    )
                    for p in item.payments
                ],
                customer_id=item.customer_id,
                cash_session_id=item.cash_session_id,
            )

            # Invoke domain create_sale
            sale = await create_sale(
                db=db,
                sale_data=sale_create,
                branch_id=item.branch_id,
                cashier_id=item.cashier_id,
            )

            # Record Sync Receipt
            receipt = SyncReceipt(
                branch_id=item.branch_id,
                client_sale_id=item.client_sale_id,
                device_id=payload.device_id,
                invoice_id=sale.id,
                invoice_no=sale.invoice_number,
                status="created",
                payload_hash=payload_hash,
            )
            db.add(receipt)
            await db.commit()

            results.append(
                SyncSaleResult(
                    client_sale_id=item.client_sale_id,
                    status="created",
                    invoice_no=sale.invoice_number,
                    warnings=warnings,
                )
            )
        except Exception as ex:
            await db.rollback()
            # Flag for manager review rather than losing sales that physically happened
            receipt = SyncReceipt(
                branch_id=item.branch_id,
                client_sale_id=item.client_sale_id,
                device_id=payload.device_id,
                status="needs_review",
                payload_hash=payload_hash,
                warnings=str(ex),
            )
            db.add(receipt)
            await db.commit()

            results.append(
                SyncSaleResult(
                    client_sale_id=item.client_sale_id,
                    status="needs_review",
                    warnings=[f"RECONCILIATION_REQUIRED: {str(ex)}"],
                    reason=str(ex),
                )
            )

    return SyncSalesResponse(results=results)
