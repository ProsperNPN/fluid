"""Recipient isolation, diagnostics and actual referral outcomes in PostgreSQL."""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import pytest
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import async_sessionmaker
from app.core.config import settings
from app.core.security import decode_token, create_access_token
from app.models import Notification, BloodRequest, RequestNotificationReceipt, DonorProfile, User, HospitalMembership
from app.services.notification_stream import event_stream
from app.services.blood_matching import precise_distance_km, exclusion_reasons
from tests.test_portal_journey import approved_hospital, register
from tests.test_intelligent_matching import donor, request


@pytest.fixture(autouse=True)
def safe_policy(monkeypatch):
    monkeypatch.setattr(settings, "DONATION_POLICY_APPROVED", True)
    monkeypatch.setattr(settings, "ALERT_EMAIL_ENABLED", False)
    monkeypatch.setattr(settings, "ALERT_SMS_ENABLED", False)


@pytest.mark.asyncio
async def test_automatic_recipients_isolation_diagnostics_ack_and_response(client, db_session, admin_headers):
    _, hospital, _ = await approved_hospital(client, db_session)
    _, other, _ = await approved_hospital(client, db_session, "isolation-hospital-b@test.invalid")
    uid, a = await donor(client, "isolation-a", km=0)
    _, b = await donor(client, "isolation-b", km=0, blood_type="B+")
    _, c = await donor(client, "isolation-c", km=25, preferred_radius_km=10)
    _, d = await donor(client, "isolation-d", km=0, matching_opt_in=False)
    rid = await request(client, hospital)
    listing = (await client.get("/api/v1/notifications", headers=a)).json()
    card = next(n for n in listing["items"] if n["payload"] and n["payload"].get("request_id") == rid)
    assert card["payload"]["distance_km"] == 0
    for headers in (b, c, d, other, admin_headers):
        result = await client.get("/api/v1/notifications", headers=headers)
        assert card["id"] not in str(result.json())
        for method, path in [("patch", f"/{card['id']}/read"), ("patch", f"/{card['id']}/unread"), ("delete", f"/{card['id']}")]:
            assert (await getattr(client, method)("/api/v1/notifications" + path, headers=headers)).status_code == 404
        await client.post("/api/v1/notifications/received", headers=headers, json={"ids": [card["id"]]})
    await db_session.refresh(await db_session.get(Notification, card["id"]))
    assert (await db_session.get(Notification, card["id"])).received_at is None
    assert (await client.patch("/api/v1/notifications/read-all", headers=b)).status_code == 204
    assert not (await client.get("/api/v1/notifications", headers=a)).json()["items"][0]["is_read"]
    assert (await client.post("/api/v1/notifications/received", headers=a, json={"ids": [card["id"]]})).status_code == 204
    assert (await client.patch(f"/api/v1/notifications/{card['id']}/read", headers=a)).status_code == 200
    detail = await client.get(f"/api/v1/blood-requests/{rid}/notification-diagnostics", headers=hospital)
    assert detail.status_code == 200, detail.text
    data = detail.json()
    assert data["current"]["matched"] == 1 and data["evidence"]["client_acknowledged"] == 1
    assert data["current"]["exclusion_reasons"]["component_incompatible"] == 1
    assert data["current"]["exclusion_reasons"]["matching_consent_missing"] == 1
    assert "latitude" not in detail.text and uid not in detail.text
    assert (await client.get(f"/api/v1/blood-requests/{rid}/notification-diagnostics", headers=other)).status_code == 404
    assert (await client.get(f"/api/v1/blood-requests/{rid}/notification-diagnostics", headers=a)).status_code == 403
    assert (await client.post(f"/api/v1/donor-matches/{rid}/responses/accepted", headers=a)).status_code == 200
    assert any(n["type"] == "emergency_update" and "Donor" in n["title"] for n in (await client.get("/api/v1/notifications", headers=hospital)).json()["items"])
    assert not (await client.get("/api/v1/notifications", headers=other)).json()["items"]
    assert "no-store" in (await client.get("/api/v1/notifications/state", headers=a)).headers["cache-control"]


@pytest.mark.asyncio
async def test_routine_pagination_and_durable_deduplication(client, db_session):
    from app.api.v1.endpoints.blood_requests import _notify_compatible_donors
    _, hospital, _ = await approved_hospital(client, db_session)
    # Bulk synthetic profiles avoid hashing 101 passwords; no real accounts are used.
    for index in range(101):
        user = User(email=f"bulk-{index}@test.invalid", hashed_password="not-a-login-password", role="donor", is_active=True)
        db_session.add(user)
        await db_session.flush()
        db_session.add(DonorProfile(user_id=user.id, blood_type="A+", blood_type_known=True,
            matching_opt_in=True, is_available=True, latitude=5.6, longitude=-.18, preferred_radius_km=25))
    await db_session.commit()
    now = datetime.now(timezone.utc)
    result = await client.post("/api/v1/blood-requests", headers=hospital, json={
        "blood_type":"A+", "component":"red_cells", "units":1, "urgency":"routine", "status":"published",
        "location":"Synthetic facility", "latitude":5.6, "longitude":-.18,
        "expires_at":(now+timedelta(hours=4)).isoformat(), "required_by":(now+timedelta(hours=5)).isoformat()})
    assert result.status_code == 201, result.text
    rid = result.json()["id"]
    assert await db_session.scalar(select(func.count(RequestNotificationReceipt.id))) == 101
    card = await db_session.scalar(select(Notification).where(Notification.type == "blood_request"))
    await db_session.delete(card)
    await db_session.commit()
    item = await db_session.get(BloodRequest, rid)
    await db_session.execute(select(BloodRequest.id).where(BloodRequest.id == rid).with_for_update())
    await _notify_compatible_donors(db_session, item)
    await db_session.commit()
    assert await db_session.scalar(select(func.count(RequestNotificationReceipt.id))) == 101
    assert await db_session.scalar(select(func.count(Notification.id)).where(Notification.type == "blood_request")) == 100


@pytest.mark.asyncio
async def test_two_live_sessions_expiry_revocation_and_no_cross_account_state(client, db_session):
    uid, a = await donor(client, "stream-owner", km=0)
    _, b = await donor(client, "stream-other", km=0)
    login = await client.post("/api/v1/auth/login", json={"email":"matching-stream-owner@journey.test", "password":"Testing-secure-123!"})
    second = {"Authorization": "Bearer " + login.json()["access_token"]}
    db_session.add(Notification(user_id=uid, title="Private synthetic card", message="Test"))
    await db_session.commit()
    factory = async_sessionmaker(db_session.bind, expire_on_commit=False)
    class Connected:
        async def is_disconnected(self): return False
    sid_a = decode_token(a["Authorization"].split()[1]).sid
    sid_second = decode_token(login.json()["access_token"]).sid
    one = event_stream(factory, uid, Connected(), session_id=sid_a)
    two = event_stream(factory, uid, Connected(), session_id=sid_second)
    assert "event: sync" in await anext(one)
    assert "event: sync" in await anext(two)
    await one.aclose(); await two.aclose()
    assert (await client.get("/api/v1/notifications/state", headers=b)).json()["unread_count"] == 0
    assert (await client.post("/api/v1/auth/logout", headers=second, json={"refresh_token":login.json()["refresh_token"]})).status_code == 200
    assert (await client.get("/api/v1/notifications/stream", headers=second)).status_code == 401
    closed = event_stream(factory, uid, Connected(), session_id=sid_second)
    with pytest.raises(StopAsyncIteration): await anext(closed)
    assert (await client.get("/api/v1/notifications", headers=a)).status_code == 200
    expired, _ = create_access_token(uid, {"exp":int((datetime.now(timezone.utc)-timedelta(seconds=1)).timestamp()), "sid":sid_a})
    for headers in ({}, {"Authorization":"Bearer invalid"}, {"Authorization":"Bearer " + expired}):
        assert (await client.get("/api/v1/notifications/stream", headers=headers)).status_code == 401
    assert (await client.get("/api/v1/notifications/stream?token=" + login.json()["access_token"])).status_code == 401


@pytest.mark.parametrize("km", [0, 5, 10, 25, 50, 100])
def test_exact_distance_and_invalid_coordinate_exclusion(km):
    from tests.test_blood_matching import profile, request as blood_request
    from math import degrees
    latitude = degrees(km/6371)
    measured = precise_distance_km(0, 0, latitude, 0)
    assert measured == pytest.approx(km, abs=1e-9)
    donor_profile = profile(latitude=float("nan"))
    assert "donor_location_missing_or_invalid" in exclusion_reasons(donor_profile, blood_request())


@pytest.mark.asyncio
async def test_clinical_policy_block_is_visible_and_never_bypassed(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "DONATION_POLICY_APPROVED", False)
    _, hospital, _ = await approved_hospital(client, db_session)
    _, a = await donor(client, "policy-blocked", km=0)
    rid = await request(client, hospital)
    assert not (await client.get("/api/v1/notifications", headers=a)).json()["items"]
    status = (await client.get("/api/v1/donor-matches/readiness", headers=a)).json()
    assert any("clinical policy" in reason for reason in status["reasons"])
    result = (await client.get(f"/api/v1/blood-requests/{rid}/notification-diagnostics", headers=hospital)).json()
    assert result["last_execution"]["status"] == "blocked_by_clinical_policy"
    assert result["last_execution"]["notifications_created"] == 0
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    assert (await client.get(f"/api/v1/blood-requests/{rid}/notification-diagnostics", headers=hospital)).status_code == 404


@pytest.mark.asyncio
async def test_notification_migration_preserves_legacy_history_and_backfills_dedup(db_session, client):
    import importlib.util
    import json
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import text
    _, hospital, _ = await approved_hospital(client, db_session)
    uid, _ = await donor(client, "legacy-notification", km=0)
    rid = await request(client, hospital)
    item = await db_session.get(BloodRequest, rid)
    item.urgency = "routine"
    await db_session.commit()
    path = Path(__file__).resolve().parents[1] / "alembic/versions/20261019_0017_notification_isolation.py"
    spec = importlib.util.spec_from_file_location("notification_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    def round_trip(connection):
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
            for nid in ("legacy-first", "legacy-second"):
                connection.execute(text("""INSERT INTO notifications (id,user_id,type,title,message,related_path)
                    VALUES (:id,:uid,'blood_request','Legacy routine','Synthetic legacy history',:path)"""),
                    {"id":nid,"uid":uid,"path":f"/donor/requests?request={rid}"})
            before = connection.scalar(text("select count(*) from notifications"))
            migration.upgrade()
            assert connection.scalar(text("select count(*) from notifications")) == before
            assert connection.scalar(text("select count(*) from request_notification_receipts")) == 1
            assert connection.scalar(text("select blood_request_id from request_notification_receipts")) == rid
    async with db_session.bind.begin() as connection:
        await connection.run_sync(round_trip)
