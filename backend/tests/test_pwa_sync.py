import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import get_db
import uuid
from datetime import datetime

@pytest.mark.asyncio
async def test_pwa_meta_and_health():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Health check
        res_health = await client.get("/api/v1/health/live")
        assert res_health.status_code == 200
        assert res_health.json()["live"] is True

        # Meta configuration flags
        res_meta = await client.get("/api/v1/meta")
        assert res_meta.status_code == 200
        data = res_meta.json()
        assert data["offline_enabled"] is True
        assert data["offline_sales_enabled"] is True
        assert "server_time" in data

@pytest.mark.asyncio
async def test_pwa_catalog_bootstrap_and_delta(test_db):
    async def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Bootstrap snapshot
            res = await client.get("/api/v1/catalog/bootstrap")
            assert res.status_code == 200
            data = res.json()
            assert "cursor" in data
            assert isinstance(data["medicines"], list)
            assert isinstance(data["batches"], list)

            # Delta sync
            cursor = data["cursor"]
            res_delta = await client.get(f"/api/v1/catalog/delta?since={cursor}")
            assert res_delta.status_code == 200
            delta_data = res_delta.json()
            assert "cursor" in delta_data
            assert isinstance(delta_data["medicines"], list)
            assert isinstance(delta_data["deleted_medicine_ids"], list)
    finally:
        app.dependency_overrides.pop(get_db, None)

@pytest.mark.asyncio
async def test_pwa_device_heartbeat(test_db):
    async def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db
    try:
        transport = ASGITransport(app=app)
        device_id = str(uuid.uuid4())
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                f"/api/v1/devices/{device_id}/heartbeat",
                json={
                    "client_version": "1.3.4",
                    "pending_sales": 2,
                    "storage": {"usage_mb": 15, "quota_mb": 2048, "persisted": True},
                },
            )
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "ok"
            assert "server_time" in data
    finally:
        app.dependency_overrides.pop(get_db, None)

@pytest.mark.asyncio
async def test_pwa_sales_sync_idempotency(test_db):
    async def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db
    try:
        transport = ASGITransport(app=app)
        device_id = str(uuid.uuid4())
        client_sale_id = str(uuid.uuid4())
        branch_id = str(uuid.uuid4())
        cashier_id = str(uuid.uuid4())

        payload = {
            "device_id": device_id,
            "client_version": "1.3.4",
            "items": [
                {
                    "client_sale_id": client_sale_id,
                    "branch_id": branch_id,
                    "cashier_id": cashier_id,
                    "created_at_device": datetime.utcnow().isoformat(),
                    "provisional_no": "PROV-TEST-001",
                    "lines": [],
                    "payments": [{"method": "cash", "amount": "10.00"}],
                    "totals": {"subtotal": "10.00", "tax": "0.00", "discount": "0.00", "total": "10.00"},
                }
            ],
        }

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # First sync attempt
            res1 = await client.post("/api/v1/sync/sales", json=payload)
            assert res1.status_code == 200
            results1 = res1.json()["results"]
            assert len(results1) == 1
            assert results1[0]["client_sale_id"] == client_sale_id

            # Second sync attempt with SAME client_sale_id (must return duplicate, not double charge)
            res2 = await client.post("/api/v1/sync/sales", json=payload)
            assert res2.status_code == 200
            results2 = res2.json()["results"]
            assert len(results2) == 1
            assert results2[0]["client_sale_id"] == client_sale_id
            assert results2[0]["status"] == "duplicate"
    finally:
        app.dependency_overrides.pop(get_db, None)
