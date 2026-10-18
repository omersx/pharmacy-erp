import pytest
import pytest_asyncio
import asyncio
import uuid
import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.database import Base
from app.modules.auth.models import User
from app.modules.organizations.models import Branch
from app.modules.medicines.models import Medicine, MedicineBatch, MedicineCategory
from app.modules.suppliers.models import Supplier
from app.modules.inventory.models import InventoryMovement
from app.modules.sales.models import Sale, SaleItem, HeldSale
from app.modules.customers.models import Customer, CustomerPayment
from app.modules.cash_sessions.models import CashSession
from app.modules.roles.models import Role, Permission
from app.modules.admin.models import AuditLog
from app.modules.notifications.models import Notification

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture
async def test_db():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
