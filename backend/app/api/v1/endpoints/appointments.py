from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Appointment, AuditLog, BloodRequest, HospitalMembership, Notification, User
from app.schemas.appointment import AppointmentPageRead, AppointmentRead, AppointmentSchedule, AppointmentStatusUpdate

router = APIRouter(prefix="/appointments", tags=["Appointments"])

def _donor_name(user: User) -> str:
    if not user.full_name: return "Verified donor"
    parts = user.full_name.split(); return parts[0] + (f" {parts[-1][0]}." if len(parts) > 1 else "")

def _read(item: Appointment, request: BloodRequest, donor: User) -> AppointmentRead:
    return AppointmentRead(id=item.id, blood_request_id=item.blood_request_id, hospital_name=request.hospital_name, donor_name=_donor_name(donor), blood_type=request.blood_type, scheduled_at=item.scheduled_at, status=item.status, location=item.location, units=item.units, department=item.department, contact_person=item.contact_person, internal_notes=item.internal_notes)

async def _hospital_id(db: AsyncSession, user_id: str) -> str | None:
    return (await db.execute(select(HospitalMembership.hospital_profile_id).where(HospitalMembership.user_id == user_id, HospitalMembership.is_active.is_(True)))).scalar_one_or_none()

@router.get("", response_model=AppointmentPageRead)
async def list_appointments(scope: str = Query("donor", pattern="^(donor|hospital)$"), status_filter: str | None = Query(None, alias="status"), page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=50), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> AppointmentPageRead:
    filters = [Appointment.donor_user_id == current_user.id] if scope == "donor" else [BloodRequest.hospital_profile_id == await _hospital_id(db, current_user.id)]
    if status_filter: filters.append(Appointment.status == status_filter)
    total = int((await db.execute(select(func.count(Appointment.id)).join(BloodRequest, BloodRequest.id == Appointment.blood_request_id).where(*filters))).scalar_one() or 0)
    stmt = select(Appointment, BloodRequest, User).join(BloodRequest, BloodRequest.id == Appointment.blood_request_id).join(User, User.id == Appointment.donor_user_id).where(*filters).order_by(Appointment.scheduled_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).all()
    return AppointmentPageRead(items=[_read(*row) for row in rows], page=page, page_size=page_size, total=total, total_pages=(total + page_size - 1) // page_size if total else 0)

async def _owned(db: AsyncSession, appointment_id: str, user: User):
    row = (await db.execute(select(Appointment, BloodRequest, User).join(BloodRequest, BloodRequest.id == Appointment.blood_request_id).join(User, User.id == Appointment.donor_user_id).where(Appointment.id == appointment_id))).first()
    if not row: raise HTTPException(status_code=404, detail="Appointment not found")
    item, request, donor = row; hospital_id = await _hospital_id(db, user.id) if user.role == "hospital" else None
    if user.id != item.donor_user_id and request.hospital_profile_id != hospital_id: raise HTTPException(status_code=404, detail="Appointment not found")
    return item, request, donor, hospital_id

@router.patch("/{appointment_id}/schedule", response_model=AppointmentRead)
async def schedule_appointment(appointment_id: str, payload: AppointmentSchedule, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> AppointmentRead:
    item, request, donor, hospital_id = await _owned(db, appointment_id, current_user)
    if item.status in {"completed", "cancelled", "missed"}: raise HTTPException(status_code=409, detail="Appointment cannot be rescheduled")
    item.scheduled_at = payload.scheduled_at; item.status = "confirmed"
    for field in ["department", "contact_person", "internal_notes"]:
        value = getattr(payload, field)
        if value is not None: setattr(item, field, value)
    other_user = item.hospital_user_id if current_user.id == item.donor_user_id else item.donor_user_id
    db.add(Notification(user_id=other_user, type="appointment", title="Appointment scheduled", message=f"The donation appointment is set for {payload.scheduled_at:%b %d, %Y at %I:%M %p}.", level="success", related_path="/donor/appointments" if other_user == item.donor_user_id else "/hospital/appointments"))
    if hospital_id: db.add(AuditLog(hospital_profile_id=hospital_id, actor_user_id=current_user.id, action="appointment.scheduled", entity_type="appointment", entity_id=item.id))
    await db.commit(); return _read(item, request, donor)

@router.patch("/{appointment_id}/status", response_model=AppointmentRead)
async def update_appointment_status(appointment_id: str, payload: AppointmentStatusUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> AppointmentRead:
    item, request, donor, hospital_id = await _owned(db, appointment_id, current_user)
    if current_user.role != "hospital" and payload.status in {"completed", "missed"}: raise HTTPException(status_code=403, detail="Hospital access required")
    if item.status in {"completed", "cancelled"}: raise HTTPException(status_code=409, detail="Appointment is already closed")
    item.status = payload.status
    if payload.internal_notes is not None: item.internal_notes = payload.internal_notes
    if payload.status == "completed":
        request.units_fulfilled = min(request.units, request.units_fulfilled + item.units)
        request.status = "fulfilled" if request.units_fulfilled >= request.units else "partially_fulfilled"
    db.add(Notification(user_id=item.donor_user_id, type="appointment", title=f"Appointment {payload.status}", message=f"Your appointment with {request.hospital_name} was marked {payload.status}.", level="success" if payload.status == "completed" else "info", related_path="/donor/appointments"))
    if hospital_id: db.add(AuditLog(hospital_profile_id=hospital_id, actor_user_id=current_user.id, action=f"appointment.{payload.status}", entity_type="appointment", entity_id=item.id))
    await db.commit(); return _read(item, request, donor)

@router.patch("/{appointment_id}/cancel", response_model=AppointmentRead)
async def cancel_appointment(appointment_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> AppointmentRead:
    return await update_appointment_status(appointment_id, AppointmentStatusUpdate(status="cancelled"), db, current_user)
