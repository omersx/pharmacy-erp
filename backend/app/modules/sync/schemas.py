from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from uuid import UUID

class SyncSaleLine(BaseModel):
    medicine_id: UUID
    batch_hint_id: Optional[UUID] = None
    qty: str
    unit_price: str
    discount: str = "0.00"
    tax_rate: str = "0.00"
    price_version: int = 1

class SyncSalePayment(BaseModel):
    method: str = "cash"
    amount: str
    reference: Optional[str] = None

class SyncSaleTotals(BaseModel):
    subtotal: str
    tax: str = "0.00"
    discount: str = "0.00"
    total: str

class SyncSaleItem(BaseModel):
    client_sale_id: UUID
    branch_id: UUID
    cashier_id: UUID
    cash_session_id: Optional[UUID] = None
    created_at_device: datetime
    provisional_no: str
    lines: List[SyncSaleLine]
    payments: List[SyncSalePayment]
    totals: SyncSaleTotals
    customer_id: Optional[UUID] = None
    signature: Optional[str] = None

class SyncSalesRequest(BaseModel):
    device_id: UUID
    client_version: str = "1.3.4"
    items: List[SyncSaleItem]

class SyncSaleResult(BaseModel):
    client_sale_id: UUID
    status: str  # 'created', 'duplicate', 'needs_review', 'rejected'
    invoice_no: Optional[str] = None
    warnings: List[str] = []
    reason: Optional[str] = None

class SyncSalesResponse(BaseModel):
    results: List[SyncSaleResult]
