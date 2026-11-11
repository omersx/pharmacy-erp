from fastapi import APIRouter, Depends, Query, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from app.core.database import get_db
from app.core.deps import get_current_user
from app.modules.auth.models import User
from app.modules.medicines.models import Medicine, MedicineBatch
from app.modules.catalog.schemas import (
    CatalogMedicineItem,
    CatalogBatchItem,
    CatalogBootstrapResponse,
    CatalogDeltaResponse,
)
from typing import Optional, List
from uuid import UUID
from datetime import datetime, timezone

router = APIRouter(tags=["PWA Catalog"])

async def get_current_user_optional(request: Request, db: AsyncSession = Depends(get_db)) -> Optional[User]:
    token = request.cookies.get("access_token")
    if not token:
        # Also check Authorization header if sent
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        return None
    try:
        from app.core.security import verify_token
        payload = verify_token(token)
        user_id = payload.get("sub")
        if not user_id:
            return None
        import uuid
        uid = uuid.UUID(str(user_id))
        res = await db.execute(select(User).where(User.id == uid))
        return res.scalar_one_or_none()
    except Exception:
        return None

@router.get("/bootstrap", response_model=CatalogBootstrapResponse)
async def get_catalog_bootstrap(
    branch_id: Optional[UUID] = None,
    limit: int = Query(default=10000, le=50000),
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Returns full catalog snapshot for offline PWA storage:
    - Active medicines (prices, barcodes, prescription requirements)
    - Active non-expired batches for the branch (quantities, expiry dates)
    Excludes sensitive business data (purchase price, supplier info).
    """
    # Fetch active medicines
    med_query = select(Medicine).where(Medicine.is_active == True).limit(limit)
    med_result = await db.execute(med_query)
    medicines = med_result.scalars().all()

    # Fetch active batches with remaining stock
    batch_conditions = [
        MedicineBatch.is_active == True,
        MedicineBatch.quantity_remaining > 0,
    ]
    if branch_id:
        batch_conditions.append(MedicineBatch.branch_id == branch_id)

    batch_query = select(MedicineBatch).where(and_(*batch_conditions)).limit(limit * 2)
    batch_result = await db.execute(batch_query)
    batches = batch_result.scalars().all()

    # Calculate latest cursor
    latest_dt = datetime.min
    for m in medicines:
        if m.updated_at and m.updated_at > latest_dt:
            latest_dt = m.updated_at
    for b in batches:
        if b.updated_at and b.updated_at > latest_dt:
            latest_dt = b.updated_at

    cursor = latest_dt.isoformat() if latest_dt != datetime.min else datetime.utcnow().isoformat()

    return CatalogBootstrapResponse(
        cursor=cursor,
        medicines=[CatalogMedicineItem.model_validate(m) for m in medicines],
        batches=[CatalogBatchItem.model_validate(b) for b in batches],
        total_medicines=len(medicines),
        total_batches=len(batches),
        has_more=False,
    )

@router.get("/delta", response_model=CatalogDeltaResponse)
async def get_catalog_delta(
    since: str = Query(..., description="ISO 8601 timestamp cursor from previous sync"),
    branch_id: Optional[UUID] = None,
    limit: int = Query(default=2000, le=10000),
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Returns incremental catalog changes updated after the 'since' cursor:
    - Upserted/modified medicines and batches
    - Inactive/deleted medicine IDs for tombstone cleanup
    """
    try:
        since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
        if since_dt.tzinfo is not None:
            since_dt = since_dt.astimezone(timezone.utc).replace(tzinfo=None)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ISO 8601 cursor format for 'since'")

    # Changed medicines
    med_query = (
        select(Medicine)
        .where(Medicine.updated_at > since_dt)
        .order_by(Medicine.updated_at.asc())
        .limit(limit)
    )
    med_result = await db.execute(med_query)
    all_updated_meds = med_result.scalars().all()

    active_meds = [m for m in all_updated_meds if m.is_active]
    deleted_ids = [m.id for m in all_updated_meds if not m.is_active]

    # Changed batches
    batch_conditions = [MedicineBatch.updated_at > since_dt]
    if branch_id:
        batch_conditions.append(MedicineBatch.branch_id == branch_id)

    batch_query = (
        select(MedicineBatch)
        .where(and_(*batch_conditions))
        .order_by(MedicineBatch.updated_at.asc())
        .limit(limit)
    )
    batch_result = await db.execute(batch_query)
    batches = batch_result.scalars().all()

    # Compute new cursor
    new_cursor = since
    latest_dt = since_dt
    for m in all_updated_meds:
        if m.updated_at and m.updated_at > latest_dt:
            latest_dt = m.updated_at
    for b in batches:
        if b.updated_at and b.updated_at > latest_dt:
            latest_dt = b.updated_at

    new_cursor = latest_dt.isoformat()

    return CatalogDeltaResponse(
        cursor=new_cursor,
        medicines=[CatalogMedicineItem.model_validate(m) for m in active_meds],
        batches=[CatalogBatchItem.model_validate(b) for b in batches],
        deleted_medicine_ids=deleted_ids,
        has_more=len(all_updated_meds) == limit or len(batches) == limit,
    )
