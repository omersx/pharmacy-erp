from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Boolean, ForeignKey, Text
from app.core.database import Base
import uuid

class Notification(Base):
    __tablename__ = "notifications"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=True)
    type: Mapped[str] = mapped_column(String)  # info, warning, danger, success
    title: Mapped[str] = mapped_column(String)
    title_ar: Mapped[str] = mapped_column(String, nullable=True)
    message: Mapped[str] = mapped_column(Text)
    message_ar: Mapped[str] = mapped_column(Text, nullable=True)
    link: Mapped[str] = mapped_column(String, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
