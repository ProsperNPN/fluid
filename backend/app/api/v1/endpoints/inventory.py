"""Compatibility API for batch views; physical unit records are the source of truth."""
from datetime import date,datetime,time,timedelta,timezone
from fastapi import APIRouter,Depends,HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import HospitalContext,require_hospital_operator
from app.core.database import get_db
from app.models import BloodInventory,InventoryUnit,InventoryStockPolicy,InventoryMovement,BloodRequest,AuditLog
from app.schemas.inventory import InventoryCreate,InventoryAdjust,InventoryRead,InventoryPageRead
from app.schemas.inventory_settings import InventorySettings
from app.schemas.inventory_unit import UnitAction
from app.services import smart_inventory as service

router=APIRouter(prefix='/inventory',tags=['Blood Inventory'])

async def _read(db,item):
    await db.refresh(item)
    units,policies,stock=await service.data_for(db,item.hospital_profile_id)
    rows=[u for u in units if u.batch_id==item.id]
    eligible=[u for u in rows if service.eligible(u,policies.get(u.component))]
    available=len(eligible);reserved=sum(u.status=='reserved' for u in eligible)
    group=next((p for p in stock if p.blood_type==item.blood_type and p.component==item.component),None)
    minimum=group.minimum if group else item.minimum_threshold
    level='unknown' if not item.expiration_date else 'expired' if rows and all(service.effective_status(u)=='expired' for u in rows) else 'critical' if available-reserved<=0 else 'low' if available-reserved<=minimum else 'normal'
    return InventoryRead(id=item.id,blood_type=item.blood_type,component=item.component,units_available=available,units_reserved=reserved,
        collection_date=item.collection_date,expiration_date=item.expiration_date,storage_location=item.storage_location,minimum_threshold=minimum,alert_level=level,updated_at=item.updated_at,
        physical_units=sum(service.effective_status(u) not in service.TERMINAL for u in rows),quarantined_units=sum(service.effective_status(u) in {'quarantined','testing'} for u in rows))

@router.get('',response_model=InventoryPageRead)
async def list_inventory(blood_type:str|None=None,alert_only:bool=False,db:AsyncSession=Depends(get_db),context:HospitalContext=Depends(require_hospital_operator)):
    filters=[BloodInventory.hospital_profile_id==context.hospital.id]
    if blood_type:filters.append(BloodInventory.blood_type==blood_type)
    rows=(await db.execute(select(BloodInventory).where(*filters).order_by(BloodInventory.expiration_date.asc().nullslast()))).scalars().all()
    items=[await _read(db,row) for row in rows]
    if alert_only:items=[i for i in items if i.alert_level!='normal']
    return InventoryPageRead(items=items,total=len(items))

@router.post('',response_model=InventoryRead,status_code=201)
async def create_inventory(payload:InventoryCreate,db:AsyncSession=Depends(get_db),context:HospitalContext=Depends(require_hospital_operator)):
    if not context.hospital.has_blood_bank:raise HTTPException(409,'Enable the hospital blood bank first')
    await service.lock_hospital(db,context.hospital.id)
    expires=datetime.combine(payload.expiration_date+timedelta(days=1),time(),timezone.utc)
    collected=datetime.combine(payload.collection_date,time(),timezone.utc) if payload.collection_date else None
    batch=await service.batch_for(db,context.hospital.id,payload.blood_type,payload.component,expires,collected,payload.storage_location,payload.minimum_threshold)
    for _ in range(payload.units_available):
        await service.create_unit(db,context.hospital.id,dict(blood_type=payload.blood_type,component=payload.component,collected_at=collected,expires_at=expires,storage_location=payload.storage_location),context.user.id,payload.minimum_threshold)
    await service.reconcile(db,context.hospital.id);await db.commit()
    return await _read(db,batch)

@router.post('/{item_id}/adjust',response_model=InventoryRead)
async def adjust_inventory(item_id:str,payload:InventoryAdjust,db:AsyncSession=Depends(get_db),context:HospitalContext=Depends(require_hospital_operator)):
    if payload.request_id:await db.execute(select(BloodRequest.id).where(BloodRequest.id==payload.request_id,BloodRequest.hospital_profile_id==context.hospital.id).with_for_update())
    await service.lock_hospital(db,context.hospital.id)
    item=await db.get(BloodInventory,item_id)
    if not item or item.hospital_profile_id!=context.hospital.id:raise HTTPException(404,'Inventory item not found')
    if not payload.reason or len(payload.reason.strip())<5:raise HTTPException(422,'Record a reason for the verified physical movement')
    if payload.action in {'add','donation_intake'}:
        for _ in range(payload.units):
            await service.create_unit(db,context.hospital.id,dict(blood_type=item.blood_type,component=item.component,
                collected_at=datetime.combine(item.collection_date,time(),timezone.utc) if item.collection_date else None,
                expires_at=datetime.combine(item.expiration_date+timedelta(days=1),time(),timezone.utc) if item.expiration_date else None,storage_location=item.storage_location),context.user.id,item.minimum_threshold)
    else:
        mapping={'remove':'discard','expire':'discard','reserve':'reserve','release':'unreserve','use':'use'}
        action=mapping[payload.action]
        rows=(await db.execute(select(InventoryUnit).where(InventoryUnit.batch_id==item.id,InventoryUnit.hospital_profile_id==context.hospital.id).order_by(InventoryUnit.expires_at.asc().nullslast(),InventoryUnit.id))).scalars().all()
        if action=='reserve':rows=[u for u in rows if u.status=='available']
        elif action=='unreserve':rows=[u for u in rows if u.status=='reserved']
        elif action=='use':rows=[u for u in rows if u.status=='available']
        else:rows=[u for u in rows if u.status not in {'used','discarded','reserved'}]
        if len(rows)<payload.units:raise HTTPException(409,'Insufficient eligible physical stock; manage individual reserved units explicitly')
        for unit in rows[:payload.units]:
            await service.act(db,unit,UnitAction(action=action,expected_version=unit.version,reason=payload.reason,
                clinical_authorization=payload.clinical_authorization,compatibility_verified=payload.compatibility_verified,request_id=payload.request_id),context)
    await service.reconcile(db,context.hospital.id);await db.commit()
    return await _read(db,item)

@router.get('/{item_id}/transactions')
async def inventory_transactions(item_id:str,db:AsyncSession=Depends(get_db),context:HospitalContext=Depends(require_hospital_operator)):
    item=await db.get(BloodInventory,item_id)
    if not item or item.hospital_profile_id!=context.hospital.id:raise HTTPException(404,'Inventory not found')
    rows=(await db.execute(select(InventoryMovement).join(InventoryUnit,InventoryUnit.id==InventoryMovement.unit_id).where(
        InventoryUnit.batch_id==item_id,InventoryMovement.hospital_profile_id==context.hospital.id).order_by(InventoryMovement.created_at.desc()).limit(100))).scalars()
    return {'items':[{'id':m.id,'action':m.action,'details':m.details,'created_at':m.created_at} for m in rows]}

@router.patch('/{item_id}/settings',response_model=InventoryRead)
async def inventory_settings(item_id:str,payload:InventorySettings,db:AsyncSession=Depends(get_db),context:HospitalContext=Depends(require_hospital_operator)):
    await service.lock_hospital(db,context.hospital.id)
    item=await db.get(BloodInventory,item_id)
    if not item or item.hospital_profile_id!=context.hospital.id:raise HTTPException(404,'Inventory not found')
    policy=(await db.execute(select(InventoryStockPolicy).where(InventoryStockPolicy.hospital_profile_id==context.hospital.id,InventoryStockPolicy.blood_type==item.blood_type,InventoryStockPolicy.component==item.component))).scalar_one_or_none()
    if policy:policy.minimum=payload.minimum_threshold;policy.critical=min(policy.critical,policy.minimum)
    else:db.add(InventoryStockPolicy(hospital_profile_id=context.hospital.id,blood_type=item.blood_type,component=item.component,minimum=payload.minimum_threshold,critical=0))
    item.minimum_threshold=payload.minimum_threshold
    db.add(AuditLog(hospital_profile_id=context.hospital.id,actor_user_id=context.user.id,action='inventory.threshold_changed',entity_type='blood_inventory',entity_id=item.id,details={'minimum':payload.minimum_threshold}))
    await service.reconcile(db,context.hospital.id);await db.commit()
    return await _read(db,item)
