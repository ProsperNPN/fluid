from datetime import datetime,timezone,timedelta
import asyncio
import pytest
from sqlalchemy import select,text,func
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession,async_sessionmaker
from httpx import AsyncClient,ASGITransport
from app.models import InventoryUnit,InventoryMovement,InventoryAlertState,BloodInventory,HospitalMembership
from app.core.database import get_db
from app.services import smart_inventory as service
from tests.test_portal_journey import approved_hospital,register


async def reviewed_policy(client,hospital):
    result=await client.put('/api/v1/inventory/component-policies/red_cells',headers=hospital,json={
        'approved':True,'clinical_authorization':True,'standard_reference':'Synthetic test SOP; not clinical guidance',
        'storage_requirements':'Synthetic test storage','max_shelf_life_hours':168,
        'temperature_min_c':1,'temperature_max_c':9,'expiry_warning_hours':48,'expected_version':0})
    assert result.status_code==200,result.text


async def unit(client,hospital,index='one',**changes):
    now=datetime.now(timezone.utc)
    payload=dict(blood_type='O+',component='red_cells',official_identifier='TEST-'+str(index),product_code='P-'+str(index),label_standard='other',
        collected_at=(now-timedelta(hours=12)).isoformat(),expires_at=(now+timedelta(hours=24)).isoformat(),storage_location='Test storage')
    payload.update(changes)
    result=await client.post('/api/v1/inventory/units',headers=hospital,json=payload)
    assert result.status_code==201,result.text
    return result.json()


async def action(client,hospital,item,kind,**changes):
    return await client.post(f"/api/v1/inventory/units/{item['id']}/actions",headers=hospital,json={
        'action':kind,'expected_version':item['version'],'reason':'Synthetic test stock movement',**changes})


async def release(client,hospital,item):
    r=await action(client,hospital,item,'start_testing');assert r.status_code==200,r.text
    r=await action(client,hospital,r.json(),'record_testing',testing_status='passed',clinical_authorization=True);assert r.status_code==200,r.text
    r=await action(client,hospital,r.json(),'clinical_release',clinical_authorization=True,official_label_verified=True,cold_chain_verified=True,temperature_c=5)
    assert r.status_code==200,r.text
    return r.json()


async def stock_request(client,hospital):
    now=datetime.now(timezone.utc)
    r=await client.post('/api/v1/blood-requests',headers=hospital,json={'blood_type':'O+','component':'red_cells','units':5,'status':'published',
        'location':'Synthetic test hospital','latitude':5.6,'longitude':-.18,'expires_at':(now+timedelta(hours=12)).isoformat(),'required_by':(now+timedelta(hours=18)).isoformat()})
    assert r.status_code==201,r.text
    return r.json()['id']


@pytest.mark.asyncio
async def test_release_reserve_use_traceability_and_no_request_double_count(client,db_session):
    _,hospital,_=await approved_hospital(client,db_session)
    item=await unit(client,hospital)
    assert item['status']=='quarantined' and not item['clinically_available']
    assert (await client.get('/api/v1/inventory/summary',headers=hospital)).json()['available']==0
    assert (await action(client,hospital,item,'reserve',compatibility_verified=True)).status_code==409
    await reviewed_policy(client,hospital)
    assert (await action(client,hospital,item,'clinical_release',clinical_authorization=True,official_label_verified=True,cold_chain_verified=True,temperature_c=5)).status_code==409
    item=await release(client,hospital,item)
    summary=(await client.get('/api/v1/inventory/summary',headers=hospital)).json()
    assert summary['available']==1
    rid=await stock_request(client,hospital)
    reserved=await action(client,hospital,item,'reserve',request_id=rid,compatibility_verified=True)
    assert reserved.status_code==200,reserved.text
    assert (await action(client,hospital,item,'reserve',request_id=rid,compatibility_verified=True)).status_code==409
    used=await action(client,hospital,reserved.json(),'use',clinical_authorization=True,compatibility_verified=True)
    assert used.status_code==200 and used.json()['status']=='used'
    request=(await client.get(f'/api/v1/blood-requests/{rid}',headers=hospital)).json()
    assert request['units_fulfilled']==0
    assert (await client.get('/api/v1/workspace/overview',headers=hospital)).json()['stock_units']==0
    history=(await client.get(f"/api/v1/inventory/units/{item['id']}/history",headers=hospital)).json()['items']
    assert {h['action'] for h in history}>={'intake','start_testing','record_testing','clinical_release','reserve','use'}
    with pytest.raises(DBAPIError):
        async with db_session.begin_nested():
            await db_session.execute(text('UPDATE inventory_movements SET action=:action WHERE id=:id'),{'action':'tampered','id':history[0]['id']})


@pytest.mark.asyncio
async def test_duplicate_edit_scan_qr_and_cross_hospital_security(client,db_session):
    _,hospital,_=await approved_hospital(client,db_session)
    item=await unit(client,hospital)
    duplicate=await client.post('/api/v1/inventory/units',headers=hospital,json={key:item[key] for key in ('blood_type','component','official_identifier','product_code','label_standard','collected_at','expires_at','storage_location')})
    assert duplicate.status_code==409
    scanned=await client.post('/api/v1/inventory/scan',headers=hospital,json={'value':item['qr_payload']})
    assert scanned.status_code==200 and scanned.json()['id']==item['id']
    qr=await client.get(f"/api/v1/inventory/units/{item['id']}/qr",headers=hospital)
    assert qr.status_code==200 and 'image/svg+xml' in qr.headers['content-type']
    assert '<svg' in qr.text and item['official_identifier'] not in qr.text
    _,other,_=await approved_hospital(client,db_session,'other-inventory@journey.test')
    assert (await client.post('/api/v1/inventory/scan',headers=other,json={'value':item['qr_payload']})).status_code==404
    assert (await client.get(f"/api/v1/inventory/units/{item['id']}/qr",headers=other)).status_code==404
    _,donor=await register(client,'inventory-donor@journey.test','donor')
    _,unverified=await register(client,'inventory-unverified@journey.test','hospital')
    assert (await client.get('/api/v1/inventory/units',headers=donor)).status_code==403
    assert (await client.get('/api/v1/inventory/units',headers=unverified)).status_code==403
    assert (await client.get('/api/v1/inventory/units')).status_code==401
    payload={key:item[key] for key in ('blood_type','component','official_identifier','product_code','label_standard','collected_at','expires_at','storage_location')}
    payload.update(expected_version=item['version'],reason='Verified test correction',clinical_authorization=True,storage_location='Corrected storage')
    edited=await client.put(f"/api/v1/inventory/units/{item['id']}",headers=hospital,json=payload)
    assert edited.status_code==200 and edited.json()['storage_location']=='Corrected storage'
    filtered=await client.get('/api/v1/inventory/units',headers=hospital,params={'blood_type':'O+','component':'red_cells','status':'quarantined','search':'Corrected','page_size':1})
    assert filtered.json()['total']==1


@pytest.mark.asyncio
async def test_low_stock_expiry_alerts_deduplicate_recall_and_disposal(client,db_session,monkeypatch):
    _,hospital,hp=await approved_hospital(client,db_session)
    await reviewed_policy(client,hospital)
    item=await release(client,hospital,await unit(client,hospital))
    await db_session.commit()
    factory=async_sessionmaker(db_session.bind,expire_on_commit=False)
    await service.monitor_inventory(factory);await service.monitor_inventory(factory)
    from app.models import Notification
    before=(await db_session.execute(select(func.count(Notification.id)).where(Notification.type=='inventory'))).scalar_one()
    await db_session.commit()
    await service.monitor_inventory(factory)
    assert (await db_session.execute(select(func.count(Notification.id)).where(Notification.type=='inventory'))).scalar_one()==before
    recalled=await action(client,hospital,item,'recall',clinical_authorization=True)
    assert recalled.status_code==200 and recalled.json()['recall_active']
    assert (await client.get('/api/v1/inventory/summary',headers=hospital)).json()['available']==0
    item=await release_after_recall(client,hospital,recalled.json())
    future=datetime.fromisoformat(item['expires_at'])+timedelta(seconds=1)
    monkeypatch.setattr(service,'now_utc',lambda:future)
    assert (await action(client,hospital,item,'reserve',compatibility_verified=True)).status_code==409
    await db_session.commit();await service.monitor_inventory(factory)
    current=(await client.get(f"/api/v1/inventory/units/{item['id']}",headers=hospital)).json()
    assert current['status']=='expired'
    disposed=await action(client,hospital,current,'discard',clinical_authorization=True)
    assert disposed.status_code==200 and disposed.json()['status']=='discarded'


async def release_after_recall(client,hospital,item):
    r=await action(client,hospital,item,'start_testing')
    r=await action(client,hospital,r.json(),'record_testing',testing_status='passed',clinical_authorization=True)
    denied=await action(client,hospital,r.json(),'clinical_release',clinical_authorization=True,official_label_verified=True,cold_chain_verified=True,temperature_c=5)
    assert denied.status_code==409
    r=await action(client,hospital,r.json(),'clinical_release',clinical_authorization=True,official_label_verified=True,cold_chain_verified=True,temperature_c=5,recall_resolved=True)
    assert r.status_code==200,r.text
    return r.json()


@pytest.mark.asyncio
async def test_concurrent_reservations_and_clinical_role_limits(client,app,db_session):
    _,hospital,hp=await approved_hospital(client,db_session)
    await reviewed_policy(client,hospital)
    item=await release(client,hospital,await unit(client,hospital))
    rid=await stock_request(client,hospital)
    async def independent():
        async with AsyncSession(db_session.bind,expire_on_commit=False) as db:yield db
    app.dependency_overrides[get_db]=independent
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as other:
        results=await asyncio.gather(*[action(other,hospital,item,'reserve',request_id=rid,compatibility_verified=True) for _ in range(2)])
        assert sorted(r.status_code for r in results)==[200,409]
    uid,staff=await register(client,'inventory-staff@journey.test','hospital')
    member=(await db_session.execute(select(HospitalMembership).where(HospitalMembership.user_id==uid))).scalar_one()
    member.hospital_profile_id=hp.id;member.role='hospital_staff';await db_session.commit()
    reserved=next(r.json() for r in results if r.status_code==200)
    assert (await action(client,staff,reserved,'use',clinical_authorization=True,compatibility_verified=True)).status_code==403


@pytest.mark.asyncio
async def test_out_of_range_move_quarantines_and_stops_allocation(client,db_session):
    _,hospital,_=await approved_hospital(client,db_session)
    await reviewed_policy(client,hospital)
    item=await release(client,hospital,await unit(client,hospital))
    moved=await action(client,hospital,item,'move',storage_location='Deviation storage',cold_chain_verified=True,temperature_c=25)
    assert moved.status_code==200 and moved.json()['status']=='quarantined'
    assert (await client.get('/api/v1/inventory/summary',headers=hospital)).json()['available']==0


@pytest.mark.asyncio
async def test_component_policy_and_failed_testing_never_auto_release(client,db_session):
    _,hospital,_=await approved_hospital(client,db_session)
    item=await unit(client,hospital,collected_at=None)
    result=await client.put('/api/v1/inventory/component-policies/red_cells',headers=hospital,json={'approved':True,'clinical_authorization':True})
    assert result.status_code==422
    await reviewed_policy(client,hospital)
    item=(await action(client,hospital,item,'start_testing')).json()
    item=(await action(client,hospital,item,'record_testing',clinical_authorization=True,testing_status='failed')).json()
    assert item['status']=='quarantined'
    assert (await action(client,hospital,item,'clinical_release',clinical_authorization=True,official_label_verified=True,cold_chain_verified=True,temperature_c=5)).status_code==409
    assert (await client.get('/api/v1/inventory/summary',headers=hospital)).json()['available']==0


@pytest.mark.asyncio
async def test_migration_retains_legacy_quantity_in_quarantine(db_session):
    import importlib.util
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path=Path(__file__).resolve().parents[1]/'alembic'/'versions'/'20261018_0016_smart_inventory.py'
    spec=importlib.util.spec_from_file_location('inventory_migration',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    from app.models import User,HospitalProfile
    user=User(email='migration-stock@inventory.test',hashed_password='not-a-real-login',role='hospital')
    db_session.add(user);await db_session.flush()
    hp=HospitalProfile(user_id=user.id,hospital_name='Synthetic migration hospital',verification_status='verified');db_session.add(hp);await db_session.flush()
    batch=BloodInventory(hospital_profile_id=hp.id,blood_type='O+',component='red_cells',units_available=3,units_reserved=1,storage_location='Legacy stock',expiration_date=(datetime.now(timezone.utc)+timedelta(days=2)).date())
    db_session.add(batch);await db_session.commit()
    def migrate(conn):
        with Operations.context(MigrationContext.configure(conn)):
            module.downgrade();module.upgrade()
    async with db_session.bind.begin() as conn:await conn.run_sync(migrate)
    await db_session.refresh(batch)
    assert batch.units_available==0 and batch.legacy_reported_counts=={'available':3,'reserved':1}
    rows=(await db_session.execute(select(InventoryUnit))).scalars().all()
    assert len(rows)==3 and all(u.status=='quarantined' and u.official_identifier is None for u in rows)


@pytest.mark.asyncio
async def test_bulk_intake_preserves_exact_expiration_and_unique_internal_ids(client,db_session):
    _,hospital,_=await approved_hospital(client,db_session)
    expires=(datetime.now(timezone.utc)+timedelta(hours=8)).replace(microsecond=0)
    result=await client.post('/api/v1/inventory/units/intake',headers=hospital,json={'quantity':3,'blood_type':'AB-','component':'plasma','expires_at':expires.isoformat(),'storage_location':'Synthetic freezer'})
    assert result.status_code==201,result.text
    rows=result.json()['items']
    assert len({r['internal_identifier'] for r in rows})==3
    assert all(datetime.fromisoformat(r['expires_at'])==expires and r['status']=='quarantined' for r in rows)
    assert (await client.get('/api/v1/inventory/summary',headers=hospital)).json()['available']==0
