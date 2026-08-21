from pydantic import BaseModel
from typing import Optional, List
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
    reorder_level: int = 0
    max_stock: int = 0
    image_url: Optional[str] = None

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

class MedicineResponse(MedicineCreate):
    id: uuid.UUID
    selling_price: Decimal
    is_active: bool
    model_config = {"from_attributes": True}

class InitialBatch(BaseModel):
    batch_number: Optional[str] = None
    quantity: Decimal
    purchase_price: Decimal
    production_date: Optional[datetime] = None
    expiry_date: datetime
    supplier_id: Optional[uuid.UUID] = None

class MedicineCreateWithBatch(MedicineCreate):
    initial_batch: Optional[InitialBatch] = None

class BatchCreate(BaseModel):
    batch_number: str
    expiry_date: datetime
    purchase_price: Decimal
    quantity_received: Decimal
    supplier_id: Optional[uuid.UUID] = None
    production_date: Optional[datetime] = None
    notes: Optional[str] = None

class BatchUpdate(BaseModel):
    expiry_date: Optional[datetime] = None
    purchase_price: Optional[Decimal] = None
    production_date: Optional[datetime] = None
    notes: Optional[str] = None
    status: Optional[str] = None  # ACTIVE, QUARANTINED, RECALLED, DAMAGED

class BatchResponse(BaseModel):
    id: uuid.UUID
    medicine_id: uuid.UUID
    batch_number: str
    expiry_date: datetime
    purchase_price: Decimal
    quantity_received: Decimal
    quantity_remaining: Decimal
    received_date: datetime
    is_active: bool
    production_date: Optional[datetime] = None
    supplier_id: Optional[uuid.UUID] = None
    status: Optional[str] = "ACTIVE"
    notes: Optional[str] = None
    model_config = {"from_attributes": True}

class BatchConflictResponse(BaseModel):
    """Returned when a batch number already exists with a different expiry date"""
    conflict: bool = True
    message: str
    existing_batch_number: str
    existing_expiry_date: datetime
    entered_expiry_date: datetime

class MedicineDetailResponse(MedicineResponse):
    batches: List[BatchResponse] = []
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

