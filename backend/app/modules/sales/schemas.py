from pydantic import BaseModel
from typing import List, Optional
import uuid
from decimal import Decimal
from datetime import datetime

class SaleItemCreate(BaseModel):
    medicine_id: uuid.UUID
    quantity: Decimal
    unit_price: Decimal

class SaleCreate(BaseModel):
    payment_method: str
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
    batch_id: uuid.UUID
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal
    model_config = {"from_attributes": True}

class SaleResponse(BaseModel):
    id: uuid.UUID
    invoice_number: str
    total_amount: Decimal
    status: str
    payment_method: str
    created_at: datetime
    customer: Optional[CustomerSimple] = None
    items: List[SaleItemResponse] = []
    model_config = {"from_attributes": True}

