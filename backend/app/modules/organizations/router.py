from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import uuid

from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.auth.models import User
from app.modules.organizations.models import Branch
from app.modules.organizations.schemas import BranchCreate, BranchUpdate, BranchResponse

router = APIRouter()

@router.post("/", response_model=BranchResponse)
async def create_branch(branch: BranchCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_branch = Branch(**branch.model_dump())
    db.add(db_branch)
    await db.commit()
    await db.refresh(db_branch)
    return db_branch

@router.get("/", response_model=List[BranchResponse])
async def list_branches(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Branch))
    return result.scalars().all()

@router.get("/{id}", response_model=BranchResponse)
async def get_branch(id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Branch).where(Branch.id == id))
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    return branch

@router.put("/{id}", response_model=BranchResponse)
async def update_branch(id: uuid.UUID, branch: BranchUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Branch).where(Branch.id == id))
    db_branch = result.scalar_one_or_none()
    if not db_branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    
    update_data = branch.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_branch, key, value)
        
    await db.commit()
    await db.refresh(db_branch)
    return db_branch
