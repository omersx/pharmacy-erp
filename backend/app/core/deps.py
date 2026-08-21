from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import verify_token
from app.core.exceptions import AuthError, PermissionError
from app.modules.auth.models import User

async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get("access_token")
    if not token:
        raise AuthError("Not authenticated")
    try:
        payload = verify_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise AuthError("Invalid token")
        
        import uuid
        try:
            uid = uuid.UUID(user_id)
        except:
            uid = user_id
            
        result = await db.execute(select(User).where(User.id == uid))
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            raise AuthError("User not found or inactive")
        return user
    except Exception:
        raise AuthError("Invalid or expired token")

def require_role(*roles):
    async def role_checker(current_user: User = Depends(get_current_user)):
        user_role = current_user.role.upper() if current_user.role else ""
        allowed_roles = [r.upper() for r in roles]
        if user_role not in allowed_roles and user_role not in ["SUPER_ADMIN", "ADMIN"]:
            raise PermissionError("Not enough permissions")
        return current_user
    return role_checker

def require_permission(permission: str):
    async def permission_checker(current_user: User = Depends(get_current_user)):
        # Granular check logic here
        user_role = current_user.role.upper() if current_user.role else ""
        if user_role not in ["SUPER_ADMIN", "ADMIN"]:
            raise PermissionError("Not enough permissions")
        return current_user
    return permission_checker
