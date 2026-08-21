from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Numeric, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.core.database import Base
import uuid
from datetime import datetime

class Sale(Base):
    __tablename__ = "sales"
    invoice_number: Mapped[str] = mapped_column(String, unique=True)
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"))
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), nullable=True)
    cashier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    cash_session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cash_sessions.id"), nullable=True)
    status: Mapped[str] = mapped_column(String)
    subtotal: Mapped[float] = mapped_column(Numeric(10, 2))
    discount_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    total_amount: Mapped[float] = mapped_column(Numeric(10, 2))
    payment_method: Mapped[str] = mapped_column(String)
    notes: Mapped[str] = mapped_column(String, nullable=True)
    
    items = relationship("SaleItem", back_populates="sale", lazy="selectin")
    customer = relationship("Customer", lazy="selectin")

class SaleItem(Base):
    __tablename__ = "sale_items"
    sale_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales.id"))
    medicine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicines.id"))
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicine_batches.id"))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2))
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2))
    discount_percent: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    line_total: Mapped[float] = mapped_column(Numeric(10, 2))
    
    sale = relationship("Sale", back_populates="items")

class HeldSale(Base):
    __tablename__ = "held_sales"
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"))
    cashier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    label: Mapped[str] = mapped_column(String)
    items_json: Mapped[str] = mapped_column(String)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), nullable=True)
    held_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
