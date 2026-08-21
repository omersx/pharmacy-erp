from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from uuid import UUID

from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.auth.models import User
from pydantic import BaseModel, EmailStr
from typing import Optional

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    full_name_ar: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    full_name_ar: Optional[str] = None
    role: str
    phone: Optional[str] = None
    is_active: bool
    
    model_config = {"from_attributes": True}

router = APIRouter(tags=["users"])

@router.get("/", response_model=List[UserResponse])
async def list_users(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    result = await db.execute(select(User))
    return result.scalars().all()

@router.get("/{id}", response_model=UserResponse)
async def get_user(id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = await db.get(User, id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.put("/{id}", response_model=UserResponse)
async def update_user(id: UUID, data: UserUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin" and current_user.id != id:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    user = await db.get(User, id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
        
    await db.commit()
    await db.refresh(user)
    return user

@router.delete("/{id}")
async def delete_user(id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
        
    user = await db.get(User, id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.is_active = False
    await db.commit()
    return {"message": "User deleted successfully"}