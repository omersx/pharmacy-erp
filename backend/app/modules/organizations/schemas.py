from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid

class BranchCreate(BaseModel):
    name: str
    code: str
    name_ar: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    currency: str = "SAR"
    timezone: str = "Asia/Riyadh"
    locale: str = "ar_SA"

class BranchUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    name_ar: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    currency: Optional[str] = None
    timezone: Optional[str] = None
    locale: Optional[str] = None
    is_active: Optional[bool] = None

class BranchResponse(BranchCreate):
    id: uuid.UUID
    is_active: bool
    model_config = {"from_attributes": True}
