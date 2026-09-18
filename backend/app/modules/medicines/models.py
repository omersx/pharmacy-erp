from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Boolean, Numeric, ForeignKey, Integer, DateTime
from app.core.database import Base
import uuid
from datetime import datetime

class MedicineCategory(Base):
    __tablename__ = "medicine_categories"
    name_en: Mapped[str] = mapped_column(String)
    name_ar: Mapped[str] = mapped_column(String, nullable=True)
    parent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicine_categories.id"), nullable=True)
    category_level: Mapped[int] = mapped_column(Integer, default=1)
    icon: Mapped[str] = mapped_column(String, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

class Medicine(Base):
    __tablename__ = "medicines"
    sku: Mapped[str] = mapped_column(String, unique=True)
    barcode: Mapped[str] = mapped_column(String, unique=True, nullable=True)
    name_en: Mapped[str] = mapped_column(String)
    name_ar: Mapped[str] = mapped_column(String, nullable=True)
    generic_name: Mapped[str] = mapped_column(String, nullable=True)
    brand_name: Mapped[str] = mapped_column(String, nullable=True)
    strength: Mapped[str] = mapped_column(String, nullable=True)
    dosage_form: Mapped[str] = mapped_column(String, nullable=True)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicine_categories.id"), nullable=True)
    manufacturer: Mapped[str] = mapped_column(String, nullable=True)
    description: Mapped[str] = mapped_column(String, nullable=True)
    base_unit: Mapped[str] = mapped_column(String)
    units_per_pack: Mapped[int] = mapped_column(Integer, default=1)
    allow_loose_sale: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    requires_prescription: Mapped[bool] = mapped_column(Boolean, default=False)
    is_controlled: Mapped[bool] = mapped_column(Boolean, default=False)
    is_cold_chain: Mapped[bool] = mapped_column(Boolean, default=False)
    reorder_level: Mapped[int] = mapped_column(Integer, default=10)
    max_stock: Mapped[int] = mapped_column(Integer, default=0)
    selling_price: Mapped[float] = mapped_column(Numeric(10, 2))
    image_url: Mapped[str] = mapped_column(String, nullable=True)

class MedicineBatch(Base):
    __tablename__ = "medicine_batches"
    medicine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medicines.id"))
    batch_number: Mapped[str] = mapped_column(String)
    expiry_date: Mapped[datetime] = mapped_column(DateTime)
    purchase_price: Mapped[float] = mapped_column(Numeric(10, 2))
    quantity_received: Mapped[float] = mapped_column(Numeric(10, 2))
    quantity_remaining: Mapped[float] = mapped_column(Numeric(10, 2))
    supplier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("suppliers.id"), nullable=True)
    production_date: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    received_date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String, default="ACTIVE")
    notes: Mapped[str] = mapped_column(String, nullable=True)
