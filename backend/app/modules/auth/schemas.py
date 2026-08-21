from pydantic import BaseModel
from typing import Optional
import uuid
from datetime import datetime

class LoginRequest(BaseModel):
    email: str
    password: str
    remember_me: Optional[bool] = False

class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    full_name_ar: Optional[str] = None
    role: str
    phone: Optional[str] = None

class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    full_name_ar: Optional[str] = None
    role: str
    phone: Optional[str] = None
    is_active: bool
    created_at: datetime
    
    model_config = {"from_attributes": True}
