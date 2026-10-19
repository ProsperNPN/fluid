"""Publication regressions against real, isolated PostgreSQL records."""
from datetime import datetime, timezone, timedelta

import pytest
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient, ASGITransport

from app.models import AuditLog, BloodRequest, HospitalMembership
from tests.test_portal_journey import approved_hospital, register


def payload(**changes):
    now = datetime.now(timezone.utc)
    return {
        "blood_type": "O+", "component": "red_cells", "units": 2,
        "urgency": "routine", "status": "published", "location": "",
        "required_by": (now + timedelta(days=2)).isoformat(),
        "expires_at": (now + timedelta(days=1)).isoformat(), **changes,
    }


@pytest.mark.asyncio
async def test_publication_uses_saved_facility_and_persists(client, db_session):
    uid, hospital, profile = await approved_hospital(client, db_session)
    profile.latitude, profile.longitude, profile.address = 5.6037, -0.187, "Test facility, Accra"
    await db_session.commit()
    result = await client.post('/api/v1/blood-requests', headers=hospital, json=payload())
    assert result.status_code == 201, result.text
    data = result.json()
    assert data['status'] == 'published' and data['hospital_profile_id'] == profile.id
    assert (data['latitude'], data['longitude'], data['location']) == (5.6037, -0.187, profile.address)
    async with AsyncSession(bind=db_session.bind) as fresh:
        stored = await fresh.get(BloodRequest, data['id'])
        assert stored.created_by_user_id == uid and stored.hospital_profile_id == profile.id
        assert stored.status == 'published'
    listed = await client.get('/api/v1/blood-requests/page', headers=hospital)
    assert data['id'] in [item['id'] for item in listed.json()['items']]
    assert (await db_session.scalar(select(func.count(AuditLog.id)).where(
        AuditLog.entity_id == data['id'], AuditLog.action == 'matching.evaluated'))) == 1


@pytest.mark.asyncio
async def test_missing_coordinates_and_field_errors(client, db_session):
    _, hospital, _ = await approved_hospital(client, db_session)
    result = await client.post('/api/v1/blood-requests', headers=hospital, json=payload(location='Test facility'))
    assert result.status_code == 422, result.text
    assert any(issue['loc'][-1] == 'latitude' for issue in result.json()['detail'])
    now = datetime.now(timezone.utc)
    cases = [
        ({'units': 0}, 'units'), ({'blood_type': 'invalid'}, 'blood_type'),
        ({'component': 'invalid'}, 'component'), ({'urgency': 'invalid'}, 'urgency'),
        ({'required_by': None}, 'required_by'), ({'expires_at': None}, 'expires_at'),
        ({'expires_at': (now-timedelta(hours=1)).isoformat()}, 'expires_at'),
        ({'required_by': (now-timedelta(hours=1)).isoformat(), 'expires_at': None}, 'required_by'),
        ({'expires_at': (now+timedelta(days=3)).isoformat()}, 'expires_at'),
        ({'required_by': '2028-01-01T00:00:00'}, 'required_by'),
        ({'latitude': 91}, 'latitude'), ({'longitude': None}, 'longitude'),
    ]
    for changes, field in cases:
        result = await client.post('/api/v1/blood-requests', headers=hospital, json=payload(**{
            'location': 'Test facility', 'latitude': 5.6, 'longitude': -0.18, **changes}))
        assert result.status_code == 422, (changes, result.text)
        assert any(issue['loc'][-1] == field for issue in result.json()['detail']), result.text
    assert await db_session.scalar(select(func.count(BloodRequest.id))) == 0


@pytest.mark.asyncio
async def test_invalid_saved_coordinates_cannot_be_published(client, db_session):
    _, hospital, profile = await approved_hospital(client, db_session)
    for latitude, longitude, field in [(90.1, 0, 'latitude'), (0, 180.1, 'longitude'), (float('nan'), 0, 'latitude')]:
        profile.latitude, profile.longitude = latitude, longitude
        await db_session.commit()
        response = await client.post('/api/v1/blood-requests', headers=hospital, json=payload())
        assert response.status_code == 422, response.text
        assert any(issue['loc'][-1] == field for issue in response.json()['detail'])
    assert await db_session.scalar(select(func.count(BloodRequest.id))) == 0


@pytest.mark.asyncio
async def test_draft_publication_permissions_and_repeat_publish(client, db_session):
    uid, hospital, profile = await approved_hospital(client, db_session)
    draft = await client.post('/api/v1/blood-requests', headers=hospital, json=payload(
        status='draft', location='Test facility'))
    assert draft.status_code == 201, draft.text
    rid = draft.json()['id']
    assert (await client.post(f'/api/v1/blood-requests/{rid}/publish', headers=hospital)).status_code == 422
    profile.latitude, profile.longitude = 0, 0  # Zero coordinates are valid.
    await db_session.commit()
    _, other, _ = await approved_hospital(client, db_session, 'other-publish@journey.test')
    assert (await client.post(f'/api/v1/blood-requests/{rid}/publish', headers=other)).status_code == 404
    _, unverified = await register(client, 'unverified-publish@journey.test', 'hospital')
    assert (await client.post('/api/v1/blood-requests', headers=unverified, json=payload())).status_code == 403
    assert (await client.post('/api/v1/blood-requests', json=payload())).status_code == 401
    result = await client.post(f'/api/v1/blood-requests/{rid}/publish', headers=hospital)
    assert result.status_code == 200 and result.json()['latitude'] == 0, result.text
    assert (await client.post(f'/api/v1/blood-requests/{rid}/publish', headers=hospital)).status_code == 409
    assert await db_session.scalar(select(func.count(BloodRequest.id))) == 1
    membership = await db_session.scalar(select(HospitalMembership).where(HospitalMembership.user_id == uid))
    membership.role = 'viewer'
    await db_session.commit()
    assert (await client.post('/api/v1/blood-requests', headers=hospital, json=payload())).status_code == 403


@pytest.mark.asyncio
async def test_database_failure_rolls_back_and_can_retry(client, app, db_session):
    _, hospital, profile = await approved_hospital(client, db_session)
    profile.latitude, profile.longitude, profile.address = 5.6, -.18, 'Synthetic failure test facility'
    # A real PostgreSQL failure in this disposable schema, never a fake API response.
    await db_session.execute(text("""CREATE FUNCTION reject_test_publication() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic database failure'; END; $$"""))
    await db_session.execute(text("""CREATE TRIGGER test_publication_failure BEFORE INSERT ON blood_requests
        FOR EACH ROW WHEN (NEW.notes = 'synthetic-failure') EXECUTE FUNCTION reject_test_publication()"""))
    await db_session.commit()
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url='http://test') as failures:
        response = await failures.post('/api/v1/blood-requests', headers=hospital, json=payload(notes='synthetic-failure'))
    assert response.status_code == 500
    await db_session.rollback()
    async with AsyncSession(bind=db_session.bind) as fresh:
        assert await fresh.scalar(select(func.count(BloodRequest.id))) == 0
        assert await fresh.scalar(select(func.count(AuditLog.id)).where(AuditLog.action == 'request.published')) == 0
    response = await client.post('/api/v1/blood-requests', headers=hospital, json=payload())
    assert response.status_code == 201, response.text
