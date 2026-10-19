"""Traceable physical units. Clinical release always requires human authorization."""
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func
from fastapi import HTTPException
from app.models import (InventoryUnit, InventoryComponentPolicy, InventoryStockPolicy, InventoryMovement,
    InventoryAlertState, BloodInventory, BloodRequest, HospitalProfile, HospitalMembership, Notification, AuditLog)
from app.services.blood_matching import can_donate_to

COMPONENTS = ("whole_blood", "red_cells", "plasma", "platelets")
TERMINAL = {"used", "discarded", "expired"}


def now_utc(): return datetime.now(timezone.utc)


async def lock_hospital(db, hospital_id):
    await db.execute(select(HospitalProfile.id).where(HospitalProfile.id == hospital_id).with_for_update())


def authorize_clinical(context, attested):
    if context.membership.role not in {"hospital_admin", "blood_bank_manager"} or not attested:
        raise HTTPException(403, "Clinical authorization by a hospital administrator or blood bank manager is required")


def effective_status(unit, now=None):
    if unit.status not in {"used", "discarded"} and unit.expires_at and unit.expires_at <= (now or now_utc()): return "expired"
    return unit.status


def release_valid(unit, policy, now=None):
    now = now or now_utc()
    return bool(policy and policy.approved and unit.collected_at and unit.expires_at and unit.expires_at > now
        and policy.max_shelf_life_hours and unit.expires_at <= unit.collected_at + timedelta(hours=policy.max_shelf_life_hours)
        and unit.temperature_c is not None and policy.temperature_min_c is not None and policy.temperature_max_c is not None
        and policy.temperature_min_c <= unit.temperature_c <= policy.temperature_max_c
        and unit.official_identifier and unit.product_code and unit.label_standard and unit.testing_status == "passed" and not unit.recall_active)


def eligible(unit, policy, now=None):
    return effective_status(unit, now) in {"available", "reserved"} and bool(unit.released_at) and release_valid(unit, policy, now)


def snapshot(unit):
    return {key: (getattr(unit, key).isoformat() if isinstance(getattr(unit,key), datetime) else getattr(unit,key)) for key in (
        "blood_type", "component", "official_identifier", "product_code", "label_standard", "status", "testing_status", "storage_location", "temperature_c", "reserved_request_id", "recall_active", "collected_at", "expires_at")}


async def record(db, unit, action, before, reason, actor_id=None, extra=None):
    unit.version += 1
    after = snapshot(unit)
    # Free-stock delta is recorded from actual release/status transitions; stock analytics use this ledger.
    before_free = int(before.get("status") == "available" and before.get("testing_status") == "passed")
    after_free = int(unit.status == "available" and unit.testing_status == "passed")
    details = {"before": before, "after": after, "reason": reason, "version": unit.version,
        "available_delta": after_free-before_free, **(extra or {})}
    db.add(InventoryMovement(hospital_profile_id=unit.hospital_profile_id, unit_id=unit.id, actor_user_id=actor_id, action=action, details=details))
    if actor_id:
        db.add(AuditLog(hospital_profile_id=unit.hospital_profile_id, actor_user_id=actor_id,
            action=f"inventory.{action}", entity_type="inventory_unit", entity_id=unit.id, details=details))


async def batch_for(db, hospital_id, blood_type, component, expires_at, collected_at, storage, threshold=5):
    expiration = (expires_at - timedelta(microseconds=1)).date() if expires_at else None
    batch = (await db.execute(select(BloodInventory).where(BloodInventory.hospital_profile_id == hospital_id,
        BloodInventory.blood_type == blood_type, BloodInventory.component == component,
        BloodInventory.expiration_date == expiration, BloodInventory.storage_location == storage))).scalar_one_or_none()
    if not batch:
        batch = BloodInventory(hospital_profile_id=hospital_id,blood_type=blood_type,component=component,
            expiration_date=expiration,collection_date=collected_at.date() if collected_at else None,
            storage_location=storage,units_available=0,minimum_threshold=threshold)
        db.add(batch); await db.flush()
    policy = (await db.execute(select(InventoryStockPolicy).where(InventoryStockPolicy.hospital_profile_id == hospital_id,
        InventoryStockPolicy.blood_type == blood_type, InventoryStockPolicy.component == component))).scalar_one_or_none()
    if not policy:
        db.add(InventoryStockPolicy(hospital_profile_id=hospital_id,blood_type=blood_type,component=component,minimum=threshold,critical=0))
    return batch


async def create_unit(db, hospital_id, payload, actor_id, threshold=5):
    data = payload.model_dump() if hasattr(payload, "model_dump") else payload
    batch = await batch_for(db,hospital_id,data['blood_type'],data['component'],data.get('expires_at'),data.get('collected_at'),data['storage_location'],threshold)
    unit = InventoryUnit(hospital_profile_id=hospital_id,batch_id=batch.id,status="quarantined",testing_status="not_tested",**data)
    db.add(unit); await db.flush()
    await record(db,unit,"intake",{},"Physical unit received; quarantined pending testing and clinical release",actor_id)
    return unit


async def act(db, unit, payload, context):
    if unit.version != payload.expected_version: raise HTTPException(409,"This unit changed. Refresh before continuing")
    action, before = payload.action, snapshot(unit)
    policy = (await db.execute(select(InventoryComponentPolicy).where(InventoryComponentPolicy.hospital_profile_id == unit.hospital_profile_id,
        InventoryComponentPolicy.component == unit.component))).scalar_one_or_none()
    current = effective_status(unit)
    if current in TERMINAL and action != "recall" and not (current == "expired" and action == "discard"): raise HTTPException(409,"Used, discarded or expired units cannot re-enter available stock")
    if action in {"clinical_release","use","recall","discard","record_testing"}: authorize_clinical(context,payload.clinical_authorization)
    if action == "start_testing":
        if current != "quarantined": raise HTTPException(409,"Only quarantined units can enter testing")
        unit.status,unit.testing_status="testing","in_progress"
    elif action == "record_testing":
        if current != "testing" or not payload.testing_status: raise HTTPException(409,"Start testing and choose a verified result")
        unit.testing_status=payload.testing_status
        if payload.testing_status=="failed": unit.status="quarantined"
    elif action == "clinical_release":
        if current not in {"quarantined","testing"} or not payload.official_label_verified or not payload.cold_chain_verified:
            raise HTTPException(409,"Release requires quarantine/testing, official-label verification and verified cold-chain conditions")
        if unit.recall_active and not payload.recall_resolved: raise HTTPException(409,"The recall must be explicitly resolved before re-release")
        from types import SimpleNamespace
        candidate=SimpleNamespace(**{c.name:getattr(unit,c.name) for c in unit.__table__.columns})
        candidate.recall_active=False
        candidate.temperature_c=payload.temperature_c
        if not release_valid(candidate,policy): raise HTTPException(409,"Clinical release requires passed testing, official identifiers, current expiration, and an approved component storage/shelf-life policy")
        unit.recall_active,unit.temperature_c=False,payload.temperature_c
        unit.status,unit.released_at,unit.released_by="available",now_utc(),context.user.id
    elif action == "reserve":
        if current != "available" or not eligible(unit,policy) or not payload.compatibility_verified: raise HTTPException(409,"Reserve only clinically released current stock after compatibility review")
        request = await db.get(BloodRequest,payload.request_id) if payload.request_id else None
        if not request or request.hospital_profile_id != context.hospital.id: raise HTTPException(404,"Choose a hospital-owned blood request")
        if request.status not in {"published","partially_fulfilled"} or any(d and d<=now_utc() for d in (request.expires_at,request.required_by)):
            raise HTTPException(409,"The blood request has closed")
        if request.component != unit.component or not can_donate_to(unit.blood_type,request.blood_type,unit.component): raise HTTPException(409,"Component or blood-group compatibility requires another unit")
        unit.status,unit.reserved_request_id="reserved",request.id
    elif action == "unreserve":
        if current != "reserved": raise HTTPException(409,"Unit is not reserved")
        unit.reserved_request_id=None
        unit.status="available" if eligible(unit,policy) else "quarantined"
    elif action == "use":
        if current not in {"available","reserved"} or not eligible(unit,policy) or not payload.compatibility_verified:
            raise HTTPException(409,"Issue only released, unexpired stock with authorized compatibility confirmation")
        if unit.reserved_request_id:
            request=await db.get(BloodRequest,unit.reserved_request_id)
            if not request or request.status not in {"published","partially_fulfilled"} or any(d and d<=now_utc() for d in (request.expires_at,request.required_by)):
                raise HTTPException(409,"The reserved request closed; release the reservation before reassignment")
        unit.status="used"
    elif action in {"quarantine","recall"}:
        if current=="discarded": raise HTTPException(409,"A discarded unit is terminal")
        if action=="recall": unit.recall_active=True
        if current!="used":
            unit.status,unit.testing_status,unit.released_at,unit.reserved_request_id="quarantined","not_tested",None,None
    elif action == "discard":
        if unit.status=="used": raise HTTPException(409,"A used unit cannot be recorded as disposed stock")
        unit.status,unit.reserved_request_id="discarded",None
    elif action == "move":
        if not payload.storage_location or not payload.cold_chain_verified: raise HTTPException(409,"Record the destination and verify transport/storage conditions")
        unit.storage_location,unit.temperature_c=payload.storage_location,payload.temperature_c
        if unit.status in {"available","reserved"} and not release_valid(unit,policy):
            unit.status,unit.testing_status,unit.released_at,unit.reserved_request_id="quarantined","not_tested",None,None
    await record(db,unit,action,before,payload.reason,context.user.id,
        {"clinical_authorization":payload.clinical_authorization,"cold_chain_verified":payload.cold_chain_verified,"official_label_verified":payload.official_label_verified,"compatibility_verified":payload.compatibility_verified, "component_policy": {"version": policy.version, "standard_reference": policy.standard_reference, "max_shelf_life_hours": policy.max_shelf_life_hours, "temperature_min_c":policy.temperature_min_c,"temperature_max_c":policy.temperature_max_c} if policy and action=="clinical_release" else None})
    if action=="recall":
        await alert(db,unit.hospital_profile_id,"recall:"+unit.id,str(unit.version),"Inventory recall",f"{unit.internal_identifier}: active recall. Review traceability and coordinate any necessary clinical follow-up.")


async def data_for(db,hospital_id):
    units=list((await db.execute(select(InventoryUnit).where(InventoryUnit.hospital_profile_id==hospital_id))).scalars())
    policies={p.component:p for p in (await db.execute(select(InventoryComponentPolicy).where(InventoryComponentPolicy.hospital_profile_id==hospital_id))).scalars()}
    stock=list((await db.execute(select(InventoryStockPolicy).where(InventoryStockPolicy.hospital_profile_id==hospital_id))).scalars())
    return units,policies,stock


async def summary(db,hospital_id):
    units,policies,stock=await data_for(db,hospital_id)
    now=now_utc(); groups=[]
    configured={(p.blood_type,p.component):p for p in stock}
    keys=set(configured)|{(u.blood_type,u.component) for u in units}
    for blood,component in sorted(keys):
        rows=[u for u in units if u.blood_type==blood and u.component==component]
        policy=configured.get((blood,component));clinical=policies.get(component)
        free=sum(u.status=="available" and eligible(u,clinical,now) for u in rows)
        reserved=sum(u.status=="reserved" and eligible(u,clinical,now) for u in rows)
        minimum,critical=(policy.minimum,policy.critical) if policy else (0,0)
        level="critical" if policy and free<=critical else "low" if policy and free<=minimum else "normal"
        groups.append(dict(blood_type=blood,component=component,available=free,reserved=reserved,total=len(rows),minimum=minimum,critical=critical,level=level,shortage=max(0,minimum-free)))
    expiring=[u for u in units if u.status not in TERMINAL and u.expires_at and now<u.expires_at<=now+timedelta(hours=policies[u.component].expiry_warning_hours if u.component in policies else 168)]
    movements=(await db.execute(select(InventoryMovement).where(InventoryMovement.hospital_profile_id==hospital_id,InventoryMovement.created_at>=now-timedelta(days=30)))).scalars().all()
    trend=[]
    for offset in range(29,-1,-1):
        day=(now-timedelta(days=offset)).date();rows=[m for m in movements if m.created_at.date()==day]
        trend.append({"date":day.isoformat(),"available_change":sum(m.details.get("available_delta",0) for m in rows),"movements":len(rows)})
    return {"available":sum(g['available'] for g in groups),"reserved":sum(g['reserved'] for g in groups),"physical_units":sum(effective_status(u) not in TERMINAL for u in units),
        "low_groups":sum(g['level']=='low' for g in groups),"critical_groups":sum(g['level']=='critical' for g in groups),"expiring_soon":len(expiring),
        "quarantined":sum(effective_status(u)=='quarantined' for u in units),"groups":groups,"trend":trend}


async def alert(db,hospital_id,key,state,title,message):
    row=(await db.execute(select(InventoryAlertState).where(InventoryAlertState.hospital_profile_id==hospital_id,InventoryAlertState.key==key))).scalar_one_or_none()
    if row and row.state==state:return
    if row:row.state=state
    else:db.add(InventoryAlertState(hospital_profile_id=hospital_id,key=key,state=state))
    if state=="normal":return
    users=(await db.execute(select(HospitalMembership.user_id).where(HospitalMembership.hospital_profile_id==hospital_id,HospitalMembership.is_active.is_(True),HospitalMembership.role.in_(["hospital_admin","blood_bank_manager","hospital_staff"])))).scalars()
    for uid in set(users): db.add(Notification(user_id=uid,type="inventory",title=title,message=message,level="warning",related_path="/hospital/inventory"))


async def reconcile(db,hospital_id):
    """Caller holds the facility lock; never auto-releases a clinical unit."""
    units,policies,_=await data_for(db,hospital_id)
    for unit in units:
        before=snapshot(unit)
        if unit.status not in TERMINAL and unit.expires_at and unit.expires_at<=now_utc():
            unit.status,unit.reserved_request_id="expired",None
            await record(db,unit,"expired",before,"Expiration time reached")
        elif unit.status in {"available","reserved"} and not eligible(unit,policies.get(unit.component)):
            unit.status,unit.released_at,unit.reserved_request_id="quarantined",None,None
            await record(db,unit,"quarantined",before,"Clinical release prerequisites no longer satisfied")
        elif unit.status=="reserved" and unit.reserved_request_id:
            req=await db.get(BloodRequest,unit.reserved_request_id)
            if not req or req.status not in {"published","partially_fulfilled"} or any(d and d<=now_utc() for d in (req.expires_at,req.required_by)):
                unit.status,unit.reserved_request_id="available",None
                await record(db,unit,"unreserved",before,"Related blood request closed")
        if unit.expires_at:
            state="expired:"+unit.expires_at.isoformat() if effective_status(unit)=="expired" else "soon:"+unit.expires_at.isoformat() if unit.status not in TERMINAL and unit.expires_at<=now_utc()+timedelta(hours=policies[unit.component].expiry_warning_hours if unit.component in policies else 168) else "normal"
            await alert(db,hospital_id,"expiry:"+unit.id,state,"Inventory expiration alert",f"{unit.internal_identifier}: {effective_status(unit)}; expires {unit.expires_at.isoformat()}.")
    await db.flush()
    for batch in (await db.execute(select(BloodInventory).where(BloodInventory.hospital_profile_id==hospital_id))).scalars():
        rows=[u for u in units if u.batch_id==batch.id and eligible(u,policies.get(u.component))]
        batch.units_available=len(rows);batch.units_reserved=sum(u.status=='reserved' for u in rows)
    result=await summary(db,hospital_id)
    for group in result['groups']:
        await alert(db,hospital_id,f"stock:{group['blood_type']}:{group['component']}",group['level'],f"{group['level'].title()} {group['blood_type']} stock",
            f"{group['component'].replace('_',' ')}: {group['available']} clinically released unreserved unit(s). Minimum {group['minimum']}.")


async def monitor_inventory(factory):
    async with factory() as db:
        ids=(await db.execute(select(HospitalProfile.id).where(HospitalProfile.verification_status=='verified'))).scalars().all()
    for hid in ids:
        async with factory() as db:
            await lock_hospital(db,hid)
            await reconcile(db,hid)
            await db.commit()
