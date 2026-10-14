"""Legacy summaries retained for clients, populated from real scoped records."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, get_hospital_context, require_hospital_operator, require_superuser
from app.core.database import get_db
from app.models import Appointment, BloodRequest, DonorResponse, User, AuditLog, HospitalProfile
router = APIRouter(prefix="/portal", tags=["Portal"])

@router.get("/donor-data")
async def donor_data(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "donor": raise HTTPException(403, "Donor access only")
    rows = (await db.execute(select(Appointment, BloodRequest).join(BloodRequest, BloodRequest.id == Appointment.blood_request_id).where(Appointment.donor_user_id == user.id).order_by(Appointment.scheduled_at.desc()).limit(100))).all()
    return {"donation_history": [{"id": a.id, "hospital": r.hospital_name, "date": (a.completed_at or a.scheduled_at).isoformat(), "blood_type": r.blood_type, "status": "completed"} for a,r in rows if a.status == "completed"], "appointments": [{"id": a.id, "title": r.hospital_name, "date": a.scheduled_at.isoformat(), "location": a.location} for a,r in rows if a.status in {"pending", "confirmed"}]}

@router.get("/hospital-data")
async def hospital_data(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    context = await require_hospital_operator(await get_hospital_context(db, user))
    rows = (await db.execute(select(Appointment, BloodRequest).join(BloodRequest, BloodRequest.id == Appointment.blood_request_id).where(BloodRequest.hospital_profile_id == context.hospital.id).limit(100))).all()
    responses = (await db.execute(select(DonorResponse, User, BloodRequest).join(User, User.id == DonorResponse.donor_user_id).join(BloodRequest, BloodRequest.id == DonorResponse.blood_request_id).where(BloodRequest.hospital_profile_id == context.hospital.id).limit(100))).all()
    return {"donor_responses": [{"donor": (u.full_name or "Donor").split()[0], "blood_type": r.blood_type, "response": d.status, "eta": "Contact donor"} for d,u,r in responses], "appointments": [{"id": a.id, "title": f"Donation appointment: {r.blood_type}", "date": a.scheduled_at.isoformat(), "location": a.location} for a,r in rows if a.status in {"pending", "confirmed"}]}

@router.get("/admin-data")
async def admin_data(db: AsyncSession = Depends(get_db), user: User = Depends(require_superuser)):
    hospitals = (await db.execute(select(HospitalProfile).where(HospitalProfile.verification_status == "pending"))).scalars().all()
    logs = (await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(100))).scalars().all()
    return {"pending_hospitals": [{"name": h.hospital_name, "city": h.city, "submitted": h.updated_at.isoformat()} for h in hospitals], "platform_activity": [{"event": l.action, "actor": l.actor_user_id, "time": l.created_at.isoformat()} for l in logs]}
