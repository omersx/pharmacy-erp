from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Numeric, ForeignKey, Boolean, UniqueConstraint, DateTime
from app.core.database import Base
from datetime import datetime
import uuid

class StockLocation(Base):
    __tablename__ = "stock_locations"
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"), index=True)
    name_en: Mapped[str] = mapped_column(String)
    name_ar: Mapped[str] = mapped_column(String, nullable=True)
    location_type: Mapped[str] = mapped_column(String, default="DISPENSARY_SHELF")  # DISPENSARY_SHELF, WAREHOUSE, COLD_CHAIN, NARCOTICS_SAFE, QUARANTINE
    code: Mapped[str] = mapped_column(String, nullable=True)
    is_default_dispense: Mapped[bool] = mapped_column(Boolean, default=False)
    is_default_receive: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    branch = relationship("Branch", lazy="selectin")
    batch_stocks = relationship("BatchLocationStock", back_populates="location", cascade="all, delete-orphan", lazy="selectin")

class BatchLocationStock(Base):
    __tablename__ = "batch_location_stock"
    __table_args__ = (
        UniqueConstraint("batch_id", "location_id", name="uq_batch_location_stock"),
    )
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicine_batches.id"), index=True)
    location_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stock_locations.id"), index=True)
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=0)

    batch = relationship("MedicineBatch", lazy="selectin")
    location = relationship("StockLocation", back_populates="batch_stocks", lazy="selectin")

class InventoryMovement(Base):
    __tablename__ = "inventory_movements"
    medicine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicines.id"))
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicine_batches.id"))
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"))
    movement_type: Mapped[str] = mapped_column(String)  # SALE, RETURN, ADJUSTMENT, EXPIRED, QUARANTINED, INTERNAL_TRANSFER
    quantity: Mapped[float] = mapped_column(Numeric(10, 2))
    unit_cost: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    reference_type: Mapped[str] = mapped_column(String, nullable=True)
    reference_id: Mapped[str] = mapped_column(String, nullable=True)
    notes: Mapped[str] = mapped_column(String, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    from_location_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stock_locations.id"), nullable=True)
    to_location_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stock_locations.id"), nullable=True)

    from_location = relationship("StockLocation", foreign_keys=[from_location_id], lazy="selectin")
    to_location = relationship("StockLocation", foreign_keys=[to_location_id], lazy="selectin")


class StockCountSession(Base):
    __tablename__ = "stock_count_sessions"
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"), index=True)
    location_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stock_locations.id"), index=True)
    session_number: Mapped[str] = mapped_column(String, unique=True, index=True)
    status: Mapped[str] = mapped_column(String, default="IN_PROGRESS")  # IN_PROGRESS, RECONCILED, CANCELLED
    notes: Mapped[str] = mapped_column(String, nullable=True)
    counted_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    reconciled_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=True)
    reconciled_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    branch = relationship("Branch", lazy="selectin")
    location = relationship("StockLocation", lazy="selectin")
    lines = relationship("StockCountLine", back_populates="session", cascade="all, delete-orphan", lazy="selectin")


class StockCountLine(Base):
    __tablename__ = "stock_count_lines"
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stock_count_sessions.id"), index=True)
    medicine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicines.id"), index=True)
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicine_batches.id"), index=True)
    expected_quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    counted_quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    variance_quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    variance_reason: Mapped[str] = mapped_column(String, nullable=True)

    session = relationship("StockCountSession", back_populates="lines")
    medicine = relationship("Medicine", lazy="selectin")
    batch = relationship("MedicineBatch", lazy="selectin")

