from fastapi import APIRouter, Depends, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.audit import log_action
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import verify_password, create_access_token, create_refresh_token, hash_password
from app.core.exceptions import AuthError
from app.modules.auth.models import User
from app.modules.auth.schemas import LoginRequest, RegisterRequest, UserResponse
from app.core.deps import get_current_user, require_role
from datetime import datetime, timedelta

router = APIRouter(tags=["Auth"])

@router.post("/login", response_model=UserResponse)
async def login(req: LoginRequest, response: Response, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise AuthError("Invalid credentials")
    
    user.last_login = datetime.utcnow()
    await db.commit()
    
    if req.remember_me:
        access_token_expires = timedelta(days=30)
        max_age = 30 * 24 * 60 * 60
    else:
        access_token_expires = None
        max_age = 120 * 60
        
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role},
        expires_delta=access_token_expires
    )
    refresh_token = create_refresh_token({"sub": str(user.id)})
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, samesite="lax", max_age=max_age)
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, samesite="lax", max_age=max_age)
    
    await log_action(
        db=db, action="LOGIN", module="Auth",
        details=f"User logged in: {user.email}",
        user=user, ip_address=request.client.host if request.client else None
    )
    await db.commit()
    
    return user

@router.post("/register", response_model=UserResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("SUPER_ADMIN"))):
    new_user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        full_name=req.full_name,
        full_name_ar=req.full_name_ar,
        role=req.role,
        phone=req.phone
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"message": "Logged out"}

@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return user
