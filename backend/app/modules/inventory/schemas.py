from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime
from decimal import Decimal

class StockAdjustment(BaseModel):
    medicine_id: UUID
    batch_id: UUID
    branch_id: Optional[UUID] = None
    quantity: Optional[Decimal] = None      # Delta to add/subtract
    new_quantity: Optional[Decimal] = None  # Exact physical count after adjustment
    reason: str
    adjustment_type: str = "CORRECTION"     # IN, OUT, CORRECTION, DAMAGE, EXPIRED, THEFT_LOSS, INTERNAL_USE

class InventoryMovementResponse(BaseModel):
    id: UUID
    medicine_id: UUID
    medicine_name: Optional[str] = None
    medicine_sku: Optional[str] = None
    batch_id: UUID
    batch_number: Optional[str] = None
    branch_id: Optional[UUID] = None
    movement_type: str
    quantity: Decimal
    unit_cost: Optional[Decimal] = Decimal('0.0')
    total_cost: Optional[Decimal] = Decimal('0.0')
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    notes: Optional[str] = None
    user_name: Optional[str] = None
    created_at: datetime
    
    model_config = {"from_attributes": True}
