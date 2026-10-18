from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime
from decimal import Decimal

class StockAdjustment(BaseModel):
    medicine_id: UUID
    batch_id: UUID
    branch_id: Optional[UUID] = None
    quantity: Decimal
    reason: str
    adjustment_type: str  # IN, OUT, DAMAGE, EXPIRED, CORRECTION

class InventoryMovementResponse(BaseModel):
    id: UUID
    medicine_id: UUID
    batch_id: UUID
    branch_id: Optional[UUID] = None
    movement_type: str
    quantity: Decimal
    unit_cost: Optional[Decimal] = Decimal('0.0')
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True
