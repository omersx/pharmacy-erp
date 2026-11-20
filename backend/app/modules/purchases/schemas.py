from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from uuid import UUID
from datetime import datetime
from decimal import Decimal


# --- Supplier Product Terms ---
class SupplierProductTermBase(BaseModel):
    supplier_id: UUID
    medicine_id: UUID
    supplier_sku: Optional[str] = None
    pack_size: int = 1
    lead_time_days: int = 1
    min_order_qty: int = 1
    last_cost: Decimal = Decimal('0.0')
    currency: str = "SDG"
    is_preferred: bool = False


class SupplierProductTermCreate(SupplierProductTermBase):
    pass


class SupplierProductTermUpdate(BaseModel):
    supplier_sku: Optional[str] = None
    pack_size: Optional[int] = None
    lead_time_days: Optional[int] = None
    min_order_qty: Optional[int] = None
    last_cost: Optional[Decimal] = None
    currency: Optional[str] = None
    is_preferred: Optional[bool] = None


class SupplierProductTermResponse(SupplierProductTermBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    medicine_name: Optional[str] = None
    supplier_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# --- Purchase Order Lines ---
class PurchaseOrderLineCreate(BaseModel):
    medicine_id: UUID
    pack_size: int = 1
    packs_ordered: Decimal = Decimal('1.0')
    quantity_ordered: Optional[Decimal] = None  # If omitted, computed as packs_ordered * pack_size
    unit_cost: Decimal = Decimal('0.0')
    tax_percent: Decimal = Decimal('0.0')


class PurchaseOrderLineResponse(BaseModel):
    id: UUID
    po_id: UUID
    medicine_id: UUID
    medicine_name: Optional[str] = None
    medicine_sku: Optional[str] = None
    pack_size: int
    packs_ordered: Decimal
    quantity_ordered: Decimal
    unit_cost: Decimal
    tax_percent: Decimal
    line_total: Decimal
    quantity_received: Decimal
    quantity_cancelled: Decimal

    model_config = ConfigDict(from_attributes=True)


# --- Purchase Orders ---
class PurchaseOrderCreate(BaseModel):
    supplier_id: UUID
    branch_id: UUID
    order_date: Optional[datetime] = None
    expected_delivery_date: Optional[datetime] = None
    payment_terms: Optional[str] = None
    currency: str = "SDG"
    notes: Optional[str] = None
    lines: List[PurchaseOrderLineCreate] = []


class PurchaseOrderUpdate(BaseModel):
    supplier_id: Optional[UUID] = None
    expected_delivery_date: Optional[datetime] = None
    payment_terms: Optional[str] = None
    notes: Optional[str] = None
    lines: Optional[List[PurchaseOrderLineCreate]] = None


class PurchaseOrderApproveRequest(BaseModel):
    notes: Optional[str] = None


class PurchaseOrderCancelRequest(BaseModel):
    reason: str


class PurchaseOrderResponse(BaseModel):
    id: UUID
    po_number: str
    supplier_id: UUID
    supplier_name: Optional[str] = None
    branch_id: UUID
    branch_name: Optional[str] = None
    status: str
    order_date: datetime
    expected_delivery_date: Optional[datetime] = None
    payment_terms: Optional[str] = None
    currency: str
    subtotal: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    notes: Optional[str] = None
    created_by_id: UUID
    created_by_name: Optional[str] = None
    approved_by_id: Optional[UUID] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    cancelled_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    lines: List[PurchaseOrderLineResponse] = []

    model_config = ConfigDict(from_attributes=True)


# --- Goods Receipts (Inbound Receiving) ---
class GoodsReceiptLineCreate(BaseModel):
    po_line_id: Optional[UUID] = None
    medicine_id: UUID
    quantity_received: Decimal
    quantity_accepted: Decimal
    quantity_rejected: Decimal = Decimal('0.0')
    rejection_reason: Optional[str] = None
    batch_number: str
    expiry_date: datetime
    production_date: Optional[datetime] = None
    unit_cost: Decimal


class GoodsReceiptLineResponse(BaseModel):
    id: UUID
    receipt_id: UUID
    po_line_id: Optional[UUID] = None
    medicine_id: UUID
    medicine_name: Optional[str] = None
    quantity_received: Decimal
    quantity_accepted: Decimal
    quantity_rejected: Decimal
    rejection_reason: Optional[str] = None
    batch_number: str
    expiry_date: datetime
    production_date: Optional[datetime] = None
    unit_cost: Decimal
    created_batch_id: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)


class GoodsReceiptCreate(BaseModel):
    po_id: Optional[UUID] = None
    supplier_id: UUID
    branch_id: UUID
    destination_location_id: Optional[UUID] = None
    received_date: Optional[datetime] = None
    supplier_delivery_ref: Optional[str] = None
    notes: Optional[str] = None
    lines: List[GoodsReceiptLineCreate]


class GoodsReceiptResponse(BaseModel):
    id: UUID
    receipt_number: str
    po_id: Optional[UUID] = None
    po_number: Optional[str] = None
    supplier_id: UUID
    supplier_name: Optional[str] = None
    branch_id: UUID
    branch_name: Optional[str] = None
    destination_location_id: Optional[UUID] = None
    destination_location_name: Optional[str] = None
    received_date: datetime
    supplier_delivery_ref: Optional[str] = None
    status: str
    receiver_id: UUID
    receiver_name: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    lines: List[GoodsReceiptLineResponse] = []

    model_config = ConfigDict(from_attributes=True)


# --- Supplier Returns ---
class SupplierReturnLineCreate(BaseModel):
    medicine_id: UUID
    batch_id: UUID
    quantity: Decimal
    unit_cost: Decimal
    reason: Optional[str] = None


class SupplierReturnLineResponse(BaseModel):
    id: UUID
    return_id: UUID
    medicine_id: UUID
    medicine_name: Optional[str] = None
    batch_id: UUID
    batch_number: Optional[str] = None
    quantity: Decimal
    unit_cost: Decimal
    total_cost: Decimal
    reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SupplierReturnCreate(BaseModel):
    receipt_id: Optional[UUID] = None
    supplier_id: UUID
    branch_id: UUID
    from_location_id: Optional[UUID] = None
    reason: str
    notes: Optional[str] = None
    lines: List[SupplierReturnLineCreate]


class SupplierReturnResponse(BaseModel):
    id: UUID
    return_number: str
    receipt_id: Optional[UUID] = None
    supplier_id: UUID
    supplier_name: Optional[str] = None
    branch_id: UUID
    branch_name: Optional[str] = None
    from_location_id: Optional[UUID] = None
    from_location_name: Optional[str] = None
    status: str
    reason: str
    total_amount: Decimal
    created_by_id: UUID
    created_by_name: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    lines: List[SupplierReturnLineResponse] = []

    model_config = ConfigDict(from_attributes=True)


# --- Analytics ---
class PurchaseAnalyticsResponse(BaseModel):
    total_orders: int
    draft_rfqs: int
    approved_orders: int
    partially_received: int
    fully_received: int
    pending_receipts_count: int
    monthly_spend: Decimal
    total_spend: Decimal
    active_suppliers_count: int
