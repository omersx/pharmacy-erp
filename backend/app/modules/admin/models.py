from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, ForeignKey, Text
from app.core.database import Base
import uuid

class AuditLog(Base):
    __tablename__ = "audit_logs"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=True)
    user_email: Mapped[str] = mapped_column(String, nullable=True)
    action: Mapped[str] = mapped_column(String)  # CREATE, UPDATE, DELETE, LOGIN, LOGOUT, IMPORT, WIPE, EXPORT
    module: Mapped[str] = mapped_column(String)  # Auth, Medicine, Sales, Inventory, Customer, Admin, System
    entity_type: Mapped[str] = mapped_column(String, nullable=True)  # Medicine, Sale, Batch, etc.
    entity_id: Mapped[str] = mapped_column(String, nullable=True)  # UUID of affected record
    details: Mapped[str] = mapped_column(Text)  # Human-readable description
    ip_address: Mapped[str] = mapped_column(String, nullable=True)
