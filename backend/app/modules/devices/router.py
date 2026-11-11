from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.auth.models import User
from app.modules.devices.models import Device
from app.modules.devices.schemas import (
    DeviceRegisterRequest,
    DeviceResponse,
    DeviceHeartbeatRequest,
    DeviceHeartbeatResponse,
    AppMetaResponse,
)
from typing import List, Optional
from uuid import UUID
from datetime import datetime

router = APIRouter(tags=["PWA Devices & Sync"])

@router.get("/meta", response_model=AppMetaResponse)
async def get_app_meta():
    """
    Returns PWA configuration flags, offline parameters, and minimum supported client version.
    """
    return AppMetaResponse(
        offline_enabled=True,
        offline_sales_enabled=True,
        offline_valid_hours=12,
        invoice_numbering_mode="provisional",
        catalog_stale_warn_hours=24,
        catalog_stale_block_hours=72,
        sw_kill=False,
        min_client_version="1.3.4",
        server_time=datetime.utcnow(),
    )

@router.post("/devices/register", response_model=DeviceResponse)
async def register_device(
    payload: DeviceRegisterRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_current_user),
):
    """
    Registers a new till terminal or mobile scanner device.
    """
    new_device = Device(
        branch_id=payload.branch_id,
        name=payload.name,
        public_key=payload.public_key,
        registered_by=user.id if user else None,
        client_version=payload.client_version,
        last_seen_at=datetime.utcnow(),
    )
    db.add(new_device)
    await db.commit()
    await db.refresh(new_device)

    return DeviceResponse(
        id=new_device.id,
        branch_id=new_device.branch_id,
        name=new_device.name,
        client_version=new_device.client_version,
        last_seen_at=new_device.last_seen_at,
        is_active=new_device.is_active,
        is_revoked=new_device.revoked_at is not None,
        wipe_requested=new_device.wipe_requested_at is not None,
    )

@router.post("/devices/{device_id}/heartbeat", response_model=DeviceHeartbeatResponse)
async def device_heartbeat(
    device_id: UUID,
    payload: DeviceHeartbeatRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Receives device telemetry (storage health, pending sales count) and checks
    if wipe or revocation was requested.
    """
    res = await db.execute(select(Device).where(Device.id == device_id))
    device = res.scalar_one_or_none()

    if not device:
        # If device not found, create a placeholder device entry
        device = Device(
            id=device_id,
            branch_id=UUID("00000000-0000-0000-0000-000000000000"),
            name="Auto-registered Terminal",
            client_version=payload.client_version,
            last_seen_at=datetime.utcnow(),
        )
        db.add(device)
    else:
        device.last_seen_at = datetime.utcnow()
        device.client_version = payload.client_version

    await db.commit()

    is_revoked = device.revoked_at is not None
    wipe_requested = device.wipe_requested_at is not None

    return DeviceHeartbeatResponse(
        status="ok",
        wipe_requested=wipe_requested,
        is_revoked=is_revoked,
        server_time=datetime.utcnow(),
    )

@router.get("/devices", response_model=List[DeviceResponse])
async def list_devices(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Lists all registered devices for management and audit.
    """
    res = await db.execute(select(Device).order_by(Device.last_seen_at.desc()))
    devices = res.scalars().all()

    return [
        DeviceResponse(
            id=d.id,
            branch_id=d.branch_id,
            name=d.name,
            client_version=d.client_version,
            last_seen_at=d.last_seen_at,
            is_active=d.is_active,
            is_revoked=d.revoked_at is not None,
            wipe_requested=d.wipe_requested_at is not None,
        )
        for d in devices
    ]
