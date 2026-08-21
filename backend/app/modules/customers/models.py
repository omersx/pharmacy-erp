from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Boolean, Numeric, ForeignKey, Enum as SAEnum
from app.core.database import Base
import enum


class Customer(Base):
    __tablename__ = "customers"
    name: Mapped[str] = mapped_column(String)
    name_ar: Mapped[str] = mapped_column(String, nullable=True)
    phone: Mapped[str] = mapped_column(String, nullable=True)
    email: Mapped[str] = mapped_column(String, nullable=True)
    address: Mapped[str] = mapped_column(String, nullable=True)
    credit_limit: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    credit_balance: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(String, nullable=True)

    payments: Mapped[list["CustomerPayment"]] = relationship(back_populates="customer", lazy="selectin")


class PaymentMethod(str, enum.Enum):
    CASH = "CASH"
    CARD = "CARD"
    BANK_TRANSFER = "BANK_TRANSFER"


class CustomerPayment(Base):
    __tablename__ = "customer_payments"
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    payment_method: Mapped[str] = mapped_column(String, default="CASH")
    reference: Mapped[str] = mapped_column(String, nullable=True)
    notes: Mapped[str] = mapped_column(String, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=True)

    customer: Mapped["Customer"] = relationship(back_populates="payments")
