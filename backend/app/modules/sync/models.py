from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, ForeignKey, DateTime
from app.core.database import Base
import uuid
from datetime import datetime

class SyncReceipt(Base):
    __tablename__ = "sync_receipts"

    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"), index=True)
    client_sale_id: Mapped[uuid.UUID] = mapped_column(index=True)
    device_id: Mapped[uuid.UUID] = mapped_column(index=True)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales.id"), nullable=True)
    invoice_no: Mapped[str] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String)  # 'created', 'duplicate', 'needs_review', 'rejected'
    payload_hash: Mapped[str] = mapped_column(String)
    warnings: Mapped[str] = mapped_column(String, nullable=True)
