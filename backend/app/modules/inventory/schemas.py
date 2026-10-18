from pydantic import BaseModel
from typing import Optional, List, Dict, Any
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

class BatchStatusUpdate(BaseModel):
    status: str  # ACTIVE, QUARANTINED, RECALLED, DISPOSED
    reason: str
    reference: Optional[str] = None  # Recall notice #, Lab report, Inspection ID
    quantity_to_dispose: Optional[Decimal] = None  # For partial or full write-off

class ExpiryBatchItem(BaseModel):
    batch_id: UUID
    batch_number: str
    medicine_id: UUID
    medicine_name: str
    medicine_sku: str
    branch_id: Optional[UUID] = None
    branch_name: Optional[str] = None
    expiry_date: datetime
    days_to_expiry: int
    quantity_remaining: Decimal
    purchase_price: Decimal
    total_value_at_risk: Decimal
    status: str
    notes: Optional[str] = None
    bucket: str  # 'EXPIRED', '0_30_DAYS', '31_60_DAYS', '61_90_DAYS', 'QUARANTINED', 'RECALLED', 'SAFE'

    model_config = {"from_attributes": True}

class ExpiryDashboardSummary(BaseModel):
    count_0_30: int = 0
    value_0_30: Decimal = Decimal('0.0')
    count_31_60: int = 0
    value_31_60: Decimal = Decimal('0.0')
    count_61_90: int = 0
    value_61_90: Decimal = Decimal('0.0')
    count_expired: int = 0
    value_expired: Decimal = Decimal('0.0')
    count_quarantined: int = 0
    value_quarantined: Decimal = Decimal('0.0')
    count_recalled: int = 0
    value_recalled: Decimal = Decimal('0.0')
    total_batches_at_risk: int = 0
    total_value_at_risk: Decimal = Decimal('0.0')

class ExpiryDashboardResponse(BaseModel):
    summary: ExpiryDashboardSummary
    batches: List[ExpiryBatchItem]
