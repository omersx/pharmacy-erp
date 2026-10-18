from pydantic import BaseModel
from typing import List, Optional
import uuid
from decimal import Decimal
from datetime import datetime

class SaleItemCreate(BaseModel):
    medicine_id: uuid.UUID
    quantity: Decimal
    unit_price: Decimal

class PaymentEntryCreate(BaseModel):
    payment_method: str
    amount: Decimal
    reference: Optional[str] = None

class PaymentEntryResponse(BaseModel):
    id: uuid.UUID
    sale_id: uuid.UUID
    cash_session_id: Optional[uuid.UUID] = None
    payment_method: str
    amount: Decimal
    reference: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}

class SaleCreate(BaseModel):
    payment_method: Optional[str] = "CASH"
    payments: Optional[List[PaymentEntryCreate]] = None
    items: List[SaleItemCreate]
    customer_id: Optional[uuid.UUID] = None
    cash_session_id: Optional[uuid.UUID] = None

class CustomerSimple(BaseModel):
    id: uuid.UUID
    name: str
    model_config = {"from_attributes": True}

class SaleItemResponse(BaseModel):
    id: uuid.UUID
    medicine_id: uuid.UUID
    medicine_name: Optional[str] = None
    batch_id: uuid.UUID
    batch_number: Optional[str] = None
    quantity: Decimal
    quantity_returned: Optional[Decimal] = Decimal('0.0')
    unit_price: Decimal
    unit_cost: Optional[Decimal] = Decimal('0.0')
    line_total: Decimal
    profit: Optional[Decimal] = Decimal('0.0')
    model_config = {"from_attributes": True}

class SaleReturnItemCreate(BaseModel):
    sale_item_id: uuid.UUID
    quantity: Decimal
    condition: str = "GOOD"         # GOOD, DAMAGED, EXPIRED, OPENED
    disposition: str = "RESTOCK"     # RESTOCK, QUARANTINE, DISPOSAL
    reason: Optional[str] = None

class SaleReturnCreate(BaseModel):
    items: Optional[List[SaleReturnItemCreate]] = None
    refund_method: str = "CASH"     # CASH, CARD, STORE_CREDIT
    reason: Optional[str] = None
    cash_session_id: Optional[uuid.UUID] = None

class SaleReturnItemResponse(BaseModel):
    id: uuid.UUID
    sale_item_id: uuid.UUID
    medicine_id: uuid.UUID
    medicine_name: Optional[str] = None
    batch_id: uuid.UUID
    batch_number: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    refund_amount: Decimal
    condition: str
    disposition: str
    notes: Optional[str] = None
    model_config = {"from_attributes": True}

class SaleReturnResponse(BaseModel):
    id: uuid.UUID
    sale_id: uuid.UUID
    return_number: str
    branch_id: uuid.UUID
    cashier_id: uuid.UUID
    cash_session_id: Optional[uuid.UUID] = None
    refund_method: str
    total_refund: Decimal
    reason: Optional[str] = None
    created_at: datetime
    items: List[SaleReturnItemResponse] = []
    model_config = {"from_attributes": True}

class SaleResponse(BaseModel):
    id: uuid.UUID
    invoice_number: str
    subtotal: Optional[Decimal] = None
    discount_amount: Optional[Decimal] = Decimal('0.0')
    tax_amount: Optional[Decimal] = Decimal('0.0')
    profit_amount: Optional[Decimal] = Decimal('0.0')
    total_amount: Decimal
    status: str
    payment_method: str
    created_at: datetime
    customer: Optional[CustomerSimple] = None
    items: List[SaleItemResponse] = []
    returns: List[SaleReturnResponse] = []
    payments: List[PaymentEntryResponse] = []
    model_config = {"from_attributes": True}
