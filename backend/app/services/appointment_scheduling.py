"""Appointment coordination and occupancy; never automated clinical clearance."""
from datetime import datetime, timedelta, timezone, time
from zoneinfo import ZoneInfo
from sqlalchemy import select, delete, or_
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from app.models import (Appointment, AppointmentPolicy, AppointmentOccupancy, AppointmentEvent,
    AppointmentReminder, HospitalMembership, HospitalProfile, DonorProfile, DonorResponse, User, AuditLog)
from app.services.notification_delivery import notify
from app.services.blood_matching import can_donate_to

ACTIVE = {"pending", "confirmed", "checked_in"}
REQUEST_ACTIVE = {"published", "partially_fulfilled"}


def now_utc():
    return datetime.now(timezone.utc)


async def policy_for(db, hospital_id, lock=False):
    # A parent row serializes first-time policy creation as well as booking capacity.
    if lock:
        await db.execute(select(HospitalProfile.id).where(HospitalProfile.id == hospital_id).with_for_update())
    policy = await db.get(AppointmentPolicy, hospital_id, populate_existing=True)
    if policy is None:
        policy = AppointmentPolicy(hospital_profile_id=hospital_id)
        db.add(policy)
        await db.flush()
    return policy


def slot_end(start, policy):
    if start.tzinfo is None or start.second or start.microsecond:
        raise HTTPException(422, "Choose a time-zone-aware slot at an exact minute")
    if not policy.enabled:
        raise HTTPException(409, "The hospital must configure appointment availability first")
    local = start.astimezone(ZoneInfo(policy.timezone))
    end = start + timedelta(minutes=policy.slot_minutes)
    local_end = end.astimezone(ZoneInfo(policy.timezone))
    # A UTC round-trip rejects nonexistent wall times around DST changes.
    for hours in policy.hours:
        if hours["weekday"] != local.weekday(): continue
        opening = datetime.combine(local.date(), time.fromisoformat(hours["start"]), ZoneInfo(policy.timezone))
        closing = datetime.combine(local.date(), time.fromisoformat(hours["end"]), ZoneInfo(policy.timezone))
        elapsed = (local.replace(tzinfo=None) - opening.replace(tzinfo=None)).total_seconds() / 60
        if opening <= local and local_end.date() == local.date() and local_end <= closing and elapsed % policy.slot_minutes == 0:
            return end
    raise HTTPException(409, "Choose an available slot within hospital operating hours")


def preferred(start, profile):
    if not profile or not profile.appointment_preferences: return False
    local = start.astimezone(ZoneInfo(profile.appointment_timezone))
    return any(h["weekday"] == local.weekday() and h["start"] <= local.strftime("%H:%M") < h["end"] for h in profile.appointment_preferences)


async def validate_referral(db, request, donor_id):
    hospital = await db.get(HospitalProfile, request.hospital_profile_id)
    profile = (await db.execute(select(DonorProfile).where(DonorProfile.user_id == donor_id).execution_options(populate_existing=True))).scalar_one_or_none()
    user = await db.get(User, donor_id, populate_existing=True)
    response = (await db.execute(select(DonorResponse).where(DonorResponse.donor_user_id == donor_id,
        DonorResponse.blood_request_id == request.id).execution_options(populate_existing=True))).scalar_one_or_none()
    now = now_utc()
    if not hospital or hospital.verification_status != "verified": raise HTTPException(403, "Hospital verification is required")
    if request.status not in REQUEST_ACTIVE or any(d and d <= now for d in (request.expires_at, request.required_by)):
        raise HTTPException(409, "The blood request has closed or expired")
    if not response or response.status not in {"pending", "accepted", "scheduled"}:
        raise HTTPException(409, "The donor must first express availability for this request")
    if not user or not user.is_active or not profile or not profile.is_available or not profile.matching_opt_in:
        raise HTTPException(409, "The donor is unavailable or has withdrawn matching consent")
    if not profile.blood_type_known or not can_donate_to(profile.blood_type, request.blood_type, request.component):
        raise HTTPException(409, "Blood-component compatibility has changed; hospital review is required")
    return profile, response


async def reserve(db, appointment, request, start, policy):
    if start.tzinfo is None or start <= now_utc(): raise HTTPException(422, "Choose a future time including its time zone")
    start = start.astimezone(timezone.utc)
    end = slot_end(start, policy)
    if any(deadline and end > deadline for deadline in (request.required_by, request.expires_at)):
        raise HTTPException(409, "The appointment must end before the request deadline and expiration")
    await validate_referral(db, request, appointment.donor_user_id)
    # Lock order is request -> facility -> donor -> appointment throughout API/worker.
    await db.execute(select(DonorProfile.id).where(DonorProfile.user_id == appointment.donor_user_id).with_for_update())
    occupied = (await db.execute(select(AppointmentOccupancy).where(
        or_(AppointmentOccupancy.donor_user_id == appointment.donor_user_id, AppointmentOccupancy.hospital_profile_id == request.hospital_profile_id),
        AppointmentOccupancy.appointment_id != appointment.id,
        AppointmentOccupancy.minute >= start, AppointmentOccupancy.minute < end))).scalars().all()
    if any(row.donor_user_id == appointment.donor_user_id for row in occupied):
        raise HTTPException(409, "The donor already has an overlapping appointment")
    reservations = []
    for offset in range(policy.slot_minutes):
        minute = start + timedelta(minutes=offset)
        taken = {r.seat for r in occupied if r.hospital_profile_id == request.hospital_profile_id and r.minute == minute}
        seat = next((seat for seat in range(policy.capacity) if seat not in taken), None)
        if seat is None: raise HTTPException(409, "This appointment slot is full; choose another time")
        reservations.append(AppointmentOccupancy(appointment_id=appointment.id, donor_user_id=appointment.donor_user_id,
            hospital_profile_id=request.hospital_profile_id, minute=minute, seat=seat))
    await db.execute(delete(AppointmentOccupancy).where(AppointmentOccupancy.appointment_id == appointment.id))
    db.add_all(reservations)
    try: await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "The donor or hospital slot was booked concurrently; refresh available slots") from None
    appointment.scheduled_at, appointment.ends_at = start, end
    appointment.timezone, appointment.is_scheduled = policy.timezone, True


async def changed(db, appointment, request, actor_id, action, details=None):
    appointment.version += 1
    details = {"status": appointment.status, "scheduled_at": appointment.scheduled_at.isoformat() if appointment.is_scheduled else None, **(details or {})}
    db.add(AppointmentEvent(appointment_id=appointment.id, actor_user_id=actor_id, version=appointment.version, action=action, details=details))
    if actor_id is not None:
        db.add(AuditLog(hospital_profile_id=request.hospital_profile_id, actor_user_id=actor_id,
            action=f"appointment.{action}", entity_type="appointment", entity_id=appointment.id, details=details))
    await notify(db, appointment.donor_user_id, type="appointment", title=f"Appointment {action.replace('_', ' ')}",
        message=f"{request.hospital_name}: {appointment.status.replace('_', ' ')}. Open your appointment for details.",
        level="info", related_path="/donor/appointments")
    members = (await db.execute(select(HospitalMembership.user_id).where(HospitalMembership.hospital_profile_id == request.hospital_profile_id,
        HospitalMembership.is_active.is_(True)))).scalars().all()
    for uid in set(members) | {appointment.hospital_user_id}:
        await notify(db, uid, type="appointment", title=f"Appointment {action.replace('_', ' ')}",
            message=f"Appointment status: {appointment.status.replace('_', ' ')}.", level="info", related_path="/hospital/appointments")


async def close_for_request(db, request, reason):
    rows = (await db.execute(select(Appointment).where(Appointment.blood_request_id == request.id,
        Appointment.status.in_(["pending", "confirmed"])).with_for_update().execution_options(populate_existing=True))).scalars().all()
    for item in rows:
        item.status, item.cancellation_reason = "cancelled", reason
        await db.execute(delete(AppointmentOccupancy).where(AppointmentOccupancy.appointment_id == item.id))
        await changed(db, item, request, None, "cancelled", {"reason": reason})


async def send_reminders(factory):
    from app.models import BloodRequest
    async with factory() as db:
        ids = (await db.execute(select(Appointment.id).where(Appointment.status == "confirmed",
            Appointment.scheduled_at > now_utc(), Appointment.scheduled_at <= now_utc() + timedelta(days=7)))).scalars().all()
    for appointment_id in ids:
        async with factory() as db:
            item = await db.get(Appointment, appointment_id)
            if item is None:
                continue
            request = (await db.execute(select(BloodRequest).where(BloodRequest.id == item.blood_request_id).with_for_update())).scalar_one_or_none()
            if request is None or not request.hospital_profile_id:
                continue
            policy = await policy_for(db, request.hospital_profile_id, lock=True)
            item = (await db.execute(select(Appointment).where(Appointment.id == appointment_id).with_for_update().execution_options(populate_existing=True))).scalar_one()
            hospital = await db.get(HospitalProfile, request.hospital_profile_id)
            now = now_utc()
            if not hospital or hospital.verification_status != "verified" or item.status != "confirmed" or item.scheduled_at <= now:
                continue
            if request.status not in REQUEST_ACTIVE or any(d and d <= now for d in (request.required_by, request.expires_at)):
                continue
            due = [h for h in policy.reminder_hours if item.scheduled_at - timedelta(hours=h) <= now]
            if not due: continue
            hours = min(due)  # Coalesce missed thresholds after downtime; avoid reminder bursts.
            existing = (await db.execute(select(AppointmentReminder.id).where(AppointmentReminder.appointment_id == item.id,
                AppointmentReminder.schedule_version == item.schedule_version, AppointmentReminder.hours_before == hours))).first()
            if existing: continue
            db.add(AppointmentReminder(appointment_id=item.id, schedule_version=item.schedule_version, hours_before=hours))
            await notify(db, item.donor_user_id, type="appointment", title="Upcoming donation appointment",
                message=f"{request.hospital_name}: {item.scheduled_at.astimezone(ZoneInfo(item.timezone)).strftime('%d %b %Y, %H:%M')} ({item.timezone}). Review preparation instructions before your visit.",
                level="info", related_path="/donor/appointments")
            await db.commit()
