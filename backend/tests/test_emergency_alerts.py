"""Real PostgreSQL workflows; provider I/O is intercepted in provider tests only."""
from datetime import datetime, timezone, timedelta
import asyncio
import pytest
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import async_sessionmaker
from app.core.config import settings
from app.models import EmergencyAlert, AlertDelivery, Notification, BloodRequest, DonorProfile
from app.services.emergency_alerts import queue_alerts
from app.services.alert_worker import process_delivery, DeliveryFailure
from app.services.notification_stream import event_stream
from tests.test_intelligent_matching import donor, request
from tests.test_portal_journey import approved_hospital, register


@pytest.fixture(autouse=True)
def policy(monkeypatch):
    monkeypatch.setattr(settings, "DONATION_POLICY_APPROVED", True)
    monkeypatch.setattr(settings, "ALERT_EMAIL_ENABLED", False)
    monkeypatch.setattr(settings, "ALERT_SMS_ENABLED", False)


@pytest.mark.asyncio
async def test_emergency_flow_history_counts_escalation_and_terminal_stop(client, db_session, monkeypatch):
    _, hospital, _ = await approved_hospital(client, db_session)
    uid, person = await donor(client, "emergency-near", notify_email_alerts=True)
    far, far_person = await donor(client, "emergency-far", km=20)
    await donor(client, "emergency-incompatible", blood_type="B+")
    await donor(client, "emergency-muted", notify_urgent_requests=False)
    rid = await request(client, hospital)
    notifications = (await client.get("/api/v1/notifications", headers=person)).json()
    card = next(n for n in notifications["items"] if n["payload"])
    assert card["payload"]["can_respond"] and card["payload"]["distance_km"] == 5
    assert "latitude" not in str(card["payload"]) and "longitude" not in str(card["payload"])
    assert not (await client.get("/api/v1/notifications", headers=far_person)).json()["items"]
    assert (await client.post(f"/api/v1/emergencies/{rid}/escalate", headers=hospital)).status_code == 429
    monkeypatch.setattr(settings, "ALERT_ESCALATION_WAIT_SECONDS", 0)
    expanded = await client.post(f"/api/v1/emergencies/{rid}/escalate", headers=hospital)
    assert expanded.json() == {"radius_km": 25, "new_alerts": 1}
    assert (await client.post(f"/api/v1/donor-matches/{rid}/responses/accepted", headers=person)).status_code == 200
    assert (await client.post(f"/api/v1/donor-matches/{rid}/responses/accepted", headers=person)).status_code == 409
    assert (await client.post(f"/api/v1/donor-matches/{rid}/responses/declined", headers=far_person)).status_code == 200
    summary = (await client.get("/api/v1/emergencies", headers=hospital)).json()["items"][0]
    assert (summary["notified"], summary["responded"], summary["accepted"], summary["declined"]) == (2, 2, 1, 1)
    assert all("latitude" not in r and "phone" not in r for r in summary["responses"])
    before = (await client.get("/api/v1/notifications/state", headers=person)).json()["revision"]
    assert (await client.patch(f"/api/v1/notifications/{card['id']}/read", headers=person)).status_code == 200
    assert (await client.get("/api/v1/notifications/state", headers=person)).json()["revision"] != before
    assert (await client.patch(f"/api/v1/notifications/{card['id']}/unread", headers=person)).json()["is_read"] is False
    # Deleting history never deletes the recipient ledger or permits repeat alerts.
    await client.delete(f"/api/v1/notifications/{card['id']}", headers=person)
    item = await db_session.get(BloodRequest, rid)
    assert await queue_alerts(db_session, item) == 0
    await db_session.commit()
    assert (await db_session.execute(select(func.count(EmergencyAlert.id)))).scalar_one() == 2
    assert (await client.post(f"/api/v1/blood-requests/{rid}/cancel", headers=hospital)).status_code == 200
    assert (await client.post(f"/api/v1/emergencies/{rid}/escalate", headers=hospital)).status_code == 409
    cards = (await client.get("/api/v1/notifications", headers=far_person)).json()["items"]
    assert not next(n for n in cards if n["payload"])["payload"]["can_respond"]
    job = (await db_session.execute(select(AlertDelivery))).scalar_one()
    assert job.status == "cancelled"


@pytest.mark.asyncio
async def test_security_and_expiry(client, db_session):
    _, hospital, _ = await approved_hospital(client, db_session)
    _, person = await donor(client, "emergency-expiry")
    rid = await request(client, hospital)
    _, outsider = await register(client, "unverified-emergency@journey.test", "hospital")
    _, other, _ = await approved_hospital(client, db_session, "other-emergency@journey.test")
    assert (await client.get("/api/v1/notifications/stream")).status_code == 401
    assert (await client.get("/api/v1/emergencies", headers=outsider)).status_code == 403
    assert (await client.get("/api/v1/emergencies", headers=person)).status_code == 403
    assert (await client.post(f"/api/v1/emergencies/{rid}/escalate", headers=other)).status_code == 404
    notification = (await client.get("/api/v1/notifications", headers=person)).json()["items"][0]
    assert (await client.patch(f"/api/v1/notifications/{notification['id']}/read", headers=other)).status_code == 404
    item = await db_session.get(BloodRequest, rid)
    item.required_by = datetime.now(timezone.utc) - timedelta(seconds=1)
    await db_session.commit()
    await client.get("/api/v1/emergencies", headers=hospital)
    card = (await client.get("/api/v1/notifications", headers=person)).json()["items"][0]
    assert card["payload"]["status"] == "expired" and not card["payload"]["can_respond"]
    assert (await client.post(f"/api/v1/donor-matches/{rid}/responses/accepted", headers=person)).status_code == 409


@pytest.mark.asyncio
async def test_delivery_retries_provider_acceptance_and_no_real_messages(client, db_session, monkeypatch):
    from app.services import alert_worker
    _, hospital, _ = await approved_hospital(client, db_session)
    _, person = await donor(client, "emergency-outbox", notify_email_alerts=True)
    await request(client, hospital)
    factory = async_sessionmaker(db_session.bind, expire_on_commit=False)
    calls = []
    def failed(*args):
        calls.append(args[-1])
        raise DeliveryFailure("test_connect_failure", retry=True)
    monkeypatch.setattr(alert_worker, "send_email", failed)
    monkeypatch.setattr(settings, "ALERT_EMAIL_ENABLED", True)
    assert await process_delivery(factory)
    async with factory() as db:
        job = (await db.execute(select(AlertDelivery))).scalar_one()
        assert job.status == "retry" and job.attempts == 1
        job.next_attempt_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await db.commit()
    monkeypatch.setattr(alert_worker, "send_email", lambda *args: ("accepted", None))
    assert await process_delivery(factory)
    async with factory() as db:
        job = (await db.execute(select(AlertDelivery))).scalar_one()
        assert job.status == "accepted" and job.status != "delivered"
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_sse_catches_up_after_offline_and_persists_read_state(client, db_session):
    uid, person = await donor(client, "emergency-stream")
    factory = async_sessionmaker(db_session.bind, expire_on_commit=False)
    class Connected:
        async def is_disconnected(self): return False
    stream = event_stream(factory, uid, Connected())
    initial = await anext(stream)
    assert "event: sync" in initial
    await stream.aclose()  # Offline donor.
    _, hospital, _ = await approved_hospital(client, db_session)
    await request(client, hospital)
    reconnected = event_stream(factory, uid, Connected())
    catchup = await anext(reconnected)
    await reconnected.aclose()
    assert catchup != initial and '"unread_count": 1' in catchup
    assert (await client.get("/api/v1/notifications", headers=person)).json()["unread_count"] == 1


@pytest.mark.asyncio
async def test_concurrent_fanout_workers_and_consent_revocation(client, db_session, monkeypatch):
    from app.services import alert_worker
    _, hospital, _ = await approved_hospital(client, db_session)
    uid, _ = await donor(client, "emergency-concurrent", km=20, notify_email_alerts=True)
    rid = await request(client, hospital)
    factory = async_sessionmaker(db_session.bind, expire_on_commit=False)
    async def fanout():
        async with factory() as db:
            item = (await db.execute(select(BloodRequest).where(BloodRequest.id == rid).with_for_update())).scalar_one()
            item.alert_radius_km = 25
            count = await queue_alerts(db, item)
            await db.commit()
            return count
    assert sorted(await asyncio.gather(fanout(), fanout())) == [0, 1]
    async with factory() as db:
        profile = (await db.execute(select(DonorProfile).where(DonorProfile.user_id == uid))).scalar_one()
        profile.notify_email_alerts = False
        await db.commit()
    def forbidden(*args):
        pytest.fail("Consent revoked: no provider may be called")
    monkeypatch.setattr(alert_worker, "send_email", forbidden)
    monkeypatch.setattr(settings, "ALERT_EMAIL_ENABLED", True)
    await asyncio.gather(process_delivery(factory), process_delivery(factory))
    async with factory() as db:
        job = (await db.execute(select(AlertDelivery))).scalar_one()
        assert job.status == "cancelled" and job.attempts == 0


@pytest.mark.asyncio
async def test_ambiguous_send_is_not_retried(client, db_session, monkeypatch):
    from app.services import alert_worker
    _, hospital, _ = await approved_hospital(client, db_session)
    await donor(client, "emergency-ambiguous", notify_email_alerts=True)
    await request(client, hospital)
    factory = async_sessionmaker(db_session.bind, expire_on_commit=False)
    calls = []
    def ambiguous(*args):
        calls.append(1)
        raise DeliveryFailure("test_ambiguous_send", ambiguous=True)
    monkeypatch.setattr(alert_worker, "send_email", ambiguous)
    monkeypatch.setattr(settings, "ALERT_EMAIL_ENABLED", True)
    assert await process_delivery(factory)
    assert not await process_delivery(factory)
    async with factory() as db:
        job = (await db.execute(select(AlertDelivery))).scalar_one()
        assert job.status == "unknown"
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_sms_provider_requires_actual_delivered_status(monkeypatch):
    import httpx
    from app.services import alert_worker
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "ACtest")
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "test-only")
    monkeypatch.setattr(settings, "TWILIO_FROM_NUMBER", "+233200000000")
    real_client = httpx.AsyncClient
    calls = []
    def provider(request):
        calls.append(request.method)
        return httpx.Response(200, json={"sid": "SMtest", "status": "delivered" if request.method == "GET" else "queued"})
    monkeypatch.setattr(alert_worker.httpx, "AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(provider), **kwargs))
    assert await alert_worker.send_sms("+233200000001", "Test only") == ("accepted", "SMtest")
    assert await alert_worker.send_sms("+233200000001", "Test only", "SMtest") == ("delivered", "SMtest")
    assert calls == ["POST", "GET"]


@pytest.mark.asyncio
async def test_live_edits_and_fulfillment_stop_alerts(client, db_session):
    _, hospital, _ = await approved_hospital(client, db_session)
    _, person = await donor(client, "emergency-updates", notify_email_alerts=True)
    rid = await request(client, hospital)
    payload = dict(blood_type="A+", component="red_cells", units=4, urgency="critical", location="Accra",
        status="draft", latitude=5.6, longitude=-.18,
        required_by=(datetime.now(timezone.utc)+timedelta(hours=5)).isoformat(),
        expires_at=(datetime.now(timezone.utc)+timedelta(hours=4)).isoformat())
    updated = await client.put(f"/api/v1/blood-requests/{rid}", headers=hospital, json=payload)
    assert updated.status_code == 200 and updated.json()["status"] == "published"
    cards = (await client.get("/api/v1/notifications", headers=person)).json()["items"]
    assert len([n for n in cards if n["payload"]]) == 1
    assert cards[0]["payload"]["units"] == 4 and cards[0]["payload"]["urgency"] == "critical"
    payload["blood_type"] = "B+"
    assert (await client.put(f"/api/v1/blood-requests/{rid}", headers=hospital, json=payload)).status_code == 409
    fulfilled = await client.post(f"/api/v1/blood-requests/{rid}/transition", headers=hospital,
        json={"action": "fulfill", "record_confirmed": True, "confirmed_units": 4, "reason": "Test receipt"})
    assert fulfilled.status_code == 200 and fulfilled.json()["status"] == "fulfilled"
    assert (await db_session.execute(select(AlertDelivery))).scalar_one().status == "cancelled"
    card = next(n for n in (await client.get("/api/v1/notifications", headers=person)).json()["items"] if n["payload"])
    assert not card["payload"]["can_respond"]


@pytest.mark.asyncio
async def test_cancelled_invitations_do_not_count_as_responses(client, db_session):
    _, hospital, _ = await approved_hospital(client, db_session)
    await donor(client, "emergency-never-replied")
    rid = await request(client, hospital)
    await client.post(f"/api/v1/blood-requests/{rid}/cancel", headers=hospital)
    summary = (await client.get("/api/v1/emergencies", headers=hospital)).json()["items"][0]
    assert summary["notified"] == 1 and summary["responded"] == 0


@pytest.mark.asyncio
async def test_emergency_migrations_round_trip_in_owned_schema(db_session):
    import importlib.util
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    root = Path(__file__).resolve().parents[1] / "alembic" / "versions"
    modules = []
    for name in ("20261018_0013_emergency_alerts.py", "20261018_0014_response_timestamp.py"):
        spec = importlib.util.spec_from_file_location(name.removesuffix(".py"), root / name)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        modules.append(module)
    def round_trip(connection):
        from sqlalchemy import inspect
        with Operations.context(MigrationContext.configure(connection)):
            for module in reversed(modules): module.downgrade()
            assert "emergency_alerts" not in inspect(connection).get_table_names()
            for module in modules: module.upgrade()
        assert "emergency_alerts" in inspect(connection).get_table_names()
        assert "responded_at" in {c["name"] for c in inspect(connection).get_columns("donor_responses")}
    async with db_session.bind.begin() as connection:
        await connection.run_sync(round_trip)


@pytest.mark.parametrize("outcome", ["accepted", "temporary_refusal", "permanent_refusal", "ambiguous"])
def test_smtp_adapter_acceptance_tls_and_failure_semantics(monkeypatch, outcome):
    import ssl
    import smtplib
    from app.services import alert_worker
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.test.invalid")
    monkeypatch.setattr(settings, "SMTP_FROM_EMAIL", "alerts@test.invalid")
    monkeypatch.setattr(settings, "SMTP_USERNAME", None)
    checks = []
    class SMTP:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def starttls(self, context):
            assert context.check_hostname and context.verify_mode == ssl.CERT_REQUIRED
            checks.append("tls")
        def send_message(self, message):
            assert message["Message-ID"] == "<test-job@alerts.fluid>"
            if outcome.endswith("refusal"):
                raise smtplib.SMTPRecipientsRefused({"donor@test.invalid": (450 if outcome == "temporary_refusal" else 550, b"Test rejection")})
            if outcome == "ambiguous": raise smtplib.SMTPServerDisconnected("Test disconnect")
            return {}
    monkeypatch.setattr(alert_worker.smtplib, "SMTP", SMTP)
    if outcome == "accepted":
        assert alert_worker.send_email("donor@test.invalid", "Test", "Test only", "test-job") == ("accepted", None)
    else:
        with pytest.raises(DeliveryFailure) as failure:
            alert_worker.send_email("donor@test.invalid", "Test", "Test only", "test-job")
        assert failure.value.retry is (outcome == "temporary_refusal")
        assert failure.value.ambiguous is (outcome == "ambiguous")
    assert checks == ["tls"]
