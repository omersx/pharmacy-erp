from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Numeric, ForeignKey, DateTime
from app.core.database import Base
import uuid
from datetime import datetime
from typing import List

class CashSession(Base):
    __tablename__ = "cash_sessions"
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"), index=True)
    cashier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    terminal_name: Mapped[str] = mapped_column(String, default="Main Register")
    status: Mapped[str] = mapped_column(String, default="OPEN")
    opening_amount: Mapped[float] = mapped_column(Numeric(10, 2))
    closing_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=True)
    expected_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=True)
    variance: Mapped[float] = mapped_column(Numeric(10, 2), nullable=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    closed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str] = mapped_column(String, nullable=True)

    movements: Mapped[List["CashMovement"]] = relationship("CashMovement", back_populates="session", lazy="selectin")

class CashMovement(Base):
    __tablename__ = "cash_movements"
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cash_sessions.id"), index=True)
    movement_type: Mapped[str] = mapped_column(String)  # CASH_IN, CASH_OUT
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    reason: Mapped[str] = mapped_column(String)
    performed_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    
    session: Mapped["CashSession"] = relationship("CashSession", back_populates="movements")
