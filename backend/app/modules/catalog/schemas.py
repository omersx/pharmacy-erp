from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from uuid import UUID

class CatalogMedicineItem(BaseModel):
    id: UUID
    sku: str
    barcode: Optional[str] = None
    name_en: str
    name_ar: Optional[str] = None
    generic_name: Optional[str] = None
    brand_name: Optional[str] = None
    strength: Optional[str] = None
    dosage_form: Optional[str] = None
    category_id: Optional[UUID] = None
    selling_price: float
    units_per_pack: int = 1
    requires_prescription: bool = False
    is_controlled: bool = False
    is_active: bool = True
    updated_at: datetime

    class Config:
        from_attributes = True

class CatalogBatchItem(BaseModel):
    id: UUID
    medicine_id: UUID
    branch_id: UUID
    batch_number: str
    barcode: Optional[str] = None
    expiry_date: datetime
    quantity_remaining: float
    status: str = "ACTIVE"
    updated_at: datetime

    class Config:
        from_attributes = True

class CatalogBootstrapResponse(BaseModel):
    cursor: str
    medicines: List[CatalogMedicineItem]
    batches: List[CatalogBatchItem]
    total_medicines: int
    total_batches: int
    has_more: bool = False

class CatalogDeltaResponse(BaseModel):
    cursor: str
    medicines: List[CatalogMedicineItem]
    batches: List[CatalogBatchItem]
    deleted_medicine_ids: List[UUID] = []
    has_more: bool = False
