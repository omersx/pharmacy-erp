from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone
from decimal import Decimal

from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.auth.models import User
from app.modules.purchases.models import (
    PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine,
    SupplierReturn, SupplierReturnLine, SupplierProductTerm
)
from app.modules.purchases.schemas import (
    PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderResponse,
    PurchaseOrderApproveRequest, PurchaseOrderCancelRequest,
    GoodsReceiptCreate, GoodsReceiptResponse,
    SupplierReturnCreate, SupplierReturnResponse,
    SupplierProductTermCreate, SupplierProductTermUpdate, SupplierProductTermResponse,
    PurchaseAnalyticsResponse
)
from app.modules.purchases.service import (
    create_purchase_order, submit_purchase_order, approve_purchase_order,
    cancel_purchase_order, create_goods_receipt, post_goods_receipt,
    create_supplier_return, post_supplier_return
)
from app.modules.suppliers.models import Supplier
from app.modules.organizations.models import Branch
from app.modules.medicines.models import Medicine

router = APIRouter(tags=["purchases"])


def map_po_response(po: PurchaseOrder) -> PurchaseOrderResponse:
    lines = []
    for l in po.lines:
        lines.append({
            "id": l.id,
            "po_id": l.po_id,
            "medicine_id": l.medicine_id,
            "medicine_name": l.medicine.name_en if l.medicine else None,
            "medicine_sku": l.medicine.sku if l.medicine else None,
            "pack_size": l.pack_size,
            "packs_ordered": Decimal(str(l.packs_ordered)),
            "quantity_ordered": Decimal(str(l.quantity_ordered)),
            "unit_cost": Decimal(str(l.unit_cost)),
            "tax_percent": Decimal(str(l.tax_percent)),
            "line_total": Decimal(str(l.line_total)),
            "quantity_received": Decimal(str(l.quantity_received)),
            "quantity_cancelled": Decimal(str(l.quantity_cancelled))
        })
    return PurchaseOrderResponse(
        id=po.id,
        po_number=po.po_number,
        supplier_id=po.supplier_id,
        supplier_name=po.supplier.name if po.supplier else None,
        branch_id=po.branch_id,
        branch_name=po.branch.name if po.branch else None,
        status=po.status,
        order_date=po.order_date,
        expected_delivery_date=po.expected_delivery_date,
        payment_terms=po.payment_terms,
        currency=po.currency,
        subtotal=Decimal(str(po.subtotal)),
        tax_amount=Decimal(str(po.tax_amount)),
        total_amount=Decimal(str(po.total_amount)),
        notes=po.notes,
        created_by_id=po.created_by_id,
        created_by_name=po.created_by.full_name if po.created_by else None,
        approved_by_id=po.approved_by_id,
        approved_by_name=po.approved_by.full_name if po.approved_by else None,
        approved_at=po.approved_at,
        cancelled_reason=po.cancelled_reason,
        created_at=po.created_at,
        updated_at=po.updated_at,
        lines=lines
    )


def map_receipt_response(r: GoodsReceipt) -> GoodsReceiptResponse:
    lines = []
    for l in r.lines:
        lines.append({
            "id": l.id,
            "receipt_id": l.receipt_id,
            "po_line_id": l.po_line_id,
            "medicine_id": l.medicine_id,
            "medicine_name": l.medicine.name_en if l.medicine else None,
            "quantity_received": Decimal(str(l.quantity_received)),
            "quantity_accepted": Decimal(str(l.quantity_accepted)),
            "quantity_rejected": Decimal(str(l.quantity_rejected)),
            "rejection_reason": l.rejection_reason,
            "batch_number": l.batch_number,
            "expiry_date": l.expiry_date,
            "production_date": l.production_date,
            "unit_cost": Decimal(str(l.unit_cost)),
            "created_batch_id": l.created_batch_id
        })
    return GoodsReceiptResponse(
        id=r.id,
        receipt_number=r.receipt_number,
        po_id=r.po_id,
        po_number=r.purchase_order.po_number if r.purchase_order else None,
        supplier_id=r.supplier_id,
        supplier_name=r.supplier.name if r.supplier else None,
        branch_id=r.branch_id,
        branch_name=r.branch.name if r.branch else None,
        destination_location_id=r.destination_location_id,
        destination_location_name=r.destination_location.name_en if r.destination_location else None,
        received_date=r.received_date,
        supplier_delivery_ref=r.supplier_delivery_ref,
        status=r.status,
        receiver_id=r.receiver_id,
        receiver_name=r.receiver.full_name if r.receiver else None,
        notes=r.notes,
        created_at=r.created_at,
        lines=lines
    )


def map_return_response(ret: SupplierReturn) -> SupplierReturnResponse:
    lines = []
    for l in ret.lines:
        lines.append({
            "id": l.id,
            "return_id": l.return_id,
            "medicine_id": l.medicine_id,
            "medicine_name": l.medicine.name_en if l.medicine else None,
            "batch_id": l.batch_id,
            "batch_number": l.batch.batch_number if l.batch else None,
            "quantity": Decimal(str(l.quantity)),
            "unit_cost": Decimal(str(l.unit_cost)),
            "total_cost": Decimal(str(l.total_cost)),
            "reason": l.reason
        })
    return SupplierReturnResponse(
        id=ret.id,
        return_number=ret.return_number,
        receipt_id=ret.receipt_id,
        supplier_id=ret.supplier_id,
        supplier_name=ret.supplier.name if ret.supplier else None,
        branch_id=ret.branch_id,
        branch_name=ret.branch.name if ret.branch else None,
        from_location_id=ret.from_location_id,
        from_location_name=ret.from_location.name_en if ret.from_location else None,
        status=ret.status,
        reason=ret.reason,
        total_amount=Decimal(str(ret.total_amount)),
        created_by_id=ret.created_by_id,
        created_by_name=ret.created_by.full_name if ret.created_by else None,
        notes=ret.notes,
        created_at=ret.created_at,
        lines=lines
    )


# --- Purchase Orders Endpoints ---
@router.get("/orders", response_model=List[PurchaseOrderResponse])
async def list_purchase_orders(
    branch_id: Optional[UUID] = None,
    supplier_id: Optional[UUID] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(PurchaseOrder).order_by(desc(PurchaseOrder.created_at))
    if branch_id:
        query = query.where(PurchaseOrder.branch_id == branch_id)
    if supplier_id:
        query = query.where(PurchaseOrder.supplier_id == supplier_id)
    if status:
        query = query.where(PurchaseOrder.status == status)

    result = await db.execute(query)
    orders = result.scalars().all()
    return [map_po_response(o) for o in orders]


@router.post("/orders", response_model=PurchaseOrderResponse)
async def create_order(
    data: PurchaseOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    po = await create_purchase_order(db, data, current_user.id)
    return map_po_response(po)


@router.get("/orders/{id}", response_model=PurchaseOrderResponse)
async def get_purchase_order(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    po = await db.get(PurchaseOrder, id)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return map_po_response(po)


@router.post("/orders/{id}/submit", response_model=PurchaseOrderResponse)
async def submit_order(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    po = await submit_purchase_order(db, id, current_user.id)
    return map_po_response(po)


@router.post("/orders/{id}/approve", response_model=PurchaseOrderResponse)
async def approve_order(
    id: UUID,
    req: Optional[PurchaseOrderApproveRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    notes = req.notes if req else None
    po = await approve_purchase_order(db, id, current_user.id, notes)
    return map_po_response(po)


@router.post("/orders/{id}/cancel", response_model=PurchaseOrderResponse)
async def cancel_order(
    id: UUID,
    req: PurchaseOrderCancelRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    po = await cancel_purchase_order(db, id, current_user.id, req.reason)
    return map_po_response(po)


# --- Goods Receipts Endpoints ---
@router.get("/receipts", response_model=List[GoodsReceiptResponse])
async def list_goods_receipts(
    branch_id: Optional[UUID] = None,
    po_id: Optional[UUID] = None,
    supplier_id: Optional[UUID] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(GoodsReceipt).order_by(desc(GoodsReceipt.created_at))
    if branch_id:
        query = query.where(GoodsReceipt.branch_id == branch_id)
    if po_id:
        query = query.where(GoodsReceipt.po_id == po_id)
    if supplier_id:
        query = query.where(GoodsReceipt.supplier_id == supplier_id)
    if status:
        query = query.where(GoodsReceipt.status == status)

    result = await db.execute(query)
    receipts = result.scalars().all()
    return [map_receipt_response(r) for r in receipts]


@router.post("/receipts", response_model=GoodsReceiptResponse)
async def create_receipt(
    data: GoodsReceiptCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    receipt = await create_goods_receipt(db, data, current_user.id)
    return map_receipt_response(receipt)


@router.get("/receipts/{id}", response_model=GoodsReceiptResponse)
async def get_goods_receipt(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    receipt = await db.get(GoodsReceipt, id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Goods receipt not found")
    return map_receipt_response(receipt)


@router.post("/receipts/{id}/post", response_model=GoodsReceiptResponse)
async def post_receipt(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    receipt = await post_goods_receipt(db, id, current_user.id)
    return map_receipt_response(receipt)


# --- Supplier Returns Endpoints ---
@router.get("/returns", response_model=List[SupplierReturnResponse])
async def list_supplier_returns(
    branch_id: Optional[UUID] = None,
    supplier_id: Optional[UUID] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(SupplierReturn).order_by(desc(SupplierReturn.created_at))
    if branch_id:
        query = query.where(SupplierReturn.branch_id == branch_id)
    if supplier_id:
        query = query.where(SupplierReturn.supplier_id == supplier_id)
    if status:
        query = query.where(SupplierReturn.status == status)

    result = await db.execute(query)
    returns = result.scalars().all()
    return [map_return_response(ret) for ret in returns]


@router.post("/returns", response_model=SupplierReturnResponse)
async def create_return(
    data: SupplierReturnCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ret = await create_supplier_return(db, data, current_user.id)
    return map_return_response(ret)


@router.get("/returns/{id}", response_model=SupplierReturnResponse)
async def get_supplier_return(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ret = await db.get(SupplierReturn, id)
    if not ret:
        raise HTTPException(status_code=404, detail="Supplier return not found")
    return map_return_response(ret)


@router.post("/returns/{id}/post", response_model=SupplierReturnResponse)
async def post_return(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ret = await post_supplier_return(db, id, current_user.id)
    return map_return_response(ret)


# --- Supplier Product Terms Endpoints ---
@router.get("/supplier-terms", response_model=List[SupplierProductTermResponse])
async def list_supplier_terms(
    supplier_id: Optional[UUID] = None,
    medicine_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(SupplierProductTerm)
    if supplier_id:
        query = query.where(SupplierProductTerm.supplier_id == supplier_id)
    if medicine_id:
        query = query.where(SupplierProductTerm.medicine_id == medicine_id)

    result = await db.execute(query)
    terms = result.scalars().all()
    out = []
    for t in terms:
        out.append(SupplierProductTermResponse(
            id=t.id,
            supplier_id=t.supplier_id,
            medicine_id=t.medicine_id,
            supplier_sku=t.supplier_sku,
            pack_size=t.pack_size,
            lead_time_days=t.lead_time_days,
            min_order_qty=t.min_order_qty,
            last_cost=Decimal(str(t.last_cost)),
            currency=t.currency,
            is_preferred=t.is_preferred,
            created_at=t.created_at,
            updated_at=t.updated_at,
            medicine_name=t.medicine.name_en if t.medicine else None,
            supplier_name=t.supplier.name if t.supplier else None
        ))
    return out


@router.post("/supplier-terms", response_model=SupplierProductTermResponse)
async def create_or_update_supplier_term(
    data: SupplierProductTermCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    res = await db.execute(
        select(SupplierProductTerm).where(
            SupplierProductTerm.supplier_id == data.supplier_id,
            SupplierProductTerm.medicine_id == data.medicine_id
        )
    )
    term = res.scalar_one_or_none()
    if term:
        term.supplier_sku = data.supplier_sku
        term.pack_size = data.pack_size
        term.lead_time_days = data.lead_time_days
        term.min_order_qty = data.min_order_qty
        term.last_cost = float(data.last_cost)
        term.currency = data.currency
        term.is_preferred = data.is_preferred
    else:
        term = SupplierProductTerm(
            supplier_id=data.supplier_id,
            medicine_id=data.medicine_id,
            supplier_sku=data.supplier_sku,
            pack_size=data.pack_size,
            lead_time_days=data.lead_time_days,
            min_order_qty=data.min_order_qty,
            last_cost=float(data.last_cost),
            currency=data.currency,
            is_preferred=data.is_preferred
        )
        db.add(term)

    await db.commit()
    await db.refresh(term)
    return SupplierProductTermResponse(
        id=term.id,
        supplier_id=term.supplier_id,
        medicine_id=term.medicine_id,
        supplier_sku=term.supplier_sku,
        pack_size=term.pack_size,
        lead_time_days=term.lead_time_days,
        min_order_qty=term.min_order_qty,
        last_cost=Decimal(str(term.last_cost)),
        currency=term.currency,
        is_preferred=term.is_preferred,
        created_at=term.created_at,
        updated_at=term.updated_at,
        medicine_name=term.medicine.name_en if term.medicine else None,
        supplier_name=term.supplier.name if term.supplier else None
    )


# --- Analytics Endpoint ---
@router.get("/analytics", response_model=PurchaseAnalyticsResponse)
async def get_purchase_analytics(
    branch_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    base_query = select(PurchaseOrder)
    if branch_id:
        base_query = base_query.where(PurchaseOrder.branch_id == branch_id)

    orders_res = await db.execute(base_query)
    orders = orders_res.scalars().all()

    total_orders = len(orders)
    draft_rfqs = sum(1 for o in orders if o.status == "DRAFT")
    approved_orders = sum(1 for o in orders if o.status == "APPROVED")
    partially_received = sum(1 for o in orders if o.status == "PARTIALLY_RECEIVED")
    fully_received = sum(1 for o in orders if o.status == "RECEIVED")

    receipts_query = select(GoodsReceipt).where(GoodsReceipt.status == "DRAFT")
    if branch_id:
        receipts_query = receipts_query.where(GoodsReceipt.branch_id == branch_id)
    rec_res = await db.execute(receipts_query)
    pending_receipts_count = len(rec_res.scalars().all())

    # Total spend on received goods receipts
    gr_spend_res = await db.execute(
        select(func.sum(GoodsReceiptLine.quantity_accepted * GoodsReceiptLine.unit_cost))
        .join(GoodsReceipt, GoodsReceipt.id == GoodsReceiptLine.receipt_id)
        .where(GoodsReceipt.status == "POSTED")
    )
    total_spend = gr_spend_res.scalar() or 0.0

    # Active suppliers
    suppliers_res = await db.execute(select(func.count(Supplier.id)).where(Supplier.is_active == True))
    active_suppliers = suppliers_res.scalar() or 0

    return PurchaseAnalyticsResponse(
        total_orders=total_orders,
        draft_rfqs=draft_rfqs,
        approved_orders=approved_orders,
        partially_received=partially_received,
        fully_received=fully_received,
        pending_receipts_count=pending_receipts_count,
        monthly_spend=Decimal(str(round(total_spend, 2))),
        total_spend=Decimal(str(round(total_spend, 2))),
        active_suppliers_count=active_suppliers
    )
