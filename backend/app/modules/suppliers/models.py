from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Boolean
from app.core.database import Base

class Supplier(Base):
    __tablename__ = "suppliers"
    name: Mapped[str] = mapped_column(String)
    name_ar: Mapped[str] = mapped_column(String, nullable=True)
    contact_person: Mapped[str] = mapped_column(String, nullable=True)
    phone: Mapped[str] = mapped_column(String, nullable=True)
    email: Mapped[str] = mapped_column(String, nullable=True)
    address: Mapped[str] = mapped_column(String, nullable=True)
    payment_terms: Mapped[str] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
