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


# --- Stock Locations & Shelf-Warehouse Transfer Schemas ---

class StockLocationBase(BaseModel):
    name_en: str
    name_ar: Optional[str] = None
    location_type: str = "DISPENSARY_SHELF"  # DISPENSARY_SHELF, WAREHOUSE, COLD_CHAIN, NARCOTICS_SAFE, QUARANTINE
    code: Optional[str] = None
    is_default_dispense: bool = False
    is_default_receive: bool = False
    is_active: bool = True

class StockLocationCreate(StockLocationBase):
    branch_id: UUID

class StockLocationUpdate(BaseModel):
    name_en: Optional[str] = None
    name_ar: Optional[str] = None
    location_type: Optional[str] = None
    code: Optional[str] = None
    is_default_dispense: Optional[bool] = None
    is_default_receive: Optional[bool] = None
    is_active: Optional[bool] = None

class StockLocationResponse(StockLocationBase):
    id: UUID
    branch_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}

class BatchLocationStockResponse(BaseModel):
    id: UUID
    batch_id: UUID
    location_id: UUID
    quantity: Decimal
    location_name: Optional[str] = None
    location_type: Optional[str] = None

    model_config = {"from_attributes": True}

class QuickRefillRequest(BaseModel):
    medicine_id: UUID
    quantity: Decimal
    branch_id: Optional[UUID] = None
    batch_id: Optional[UUID] = None  # If omitted, system picks batches FEFO from source location
    from_location_id: Optional[UUID] = None  # Defaults to branch's default receive (Warehouse)
    to_location_id: Optional[UUID] = None    # Defaults to branch's default dispense (Shelf)
    notes: Optional[str] = None

class MoveToWarehouseRequest(BaseModel):
    medicine_id: UUID
    quantity: Decimal
    branch_id: Optional[UUID] = None
    batch_id: Optional[UUID] = None
    notes: Optional[str] = None

class ConsolidateStockRequest(BaseModel):
    branch_id: Optional[UUID] = None

class BulkRefillItem(BaseModel):
    medicine_id: UUID
    quantity: Decimal
    batch_id: Optional[UUID] = None

class BulkRefillRequest(BaseModel):
    branch_id: Optional[UUID] = None
    from_location_id: Optional[UUID] = None
    to_location_id: Optional[UUID] = None
    items: List[BulkRefillItem]
    notes: Optional[str] = None

class RefillSuggestionBatch(BaseModel):
    batch_id: UUID
    batch_number: str
    expiry_date: datetime
    warehouse_quantity: Decimal

class RefillSuggestionItem(BaseModel):
    medicine_id: UUID
    medicine_name: str
    medicine_sku: str
    shelf_stock: Decimal
    warehouse_stock: Decimal
    total_stock: Decimal
    reorder_level: int
    suggested_refill: Decimal
    status: str  # EMPTY_ON_SHELF, LOW_ON_SHELF, OK
    shelf_location_name: Optional[str] = None
    warehouse_location_name: Optional[str] = None
    unit: Optional[str] = None
    available_batches: List[RefillSuggestionBatch] = []

class LocationStockSummaryItem(BaseModel):
    medicine_id: UUID
    medicine_name: str
    medicine_sku: str
    dosage_form: Optional[str] = None
    strength: Optional[str] = None
    unit: Optional[str] = None
    shelf_stock: Decimal
    warehouse_stock: Decimal
    other_locations_stock: Decimal = Decimal('0.0')
    total_stock: Decimal
    reorder_level: int
    needs_refill: bool


# --- Location Cycle Count Schemas ---

class StartCycleCountRequest(BaseModel):
    location_id: UUID
    branch_id: Optional[UUID] = None
    notes: Optional[str] = None

class CycleCountLineUpdate(BaseModel):
    line_id: UUID
    counted_quantity: Decimal
    variance_reason: Optional[str] = None

class UpdateCycleCountRequest(BaseModel):
    lines: List[CycleCountLineUpdate]

class CycleCountLineResponse(BaseModel):
    id: UUID
    medicine_id: UUID
    medicine_name: Optional[str] = None
    medicine_sku: Optional[str] = None
    batch_id: UUID
    batch_number: Optional[str] = None
    expiry_date: Optional[datetime] = None
    expected_quantity: Decimal
    counted_quantity: Decimal
    variance_quantity: Decimal
    variance_reason: Optional[str] = None

    model_config = {"from_attributes": True}

class CycleCountSessionResponse(BaseModel):
    id: UUID
    branch_id: UUID
    location_id: UUID
    location_name: Optional[str] = None
    session_number: str
    status: str
    notes: Optional[str] = None
    counted_by: UUID
    reconciled_by: Optional[UUID] = None
    reconciled_at: Optional[datetime] = None
    created_at: datetime
    lines: List[CycleCountLineResponse] = []
    total_expected: Decimal = Decimal('0.0')
    total_counted: Decimal = Decimal('0.0')
    total_variance: Decimal = Decimal('0.0')

    model_config = {"from_attributes": True}


