from datetime import datetime, timezone
from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select, func, case, and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import HospitalContext, require_hospital_operator
from app.core.database import get_db
from app.models import InventoryUnit, InventoryComponentPolicy, InventoryStockPolicy, InventoryMovement, BloodRequest, AuditLog
from app.schemas.inventory_unit import UnitInput, UnitIntake, UnitEdit, UnitAction, ComponentPolicyInput, StockPolicyInput, ScanInput, Component, Status
from app.services import smart_inventory as service

router=APIRouter(prefix="/inventory",tags=["Inventory traceability"])


def read(unit,policy=None):
    result={c.name:getattr(unit,c.name) for c in unit.__table__.columns}
    return {**result,"status":service.effective_status(unit),"quantity":1,"blood_group":unit.blood_type[:-1],"rh_factor":unit.blood_type[-1],
        "clinically_available":unit.status=="available" and service.eligible(unit,policy),"qr_payload":"fluid:inventory:"+unit.id}


async def _policy(db,unit):
    return (await db.execute(select(InventoryComponentPolicy).where(InventoryComponentPolicy.hospital_profile_id==unit.hospital_profile_id,InventoryComponentPolicy.component==unit.component))).scalar_one_or_none()


async def _owned(db,unit_id,context,lock=False,request_id=None):
    unit=await db.get(InventoryUnit,unit_id)
    if not unit or unit.hospital_profile_id!=context.hospital.id:raise HTTPException(404,"Inventory unit not found")
    if lock:
        related=unit.reserved_request_id or request_id
        if related:
            await db.execute(select(BloodRequest.id).where(BloodRequest.id==related,BloodRequest.hospital_profile_id==context.hospital.id).with_for_update())
        await service.lock_hospital(db,context.hospital.id)
        old_related=unit.reserved_request_id
        unit=(await db.execute(select(InventoryUnit).where(InventoryUnit.id==unit_id).with_for_update().execution_options(populate_existing=True))).scalar_one()
        if unit.reserved_request_id!=old_related:raise HTTPException(409,"Reservation changed; refresh the unit")
    return unit


async def _commit(db,hospital_id):
    try:
        await service.reconcile(db,hospital_id)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409,"A unit with this official donation/product identifier already exists, or the record changed concurrently") from None


@router.get('/summary')
async def summary(db:AsyncSession=Depends(get_db),context:HospitalContext=Depends(require_hospital_operator)):
    return await service.summary(db,context.hospital.id)


@router.get('/component-policies')
async def component_policies(db:AsyncSession=Depends(get_db),context:HospitalContext=Depends(require_hospital_operator)):
    rows=(await db.execute(select(InventoryComponentPolicy).where(InventoryComponentPolicy.hospital_profile_id==context.hospital.id))).scalars()
    return {'items':[{c.name:getattr(p,c.name) for c in p.__table__.columns} for p in rows]}


@router.put('/component-policies/{component}')
async def set_component_policy(component:Component,payload:ComponentPolicyInput,db:AsyncSession=Depends(get_db),context:HospitalContext=Depends(require_hospital_operator)):
    service.authorize_clinical(context,payload.clinical_authorization)
    await service.lock_hospital(db,context.hospital.id)
    policy=(await db.execute(select(InventoryComponentPolicy).where(InventoryComponentPolicy.hospital_profile_id==context.hospital.id,InventoryComponentPolicy.component==component))).scalar_one_or_none()
    if not policy:
        policy=InventoryComponentPolicy(hospital_profile_id=context.hospital.id,component=component,version=0);db.add(policy)
    if policy.version!=payload.expected_version:raise HTTPException(409,"Policy changed; refresh before saving")
    for key,value in payload.model_dump(exclude={'expected_version','clinical_authorization'}).items():setattr(policy,key,value)
    policy.version+=1
    db.add(AuditLog(hospital_profile_id=context.hospital.id,actor_user_id=context.user.id,action='inventory.component_policy',entity_type='hospital',entity_id=context.hospital.id,details={'component':component,'approved':policy.approved,'standard_reference':policy.standard_reference,'version':policy.version}))
    await _commit(db,context.hospital.id)
    return {c.name:getattr(policy,c.name) for c in policy.__table__.columns}


@router.put('/stock-policy')
async def set_stock_policy(payload:StockPolicyInput,db:AsyncSession=Depends(get_db),context:HospitalContext=Depends(require_hospital_operator)):
    await service.lock_hospital(db,context.hospital.id)
    item=(await db.execute(select(InventoryStockPolicy).where(InventoryStockPolicy.hospital_profile_id==context.hospital.id,
        InventoryStockPolicy.blood_type==payload.blood_type,InventoryStockPolicy.component==payload.component))).scalar_one_or_none()
    if not item:item=InventoryStockPolicy(hospital_profile_id=context.hospital.id,**payload.model_dump());db.add(item)
    else:
        for key,value in payload.model_dump().items():setattr(item,key,value)
    db.add(AuditLog(hospital_profile_id=context.hospital.id,actor_user_id=context.user.id,action='inventory.stock_policy',entity_type='hospital',entity_id=context.hospital.id,details=payload.model_dump()))
    await _commit(db,context.hospital.id)
    return payload


@router.post('/scan')
async def scan(payload:ScanInput,db:AsyncSession=Depends(get_db),context:HospitalContext=Depends(require_hospital_operator)):
    value=payload.value.strip()
    if value.startswith('fluid:inventory:'):value=value[len('fluid:inventory:'):]
    unit=(await db.execute(select(InventoryUnit).where(InventoryUnit.hospital_profile_id==context.hospital.id,
        or_(InventoryUnit.id==value,InventoryUnit.internal_identifier==value)))).scalar_one_or_none()
    if not unit:raise HTTPException(404,"No unit found in this hospital. Scan a FLUID internal code or search the official identifier")
    return read(unit,await _policy(db,unit))


@router.get('/units')
async def units(blood_type:str|None=None,component:Component|None=None,status:Status|None=None,testing_status:str|None=None,
    search:str|None=Query(None,max_length=100),sort:str=Query('expiration',pattern='^(expiration|newest|blood_type|storage)$'),
    page:int=Query(1,ge=1),page_size:int=Query(20,ge=1,le=100),db:AsyncSession=Depends(get_db),context:HospitalContext=Depends(require_hospital_operator)):
    filters=[InventoryUnit.hospital_profile_id==context.hospital.id]
    if blood_type:filters.append(InventoryUnit.blood_type==blood_type)
    if component:filters.append(InventoryUnit.component==component)
    if status:
        effective=case((and_(InventoryUnit.status.notin_(['used','discarded']),InventoryUnit.expires_at<=service.now_utc()),'expired'),else_=InventoryUnit.status)
        filters.append(effective==status)
    if testing_status:filters.append(InventoryUnit.testing_status==testing_status)
    if search:filters.append(or_(InventoryUnit.internal_identifier.ilike(f'%{search}%'),InventoryUnit.official_identifier.ilike(f'%{search}%'),InventoryUnit.storage_location.ilike(f'%{search}%')))
    order={'expiration':InventoryUnit.expires_at.asc().nullslast(),'newest':InventoryUnit.created_at.desc(),'blood_type':InventoryUnit.blood_type.asc(),'storage':InventoryUnit.storage_location.asc()}[sort]
    total=(await db.execute(select(func.count(InventoryUnit.id)).where(*filters))).scalar_one()
    rows=(await db.execute(select(InventoryUnit).where(*filters).order_by(order,InventoryUnit.id).offset((page-1)*page_size).limit(page_size))).scalars()
    policies={p.component:p for p in (await db.execute(select(InventoryComponentPolicy).where(InventoryComponentPolicy.hospital_profile_id==context.hospital.id))).scalars()}
    return {'items':[read(u,policies.get(u.component)) for u in rows],'total':total,'page':page,'total_pages':(total+page_size-1)//page_size}


@router.post('/units',status_code=201)
async def create(payload:UnitInput,db:AsyncSession=Depends(get_db),context:HospitalContext=Depends(require_hospital_operator)):
    if not context.hospital.has_blood_bank:raise HTTPException(409,"Enable the hospital blood bank before receiving stock")
    await service.lock_hospital(db,context.hospital.id)
    try:unit=await service.create_unit(db,context.hospital.id,payload,context.user.id)
    except IntegrityError:
        await db.rollback();raise HTTPException(409,"Official donation and product identifier already recorded") from None
    await _commit(db,context.hospital.id)
    return read(unit,await _policy(db,unit))


@router.get('/units/{unit_id}')
async def detail(unit_id:str,db:AsyncSession=Depends(get_db),context:HospitalContext=Depends(require_hospital_operator)):
    unit=await _owned(db,unit_id,context)
    return read(unit,await _policy(db,unit))


@router.put('/units/{unit_id}')
async def edit(unit_id:str,payload:UnitEdit,db:AsyncSession=Depends(get_db),context:HospitalContext=Depends(require_hospital_operator)):
    unit=await _owned(db,unit_id,context,True)
    if unit.version!=payload.expected_version:raise HTTPException(409,"Unit changed; refresh before editing")
    if service.effective_status(unit) not in {'quarantined','testing'}:raise HTTPException(409,"Quarantine the unit before changing identity, storage or expiration metadata")
    service.authorize_clinical(context,payload.clinical_authorization)
    if payload.official_identifier and payload.product_code:
        duplicate=(await db.execute(select(InventoryUnit.id).where(InventoryUnit.hospital_profile_id==context.hospital.id,
            InventoryUnit.official_identifier==payload.official_identifier,InventoryUnit.product_code==payload.product_code,InventoryUnit.id!=unit.id))).first()
        if duplicate:raise HTTPException(409,"Official donation/product identifier already recorded")
    before=service.snapshot(unit)
    for key,value in payload.model_dump(exclude={'expected_version','reason','clinical_authorization'}).items():setattr(unit,key,value)
    unit.status,unit.testing_status,unit.released_at='quarantined','not_tested',None
    batch=await service.batch_for(db,context.hospital.id,unit.blood_type,unit.component,unit.expires_at,unit.collected_at,unit.storage_location)
    unit.batch_id=batch.id
    await service.record(db,unit,'metadata_edited',before,payload.reason,context.user.id)
    await _commit(db,context.hospital.id)
    return read(unit,await _policy(db,unit))


@router.post('/units/{unit_id}/actions')
async def action(unit_id:str,payload:UnitAction,db:AsyncSession=Depends(get_db),context:HospitalContext=Depends(require_hospital_operator)):
    unit=await _owned(db,unit_id,context,True,payload.request_id)
    await service.act(db,unit,payload,context)
    await _commit(db,context.hospital.id)
    return read(unit,await _policy(db,unit))


@router.get('/units/{unit_id}/qr')
async def qr(unit_id:str,db:AsyncSession=Depends(get_db),context:HospitalContext=Depends(require_hospital_operator)):
    unit=await _owned(db,unit_id,context)
    import qrcode
    from qrcode.image.svg import SvgPathImage
    code=qrcode.make('fluid:inventory:'+unit.id,image_factory=SvgPathImage,box_size=8,border=4)
    stream=BytesIO();code.save(stream)
    return Response(stream.getvalue(),media_type='image/svg+xml',headers={'Cache-Control':'private, no-store','Content-Disposition':f'inline; filename="{unit.internal_identifier}.svg"'})


@router.get('/units/{unit_id}/history')
async def history(unit_id:str,page:int=Query(1,ge=1),db:AsyncSession=Depends(get_db),context:HospitalContext=Depends(require_hospital_operator)):
    await _owned(db,unit_id,context)
    rows=(await db.execute(select(InventoryMovement).where(InventoryMovement.unit_id==unit_id,InventoryMovement.hospital_profile_id==context.hospital.id)
        .order_by(InventoryMovement.created_at.desc(),InventoryMovement.id).offset((page-1)*50).limit(50))).scalars()
    return {'items':[{'id':m.id,'action':m.action,'actor_user_id':m.actor_user_id,'details':m.details,'created_at':m.created_at} for m in rows]}


@router.post('/units/intake',status_code=201)
async def bulk_intake(payload:UnitIntake,db:AsyncSession=Depends(get_db),context:HospitalContext=Depends(require_hospital_operator)):
    if not context.hospital.has_blood_bank:raise HTTPException(409,"Enable the hospital blood bank before receiving stock")
    await service.lock_hospital(db,context.hospital.id)
    items=[]
    for _ in range(payload.quantity):
        items.append(await service.create_unit(db,context.hospital.id,payload.model_dump(exclude={'quantity'}),context.user.id))
    await _commit(db,context.hospital.id)
    policy=await _policy(db,items[0])
    return {'items':[read(item,policy) for item in items]}
