from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime
from decimal import Decimal

class StockAdjustment(BaseModel):
    medicine_id: UUID
    batch_id: UUID
    quantity: Decimal
    reason: str
    adjustment_type: str

class InventoryMovementResponse(BaseModel):
    id: UUID
    medicine_id: UUID
    batch_id: UUID
    movement_type: str
    quantity: Decimal
    notes: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True
