from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from uuid import UUID

from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.auth.models import User
from app.modules.suppliers.models import Supplier
from app.modules.suppliers.schemas import SupplierCreate, SupplierUpdate, SupplierResponse

router = APIRouter(tags=["suppliers"])

@router.get("/", response_model=List[SupplierResponse])
async def list_suppliers(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Supplier))
    return result.scalars().all()

@router.get("/{id}", response_model=SupplierResponse)
async def get_supplier(id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    supplier = await db.get(Supplier, id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier

@router.post("/", response_model=SupplierResponse)
async def create_supplier(data: SupplierCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    supplier = Supplier(**data.model_dump())
    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)
    return supplier

@router.put("/{id}", response_model=SupplierResponse)
async def update_supplier(id: UUID, data: SupplierUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    supplier = await db.get(Supplier, id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(supplier, key, value)
        
    await db.commit()
    await db.refresh(supplier)
    return supplier

@router.delete("/{id}")
async def delete_supplier(id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    supplier = await db.get(Supplier, id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    supplier.is_active = False
    await db.commit()
    return {"message": "Supplier deleted successfully"}