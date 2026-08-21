from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Numeric, ForeignKey, DateTime
from app.core.database import Base
import uuid
from datetime import datetime

class CashSession(Base):
    __tablename__ = "cash_sessions"
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"))
    cashier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    terminal_name: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="OPEN")
    opening_amount: Mapped[float] = mapped_column(Numeric(10, 2))
    closing_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=True)
    expected_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=True)
    variance: Mapped[float] = mapped_column(Numeric(10, 2), nullable=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    closed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str] = mapped_column(String, nullable=True)
