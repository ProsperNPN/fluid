from datetime import datetime, timezone, timedelta
import asyncio
import pytest
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession
from httpx import AsyncClient, ASGITransport
from app.models import (Appointment, AppointmentOccupancy, AppointmentReminder, AppointmentPolicy,
    BloodRequest, DonorProfile, Notification, BloodInventory)
from app.core.config import settings
from app.core.database import get_db
from app.services import appointment_scheduling as service
from tests.test_portal_journey import approved_hospital, register
from tests.test_intelligent_matching import donor, request


@pytest.fixture(autouse=True)
def policy(monkeypatch):
    monkeypatch.setattr(settings, "DONATION_POLICY_APPROVED", True)


def availability(capacity=1, **changes):
    return dict(enabled=True, timezone="Africa/Accra", slot_minutes=30, capacity=capacity,
        hours=[dict(weekday=d, start="08:00", end="18:00") for d in range(7)],
        reminder_hours=[24,2], preparation_instructions="Follow the hospital's preparation instructions.", **changes)


async def setup(client, db, index="one", hospital=None):
    if hospital is None: _, hospital, _ = await approved_hospital(client, db)
    uid, person = await donor(client, f"appointments-{index}")
    rid = await request(client, hospital)
    assert (await client.post(f"/api/v1/donor-matches/{rid}/responses/accepted", headers=person)).status_code == 200
    item = await db.get(BloodRequest, rid)
    item.required_by = item.expires_at = datetime.now(timezone.utc)+timedelta(days=7)
    await db.commit()
    assert (await client.put('/api/v1/appointments/policy', headers=hospital, json=availability())).status_code == 200
    when=(datetime.now(timezone.utc)+timedelta(days=2)).replace(hour=10,minute=0,second=0,microsecond=0)
    return hospital, uid, person, rid, when


async def propose(client,hospital,uid,rid,when):
    return await client.post('/api/v1/appointments',headers=hospital,json=dict(
        donor_user_id=uid,blood_request_id=rid,scheduled_at=when.isoformat()))


@pytest.mark.asyncio
async def test_full_workflow_reminders_checkin_completion_no_inventory(client, db_session, monkeypatch):
    hospital,uid,person,rid,when=await setup(client,db_session)
    result=await propose(client,hospital,uid,rid,when)
    assert result.status_code==201,result.text
    item=result.json(); aid=item['id']
    assert item['status']=='pending' and item['proposed_by']=='hospital' and item['is_scheduled']
    assert (await client.patch(f'/api/v1/appointments/{aid}/status',headers=hospital,json={'status':'confirmed'})).status_code==409
    confirmed=await client.patch(f'/api/v1/appointments/{aid}/status',headers=person,json={'status':'confirmed','expected_version':item['version']})
    assert confirmed.status_code==200 and confirmed.json()['status']=='confirmed'
    assert (await client.get(f'/api/v1/appointments/{aid}/calendar',headers=person)).status_code==200
    calendar=(await client.get(f'/api/v1/appointments/{aid}/calendar',headers=person)).text
    assert 'BEGIN:VCALENDAR' in calendar and when.strftime('%Y%m%dT%H%M%SZ') in calendar
    assert all(len(line.encode())<=75 for line in calendar.splitlines())
    await db_session.commit()
    factory=async_sessionmaker(db_session.bind,expire_on_commit=False)
    monkeypatch.setattr(service,'now_utc',lambda:when-timedelta(hours=23))
    await service.send_reminders(factory); await service.send_reminders(factory)
    monkeypatch.setattr(service,'now_utc',lambda:when-timedelta(hours=1))
    await service.send_reminders(factory); await service.send_reminders(factory)
    assert (await db_session.execute(select(func.count(AppointmentReminder.id)))).scalar_one()==2
    assert (await client.patch(f'/api/v1/appointments/{aid}/status',headers=hospital,json={'status':'completed','screening_confirmed':True,'procedure_confirmed':True,'actual_units':1})).status_code==409
    monkeypatch.setattr(service,'now_utc',lambda:when)
    assert (await client.patch(f'/api/v1/appointments/{aid}/status',headers=hospital,json={'status':'checked_in'})).status_code==200
    assert (await client.patch(f'/api/v1/appointments/{aid}/status',headers=person,json={'status':'completed'})).status_code==403
    assert (await client.patch(f'/api/v1/appointments/{aid}/status',headers=hospital,json={'status':'completed','screening_confirmed':True})).status_code==409
    done=await client.patch(f'/api/v1/appointments/{aid}/status',headers=hospital,json={'status':'completed','screening_confirmed':True,'procedure_confirmed':True,'actual_units':1})
    assert done.status_code==200,done.text
    assert (await client.patch(f'/api/v1/appointments/{aid}/status',headers=hospital,json={'status':'completed','screening_confirmed':True,'procedure_confirmed':True,'actual_units':1})).status_code==409
    await db_session.refresh(await db_session.get(BloodRequest,rid))
    assert (await db_session.get(BloodRequest,rid)).units_fulfilled==1
    assert (await db_session.execute(select(func.count(BloodInventory.id)))).scalar_one()==0
    profile=(await db_session.execute(select(DonorProfile).where(DonorProfile.user_id==uid))).scalar_one()
    assert profile.last_donation_date==when.date()
    history=(await client.get(f'/api/v1/appointments/{aid}/history',headers=person)).json()['items']
    assert [e['action'] for e in history]==['completed','checked_in','confirmed','time_proposed']


@pytest.mark.asyncio
async def test_capacity_conflicts_reschedule_cancel_and_optimistic_versions(client,db_session):
    hospital,uid,person,rid,when=await setup(client,db_session)
    aid=(await propose(client,hospital,uid,rid,when)).json()['id']
    _,uid2,person2,rid2,_=await setup(client,db_session,'two',hospital)
    full=await propose(client,hospital,uid2,rid2,when)
    assert full.status_code==409
    before=(await client.get('/api/v1/appointments',headers=person)).json()['items'][0]
    rescheduled=await client.patch(f'/api/v1/appointments/{aid}/schedule',headers=person,json={'scheduled_at':(when+timedelta(hours=1)).isoformat(),'expected_version':before['version'],'internal_notes':'Must not appear'})
    assert rescheduled.status_code==200 and rescheduled.json()['proposed_by']=='donor'
    assert rescheduled.json()['internal_notes'] is None
    assert (await client.patch(f'/api/v1/appointments/{aid}/schedule',headers=hospital,json={'scheduled_at':(when+timedelta(hours=2)).isoformat(),'expected_version':before['version']})).status_code==409
    assert (await propose(client,hospital,uid2,rid2,when)).status_code==201
    cancelled=await client.patch(f'/api/v1/appointments/{aid}/status',headers=person,json={'status':'cancelled','reason':'Plans changed'})
    assert cancelled.status_code==200 and cancelled.json()['cancellation_reason']=='Plans changed'
    assert (await db_session.execute(select(func.count(AppointmentOccupancy.id)).where(AppointmentOccupancy.appointment_id==aid))).scalar_one()==0
    assert (await client.patch(f'/api/v1/appointments/{aid}/status',headers=hospital,json={'status':'confirmed'})).status_code==409


@pytest.mark.asyncio
async def test_unavailable_past_expired_unverified_and_tenant_access(client,db_session):
    hospital,uid,person,rid,when=await setup(client,db_session)
    _,outsider=await register(client,'appointments-unverified@journey.test','hospital')
    assert (await client.put('/api/v1/appointments/policy',headers=outsider,json=availability())).status_code==403
    assert (await propose(client,outsider,uid,rid,when)).status_code==403
    assert (await propose(client,hospital,uid,rid,datetime.now(timezone.utc)-timedelta(hours=1))).status_code==422
    assert (await propose(client,hospital,uid,rid,when.replace(tzinfo=None))).status_code==422
    aid=(await propose(client,hospital,uid,rid,when)).json()['id']
    _,other,_=await approved_hospital(client,db_session,'appointment-other@journey.test')
    assert (await client.get(f'/api/v1/appointments/{aid}/history',headers=other)).status_code==404
    await client.patch('/api/v1/profiles/donor/me/availability',headers=person,json={'is_available':False})
    assert (await client.patch(f'/api/v1/appointments/{aid}/status',headers=person,json={'status':'confirmed'})).status_code==409
    req=await db_session.get(BloodRequest,rid);req.expires_at=datetime.now(timezone.utc)-timedelta(seconds=1);await db_session.commit()
    from app.services.request_lifecycle import expire_requests
    await expire_requests(db_session)
    assert (await client.get('/api/v1/appointments',headers=person)).json()['items'][0]['status']=='cancelled'
    assert (await db_session.execute(select(func.count(AppointmentOccupancy.id)))).scalar_one()==0


@pytest.mark.asyncio
async def test_concurrent_bookings_and_reminders(client,app,db_session,monkeypatch):
    hospital,uid,person,rid,when=await setup(client,db_session)
    _,uid2,_,rid2,_=await setup(client,db_session,'concurrent',hospital)
    engine=db_session.bind
    async def independent():
        async with AsyncSession(engine,expire_on_commit=False) as session: yield session
    app.dependency_overrides[get_db]=independent
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as independent_client:
        results=await asyncio.gather(propose(independent_client,hospital,uid,rid,when),propose(independent_client,hospital,uid2,rid2,when))
        assert sorted(r.status_code for r in results)==[201,409]
    booked=next(r.json() for r in results if r.status_code==201)
    async with async_sessionmaker(engine,expire_on_commit=False)() as db:
        item=await db.get(Appointment,booked['id']);item.status='confirmed';await db.commit()
    monkeypatch.setattr(service,'now_utc',lambda:when-timedelta(hours=1))
    factory=async_sessionmaker(engine,expire_on_commit=False)
    await asyncio.gather(service.send_reminders(factory),service.send_reminders(factory))
    assert (await db_session.execute(select(func.count(AppointmentReminder.id)))).scalar_one()==1


def test_timezone_slot_validation_and_dst():
    from zoneinfo import ZoneInfo
    policy=AppointmentPolicy(enabled=True,timezone='America/New_York',slot_minutes=30,capacity=1,hours=[dict(weekday=6,start='01:00',end='04:00')])
    first=datetime(2026,11,1,1,0,tzinfo=ZoneInfo('America/New_York'),fold=0).astimezone(timezone.utc)
    second=datetime(2026,11,1,1,0,tzinfo=ZoneInfo('America/New_York'),fold=1).astimezone(timezone.utc)
    assert second-first==timedelta(hours=1)
    assert service.slot_end(first,policy)-first==timedelta(minutes=30)
    assert service.slot_end(second,policy)-second==timedelta(minutes=30)


@pytest.mark.asyncio
async def test_preferences_slots_timezone_filters_and_no_show(client,db_session,monkeypatch):
    hospital,uid,person,rid,when=await setup(client,db_session)
    preference={'timezone':'Africa/Accra','hours':[{'weekday':when.weekday(),'start':'10:00','end':'12:00'}]}
    assert (await client.put('/api/v1/appointments/preferences',headers=person,json=preference)).status_code==200
    result=await client.get('/api/v1/appointments/available-slots',headers=hospital,params={'request_id':rid,'donor_user_id':uid,'start_date':when.date().isoformat()})
    assert result.status_code==200,result.text
    assert any(slot['preferred'] for slot in result.json()['items'])
    times=[slot['scheduled_at'] for slot in result.json()['items']]
    assert times==sorted(times)  # Urgent requests favor the earliest available slot.
    item=(await propose(client,hospital,uid,rid,when)).json();aid=item['id']
    assert (await client.patch(f'/api/v1/appointments/{aid}/status',headers=person,json={'status':'confirmed'})).status_code==200
    assert (await client.patch(f'/api/v1/appointments/{aid}/status',headers=hospital,json={'status':'no_show'})).status_code==409
    assert (await client.get('/api/v1/appointments',headers=hospital,params={'scope':'hospital','from_date':when.replace(tzinfo=None).isoformat()})).status_code==422
    filtered=await client.get('/api/v1/appointments',headers=hospital,params={'scope':'hospital','from_date':(when-timedelta(hours=1)).isoformat(),'to_date':(when+timedelta(hours=1)).isoformat(),'request_id':rid,'search':'Matching'})
    assert filtered.json()['total']==1
    monkeypatch.setattr(service,'now_utc',lambda:when+timedelta(hours=1))
    assert (await client.patch(f'/api/v1/appointments/{aid}/status',headers=hospital,json={'status':'no_show'})).status_code==200
    assert (await client.get('/api/v1/appointments?status=completed',headers=person)).json()['total']==0


@pytest.mark.asyncio
async def test_concurrent_updates_require_current_version(client,app,db_session):
    hospital,uid,person,rid,when=await setup(client,db_session)
    item=(await propose(client,hospital,uid,rid,when)).json()
    async def independent():
        async with AsyncSession(db_session.bind,expire_on_commit=False) as db: yield db
    app.dependency_overrides[get_db]=independent
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as other:
        replies=await asyncio.gather(*[other.patch(f"/api/v1/appointments/{item['id']}/schedule",headers=person,
            json={'scheduled_at':(when+timedelta(hours=offset)).isoformat(),'expected_version':item['version']}) for offset in (1,2)])
        assert sorted(r.status_code for r in replies)==[200,409]


@pytest.mark.asyncio
async def test_appointment_migration_round_trip(db_session):
    import importlib.util
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path=Path(__file__).resolve().parents[1]/'alembic'/'versions'/'20261018_0015_appointment_scheduling.py'
    spec=importlib.util.spec_from_file_location('appointment_migration',path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    def round_trip(conn):
        from sqlalchemy import inspect
        with Operations.context(MigrationContext.configure(conn)):
            module.downgrade();module.upgrade()
        assert 'appointment_occupancy' in inspect(conn).get_table_names()
        assert 'is_scheduled' in {c['name'] for c in inspect(conn).get_columns('appointments')}
    async with db_session.bind.begin() as conn: await conn.run_sync(round_trip)
