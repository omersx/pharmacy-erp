from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
from uuid import UUID

class NotificationResponse(BaseModel):
    id: UUID
    user_id: Optional[UUID] = None
    type: str
    title: str
    title_ar: Optional[str] = None
    message: str
    message_ar: Optional[str] = None
    link: Optional[str] = None
    is_read: bool
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class UnreadCountResponse(BaseModel):
    unread_count: int
