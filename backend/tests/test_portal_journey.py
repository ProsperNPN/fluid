import asyncio
from datetime import datetime, timezone, timedelta, date
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient, ASGITransport
from app.core.config import settings
from app.core.database import get_db
from app.models import HospitalProfile, User, BloodRequest, BloodInventory, Appointment, HospitalMembership

async def register(client, email, role):
    result = await client.post('/api/v1/auth/register', json={'email': email, 'password': 'Testing-secure-123!', 'full_name': 'Journey Test', 'role': role})
    assert result.status_code == 201, result.text
    login = await client.post('/api/v1/auth/login', json={'email': email, 'password': 'Testing-secure-123!'})
    assert login.status_code == 200
    return result.json()['id'], {'Authorization': 'Bearer ' + login.json()['access_token']}

async def approved_hospital(client, db_session, email='hospital@journey.test'):
    uid, headers = await register(client, email, 'hospital')
    profile = (await db_session.execute(select(HospitalProfile).where(HospitalProfile.user_id == uid))).scalar_one()
    profile.verification_status = 'verified'
    profile.has_blood_bank = True
    await db_session.commit()
    return uid, headers, profile

@pytest.mark.asyncio
async def test_complete_donor_to_hospital_journey(client, db_session, admin_headers, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, 'DONATION_POLICY_APPROVED', True)
    monkeypatch.setattr(settings, 'VERIFICATION_UPLOAD_DIR', tmp_path)
    monkeypatch.setattr(settings, 'SMTP_HOST', None)
    donor_id, donor = await register(client, 'donor@journey.test', 'donor')
    hospital_id, hospital = await register(client, 'hospital@journey.test', 'hospital')
    _, outsider = await register(client, 'outsider@journey.test', 'donor')
    assert (await client.get('/api/v1/inventory', headers=hospital)).status_code == 403
    profile = {'hospital_name':'Journey Hospital','city':'Accra','address':'Test clinic','registration_number':'TEST-001','has_blood_bank':True,'latitude':5.60,'longitude':-0.18}
    assert (await client.put('/api/v1/profiles/hospital/me', headers=hospital, json=profile)).status_code == 200
    verification = await client.post('/api/v1/hospital-verifications/submit', headers=hospital, data={'document_types':'registration_certificate'}, files=[('files', ('test.pdf', b'%PDF-1.4\nTest verification document', 'application/pdf'))])
    assert verification.status_code == 201, verification.text
    assert (await client.post(f"/api/v1/hospital-verifications/{verification.json()['id']}/decision", headers=admin_headers, json={'action':'verified','notes':'Test fixture approval'})).status_code == 200
    donor_profile = {'full_name':'Journey Donor','blood_type':'A+','blood_type_known':True,'city':'Accra','date_of_birth':'1990-01-01','is_available':True,'matching_opt_in':True,'latitude':5.60,'longitude':-0.18,'preferred_radius_km':25}
    assert (await client.put('/api/v1/profiles/donor/me', headers=donor, json=donor_profile)).status_code == 200
    now = datetime.now(timezone.utc)
    blood_request = await client.post('/api/v1/blood-requests', headers=hospital, json={'blood_type':'A+','component':'red_cells','units':2,'urgency':'urgent','location':'Accra','status':'published','latitude':5.60,'longitude':-0.18,'expires_at':(now+timedelta(days=1)).isoformat(),'required_by':(now+timedelta(days=2)).isoformat()})
    assert blood_request.status_code == 201, blood_request.text
    request_id = blood_request.json()['id']
    requests = (await client.get('/api/v1/donor-matches/compatible', headers=donor)).json()
    assert requests['total'] == 1 and requests['items'][0]['distance_km'] == 0
    response = await client.post(f'/api/v1/donor-matches/{request_id}/responses/accepted', headers=donor)
    assert response.status_code == 200 and response.json()['response_status'] == 'pending'
    response_id = (await client.get('/api/v1/donor-matches', headers=hospital)).json()['items'][0]['id']
    conversation = await client.post('/api/v1/messages/conversations', headers=donor, json={'request_id':request_id})
    assert conversation.status_code == 201
    cid = conversation.json()['id']
    assert (await client.post(f'/api/v1/messages/conversations/{cid}', headers=donor, json={'body':'Can we arrange a time?'})).status_code == 201
    assert (await client.get('/api/v1/messages', headers=hospital)).json()['unread_count'] == 1
    assert (await client.get(f'/api/v1/messages/conversations/{cid}', headers=outsider)).status_code == 404
    assert (await client.get(f'/api/v1/messages/conversations/{cid}', headers=hospital)).json()['items'][0]['body'] == 'Can we arrange a time?'
    assert (await client.get('/api/v1/messages', headers=hospital)).json()['unread_count'] == 0
    assert (await client.post(f'/api/v1/donor-matches/responses/{response_id}/accept', headers=hospital)).status_code == 200
    aid = (await client.get('/api/v1/appointments?scope=donor', headers=donor)).json()['items'][0]['id']
    availability = {'enabled': True, 'timezone':'Africa/Accra', 'slot_minutes':15, 'capacity':1, 'hours':[{'weekday':d,'start':'00:00','end':'23:59'} for d in range(7)]}
    assert (await client.put('/api/v1/appointments/policy', headers=hospital, json=availability)).status_code == 200
    visit = (now + timedelta(minutes=30)).replace(second=0,microsecond=0)
    visit = visit.replace(minute=(visit.minute // 15)*15)
    proposed = await client.patch(f'/api/v1/appointments/{aid}/schedule', headers=donor, json={'scheduled_at':visit.isoformat(),'internal_notes':'Donor must not set this'})
    assert proposed.status_code == 200 and proposed.json()['status'] == 'pending'
    assert (await client.patch(f'/api/v1/appointments/{aid}/status', headers=donor, json={'status':'confirmed'})).status_code == 409
    assert (await client.patch(f'/api/v1/appointments/{aid}/status', headers=hospital, json={'status':'confirmed','internal_notes':'Private hospital note'})).status_code == 200
    assert (await client.get('/api/v1/appointments', headers=donor)).json()['items'][0]['internal_notes'] is None
    assert (await client.patch(f'/api/v1/appointments/{aid}/status', headers=hospital, json={'status':'completed'})).status_code == 409
    assert (await client.post(f'/api/v1/donor-matches/responses/{response_id}/blood-type/verify', headers=hospital, json={'blood_type':'A+','clinical_confirmation':True})).status_code == 200
    from app.services import appointment_scheduling
    monkeypatch.setattr(appointment_scheduling, 'now_utc', lambda: visit)
    assert (await client.patch(f'/api/v1/appointments/{aid}/status', headers=hospital, json={'status':'checked_in'})).status_code == 200
    complete = await client.patch(f'/api/v1/appointments/{aid}/status', headers=hospital, json={'status':'completed','screening_confirmed':True,'procedure_confirmed':True,'actual_units':1})
    assert complete.status_code == 200, complete.text
    assert (await client.patch(f'/api/v1/appointments/{aid}/status', headers=hospital, json={'status':'completed','screening_confirmed':True})).status_code == 409
    donor_read = (await client.get('/api/v1/profiles/donor/me', headers=donor)).json()
    assert donor_read['last_donation_date'] == visit.date().isoformat() and donor_read['blood_type_verified'] is True
    assert (await client.put('/api/v1/profiles/donor/me', headers=donor, json=donor_profile)).status_code == 409
    confirmation = await client.get(f'/api/v1/appointments/{aid}/confirmation', headers=donor)
    assert confirmation.status_code == 200 and aid in confirmation.text
    stock = await client.post('/api/v1/inventory', headers=hospital, json={'blood_type':'A+','component':'red_cells','units_available':10,'storage_location':'Test bank','collection_date':date.today().isoformat(),'expiration_date':(date.today()+timedelta(days=30)).isoformat(),'minimum_threshold':3})
    assert stock.status_code == 201
    stock_id = stock.json()['id']
    assert stock.json()['units_available'] == 0  # Intake is quarantined, never implicitly released.
    assert stock.json()['quarantined_units'] == 10
    assert (await client.post(f'/api/v1/inventory/{stock_id}/adjust', headers=hospital, json={'action':'reserve','units':8,'reason':'Verified test reservation'})).status_code == 409
    assert len((await client.get(f'/api/v1/inventory/{stock_id}/transactions', headers=hospital)).json()['items']) == 10
    assert (await client.get('/api/v1/workspace/overview', headers=donor)).json()['completed_donations'] == 1
    analytics = (await client.get('/api/v1/workspace/analytics', headers=hospital)).json()
    assert analytics['donations'] == 1 and analytics['total_requests'] == 1
    assert (await client.get('/api/v1/notifications', headers=donor)).json()['unread_count'] > 0

@pytest.mark.asyncio
async def test_concurrent_inventory_reservations_are_serialized(client, app, db_session):
    from tests.test_smart_inventory import reviewed_policy, unit, release, stock_request
    _, hospital, _ = await approved_hospital(client, db_session)
    await reviewed_policy(client,hospital)
    released=[await release(client,hospital,await unit(client,hospital,str(index))) for index in range(5)]
    stock_id=released[0]['batch_id']
    rid=await stock_request(client,hospital)
    engine=db_session.bind
    async def independent_db():
        async with AsyncSession(bind=engine, expire_on_commit=False) as session: yield session
    app.dependency_overrides[get_db]=independent_db
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as independent:
        responses=await asyncio.gather(*[independent.post(f'/api/v1/inventory/{stock_id}/adjust',headers=hospital,json={'action':'reserve','units':4,'reason':'Verified test reservation','request_id':rid,'compatibility_verified':True}) for _ in range(2)])
        assert sorted(r.status_code for r in responses)==[200,409]
    batch=await db_session.get(BloodInventory,stock_id);await db_session.refresh(batch)
    assert batch.units_reserved==4 and batch.units_available==5

@pytest.mark.asyncio
async def test_unverified_and_other_hospital_cannot_access_records(client, db_session):
    _, hospital, profile = await approved_hospital(client, db_session)
    _, other, _ = await approved_hospital(client, db_session, 'other@journey.test')
    stock = (await client.post('/api/v1/inventory', headers=hospital, json={'blood_type':'O+','units_available':2,'storage_location':'Test bank','expiration_date':(date.today()+timedelta(days=30)).isoformat()})).json()
    assert (await client.post(f"/api/v1/inventory/{stock['id']}/adjust", headers=other, json={'action':'reserve','units':1})).status_code == 404
    profile.verification_status = 'suspended'; await db_session.commit()
    for route in ['/api/v1/inventory','/api/v1/messages','/api/v1/workspace/overview','/api/v1/appointments?scope=hospital']:
        assert (await client.get(route, headers=hospital)).status_code == 403

@pytest.mark.asyncio
async def test_closing_request_cancels_coordinated_appointments(client, db_session):
    uid, hospital, profile = await approved_hospital(client, db_session)
    donor_id, donor = await register(client, 'donor-close@journey.test', 'donor')
    now = datetime.now(timezone.utc)
    request = BloodRequest(created_by_user_id=uid, hospital_profile_id=profile.id, hospital_name=profile.hospital_name, hospital_verified=True, blood_type='O+', component='red_cells', units=3, location='Accra', status='published', expires_at=now+timedelta(days=1))
    db_session.add(request); await db_session.flush()
    appointment = Appointment(donor_user_id=donor_id, hospital_user_id=uid, blood_request_id=request.id, status='confirmed', scheduled_at=now+timedelta(hours=5), location='Clinic')
    db_session.add(appointment); await db_session.commit()
    assert (await client.post(f'/api/v1/blood-requests/{request.id}/cancel', headers=hospital)).status_code == 200
    data = (await client.get('/api/v1/appointments', headers=donor)).json()
    assert data['items'][0]['status'] == 'cancelled'
    assert (await client.patch(f'/api/v1/appointments/{appointment.id}/status', headers=hospital, json={'status':'completed','screening_confirmed':True})).status_code == 409

@pytest.mark.asyncio
async def test_expired_requests_and_unknown_stock_are_not_available(client, db_session):
    uid, hospital, profile = await approved_hospital(client, db_session)
    request = BloodRequest(created_by_user_id=uid, hospital_profile_id=profile.id, hospital_name=profile.hospital_name, hospital_verified=True, blood_type='O+', units=2, location='Accra', status='published', expires_at=datetime.now(timezone.utc)-timedelta(hours=1))
    stock = BloodInventory(hospital_profile_id=profile.id, blood_type='O+', component='red_cells', units_available=5, storage_location='Legacy batch', expiration_date=None)
    db_session.add_all([request,stock]); await db_session.commit()
    overview = (await client.get('/api/v1/workspace/overview', headers=hospital)).json()
    assert overview['active_requests'] == 0 and overview['stock_units'] == 0
    await db_session.refresh(request)
    assert request.status == 'expired'
    inventory = (await client.get('/api/v1/inventory', headers=hospital)).json()
    assert inventory['items'][0]['alert_level'] == 'unknown'
    assert (await client.post(f'/api/v1/inventory/{stock.id}/adjust', headers=hospital, json={'action':'reserve','units':1,'reason':'Verify unknown stock allocation'})).status_code == 409
    assert (await client.post('/api/v1/inventory', headers=hospital, json={'blood_type':'O+','units_available':5,'storage_location':'New bank'})).status_code == 422

@pytest.mark.asyncio
async def test_staff_roles_and_identity_changes_revoke_operations(client, db_session):
    _, hospital, profile = await approved_hospital(client, db_session)
    _, donor = await register(client, 'wrong-role@journey.test', 'donor')
    assert (await client.post('/api/v1/hospital-staff/invite', headers=hospital, json={'email':'wrong-role@journey.test','role':'hospital_staff'})).status_code == 403
    staff_id, staff_headers = await register(client, 'staff@journey.test', 'hospital')
    invite = await client.post('/api/v1/hospital-staff/invite', headers=hospital, json={'email':'staff@journey.test','role':'viewer'})
    assert invite.status_code == 201, invite.text
    assert (await client.get('/api/v1/inventory', headers=staff_headers)).status_code == 403
    assert (await client.get('/api/v1/profiles/hospital/me', headers=staff_headers)).status_code == 200
    assert (await client.patch(f"/api/v1/hospital-staff/{invite.json()['id']}/role", headers=hospital, json={'role':'hospital_staff'})).status_code == 200
    assert (await client.get('/api/v1/inventory', headers=staff_headers)).status_code == 200
    changed = await client.put('/api/v1/profiles/hospital/me', headers=hospital, json={'hospital_name':'Changed Identity','city':profile.city,'address':profile.address})
    assert changed.status_code == 200 and changed.json()['verification_status'] == 'more_information_required'
    assert (await client.get('/api/v1/inventory', headers=staff_headers)).status_code == 403
