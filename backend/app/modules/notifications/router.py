from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func, or_
from typing import List
from uuid import UUID

from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.auth.models import User
from app.modules.notifications.models import Notification
from app.modules.notifications.schemas import NotificationResponse, UnreadCountResponse

router = APIRouter(tags=["Notifications"])

@router.get("/", response_model=List[NotificationResponse])
async def get_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = (
        select(Notification)
        .where(or_(Notification.user_id == current_user.id, Notification.user_id == None))
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = (
        select(func.count(Notification.id))
        .where(
            or_(Notification.user_id == current_user.id, Notification.user_id == None),
            Notification.is_read == False
        )
    )
    result = await db.execute(stmt)
    count = result.scalar() or 0
    return {"unread_count": count}

@router.patch("/{id}/read")
async def mark_as_read(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = (
        update(Notification)
        .where(Notification.id == id)
        .where(or_(Notification.user_id == current_user.id, Notification.user_id == None))
        .values(is_read=True)
    )
    await db.execute(stmt)
    await db.commit()
    return {"status": "success"}

@router.post("/read-all")
async def mark_all_as_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = (
        update(Notification)
        .where(or_(Notification.user_id == current_user.id, Notification.user_id == None))
        .where(Notification.is_read == False)
        .values(is_read=True)
    )
    await db.execute(stmt)
    await db.commit()
    return {"status": "success"}

@router.delete("/{id}")
async def delete_notification(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = (
        delete(Notification)
        .where(Notification.id == id)
        .where(or_(Notification.user_id == current_user.id, Notification.user_id == None))
    )
    await db.execute(stmt)
    await db.commit()
    return {"status": "success"}
