from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Numeric, ForeignKey
from app.core.database import Base
import uuid

class InventoryMovement(Base):
    __tablename__ = "inventory_movements"
    medicine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicines.id"))
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicine_batches.id"))
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"))
    movement_type: Mapped[str] = mapped_column(String)
    quantity: Mapped[float] = mapped_column(Numeric(10, 2))
    reference_type: Mapped[str] = mapped_column(String, nullable=True)
    reference_id: Mapped[str] = mapped_column(String, nullable=True)
    notes: Mapped[str] = mapped_column(String, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
