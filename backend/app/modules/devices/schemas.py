from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime
from uuid import UUID

class DeviceRegisterRequest(BaseModel):
    branch_id: UUID
    name: str
    public_key: Optional[str] = None
    client_version: str = "1.3.4"

class DeviceResponse(BaseModel):
    id: UUID
    branch_id: UUID
    name: str
    client_version: str
    last_seen_at: datetime
    is_active: bool
    is_revoked: bool
    wipe_requested: bool

    class Config:
        from_attributes = True

class DeviceHeartbeatRequest(BaseModel):
    client_version: str = "1.3.4"
    sw_version: Optional[str] = None
    pending_sales: int = 0
    oldest_pending_age_s: Optional[int] = None
    storage: Optional[Dict[str, Any]] = None
    clock_offset_ms: Optional[int] = None

class DeviceHeartbeatResponse(BaseModel):
    status: str = "ok"
    wipe_requested: bool = False
    is_revoked: bool = False
    server_time: datetime

class AppMetaResponse(BaseModel):
    offline_enabled: bool = True
    offline_sales_enabled: bool = True
    offline_valid_hours: int = 12
    invoice_numbering_mode: str = "provisional" # 'provisional' or 'block'
    catalog_stale_warn_hours: int = 24
    catalog_stale_block_hours: int = 72
    sw_kill: bool = False
    min_client_version: str = "1.3.4"
    server_time: datetime
