from datetime import datetime, timezone, timedelta, date, time
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, select, delete, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, get_hospital_context, require_hospital_operator, require_hospital_admin
from app.core.database import get_db
from app.models import (Appointment, AppointmentPolicy, AppointmentOccupancy, AppointmentEvent, BloodRequest,
    DonorProfile, DonorResponse, User, AuditLog)
from app.schemas.appointment import (AppointmentRead, AppointmentPageRead, AppointmentSchedule,
    AppointmentStatusUpdate, AppointmentCreate, AppointmentPolicyUpdate, AppointmentPreferences)
from app.services import appointment_scheduling as scheduling

router = APIRouter(prefix='/appointments', tags=['Appointments'])


def _read(item, request, donor, private=False):
    names = (donor.full_name or 'Donor').split()
    data = {c.name: getattr(item, c.name) for c in item.__table__.columns if c.name in AppointmentRead.model_fields}
    if not private: data['internal_notes'] = None
    return AppointmentRead(**data, hospital_name=request.hospital_name,
        donor_name=names[0] + (f' {names[-1][0]}.' if private and len(names)>1 else ''),
        blood_type=request.blood_type, component=request.component,
        hospital_latitude=request.latitude, hospital_longitude=request.longitude)


async def _context(db, user):
    return await require_hospital_operator(await get_hospital_context(db, user))


async def _owned(db, appointment_id, user):
    initial = await db.get(Appointment, appointment_id)
    if not initial: raise HTTPException(404, 'Appointment not found')
    request = await db.get(BloodRequest, initial.blood_request_id)
    hospital_id = None
    if user.role == 'hospital':
        context = await _context(db, user)
        hospital_id = context.hospital.id
        if request.hospital_profile_id != hospital_id: raise HTTPException(404, 'Appointment not found')
    elif user.role != 'donor' or user.id != initial.donor_user_id: raise HTTPException(404, 'Appointment not found')
    request = (await db.execute(select(BloodRequest).where(BloodRequest.id == request.id).with_for_update().execution_options(populate_existing=True))).scalar_one()
    policy = await scheduling.policy_for(db, request.hospital_profile_id, lock=True)
    await db.execute(select(DonorProfile.id).where(DonorProfile.user_id == initial.donor_user_id).with_for_update())
    item = (await db.execute(select(Appointment).where(Appointment.id == appointment_id).with_for_update().execution_options(populate_existing=True))).scalar_one()
    return item, request, await db.get(User, item.donor_user_id), hospital_id, policy


def _version(item, value):
    if value is not None and item.version != value: raise HTTPException(409, 'This appointment changed. Refresh before updating it.')


@router.get('/policy')
async def get_policy(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    context = await _context(db, user)
    policy = await scheduling.policy_for(db, context.hospital.id, lock=True)
    await db.commit()
    return {c.name: getattr(policy, c.name) for c in policy.__table__.columns}


@router.put('/policy')
async def save_policy(payload: AppointmentPolicyUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    context = await require_hospital_operator(await require_hospital_admin(await get_hospital_context(db, user)))
    policy = await scheduling.policy_for(db, context.hospital.id, lock=True)
    # Validate proposed hours against reservations before changing availability.
    candidate = AppointmentPolicy(hospital_profile_id=policy.hospital_profile_id, **{**payload.model_dump(), "enabled": True})
    booked = (await db.execute(select(Appointment).join(BloodRequest, BloodRequest.id == Appointment.blood_request_id).where(
        BloodRequest.hospital_profile_id == context.hospital.id, Appointment.status.in_(['pending','confirmed','checked_in']),
        Appointment.is_scheduled.is_(True), Appointment.ends_at > scheduling.now_utc()))).scalars().all()
    for item in booked:
        if scheduling.slot_end(item.scheduled_at, candidate) != item.ends_at:
            raise HTTPException(409, 'Reschedule existing bookings before changing slot duration or operating hours')
    seats = (await db.execute(select(func.max(AppointmentOccupancy.seat)).where(AppointmentOccupancy.hospital_profile_id == context.hospital.id,
        AppointmentOccupancy.minute > scheduling.now_utc()))).scalar_one()
    if seats is not None and seats >= payload.capacity: raise HTTPException(409, 'Capacity cannot be reduced below existing bookings')
    for key, value in payload.model_dump().items(): setattr(policy, key, value)
    db.add(AuditLog(hospital_profile_id=context.hospital.id, actor_user_id=user.id, action='appointment.availability_updated', entity_type='hospital', entity_id=context.hospital.id,
        details={'timezone': payload.timezone, 'capacity': payload.capacity, 'slot_minutes': payload.slot_minutes}))
    await db.commit()
    return payload


@router.get('/preferences', response_model=AppointmentPreferences)
async def get_preferences(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != 'donor': raise HTTPException(403, 'Donor access only')
    profile = (await db.execute(select(DonorProfile).where(DonorProfile.user_id == user.id))).scalar_one()
    return AppointmentPreferences(timezone=profile.appointment_timezone, hours=profile.appointment_preferences)


@router.put('/preferences', response_model=AppointmentPreferences)
async def save_preferences(payload: AppointmentPreferences, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != 'donor': raise HTTPException(403, 'Donor access only')
    profile = (await db.execute(select(DonorProfile).where(DonorProfile.user_id == user.id).with_for_update())).scalar_one()
    profile.appointment_timezone, profile.appointment_preferences = payload.timezone, [h.model_dump() for h in payload.hours]
    await db.commit()
    return payload


async def _slots(db, request, donor_id, policy, start_date, days, exclude_id=None):
    profile, _ = await scheduling.validate_referral(db, request, donor_id)
    if not policy.enabled: return {'items': [], 'timezone': policy.timezone, 'notice': 'Hospital appointment availability is not configured.'}
    zone = ZoneInfo(policy.timezone)
    if abs((start_date - scheduling.now_utc().astimezone(zone).date()).days) > 365:
        raise HTTPException(422, "Search within one year of the current date")
    lower = datetime.combine(start_date, time(), zone).astimezone(timezone.utc)
    upper = lower + timedelta(days=days+1)
    rows = (await db.execute(select(AppointmentOccupancy).where(AppointmentOccupancy.minute >= lower,
        AppointmentOccupancy.minute < upper, or_(AppointmentOccupancy.hospital_profile_id == request.hospital_profile_id,
        AppointmentOccupancy.donor_user_id == donor_id), AppointmentOccupancy.appointment_id != (exclude_id or '')))).scalars().all()
    donor_busy = {r.minute for r in rows if r.donor_user_id == donor_id}
    hospital_busy = {}
    for row in rows:
        if row.hospital_profile_id == request.hospital_profile_id: hospital_busy.setdefault(row.minute, set()).add(row.seat)
    items, seen = [], set()
    for offset in range(days):
        day = start_date + timedelta(days=offset)
        for hours in policy.hours:
            if hours['weekday'] != day.weekday(): continue
            wall = datetime.combine(day, time.fromisoformat(hours['start']))
            closing = datetime.combine(day, time.fromisoformat(hours['end']))
            while wall < closing:
                for fold in (0, 1):
                    start = wall.replace(tzinfo=zone, fold=fold).astimezone(timezone.utc)
                    if start in seen or start.astimezone(zone).replace(tzinfo=None) != wall: continue
                    seen.add(start)
                    if start <= scheduling.now_utc(): continue
                    try: end = scheduling.slot_end(start, policy)
                    except HTTPException: continue
                    if any(d and end > d for d in (request.required_by, request.expires_at)): continue
                    minutes = [start + timedelta(minutes=m) for m in range(policy.slot_minutes)]
                    if any(m in donor_busy for m in minutes): continue
                    remaining = min(policy.capacity - len(hospital_busy.get(m, set())) for m in minutes)
                    if remaining > 0: items.append({'scheduled_at': start, 'ends_at': end, 'available_capacity': remaining, 'preferred': scheduling.preferred(start, profile)})
                wall += timedelta(minutes=policy.slot_minutes)
    urgent = request.urgency in {'urgent', 'critical'}
    items.sort(key=(lambda s: (s['scheduled_at'], not s['preferred'])) if urgent else (lambda s: (not s['preferred'], s['scheduled_at'])))
    return {'items': items[:500], 'timezone': policy.timezone, 'notice': ('Urgent request: earliest available times first.' if urgent else 'Preferred times first.') + ' Clinical screening remains required.', 'urgency': request.urgency}


@router.get('/available-slots')
async def available_slots(request_id: str, donor_user_id: str, start_date: date, days: int = Query(7, ge=1, le=14),
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    context = await _context(db, user)
    request = await db.get(BloodRequest, request_id)
    if not request or request.hospital_profile_id != context.hospital.id: raise HTTPException(404, 'Request not found')
    policy = await scheduling.policy_for(db, context.hospital.id, lock=True)
    return await _slots(db, request, donor_user_id, policy, start_date, days)


@router.get('', response_model=AppointmentPageRead)
async def list_appointments(scope: str = Query('donor', pattern='^(donor|hospital)$'), status_filter: str | None = Query(None, alias='status'),
    page: int = Query(1, ge=1), page_size: int = Query(12, ge=1, le=100), from_date: datetime | None = None, to_date: datetime | None = None,
    search: str | None = Query(None, max_length=120), request_id: str | None = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if scope == 'donor':
        if current_user.role != 'donor': raise HTTPException(403, 'Donor access only')
        filters = [Appointment.donor_user_id == current_user.id]
    else:
        context = await _context(db, current_user)
        filters = [BloodRequest.hospital_profile_id == context.hospital.id]
    if status_filter == 'upcoming': filters.append(Appointment.status.in_(['pending','confirmed','checked_in']))
    elif status_filter == 'closed': filters.append(Appointment.status.in_(['cancelled','no_show','missed']))
    elif status_filter and status_filter != 'all': filters.append(Appointment.status == status_filter)
    if request_id: filters.append(Appointment.blood_request_id == request_id)
    for boundary in (from_date, to_date):
        if boundary and boundary.tzinfo is None: raise HTTPException(422, 'Date filters must include a time zone')
    if from_date: filters.append(Appointment.scheduled_at >= from_date)
    if to_date: filters.append(Appointment.scheduled_at < to_date)
    if search: filters.append((User.full_name if scope=='hospital' else BloodRequest.hospital_name).ilike(f'%{search}%'))
    base = select(Appointment, BloodRequest, User).join(BloodRequest, BloodRequest.id == Appointment.blood_request_id).join(User, User.id == Appointment.donor_user_id).where(*filters)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(base.order_by(Appointment.scheduled_at.asc(), Appointment.id).offset((page-1)*page_size).limit(page_size))).all()
    return AppointmentPageRead(items=[_read(*row, private=scope=='hospital') for row in rows], page=page, page_size=page_size, total=total, total_pages=(total+page_size-1)//page_size)


async def _propose(db, item, request, user, hospital_id, policy, payload):
    _version(item, payload.expected_version)
    if item.status not in {'pending','confirmed'}: raise HTTPException(409, 'Only pending or confirmed appointments can be rescheduled')
    await scheduling.reserve(db, item, request, payload.scheduled_at, policy)
    item.status, item.proposed_by = 'pending', 'hospital' if hospital_id else 'donor'
    item.donor_confirmed_at = None if hospital_id else scheduling.now_utc()
    item.hospital_confirmed_at = scheduling.now_utc() if hospital_id else None
    item.schedule_version += 1
    if hospital_id:
        item.preparation_instructions = payload.preparation_instructions if payload.preparation_instructions is not None else policy.preparation_instructions
        for key in ('department','contact_person','internal_notes'):
            if getattr(payload,key) is not None: setattr(item,key,getattr(payload,key))
    elif not item.preparation_instructions: item.preparation_instructions = policy.preparation_instructions
    _, referral = await scheduling.validate_referral(db, request, item.donor_user_id)
    referral.status = 'scheduled'
    await scheduling.changed(db,item,request,user.id,'time_proposed')


@router.post('', response_model=AppointmentRead, status_code=201)
async def create_appointment(payload: AppointmentCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    context = await _context(db,user)
    request = (await db.execute(select(BloodRequest).where(BloodRequest.id == payload.blood_request_id).with_for_update())).scalar_one_or_none()
    if not request or request.hospital_profile_id != context.hospital.id: raise HTTPException(404,'Request not found')
    policy = await scheduling.policy_for(db,context.hospital.id,lock=True)
    await db.execute(select(DonorProfile.id).where(DonorProfile.user_id == payload.donor_user_id).with_for_update())
    await scheduling.validate_referral(db, request, payload.donor_user_id)
    item = (await db.execute(select(Appointment).where(Appointment.blood_request_id == request.id,Appointment.donor_user_id == payload.donor_user_id))).scalar_one_or_none()
    if item and (item.is_scheduled or item.status != 'pending'): raise HTTPException(409,'An appointment already exists for this donor and request')
    if item is None:
        item = Appointment(donor_user_id=payload.donor_user_id,hospital_user_id=user.id,blood_request_id=request.id,scheduled_at=payload.scheduled_at,location=request.location,status='pending')
        db.add(item); await db.flush()
    await _propose(db,item,request,user,context.hospital.id,policy,payload)
    await db.commit()
    return _read(item,request,await db.get(User,item.donor_user_id),True)


@router.get('/{appointment_id}/slots')
async def appointment_slots(appointment_id: str, start_date: date, days: int = Query(7,ge=1,le=14),db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    item, request, _, _, policy = await _owned(db,appointment_id,user)
    if item.status not in {'pending','confirmed'}: raise HTTPException(409,'This appointment cannot be rescheduled')
    return await _slots(db,request,item.donor_user_id,policy,start_date,days,item.id)


@router.patch('/{appointment_id}/schedule', response_model=AppointmentRead)
async def schedule_appointment(appointment_id: str,payload: AppointmentSchedule,db: AsyncSession = Depends(get_db),current_user: User = Depends(get_current_user)):
    item, request, donor, hospital_id, policy = await _owned(db,appointment_id,current_user)
    await _propose(db,item,request,current_user,hospital_id,policy,payload)
    await db.commit()
    return _read(item,request,donor,bool(hospital_id))


@router.patch('/{appointment_id}/status',response_model=AppointmentRead)
async def update_appointment_status(appointment_id: str,payload: AppointmentStatusUpdate,db: AsyncSession = Depends(get_db),current_user: User = Depends(get_current_user)):
    item, request, donor, hospital_id, policy = await _owned(db,appointment_id,current_user)
    _version(item,payload.expected_version)
    status = 'no_show' if payload.status=='missed' else payload.status
    now = scheduling.now_utc()
    if item.status not in scheduling.ACTIVE: raise HTTPException(409,'This appointment is already closed')
    if not hospital_id and status not in {'confirmed','cancelled'}: raise HTTPException(403,'Authorized hospital staff are required')
    if status == 'confirmed':
        if item.status != 'pending' or not item.is_scheduled: raise HTTPException(409,'A pending time proposal is required')
        if (hospital_id and item.proposed_by != 'donor') or (not hospital_id and item.proposed_by != 'hospital'):
            raise HTTPException(409,'The other party must confirm the proposed time')
        await scheduling.reserve(db,item,request,item.scheduled_at,policy)
        if hospital_id: item.hospital_confirmed_at=now
        else: item.donor_confirmed_at=now
    elif status == 'checked_in':
        await scheduling.validate_referral(db,request,item.donor_user_id)
        if item.status != 'confirmed' or not item.ends_at or now < item.scheduled_at-timedelta(minutes=30) or now > item.ends_at+timedelta(hours=2):
            raise HTTPException(409,'Check-in requires a confirmed appointment near its scheduled time')
        item.checked_in_at=now
    elif status == 'completed':
        if item.status != 'checked_in' or not payload.screening_confirmed or not payload.procedure_confirmed or not payload.actual_units:
            raise HTTPException(409,'Check in the donor and confirm screening, the actual procedure, and collected units')
        if request.status not in {'published','partially_fulfilled','expired'} or payload.actual_units > request.units-request.units_fulfilled:
            raise HTTPException(409,'Collected units exceed the remaining request or the request has closed')
        request.units_fulfilled += payload.actual_units
        request.status='fulfilled' if request.units_fulfilled==request.units else 'expired' if request.status=='expired' else 'partially_fulfilled'
        item.units,item.completed_at,item.outcome_confirmed_by=payload.actual_units,now,current_user.id
        profile=(await db.execute(select(DonorProfile).where(DonorProfile.user_id==donor.id))).scalar_one()
        profile.last_donation_date=now.date()
        referral=(await db.execute(select(DonorResponse).where(DonorResponse.blood_request_id==request.id,DonorResponse.donor_user_id==donor.id))).scalar_one_or_none()
        if referral: referral.status='completed'
        # Inventory is intentionally updated only by its existing separate testing/release workflow.
    elif status == 'no_show':
        if item.status!='confirmed' or not item.ends_at or now < item.ends_at+timedelta(minutes=15): raise HTTPException(409,'Record a no-show only after the appointment and grace period')
    elif status == 'cancelled':
        if item.status=='checked_in' and (not hospital_id or not payload.reason): raise HTTPException(409,'Hospital staff must provide a reason when the procedure was not completed')
        item.cancellation_reason=payload.reason
    item.status=status
    if status in {'completed','cancelled','no_show'}:
        await db.execute(delete(AppointmentOccupancy).where(AppointmentOccupancy.appointment_id==item.id))
        if status!='completed':
            referral=(await db.execute(select(DonorResponse).where(DonorResponse.blood_request_id==request.id,DonorResponse.donor_user_id==donor.id))).scalar_one_or_none()
            if referral: referral.status='cancelled' if status=='cancelled' else 'missed'
    if hospital_id and payload.internal_notes is not None: item.internal_notes=payload.internal_notes
    await scheduling.changed(db,item,request,current_user.id,status,{'reason':payload.reason,'actual_units':payload.actual_units if status=='completed' else None, 'screening_confirmed':payload.screening_confirmed if status=='completed' else None, 'procedure_confirmed':payload.procedure_confirmed if status=='completed' else None})
    if status=='completed':
        await db.flush()
        from app.services.emergency_alerts import request_changed
        await request_changed(db,request)
    await db.commit()
    return _read(item,request,donor,bool(hospital_id))


@router.patch('/{appointment_id}/cancel',response_model=AppointmentRead)
async def cancel_appointment(appointment_id: str, db: AsyncSession = Depends(get_db),current_user: User = Depends(get_current_user)):
    return await update_appointment_status(appointment_id,AppointmentStatusUpdate(status='cancelled'),db,current_user)


@router.get('/{appointment_id}/history')
async def appointment_history(appointment_id: str, db: AsyncSession = Depends(get_db),user: User = Depends(get_current_user)):
    await _owned(db,appointment_id,user)
    rows=(await db.execute(select(AppointmentEvent).where(AppointmentEvent.appointment_id==appointment_id).order_by(AppointmentEvent.version.desc()))).scalars().all()
    return {'items':[{'action':r.action,'details':r.details,'created_at':r.created_at,'version':r.version} for r in rows]}


def _ics_text(value):
    return value.replace('\\','\\\\').replace('\r','').replace('\n','\\n').replace(';','\\;').replace(',','\\,')


@router.get('/{appointment_id}/calendar')
async def calendar_download(appointment_id: str,db: AsyncSession = Depends(get_db),user: User = Depends(get_current_user)):
    item, request, _, _, _=await _owned(db,appointment_id,user)
    if item.status not in {'confirmed','checked_in'} or not item.ends_at: raise HTTPException(409,'Only confirmed appointments can be added to a calendar')
    stamp=lambda d:d.astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//FLUID//Appointments//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',f'UID:{item.id}@fluid',f'DTSTAMP:{stamp(scheduling.now_utc())}',f'SEQUENCE:{item.schedule_version}',f'DTSTART:{stamp(item.scheduled_at)}',f'DTEND:{stamp(item.ends_at)}','SUMMARY:FLUID donation appointment','LOCATION:'+_ics_text(item.location),'DESCRIPTION:'+_ics_text(item.preparation_instructions+'\nClinical screening required.'),'END:VEVENT','END:VCALENDAR']
    folded=[]
    for line in lines:
        current=''
        for char in line:
            if len((current+char).encode('utf-8'))>74: folded.append(current);current=' '
            current+=char
        folded.append(current)
    return Response('\r\n'.join(folded)+'\r\n',media_type='text/calendar',headers={'Content-Disposition':f'attachment; filename="fluid-appointment-{item.id}.ics"','Cache-Control':'private, no-store'})


@router.get('/{appointment_id}/confirmation')
async def download_confirmation(appointment_id: str,db: AsyncSession = Depends(get_db),current_user: User = Depends(get_current_user)):
    item, request, _, _, _=await _owned(db,appointment_id,current_user)
    if item.status!='completed': raise HTTPException(409,'Confirmation is available for completed donations only')
    body=f'FLUID donation record\nRecord: {item.id}\nHospital: {request.hospital_name}\nRecorded completion: {item.completed_at}\nUnits: {item.units}\nStatus: completed\n\nThis record confirms recorded activity, not medical fitness or transfusion clearance.'
    return Response(body,media_type='text/plain',headers={'Content-Disposition':f'attachment; filename="donation-{item.id}.txt"','Cache-Control':'private, no-store'})
