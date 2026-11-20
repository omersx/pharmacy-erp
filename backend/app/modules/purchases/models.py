import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import String, Numeric, Integer, Boolean, ForeignKey, DateTime, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SupplierProductTerm(Base):
    __tablename__ = "supplier_product_terms"

    supplier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), index=True)
    medicine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicines.id", ondelete="CASCADE"), index=True)

    supplier_sku: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pack_size: Mapped[int] = mapped_column(Integer, default=1)
    lead_time_days: Mapped[int] = mapped_column(Integer, default=1)
    min_order_qty: Mapped[int] = mapped_column(Integer, default=1)
    last_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    currency: Mapped[str] = mapped_column(String, default="SDG")
    is_preferred: Mapped[bool] = mapped_column(Boolean, default=False)

    supplier = relationship("Supplier", lazy="selectin")
    medicine = relationship("Medicine", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("supplier_id", "medicine_id", name="uq_supplier_medicine_term"),
    )


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    po_number: Mapped[str] = mapped_column(String, unique=True, index=True)
    supplier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("suppliers.id"), index=True)
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"), index=True)

    # Status: DRAFT (RFQ), SUBMITTED, APPROVED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED
    status: Mapped[str] = mapped_column(String, default="DRAFT", index=True)
    order_date: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    expected_delivery_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    payment_terms: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # e.g., "Net 30", "Cash on Delivery"
    currency: Mapped[str] = mapped_column(String, default="SDG")

    subtotal: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    tax_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    approved_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancelled_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    lines: Mapped[List["PurchaseOrderLine"]] = relationship(
        "PurchaseOrderLine", back_populates="purchase_order", cascade="all, delete-orphan", lazy="selectin"
    )
    receipts: Mapped[List["GoodsReceipt"]] = relationship(
        "GoodsReceipt", back_populates="purchase_order", lazy="selectin"
    )

    supplier = relationship("Supplier", lazy="selectin")
    branch = relationship("Branch", lazy="selectin")
    created_by = relationship("User", foreign_keys=[created_by_id], lazy="selectin")
    approved_by = relationship("User", foreign_keys=[approved_by_id], lazy="selectin")


class PurchaseOrderLine(Base):
    __tablename__ = "purchase_order_lines"

    po_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("purchase_orders.id", ondelete="CASCADE"), index=True)
    medicine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicines.id"), index=True)

    pack_size: Mapped[int] = mapped_column(Integer, default=1)
    packs_ordered: Mapped[float] = mapped_column(Numeric(10, 2), default=1.0)
    quantity_ordered: Mapped[float] = mapped_column(Numeric(10, 2), default=1.0)  # total individual units
    unit_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)         # cost per individual unit
    tax_percent: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)
    line_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)

    quantity_received: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    quantity_cancelled: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)

    purchase_order: Mapped["PurchaseOrder"] = relationship("PurchaseOrder", back_populates="lines")
    medicine = relationship("Medicine", lazy="selectin")


class GoodsReceipt(Base):
    __tablename__ = "goods_receipts"

    receipt_number: Mapped[str] = mapped_column(String, unique=True, index=True)
    po_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("purchase_orders.id"), nullable=True, index=True)
    supplier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("suppliers.id"), index=True)
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"), index=True)
    destination_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("stock_locations.id"), nullable=True)

    received_date: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    supplier_delivery_ref: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # Delivery note or invoice #

    # Status: DRAFT, POSTED, CANCELLED
    status: Mapped[str] = mapped_column(String, default="DRAFT", index=True)
    receiver_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    lines: Mapped[List["GoodsReceiptLine"]] = relationship(
        "GoodsReceiptLine", back_populates="goods_receipt", cascade="all, delete-orphan", lazy="selectin"
    )

    purchase_order = relationship("PurchaseOrder", back_populates="receipts", lazy="selectin")
    supplier = relationship("Supplier", lazy="selectin")
    branch = relationship("Branch", lazy="selectin")
    destination_location = relationship("StockLocation", lazy="selectin")
    receiver = relationship("User", foreign_keys=[receiver_id], lazy="selectin")


class GoodsReceiptLine(Base):
    __tablename__ = "goods_receipt_lines"

    receipt_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("goods_receipts.id", ondelete="CASCADE"), index=True)
    po_line_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("purchase_order_lines.id"), nullable=True)
    medicine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicines.id"), index=True)

    quantity_received: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    quantity_accepted: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    quantity_rejected: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    rejection_reason: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    batch_number: Mapped[str] = mapped_column(String)
    expiry_date: Mapped[datetime] = mapped_column(DateTime)
    production_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    unit_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)

    created_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("medicine_batches.id"), nullable=True)

    goods_receipt: Mapped["GoodsReceipt"] = relationship("GoodsReceipt", back_populates="lines")
    medicine = relationship("Medicine", lazy="selectin")
    po_line = relationship("PurchaseOrderLine", lazy="selectin")
    created_batch = relationship("MedicineBatch", lazy="selectin")


class SupplierReturn(Base):
    __tablename__ = "supplier_returns"

    return_number: Mapped[str] = mapped_column(String, unique=True, index=True)
    receipt_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("goods_receipts.id"), nullable=True)
    supplier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("suppliers.id"), index=True)
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"), index=True)
    from_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("stock_locations.id"), nullable=True)

    status: Mapped[str] = mapped_column(String, default="DRAFT", index=True)  # DRAFT, POSTED, CANCELLED
    reason: Mapped[str] = mapped_column(String)
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    lines: Mapped[List["SupplierReturnLine"]] = relationship(
        "SupplierReturnLine", back_populates="supplier_return", cascade="all, delete-orphan", lazy="selectin"
    )

    supplier = relationship("Supplier", lazy="selectin")
    branch = relationship("Branch", lazy="selectin")
    from_location = relationship("StockLocation", lazy="selectin")
    created_by = relationship("User", foreign_keys=[created_by_id], lazy="selectin")


class SupplierReturnLine(Base):
    __tablename__ = "supplier_return_lines"

    return_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("supplier_returns.id", ondelete="CASCADE"), index=True)
    medicine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicines.id"), index=True)
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicine_batches.id"), index=True)

    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1.0)
    unit_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    total_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    reason: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    supplier_return: Mapped["SupplierReturn"] = relationship("SupplierReturn", back_populates="lines")
    medicine = relationship("Medicine", lazy="selectin")
    batch = relationship("MedicineBatch", lazy="selectin")
