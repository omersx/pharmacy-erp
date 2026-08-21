from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.admin.models import AuditLog
from app.modules.auth.models import User
from typing import Optional

async def log_action(
    db: AsyncSession,
    action: str,
    module: str,
    details: str,
    user: Optional[User] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    ip_address: Optional[str] = None
):
    """Log an audit action to the database."""
    log = AuditLog(
        user_id=user.id if user else None,
        user_email=user.email if user else "System",
        action=action,
        module=module,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        details=details,
        ip_address=ip_address
    )
    db.add(log)
    # Don't commit here — let the caller's transaction handle it
    # But for standalone audit logs (like login), we flush
    try:
        await db.flush()
    except Exception:
        pass
