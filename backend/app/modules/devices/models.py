from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, ForeignKey, DateTime, Boolean
from app.core.database import Base
import uuid
from datetime import datetime

class Device(Base):
    __tablename__ = "devices"

    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"), index=True)
    name: Mapped[str] = mapped_column(String, default="Till Terminal")
    public_key: Mapped[str] = mapped_column(String, nullable=True)
    registered_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    client_version: Mapped[str] = mapped_column(String, default="1.3.4")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    revoked_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    wipe_requested_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
