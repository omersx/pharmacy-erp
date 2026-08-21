from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import init_db
from app.core.exceptions import AppException, app_exception_handler

# Ensure all models are imported before init_db
from app.modules.auth.models import User
from app.modules.organizations.models import Branch
from app.modules.medicines.models import Medicine, MedicineCategory, MedicineBatch
from app.modules.suppliers.models import Supplier
from app.modules.inventory.models import InventoryMovement
from app.modules.sales.models import Sale, SaleItem, HeldSale
from app.modules.customers.models import Customer, CustomerPayment
from app.modules.cash_sessions.models import CashSession
from app.modules.roles.models import Role, Permission
from app.modules.admin.models import AuditLog
from app.modules.notifications.models import Notification

from app.modules.auth.router import router as auth_router
from app.modules.organizations.router import router as org_router
from app.modules.medicines.router import router as medicine_router
from app.modules.sales.router import router as sales_router
from app.modules.inventory.router import router as inventory_router
from app.modules.suppliers.router import router as suppliers_router
from app.modules.customers.router import router as customers_router
from app.modules.cash_sessions.router import router as cash_sessions_router
from app.modules.reports.router import router as reports_router
from app.modules.users.router import router as users_router
from app.modules.roles.router import router as roles_router
from app.modules.admin.router import router as admin_router
from app.modules.notifications.router import router as notifications_router

app = FastAPI(title=settings.APP_NAME)
app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.add_exception_handler(AppException, app_exception_handler)

app.include_router(auth_router, prefix="/api/v1/auth")
app.include_router(org_router, prefix="/api/v1/branches")
app.include_router(medicine_router, prefix="/api/v1/medicines")
app.include_router(sales_router, prefix="/api/v1/sales")
app.include_router(inventory_router, prefix="/api/v1/inventory")
app.include_router(suppliers_router, prefix="/api/v1/suppliers")
app.include_router(customers_router, prefix="/api/v1/customers")
app.include_router(cash_sessions_router, prefix="/api/v1/cash-sessions")
app.include_router(reports_router, prefix="/api/v1/reports")
app.include_router(users_router, prefix="/api/v1/users")
app.include_router(roles_router, prefix="/api/v1/roles")
app.include_router(admin_router, prefix="/api/v1/admin")
app.include_router(notifications_router, prefix="/api/v1/notifications")

@app.on_event("startup")
async def startup():
    await init_db()
