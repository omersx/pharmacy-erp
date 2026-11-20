from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Numeric, ForeignKey, DateTime, Text, Boolean
from app.core.database import Base
import uuid
from datetime import datetime, timezone
from typing import List, Optional

class CustomerInvoice(Base):
    __tablename__ = "customer_invoices"

    # Number is None while DRAFT (displays as "/" or "Draft"), generated upon POSTED: e.g. "INV/2026/00001"
    invoice_number: Mapped[Optional[str]] = mapped_column(String, unique=True, index=True, nullable=True)
    invoice_type: Mapped[str] = mapped_column(String, default="OUT_INVOICE")  # OUT_INVOICE (Customer Invoice), OUT_REFUND (Credit Note)
    source_type: Mapped[str] = mapped_column(String, default="BACK_OFFICE")   # POS or BACK_OFFICE

    sale_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("sales.id"), nullable=True, index=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), index=True)
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"))
    cashier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))

    status: Mapped[str] = mapped_column(String, default="DRAFT", index=True)  # DRAFT, POSTED, PAID, CANCELLED
    invoice_date: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    due_date: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    currency: Mapped[str] = mapped_column(String, default="SDG")

    subtotal: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    discount_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    tax_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    amount_paid: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    amount_due: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)

    payment_terms: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # e.g., "Immediate Payment", "15 Days", "30 Days"
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    items: Mapped[List["InvoiceItem"]] = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan", lazy="selectin")
    payments: Mapped[List["InvoicePayment"]] = relationship("InvoicePayment", back_populates="invoice", cascade="all, delete-orphan", lazy="selectin")
    customer = relationship("Customer", lazy="selectin")
    branch = relationship("Branch", lazy="selectin")
    cashier = relationship("User", foreign_keys=[cashier_id], lazy="selectin")
    sale = relationship("Sale", foreign_keys=[sale_id], lazy="selectin")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customer_invoices.id"), index=True)
    medicine_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("medicines.id"), nullable=True)
    batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("medicine_batches.id"), nullable=True)

    label: Mapped[str] = mapped_column(String)  # Medicine name or service description
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1.0)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    discount_percent: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)
    tax_percent: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)  # e.g. 0.0 or 15.0
    line_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)

    invoice: Mapped["CustomerInvoice"] = relationship("CustomerInvoice", back_populates="items")
    medicine = relationship("Medicine", lazy="selectin")
    batch = relationship("MedicineBatch", lazy="selectin")


class InvoicePayment(Base):
    __tablename__ = "invoice_payments"

    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customer_invoices.id"), index=True)
    payment_method: Mapped[str] = mapped_column(String, default="CASH")  # CASH, BANKAK, FAWRY, CARD, BANK_TRANSFER
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    payment_date: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    reference: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # transaction ID or receipt note
    notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    recorded_by: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id"), nullable=True)

    invoice: Mapped["CustomerInvoice"] = relationship("CustomerInvoice", back_populates="payments")
    recorder = relationship("User", foreign_keys=[recorded_by], lazy="selectin")


class PharmacyProfile(Base):
    __tablename__ = "pharmacy_profiles"

    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("branches.id"), nullable=True, unique=True)
    name_en: Mapped[str] = mapped_column(String, default="Grand Nile Pharmacy")
    name_ar: Mapped[Optional[str]] = mapped_column(String, default="صيدلية النيل الكبرى")
    logo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # URL or data URI base64
    tax_number: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="300123456700003")  # الرقم الضريبي
    cr_number: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="1010482910")       # السجل التجاري
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="+249 91 234 5678")
    mobile: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="info@grandnile-pharma.com")
    address: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="Al-Siteen Street, Khartoum")
    city: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="Khartoum")
    currency: Mapped[str] = mapped_column(String, default="SDG")
    bank_name: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="Bank of Khartoum (Bankak)")
    bank_account_number: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="1234567")
    bank_iban: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    invoice_terms: Mapped[Optional[str]] = mapped_column(
        Text, 
        nullable=True, 
        default="Medicines cannot be returned without original invoice within 3 days. / البضاعة المباعة لا ترد ولا تستبدل بعد 3 أيام إلا بالفاتورة الأصلية"
    )
    invoice_prefix: Mapped[str] = mapped_column(String, default="INV")
