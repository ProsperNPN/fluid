from datetime import date, datetime, timezone, timedelta
import pytest
from sqlalchemy import select
from app.core.config import settings
from app.models import AuditLog, DonorProfile, DonorResponse, BloodRequest, Notification, Appointment
from tests.test_portal_journey import register, approved_hospital


@pytest.fixture(autouse=True)
def clinical_test_policy(monkeypatch):
    monkeypatch.setattr(settings, "DONATION_POLICY_APPROVED", True)


async def donor(client, index, km=5, **changes):
    uid, headers = await register(client, f"matching-{index}@journey.test", "donor")
    payload = dict(full_name=f"Matching Donor {index}", blood_type="A+", blood_type_known=True,
        matching_opt_in=True, is_available=True, city="Accra", date_of_birth="1990-01-01",
        preferred_radius_km=100, latitude=5.6 + km / 111.195, longitude=-.18)
    payload.update(changes)
    result = await client.put("/api/v1/profiles/donor/me", headers=headers, json=payload)
    assert result.status_code == 200, result.text
    return uid, headers


async def request(client, hospital, status="published"):
    result = await client.post("/api/v1/blood-requests", headers=hospital, json=dict(
        blood_type="A+", component="red_cells", units=3, urgency="urgent", location="Accra",
        latitude=5.6, longitude=-.18, status=status,
        expires_at=(datetime.now(timezone.utc)+timedelta(hours=12)).isoformat(),
        required_by=(datetime.now(timezone.utc)+timedelta(hours=18)).isoformat()))
    assert result.status_code == 201, result.text
    return result.json()["id"]


@pytest.mark.asyncio
async def test_ranked_expansion_respects_radius_consent_privacy_and_known_exclusions(client, db_session):
    _, hospital, _ = await approved_hospital(client, db_session)
    near, _ = await donor(client, "near", date_of_birth=None)
    medium, _ = await donor(client, "medium", km=20)
    far, _ = await donor(client, "far", km=80)
    await donor(client, "limited", km=45, preferred_radius_km=25)
    await donor(client, "incompatible", blood_type="B+")
    await donor(client, "unavailable", is_available=False)
    await donor(client, "optedout", matching_opt_in=False)
    await donor(client, "missing", latitude=None, longitude=None)
    await donor(client, "recent", last_donation_date=date.today().isoformat())
    deferred, _ = await donor(client, "deferred")
    profile = (await db_session.execute(select(DonorProfile).where(DonorProfile.user_id == deferred))).scalar_one()
    profile.is_eligible = False
    await db_session.commit()
    rid = await request(client, hospital)
    initial = (await client.get(f"/api/v1/donor-matches/potential?request_id={rid}", headers=hospital)).json()
    assert [r["donor_user_id"] for r in initial["items"]] == [near]
    assert initial["radius_km"] == 10 and initial["suggested_radius_km"] == 25
    assert initial["items"][0]["priority"] == "Immediate outreach"
    assert any("Age" in flag for flag in initial["items"][0]["screening_flags"])
    assert "Clinical screening" in initial["items"][0]["eligibility_status"]
    assert all(key not in initial["items"][0] for key in ["latitude", "longitude", "phone", "date_of_birth", "last_donation_date"])
    wide = (await client.get(f"/api/v1/donor-matches/potential?request_id={rid}&radius_km=100", headers=hospital)).json()
    assert [r["donor_user_id"] for r in wide["items"]] == [near, medium, far]
    assert (await client.get(f"/api/v1/donor-matches/potential?request_id={rid}&radius_km=15", headers=hospital)).status_code == 422
    notifications = (await db_session.execute(select(Notification).where(Notification.type == "blood_request"))).scalars().all()
    assert {n.user_id for n in notifications} == {near}  # Initial 10 km only.
    assert (await db_session.execute(select(AuditLog).where(AuditLog.entity_id == rid, AuditLog.action == "matching.evaluated"))).scalar_one()


@pytest.mark.asyncio
async def test_invitation_accept_decline_and_dashboard_synchronization(client, db_session):
    _, hospital, _ = await approved_hospital(client, db_session)
    uid, person = await donor(client, "invite")
    declined_id, decline_person = await donor(client, "decline", km=20)
    rid = await request(client, hospital)
    assert (await client.post(f"/api/v1/donor-matches/{rid}/invite/{declined_id}", headers=hospital)).status_code == 409
    # Initial nearby emergency donor is already invited by the publication fanout.
    assert (await client.post(f"/api/v1/donor-matches/{rid}/invite/{uid}", headers=hospital)).status_code == 409
    for target, radius in [(declined_id, 25)]:
        assert (await client.post(f"/api/v1/donor-matches/{rid}/invite/{target}?radius_km={radius}", headers=hospital)).status_code == 200
        assert (await client.post(f"/api/v1/donor-matches/{rid}/invite/{target}?radius_km={radius}", headers=hospital)).status_code == 409
    feed = (await client.get("/api/v1/donor-matches/invitations", headers=person)).json()
    assert feed["total"] == 1 and feed["items"][0]["response_status"] == "invited"
    assert feed["items"][0]["hospital_latitude"] == 5.6
    assert (await client.post(f"/api/v1/donor-matches/{rid}/responses/accepted", headers=person)).status_code == 200
    assert (await client.post(f"/api/v1/donor-matches/{rid}/responses/accepted", headers=person)).status_code == 409
    # Opting out blocks acceptance but does not trap a donor in a stale invitation.
    profile = (await db_session.execute(select(DonorProfile).where(DonorProfile.user_id == declined_id))).scalar_one()
    profile.matching_opt_in = False
    await db_session.commit()
    assert (await client.post(f"/api/v1/donor-matches/{rid}/responses/accepted", headers=decline_person)).status_code == 409
    assert (await client.post(f"/api/v1/donor-matches/{rid}/responses/declined", headers=decline_person)).status_code == 200
    rows = (await client.get("/api/v1/donor-matches", headers=hospital)).json()["items"]
    assert {r["response_status"] for r in rows} == {"pending", "declined"}
    response = next(r for r in rows if r["donor_user_id"] == uid)
    assert (await client.post(f"/api/v1/donor-matches/responses/{response['id']}/accept", headers=hospital)).status_code == 200
    assert (await client.get("/api/v1/donor-matches/invitations", headers=person)).json()["items"][0]["response_status"] == "accepted"
    assert (await client.get(f"/api/v1/donor-matches/potential?request_id={rid}&status=new", headers=hospital)).json()["total"] == 0
    assert (await client.get(f"/api/v1/donor-matches/potential?request_id={rid}", headers=person)).status_code == 403


@pytest.mark.asyncio
async def test_policy_deadline_and_tenant_protection(client, db_session, monkeypatch):
    _, hospital, hp = await approved_hospital(client, db_session)
    _, outsider = await register(client, "not-approved@journey.test", "hospital")
    uid, person = await donor(client, "deadline")
    rid = await request(client, hospital)
    assert (await client.get(f"/api/v1/donor-matches/potential?request_id={rid}", headers=outsider)).status_code == 403
    assert (await client.post(f"/api/v1/donor-matches/{rid}/invite/{uid}", headers=outsider)).status_code == 403
    _, other, _ = await approved_hospital(client, db_session, "another-approved@journey.test")
    assert (await client.get(f"/api/v1/donor-matches/potential?request_id={rid}", headers=other)).status_code == 404
    monkeypatch.setattr(settings, "DONATION_POLICY_APPROVED", False)
    result = (await client.get(f"/api/v1/donor-matches/potential?request_id={rid}", headers=hospital)).json()
    assert not result["items"] and not result["policy_approved"]
    assert (await client.post(f"/api/v1/donor-matches/{rid}/invite/{uid}", headers=hospital)).status_code == 409
    monkeypatch.setattr(settings, "DONATION_POLICY_APPROVED", True)
    assert (await client.post(f"/api/v1/donor-matches/{rid}/invite/{uid}", headers=hospital)).status_code == 409
    blood_request = await db_session.get(BloodRequest, rid)
    blood_request.required_by = datetime.now(timezone.utc)-timedelta(minutes=1)
    await db_session.commit()
    feed = (await client.get("/api/v1/donor-matches/invitations", headers=person)).json()
    assert feed["items"][0]["response_status"] == "expired" and not feed["items"][0]["can_accept"]
    assert (await client.post(f"/api/v1/donor-matches/{rid}/responses/accepted", headers=person)).status_code == 409


@pytest.mark.asyncio
async def test_matches_recalculate_when_donor_or_request_changes(client, db_session):
    _, hospital, _ = await approved_hospital(client, db_session)
    uid, person = await donor(client, "changing")
    rid = await request(client, hospital, "draft")
    assert not (await client.get(f"/api/v1/donor-matches/potential?request_id={rid}", headers=hospital)).json()["items"]

    assert (await client.post(f"/api/v1/blood-requests/{rid}/publish", headers=hospital)).status_code == 200
    assert (await client.get(f"/api/v1/donor-matches/potential?request_id={rid}", headers=hospital)).json()["total"] == 1
    await client.patch("/api/v1/profiles/donor/me/availability", headers=person, json={"is_available": False})
    assert not (await client.get(f"/api/v1/donor-matches/potential?request_id={rid}", headers=hospital)).json()["items"]


@pytest.mark.asyncio
async def test_concurrent_invitations_and_responses_do_not_duplicate(client, app, db_session):
    import asyncio
    from httpx import AsyncClient, ASGITransport
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.core.database import get_db
    _, hospital, _ = await approved_hospital(client, db_session)
    uid, person = await donor(client, "concurrent", km=20)
    rid = await request(client, hospital)
    engine = db_session.bind
    async def independent_db():
        async with AsyncSession(bind=engine, expire_on_commit=False) as session:
            yield session
    app.dependency_overrides[get_db] = independent_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as independent:
        results = await asyncio.gather(*[independent.post(f"/api/v1/donor-matches/{rid}/invite/{uid}?radius_km=25", headers=hospital) for _ in range(2)])
        assert sorted(r.status_code for r in results) == [200, 409]
        results = await asyncio.gather(*[independent.post(f"/api/v1/donor-matches/{rid}/responses/accepted", headers=person) for _ in range(2)])
        assert sorted(r.status_code for r in results) == [200, 409]
        response_id = (await independent.get("/api/v1/donor-matches", headers=hospital)).json()["items"][0]["id"]
        results = await asyncio.gather(*[independent.post(f"/api/v1/donor-matches/responses/{response_id}/accept", headers=hospital) for _ in range(2)])
        assert sorted(r.status_code for r in results) == [200, 409]
    rows = (await db_session.execute(select(DonorResponse).where(DonorResponse.blood_request_id == rid))).scalars().all()
    assert len(rows) == 1 and rows[0].status == "accepted"
    appointments = (await db_session.execute(select(Appointment).where(Appointment.blood_request_id == rid))).scalars().all()
    assert len(appointments) == 1 and appointments[0].status == "pending"
