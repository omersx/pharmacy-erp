import uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Boolean, Integer, ForeignKey, Table, Column, Text, Uuid
from app.core.database import Base

# Many-to-many association table
role_permissions = Table(
    'role_permissions',
    Base.metadata,
    Column('role_id', Uuid, ForeignKey('roles.id'), primary_key=True),
    Column('permission_id', Uuid, ForeignKey('permissions.id'), primary_key=True),
)

class Role(Base):
    __tablename__ = "roles"
    
    name: Mapped[str] = mapped_column(String, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String)
    display_name_ar: Mapped[str] = mapped_column(String, nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    description_ar: Mapped[str] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    color: Mapped[str] = mapped_column(String, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    
    permissions: Mapped[list["Permission"]] = relationship(
        secondary=role_permissions, lazy="selectin", back_populates="roles"
    )

class Permission(Base):
    __tablename__ = "permissions"
    
    code: Mapped[str] = mapped_column(String, unique=True, index=True)
    module: Mapped[str] = mapped_column(String, index=True)
    action: Mapped[str] = mapped_column(String)
    display_name: Mapped[str] = mapped_column(String)
    display_name_ar: Mapped[str] = mapped_column(String, nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    
    roles: Mapped[list["Role"]] = relationship(
        secondary=role_permissions, lazy="selectin", back_populates="permissions"
    )
