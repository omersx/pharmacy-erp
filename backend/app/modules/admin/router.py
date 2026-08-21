from fastapi import APIRouter, Depends, Response, UploadFile, File, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, func, desc
from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.modules.auth.models import User
from app.core.security import hash_password
from app.modules.admin.models import AuditLog
from app.core.audit import log_action
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import shutil
import os
from pathlib import Path

router = APIRouter(tags=["Admin"])

# ─── Schemas ─────────────────────────────────────────────────────────
class AuditLogResponse(BaseModel):
    id: str
    user_email: Optional[str] = None
    action: str
    module: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    details: str
    ip_address: Optional[str] = None
    created_at: datetime
    model_config = {"from_attributes": True}

class AuditLogPage(BaseModel):
    items: List[AuditLogResponse]
    total: int
    page: int
    pages: int

class BackupInfo(BaseModel):
    filename: str
    size_bytes: int
    size_display: str
    created_at: str

BACKUP_DIR = Path("data/backups")
DB_PATH = Path("data/pharmacy.db")

# ═══════════════════════════════════════════════════════════════════
# AUDIT LOG ENDPOINTS
# ═══════════════════════════════════════════════════════════════════

@router.get("/audit-logs", response_model=AuditLogPage)
async def get_audit_logs(
    page: int = 1,
    per_page: int = 50,
    module: Optional[str] = None,
    action: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("SUPER_ADMIN", "ADMIN"))
):
    """Get paginated audit logs with optional filters."""
    query = select(AuditLog)
    count_query = select(func.count(AuditLog.id))
    
    if module and module != 'all':
        query = query.where(AuditLog.module == module)
        count_query = count_query.where(AuditLog.module == module)
    if action and action != 'all':
        query = query.where(AuditLog.action == action)
        count_query = count_query.where(AuditLog.action == action)
    if search:
        query = query.where(AuditLog.details.ilike(f"%{search}%"))
        count_query = count_query.where(AuditLog.details.ilike(f"%{search}%"))
    
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    pages = max(1, (total + per_page - 1) // per_page)
    
    query = query.order_by(desc(AuditLog.created_at)).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    items = result.scalars().all()
    
    return AuditLogPage(
        items=[AuditLogResponse(
            id=str(log.id),
            user_email=log.user_email,
            action=log.action,
            module=log.module,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            details=log.details,
            ip_address=log.ip_address,
            created_at=log.created_at
        ) for log in items],
        total=total,
        page=page,
        pages=pages
    )


# ═══════════════════════════════════════════════════════════════════
# BACKUP ENDPOINTS
# ═══════════════════════════════════════════════════════════════════

def _format_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"


@router.post("/backups", response_model=BackupInfo)
async def create_backup(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("SUPER_ADMIN"))
):
    """Create a new database backup."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"backup_{timestamp}.db"
    backup_path = BACKUP_DIR / backup_filename
    
    shutil.copy2(str(DB_PATH), str(backup_path))
    
    size = backup_path.stat().st_size
    
    await log_action(
        db=db, action="BACKUP", module="Admin",
        details=f"Database backup created: {backup_filename}",
        user=admin, ip_address=request.client.host if request.client else None
    )
    await db.commit()
    
    return BackupInfo(
        filename=backup_filename,
        size_bytes=size,
        size_display=_format_size(size),
        created_at=datetime.now().isoformat()
    )


@router.get("/backups", response_model=List[BackupInfo])
async def list_backups(
    admin: User = Depends(require_role("SUPER_ADMIN"))
):
    """List all available backups."""
    if not BACKUP_DIR.exists():
        return []
    
    backups = []
    for f in sorted(BACKUP_DIR.glob("*.db"), key=lambda x: x.stat().st_mtime, reverse=True):
        stat = f.stat()
        backups.append(BackupInfo(
            filename=f.name,
            size_bytes=stat.st_size,
            size_display=_format_size(stat.st_size),
            created_at=datetime.fromtimestamp(stat.st_mtime).isoformat()
        ))
    return backups


@router.get("/backups/{filename}/download")
async def download_backup(
    filename: str,
    admin: User = Depends(require_role("SUPER_ADMIN"))
):
    """Download a specific backup file."""
    backup_path = BACKUP_DIR / filename
    if not backup_path.exists() or not backup_path.name.endswith('.db'):
        raise HTTPException(status_code=404, detail="Backup not found")
    return FileResponse(str(backup_path), media_type="application/octet-stream", filename=filename)


@router.delete("/backups/{filename}")
async def delete_backup(
    filename: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("SUPER_ADMIN"))
):
    """Delete a backup file."""
    backup_path = BACKUP_DIR / filename
    if not backup_path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")
    backup_path.unlink()
    
    await log_action(
        db=db, action="DELETE", module="Admin",
        details=f"Backup deleted: {filename}",
        user=admin, ip_address=request.client.host if request.client else None
    )
    await db.commit()
    
    return {"message": f"Backup {filename} deleted"}


@router.post("/backups/restore")
async def restore_backup(
    file: UploadFile = File(...),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("SUPER_ADMIN"))
):
    """Restore database from an uploaded backup file. Creates a safety backup first."""
    if not file.filename.endswith('.db'):
        raise HTTPException(status_code=400, detail="Only .db files are accepted")
    
    # Create safety backup first
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    safety_name = f"pre_restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    shutil.copy2(str(DB_PATH), str(BACKUP_DIR / safety_name))
    
    await log_action(
        db=db, action="RESTORE", module="Admin",
        details=f"Database restore initiated from: {file.filename}. Safety backup: {safety_name}",
        user=admin, ip_address=request.client.host if request and request.client else None
    )
    await db.commit()
    
    # Write uploaded file to DB path
    content = await file.read()
    with open(str(DB_PATH), 'wb') as f:
        f.write(content)
    
    return {"message": "Database restored successfully. Please restart the server.", "safety_backup": safety_name}




@router.post("/wipe-data")
async def wipe_data(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("SUPER_ADMIN"))
):
    """
    Wipe all business data: medicines, batches, inventory, sales, cash sessions,
    customers, suppliers, purchase orders. Keeps users, roles, branches, and system settings.
    """
    # Order matters due to foreign key constraints
    tables_to_wipe = [
        "sale_items",
        "sales",
        "held_sales",
        "cash_movements",
        "cash_sessions",
        "inventory_movements",
        "medicine_batches",
        "medicines",
        "medicine_categories",
        "customers",
        "suppliers",
    ]
    
    for table in tables_to_wipe:
        try:
            await db.execute(text(f"DELETE FROM {table}"))
        except Exception:
            pass  # Table might not exist yet
    
    await db.commit()
    
    await log_action(
        db=db, action="WIPE", module="Admin",
        details="All business data wiped",
        user=admin, ip_address=request.client.host if request.client else None
    )
    await db.commit()
    
    return {"message": "All business data has been wiped successfully"}


@router.post("/factory-reset")
async def factory_reset(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("SUPER_ADMIN"))
):
    """
    Full factory reset: wipe ALL data including users, then recreate default admin.
    """
    # Wipe everything in the correct order
    tables_to_wipe = [
        "sale_items",
        "sales",
        "held_sales",
        "cash_movements",
        "cash_sessions",
        "inventory_movements",
        "medicine_batches",
        "medicines",
        "medicine_categories",
        "customers",
        "suppliers",
        "users",
        "role_permissions",
        "roles",
        "branches",
    ]
    
    for table in tables_to_wipe:
        try:
            await db.execute(text(f"DELETE FROM {table}"))
        except Exception:
            pass
    
    await db.commit()
    
    # Re-create default admin user
    from app.modules.auth.models import User as UserModel
    default_admin = UserModel(
        email="admin",
        password_hash=hash_password("admin"),
        full_name="Administrator",
        full_name_ar="المدير",
        role="SUPER_ADMIN",
        is_active=True,
    )
    db.add(default_admin)
    
    # Re-create default branch
    from app.modules.organizations.models import Branch
    default_branch = Branch(
        name="Main Branch",
        name_ar="الفرع الرئيسي",
        code="HQ",
        is_active=True,
    )
    db.add(default_branch)
    
    await db.commit()
    
    await db.commit()
    
    await log_action(
        db=db, action="RESET", module="Admin",
        details="Full factory reset performed",
        user=default_admin, ip_address=request.client.host if request.client else None
    )
    await db.commit()
    
    # Clear auth cookies
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    
    return {"message": "Factory reset complete. Please log in with admin/admin."}
