from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Boolean
from app.core.database import Base

class Branch(Base):
    __tablename__ = "branches"
    name: Mapped[str] = mapped_column(String)
    name_ar: Mapped[str] = mapped_column(String, nullable=True)
    code: Mapped[str] = mapped_column(String, unique=True)
    address: Mapped[str] = mapped_column(String, nullable=True)
    phone: Mapped[str] = mapped_column(String, nullable=True)
    email: Mapped[str] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    currency: Mapped[str] = mapped_column(String, default="SAR")
    timezone: Mapped[str] = mapped_column(String, default="Asia/Riyadh")
    locale: Mapped[str] = mapped_column(String, default="ar_SA")
