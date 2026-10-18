from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Numeric, ForeignKey, DateTime
from app.core.database import Base
import uuid
from datetime import datetime, timezone

class Sale(Base):
    __tablename__ = "sales"
    invoice_number: Mapped[str] = mapped_column(String, unique=True, index=True)
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"))
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), nullable=True)
    cashier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    cash_session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cash_sessions.id"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String)  # COMPLETED, RETURNED, PARTIALLY_RETURNED
    subtotal: Mapped[float] = mapped_column(Numeric(10, 2))
    discount_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    profit_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    total_amount: Mapped[float] = mapped_column(Numeric(10, 2))
    payment_method: Mapped[str] = mapped_column(String)
    notes: Mapped[str] = mapped_column(String, nullable=True)
    
    items = relationship("SaleItem", back_populates="sale", lazy="selectin")
    customer = relationship("Customer", lazy="selectin")
    returns = relationship("SaleReturn", back_populates="sale", lazy="selectin")
    payments = relationship("SalePayment", back_populates="sale", lazy="selectin", cascade="all, delete-orphan")

class SalePayment(Base):
    __tablename__ = "sale_payments"
    sale_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales.id"), index=True)
    cash_session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cash_sessions.id"), nullable=True, index=True)
    payment_method: Mapped[str] = mapped_column(String)  # CASH, CARD, BANK, MOBILE, etc.
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    reference: Mapped[str] = mapped_column(String, nullable=True)  # txn / auth code / note

    sale = relationship("Sale", back_populates="payments")

class SaleItem(Base):
    __tablename__ = "sale_items"
    sale_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales.id"), index=True)
    medicine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicines.id"))
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicine_batches.id"))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2))
    quantity_returned: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2))
    unit_cost: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    discount_percent: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    line_total: Mapped[float] = mapped_column(Numeric(10, 2))
    profit: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    
    sale = relationship("Sale", back_populates="items")
    medicine = relationship("Medicine", lazy="selectin")
    batch = relationship("MedicineBatch", lazy="selectin")

    @property
    def medicine_name(self) -> str | None:
        return self.medicine.name_en if self.medicine else None

    @property
    def batch_number(self) -> str | None:
        return self.batch.batch_number if self.batch else None

class SaleReturn(Base):
    __tablename__ = "sale_returns"
    sale_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales.id"), index=True)
    return_number: Mapped[str] = mapped_column(String, unique=True, index=True)
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"))
    cashier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    cash_session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cash_sessions.id"), nullable=True, index=True)
    refund_method: Mapped[str] = mapped_column(String, default="CASH")  # CASH, CARD, STORE_CREDIT
    total_refund: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    reason: Mapped[str] = mapped_column(String, nullable=True)
    
    sale = relationship("Sale", back_populates="returns")
    items = relationship("SaleReturnItem", back_populates="sale_return", lazy="selectin")

class SaleReturnItem(Base):
    __tablename__ = "sale_return_items"
    return_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sale_returns.id"), index=True)
    sale_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sale_items.id"))
    medicine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicines.id"))
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicine_batches.id"))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2))
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2))
    refund_amount: Mapped[float] = mapped_column(Numeric(10, 2))
    condition: Mapped[str] = mapped_column(String, default="GOOD")  # GOOD, DAMAGED, EXPIRED, OPENED
    disposition: Mapped[str] = mapped_column(String, default="RESTOCK")  # RESTOCK, QUARANTINE, DISPOSAL
    notes: Mapped[str] = mapped_column(String, nullable=True)
    
    sale_return = relationship("SaleReturn", back_populates="items")
    medicine = relationship("Medicine", lazy="selectin")
    batch = relationship("MedicineBatch", lazy="selectin")

    @property
    def medicine_name(self) -> str | None:
        return self.medicine.name_en if self.medicine else None

    @property
    def batch_number(self) -> str | None:
        return self.batch.batch_number if self.batch else None

class HeldSale(Base):
    __tablename__ = "held_sales"
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"))
    cashier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    label: Mapped[str] = mapped_column(String)
    items_json: Mapped[str] = mapped_column(String)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), nullable=True)
    held_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
