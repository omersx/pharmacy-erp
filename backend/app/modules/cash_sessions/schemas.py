from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from decimal import Decimal

class CashSessionOpen(BaseModel):
    branch_id: Optional[UUID] = None
    terminal_name: Optional[str] = "Main Register"
    opening_amount: Decimal = Field(default=Decimal("0.0"), ge=0)

class CashSessionClose(BaseModel):
    closing_amount: Decimal = Field(ge=0)
    notes: Optional[str] = None

class CashMovementCreate(BaseModel):
    movement_type: str  # CASH_IN, CASH_OUT
    amount: Decimal = Field(gt=0)
    reason: str

class CashMovementResponse(BaseModel):
    id: UUID
    session_id: UUID
    movement_type: str
    amount: Decimal
    reason: str
    performed_by: UUID
    created_at: datetime
    model_config = {"from_attributes": True}

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
    model_config = {"from_attributes": True}

class CashSessionSummary(BaseModel):
    session: CashSessionResponse
    opening_amount: Decimal
    total_cash_sales: Decimal
    total_card_sales: Decimal
    total_other_sales: Decimal
    total_sales_count: int
    total_cash_refunds: Decimal
    total_cash_in: Decimal
    total_cash_out: Decimal
    expected_amount: Decimal
    closing_amount: Optional[Decimal] = None
    variance: Optional[Decimal] = None
    movements: List[CashMovementResponse] = []
