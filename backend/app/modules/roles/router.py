from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.auth.models import User
from app.modules.roles.models import Role, Permission, role_permissions
from app.modules.roles.schemas import (
    RoleCreate, RoleUpdate, RoleResponse, PermissionResponse, PermissionsByModule
)
from typing import List
from collections import defaultdict

router = APIRouter(tags=["roles"])

@router.get("/permissions/all", response_model=List[PermissionResponse])
async def list_permissions(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Permission).order_by(Permission.module, Permission.action))
    return result.scalars().all()

@router.get("/permissions/by-module", response_model=List[PermissionsByModule])
async def list_permissions_by_module(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Permission).order_by(Permission.module, Permission.action))
    perms = result.scalars().all()
    grouped = defaultdict(list)
    for perm in perms:
        grouped[perm.module].append(PermissionResponse.model_validate(perm))
    return [
        PermissionsByModule(module=module, permissions=permissions)
        for module, permissions in grouped.items()
    ]

@router.get("/", response_model=List[RoleResponse])
async def list_roles(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Role).order_by(Role.sort_order))
    return result.scalars().all()

@router.get("/{role_id}", response_model=RoleResponse)
async def get_role(role_id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    role = await db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role

@router.post("/", response_model=RoleResponse)
async def create_role(data: RoleCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = await db.execute(select(Role).where(Role.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Role name already exists")
    role = Role(
        name=data.name, display_name=data.display_name,
        display_name_ar=data.display_name_ar, description=data.description,
        description_ar=data.description_ar, color=data.color, sort_order=data.sort_order,
    )
    if data.permission_ids:
        result = await db.execute(select(Permission).where(Permission.id.in_([str(pid) for pid in data.permission_ids])))
        role.permissions = list(result.scalars().all())
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return role

@router.put("/{role_id}", response_model=RoleResponse)
async def update_role(role_id: UUID, data: RoleUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    role = await db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    update_data = data.model_dump(exclude_unset=True)
    permission_ids = update_data.pop('permission_ids', None)
    for key, value in update_data.items():
        setattr(role, key, value)
    if permission_ids is not None:
        result = await db.execute(select(Permission).where(Permission.id.in_([str(pid) for pid in permission_ids])))
        role.permissions = list(result.scalars().all())
    await db.commit()
    await db.refresh(role)
    return role

@router.delete("/{role_id}")
async def delete_role(role_id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    role = await db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system roles")
    await db.delete(role)
    await db.commit()
    return {"detail": "Role deleted"}
