from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, get_hospital_context, require_hospital_operator
from app.core.database import get_db
from app.models import Appointment, AuditLog, BloodRequest, DonorProfile, DonorResponse, Notification, User
from app.schemas.appointment import AppointmentPageRead, AppointmentRead, AppointmentSchedule, AppointmentStatusUpdate

from app.services.notification_delivery import notify

router = APIRouter(prefix="/appointments", tags=["Appointments"])


def _donor_name(user):
    parts = (user.full_name or "Donor").split()
    return parts[0] + (f" {parts[-1][0]}." if len(parts) > 1 else "")


def _read(item, request, donor, private=False):
    return AppointmentRead(id=item.id, blood_request_id=item.blood_request_id, hospital_name=request.hospital_name, donor_name=_donor_name(donor), blood_type=request.blood_type, scheduled_at=item.scheduled_at, status=item.status, location=item.location, units=item.units, department=item.department, contact_person=item.contact_person, internal_notes=item.internal_notes if private else None)


async def _context(db, user):
    return await require_hospital_operator(await get_hospital_context(db, user))


@router.get("", response_model=AppointmentPageRead)
async def list_appointments(scope: str = Query("donor", pattern="^(donor|hospital)$"), status_filter: str | None = Query(None, alias="status"), page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=50), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if scope == "donor":
        if current_user.role != "donor": raise HTTPException(403, "Donor access only")
        filters = [Appointment.donor_user_id == current_user.id]
    else:
        context = await _context(db, current_user)
        filters = [BloodRequest.hospital_profile_id == context.hospital.id]
    if status_filter == "upcoming": filters.append(Appointment.status.in_(["pending", "confirmed"]))
    elif status_filter == "closed": filters.append(Appointment.status.in_(["cancelled", "missed"]))
    elif status_filter and status_filter != "all": filters.append(Appointment.status == status_filter)
    total = int((await db.execute(select(func.count(Appointment.id)).join(BloodRequest, BloodRequest.id == Appointment.blood_request_id).where(*filters))).scalar_one() or 0)
    rows = (await db.execute(select(Appointment, BloodRequest, User).join(BloodRequest, BloodRequest.id == Appointment.blood_request_id).join(User, User.id == Appointment.donor_user_id).where(*filters).order_by(Appointment.scheduled_at.desc()).offset((page - 1) * page_size).limit(page_size))).all()
    return AppointmentPageRead(items=[_read(*row, private=scope == "hospital") for row in rows], page=page, page_size=page_size, total=total, total_pages=(total + page_size - 1) // page_size)


async def _owned(db, appointment_id, user):
    row = (await db.execute(select(Appointment, BloodRequest, User).join(BloodRequest, BloodRequest.id == Appointment.blood_request_id).join(User, User.id == Appointment.donor_user_id).where(Appointment.id == appointment_id).with_for_update(of=Appointment))).first()
    if not row: raise HTTPException(404, "Appointment not found")
    item, request, donor = row
    hospital_id = None
    if user.role == "hospital":
        context = await _context(db, user)
        hospital_id = context.hospital.id
        if request.hospital_profile_id != hospital_id: raise HTTPException(404, "Appointment not found")
    elif user.role != "donor" or user.id != item.donor_user_id:
        raise HTTPException(404, "Appointment not found")
    return item, request, donor, hospital_id


@router.patch("/{appointment_id}/schedule", response_model=AppointmentRead)
async def schedule_appointment(appointment_id: str, payload: AppointmentSchedule, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    item, request, donor, hospital_id = await _owned(db, appointment_id, current_user)
    if item.status not in {"pending", "confirmed"}: raise HTTPException(409, "Closed appointments cannot be rescheduled")
    if request.status not in {"published", "partially_fulfilled"}: raise HTTPException(409, "This request is closed")
    if payload.scheduled_at.tzinfo is None or payload.scheduled_at <= datetime.now(timezone.utc): raise HTTPException(422, "Choose a future time including its time zone")
    item.scheduled_at = payload.scheduled_at
    # Donors propose a time; only authorized hospital staff confirm it.
    item.status = "confirmed" if hospital_id else "pending"
    if hospital_id:
        for field in ["department", "contact_person", "internal_notes"]:
            value = getattr(payload, field)
            if value is not None: setattr(item, field, value)
    other_user = item.donor_user_id if hospital_id else item.hospital_user_id
    await notify(db, user_id=other_user, type="appointment", title="Appointment confirmed" if hospital_id else "Appointment time proposed", message=f"Appointment time: {payload.scheduled_at.isoformat()}", level="info", related_path="/donor/appointments" if hospital_id else "/hospital/appointments")
    if hospital_id: db.add(AuditLog(hospital_profile_id=hospital_id, actor_user_id=current_user.id, action="appointment.scheduled", entity_type="appointment", entity_id=item.id))
    await db.commit()
    return _read(item, request, donor, private=bool(hospital_id))


@router.patch("/{appointment_id}/status", response_model=AppointmentRead)
async def update_appointment_status(appointment_id: str, payload: AppointmentStatusUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    item, request, donor, hospital_id = await _owned(db, appointment_id, current_user)
    if not hospital_id and payload.status != "cancelled": raise HTTPException(403, "Only authorized hospital staff can confirm or complete appointments")
    if item.status not in {"pending", "confirmed"}: raise HTTPException(409, "Appointment is already closed")
    if payload.status == "completed":
        if item.status != "confirmed" or not payload.screening_confirmed: raise HTTPException(409, "Confirm the appointment and completed clinical screening first")
        locked_request = (await db.execute(select(BloodRequest).where(BloodRequest.id == request.id).with_for_update())).scalar_one()
        if locked_request.status not in {"published", "partially_fulfilled", "expired"}: raise HTTPException(409, "This blood request is closed")
        locked_request.units_fulfilled = min(locked_request.units, locked_request.units_fulfilled + item.units)
        locked_request.status = "fulfilled" if locked_request.units_fulfilled >= locked_request.units else "expired" if locked_request.status == "expired" else "partially_fulfilled"
        item.completed_at = datetime.now(timezone.utc)
        profile = (await db.execute(select(DonorProfile).where(DonorProfile.user_id == donor.id).with_for_update())).scalar_one()
        profile.last_donation_date = item.completed_at.date()
        response = (await db.execute(select(DonorResponse).where(DonorResponse.donor_user_id == donor.id, DonorResponse.blood_request_id == request.id))).scalar_one_or_none()
        if response: response.status = "completed"
    if payload.status in {"cancelled", "missed"}:
        response = (await db.execute(select(DonorResponse).where(DonorResponse.donor_user_id == donor.id, DonorResponse.blood_request_id == request.id))).scalar_one_or_none()
        if response: response.status = "cancelled" if payload.status == "cancelled" else "missed"
    item.status = payload.status
    if hospital_id and payload.internal_notes is not None: item.internal_notes = payload.internal_notes
    recipient = item.donor_user_id if hospital_id else item.hospital_user_id
    await notify(db, user_id=recipient, type="appointment", title=f"Appointment {payload.status}", message=f"Appointment with {request.hospital_name}: {payload.status}.", level="success" if payload.status == "completed" else "info", related_path="/donor/appointments" if hospital_id else "/hospital/appointments")
    if hospital_id: db.add(AuditLog(hospital_profile_id=hospital_id, actor_user_id=current_user.id, action=f"appointment.{payload.status}", entity_type="appointment", entity_id=item.id, details={"screening_confirmed": payload.screening_confirmed}))
    await db.commit()
    return _read(item, request, donor, private=bool(hospital_id))


@router.patch("/{appointment_id}/cancel", response_model=AppointmentRead)
async def cancel_appointment(appointment_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await update_appointment_status(appointment_id, AppointmentStatusUpdate(status="cancelled"), db, current_user)


@router.get("/{appointment_id}/confirmation")
async def download_confirmation(appointment_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    item, request, donor, _ = await _owned(db, appointment_id, current_user)
    if item.status != "completed": raise HTTPException(409, "Confirmation is available for completed donations only")
    text = f"FLUID donation record\nRecord: {item.id}\nHospital: {request.hospital_name}\nRecorded completion: {item.completed_at or item.updated_at}\nUnits: {item.units}\nStatus: completed\n\nThis record confirms recorded activity, not medical fitness or transfusion clearance."
    return Response(text, media_type="text/plain", headers={"Content-Disposition": f'attachment; filename="donation-{item.id}.txt"'})
