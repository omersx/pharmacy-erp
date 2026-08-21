from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime
from decimal import Decimal

class CashSessionOpen(BaseModel):
    branch_id: UUID
    terminal_name: str
    opening_amount: Decimal

class CashSessionClose(BaseModel):
    closing_amount: Decimal
    notes: Optional[str] = None

class CashSessionResponse(BaseModel):
    id: UUID
    branch_id: UUID
    cashier_id: UUID
    terminal_name: str
    status: str
    opening_amount: Decimal
    closing_amount: Optional[Decimal] = None
    expected_amount: Optional[Decimal] = None
    variance: Optional[Decimal] = None
    opened_at: datetime
    closed_at: Optional[datetime] = None
    notes: Optional[str] = None
    
    class Config:
        from_attributes = True
