from pydantic import BaseModel, model_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid
from decimal import Decimal

class CategoryCreate(BaseModel):
    name_en: str
    name_ar: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    category_level: int = 1
    icon: Optional[str] = None
    sort_order: int = 0

class CategoryResponse(CategoryCreate):
    id: uuid.UUID
    category_level: int
    icon: Optional[str] = None
    sort_order: int
    model_config = {"from_attributes": True}

class CategoryUpdate(BaseModel):
    name_en: Optional[str] = None
    name_ar: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    category_level: Optional[int] = None
    icon: Optional[str] = None
    sort_order: Optional[int] = None

class CategoryTreeResponse(CategoryResponse):
    children: List['CategoryTreeResponse'] = []
    model_config = {"from_attributes": True}

class MedicineCreate(BaseModel):
    sku: str
    name_en: str
    name_ar: Optional[str] = None
    base_unit: str
    selling_price: Decimal
    barcode: Optional[str] = None
    category_id: Optional[uuid.UUID] = None
    generic_name: Optional[str] = None
    brand_name: Optional[str] = None
    strength: Optional[str] = None
    dosage_form: Optional[str] = None
    manufacturer: Optional[str] = None
    description: Optional[str] = None
    units_per_pack: int = 1
    allow_loose_sale: bool = False
    requires_prescription: bool = False
    is_controlled: bool = False
    is_cold_chain: bool = False
    reorder_level: int = 10
    max_stock: int = 0
    image_url: Optional[str] = None

    @model_validator(mode='before')
    @classmethod
    def map_aliases(cls, data: Any):
        if isinstance(data, dict):
            if 'name' in data and not data.get('name_en'):
                data['name_en'] = data['name']
            if 'controlled_substance' in data and 'is_controlled' not in data:
                data['is_controlled'] = data['controlled_substance']
            if 'cold_chain' in data and 'is_cold_chain' not in data:
                data['is_cold_chain'] = data['cold_chain']
        return data

class MedicineUpdate(BaseModel):
    sku: Optional[str] = None
    name_en: Optional[str] = None
    name_ar: Optional[str] = None
    base_unit: Optional[str] = None
    selling_price: Optional[Decimal] = None
    barcode: Optional[str] = None
    category_id: Optional[uuid.UUID] = None
    generic_name: Optional[str] = None
    brand_name: Optional[str] = None
    strength: Optional[str] = None
    dosage_form: Optional[str] = None
    manufacturer: Optional[str] = None
    description: Optional[str] = None
    units_per_pack: Optional[int] = None
    allow_loose_sale: Optional[bool] = None
    requires_prescription: Optional[bool] = None
    is_controlled: Optional[bool] = None
    is_cold_chain: Optional[bool] = None
    reorder_level: Optional[int] = None
    max_stock: Optional[int] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None

    @model_validator(mode='before')
    @classmethod
    def map_aliases(cls, data: Any):
        if isinstance(data, dict):
            if 'name' in data and not data.get('name_en'):
                data['name_en'] = data['name']
            if 'controlled_substance' in data and 'is_controlled' not in data:
                data['is_controlled'] = data['controlled_substance']
            if 'cold_chain' in data and 'is_cold_chain' not in data:
                data['is_cold_chain'] = data['cold_chain']
        return data

class MedicineResponse(MedicineCreate):
    id: uuid.UUID
    selling_price: Decimal
    is_active: bool
    model_config = {"from_attributes": True}

class InitialBatch(BaseModel):
    batch_number: Optional[str] = None
    branch_id: Optional[uuid.UUID] = None
    quantity: Decimal
    purchase_price: Optional[Decimal] = Decimal('0.0')
    production_date: Optional[datetime] = None
    expiry_date: datetime
    supplier_id: Optional[uuid.UUID] = None

class MedicineCreateWithBatch(MedicineCreate):
    initial_batch: Optional[InitialBatch] = None

    @model_validator(mode='before')
    @classmethod
    def handle_nested_format(cls, data: Any):
        if isinstance(data, dict) and 'medicine' in data and isinstance(data['medicine'], dict):
            flat = dict(data['medicine'])
            batch = data.get('batch') or data.get('initial_batch')
            if batch:
                flat['initial_batch'] = batch
            return flat
        return data

class BatchCreate(BaseModel):
    batch_number: str
    barcode: Optional[str] = None
    branch_id: Optional[uuid.UUID] = None
    expiry_date: datetime
    purchase_price: Decimal
    quantity_received: Decimal
    supplier_id: Optional[uuid.UUID] = None
    production_date: Optional[datetime] = None
    notes: Optional[str] = None

class BatchUpdate(BaseModel):
    batch_number: Optional[str] = None
    barcode: Optional[str] = None
    branch_id: Optional[uuid.UUID] = None
    expiry_date: Optional[datetime] = None
    purchase_price: Optional[Decimal] = None
    production_date: Optional[datetime] = None
    notes: Optional[str] = None
    status: Optional[str] = None  # ACTIVE, QUARANTINED, RECALLED, DAMAGED

class BatchResponse(BaseModel):
    id: uuid.UUID
    medicine_id: uuid.UUID
    branch_id: Optional[uuid.UUID] = None
    batch_number: str
    barcode: Optional[str] = None
    expiry_date: datetime
    purchase_price: Decimal
    quantity_received: Decimal
    quantity_remaining: Decimal
    quantity: Optional[Decimal] = None
    received_date: datetime
    is_active: bool
    production_date: Optional[datetime] = None
    supplier_id: Optional[uuid.UUID] = None
    status: Optional[str] = "ACTIVE"
    notes: Optional[str] = None
    model_config = {"from_attributes": True}

    @model_validator(mode='after')
    def set_quantity(self):
        if self.quantity is None:
            self.quantity = self.quantity_remaining
        return self

class BarcodeCreate(BaseModel):
    barcode: str
    barcode_type: str = "ALTERNATE"  # PRIMARY, ALTERNATE, BATCH, PACKAGING
    packaging_type: Optional[str] = "UNIT"  # UNIT, STRIP, BOX, CARTON
    units_per_pack: int = 1
    batch_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None

class BarcodeResponse(BaseModel):
    id: uuid.UUID
    medicine_id: uuid.UUID
    batch_id: Optional[uuid.UUID] = None
    barcode: str
    barcode_type: str
    packaging_type: Optional[str] = "UNIT"
    units_per_pack: int = 1
    is_active: bool = True
    notes: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}

class BarcodeScanResult(BaseModel):
    found: bool
    barcode: str
    match_type: str  # BATCH, PACKAGING, PRIMARY, ALTERNATE
    medicine_id: uuid.UUID
    medicine_name: str
    medicine_sku: str
    selling_price: Decimal
    effective_price: Decimal
    unit_price: Optional[Decimal] = None

    @model_validator(mode='after')
    def set_unit_price(self):
        if self.unit_price is None:
            self.unit_price = self.effective_price or self.selling_price
        return self
    units_multiplier: int = 1
    packaging_type: Optional[str] = "UNIT"
    requires_prescription: bool = False
    available_stock: Decimal
    is_sellable: bool
    batch_id: Optional[uuid.UUID] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[datetime] = None
    status: Optional[str] = "ACTIVE"
    notes: Optional[str] = None

class BarcodeCheckResponse(BaseModel):
    available: bool = True
    is_unique: bool = True
    barcode: str
    conflict_message: Optional[str] = None
    assigned_to: Optional[str] = None
    conflict_type: Optional[str] = None
    conflict_details: Optional[Dict[str, Any]] = None

class BatchConflictResponse(BaseModel):
    """Returned when a batch number already exists with a different expiry date"""
    conflict: bool = True
    message: str
    existing_batch_number: str
    existing_expiry_date: datetime
    entered_expiry_date: datetime

class MedicineDetailResponse(MedicineResponse):
    batches: List[BatchResponse] = []
    barcodes: List[BarcodeResponse] = []
    category_name: Optional[str] = None

class BulkImportRowError(BaseModel):
    row: int
    field: Optional[str] = None
    message: str

class BulkImportResponse(BaseModel):
    total_rows: int
    successful: int
    failed: int
    errors: List[BulkImportRowError] = []
    created_medicines: List[MedicineResponse] = []

