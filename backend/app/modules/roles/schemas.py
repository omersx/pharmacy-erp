from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid

class PermissionResponse(BaseModel):
    id: uuid.UUID
    code: str
    module: str
    action: str
    display_name: str
    display_name_ar: Optional[str] = None
    description: Optional[str] = None
    
    model_config = {"from_attributes": True}

class RoleCreate(BaseModel):
    name: str
    display_name: str
    display_name_ar: Optional[str] = None
    description: Optional[str] = None
    description_ar: Optional[str] = None
    color: Optional[str] = None
    sort_order: int = 0
    permission_ids: List[uuid.UUID] = []

class RoleUpdate(BaseModel):
    display_name: Optional[str] = None
    display_name_ar: Optional[str] = None
    description: Optional[str] = None
    description_ar: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    permission_ids: Optional[List[uuid.UUID]] = None

class RoleResponse(BaseModel):
    id: uuid.UUID
    name: str
    display_name: str
    display_name_ar: Optional[str] = None
    description: Optional[str] = None
    description_ar: Optional[str] = None
    is_system: bool
    is_active: bool
    color: Optional[str] = None
    sort_order: int
    permissions: List[PermissionResponse] = []
    created_at: datetime
    
    model_config = {"from_attributes": True}

class PermissionsByModule(BaseModel):
    module: str
    permissions: List[PermissionResponse]
