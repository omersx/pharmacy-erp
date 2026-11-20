import uuid
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args={"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
)

AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if settings.DATABASE_URL.startswith("sqlite"):
            def migrate_sqlite(connection):
                cur = connection.connection.cursor()
                try:
                    cols = [c[1] for c in cur.execute("PRAGMA table_info(cash_sessions)").fetchall()]
                    if cols:
                        if "session_code" not in cols:
                            cur.execute("ALTER TABLE cash_sessions ADD COLUMN session_code VARCHAR")
                        if "opening_notes" not in cols:
                            cur.execute("ALTER TABLE cash_sessions ADD COLUMN opening_notes TEXT")
                    
                    inv_cols = [c[1] for c in cur.execute("PRAGMA table_info(inventory_movements)").fetchall()]
                    if inv_cols:
                        if "from_location_id" not in inv_cols:
                            cur.execute("ALTER TABLE inventory_movements ADD COLUMN from_location_id VARCHAR")
                        if "to_location_id" not in inv_cols:
                            cur.execute("ALTER TABLE inventory_movements ADD COLUMN to_location_id VARCHAR")

                    sales_cols = [c[1] for c in cur.execute("PRAGMA table_info(sales)").fetchall()]
                    if sales_cols:
                        if "is_invoiced" not in sales_cols:
                            cur.execute("ALTER TABLE sales ADD COLUMN is_invoiced BOOLEAN DEFAULT 0")
                        if "invoice_status" not in sales_cols:
                            cur.execute("ALTER TABLE sales ADD COLUMN invoice_status VARCHAR DEFAULT 'NOT_INVOICED'")
                        if "customer_invoice_id" not in sales_cols:
                            cur.execute("ALTER TABLE sales ADD COLUMN customer_invoice_id VARCHAR")
                    connection.connection.commit()
                except Exception:
                    pass
            await conn.run_sync(migrate_sqlite)
