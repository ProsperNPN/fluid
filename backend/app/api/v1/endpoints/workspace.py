from app.services.request_lifecycle import expire_requests
from datetime import datetime, timezone, timedelta, date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, get_hospital_context, require_hospital_operator
from app.core.database import get_db
from app.models import Appointment, BloodRequest, BloodInventory, DonorResponse, DonorProfile, HospitalProfile, User, AuditLog
from app.core.config import settings
from app.services.blood_matching import match_request

router = APIRouter(prefix="/workspace", tags=["Portal overview"])

@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await expire_requests(db)
    if user.role == "donor":
        appointments = (await db.execute(select(Appointment).where(Appointment.donor_user_id == user.id))).scalars().all()
        profile = (await db.execute(select(DonorProfile).where(DonorProfile.user_id == user.id))).scalar_one_or_none()
        requests = (await db.execute(select(BloodRequest).join(HospitalProfile, HospitalProfile.id == BloodRequest.hospital_profile_id).where(HospitalProfile.verification_status == "verified", BloodRequest.status.in_(["published", "partially_fulfilled"])))).scalars().all()
        matches = [row for row in requests if profile and match_request(profile, row)[0]]
        completed = [row for row in appointments if row.status == "completed"]
        hospitals = set((await db.execute(select(BloodRequest.hospital_profile_id).join(Appointment, Appointment.blood_request_id == BloodRequest.id).where(Appointment.donor_user_id == user.id, Appointment.status == "completed"))).scalars())
        return {"compatible_requests": len(matches), "urgent_requests": sum(row.urgency != "routine" for row in matches), "completed_donations": len(completed), "donation_units": sum(row.units for row in completed), "hospitals_supported": len(hospitals), "upcoming_appointments": sum(row.status in {"pending", "confirmed"} for row in appointments), "policy_approved": settings.DONATION_POLICY_APPROVED}
    context = await require_hospital_operator(await get_hospital_context(db, user))
    requests = (await db.execute(select(BloodRequest).where(BloodRequest.hospital_profile_id == context.hospital.id))).scalars().all()
    ids = [row.id for row in requests]
    pending = int((await db.execute(select(func.count(DonorResponse.id)).where(DonorResponse.blood_request_id.in_(ids), DonorResponse.status == "pending"))).scalar_one())
    appointments = int((await db.execute(select(func.count(Appointment.id)).where(Appointment.blood_request_id.in_(ids), Appointment.status.in_(["pending", "confirmed"])))).scalar_one())
    inventory = (await db.execute(select(BloodInventory).where(BloodInventory.hospital_profile_id == context.hospital.id))).scalars().all()
    return {"active_requests": sum(row.status in {"published", "partially_fulfilled"} for row in requests), "pending_responses": pending, "upcoming_appointments": appointments, "stock_units": sum(max(0, row.units_available-row.units_reserved) for row in inventory if row.expiration_date and row.expiration_date >= date.today()), "inventory_alerts": sum(bool(row.units_available-row.units_reserved <= row.minimum_threshold or (row.expiration_date and row.expiration_date <= date.today()+timedelta(days=settings.INVENTORY_EXPIRY_WARNING_DAYS))) for row in inventory), "completed_donations": int((await db.execute(select(func.count(Appointment.id)).where(Appointment.blood_request_id.in_(ids), Appointment.status == "completed"))).scalar_one())}

@router.get("/analytics")
async def analytics(days: int = Query(30, ge=1, le=365), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    context = await require_hospital_operator(await get_hospital_context(db, user))
    since = datetime.now(timezone.utc) - timedelta(days=days-1)
    start = datetime.combine(since.date(), datetime.min.time(), tzinfo=timezone.utc)
    requests = (await db.execute(select(BloodRequest).where(BloodRequest.hospital_profile_id == context.hospital.id, BloodRequest.created_at >= start))).scalars().all()
    appointments = (await db.execute(select(Appointment).join(BloodRequest, BloodRequest.id == Appointment.blood_request_id).where(BloodRequest.hospital_profile_id == context.hospital.id, Appointment.completed_at >= start))).scalars().all()
    transactions = (await db.execute(select(AuditLog).where(AuditLog.hospital_profile_id == context.hospital.id, AuditLog.entity_type == "blood_inventory", AuditLog.created_at >= start))).scalars().all()
    series = []
    for index in range(days):
        day = start.date() + timedelta(days=index)
        rows = [row for row in requests if row.created_at.date() == day]
        movements = [row for row in transactions if row.created_at.date() == day]
        delta = sum((row.details or {}).get("after", {}).get("available", 0)-(row.details or {}).get("before", {}).get("available", 0) if "after" in (row.details or {}) else (row.details or {}).get("units", 0) if row.action == "inventory.created" else (row.details or {}).get("units",0) if row.action in {"inventory.add","inventory.donation_intake"} else -(row.details or {}).get("units",0) if row.action in {"inventory.remove","inventory.use","inventory.expire"} else 0 for row in movements)
        series.append({"date": day.isoformat(), "requests": len(rows), "fulfilled": sum(row.status == "fulfilled" for row in rows), "pending": sum(row.status in {"published", "partially_fulfilled", "draft"} for row in rows), "cancelled": sum(row.status == "cancelled" for row in rows), "donations": sum(row.completed_at.date() == day for row in appointments), "stock_change": delta})
    return {"days": days, "series": series, "total_requests": len(requests), "fulfilled_requests": sum(row.status == "fulfilled" for row in requests), "donations": len(appointments), "policy_approved": settings.DONATION_POLICY_APPROVED}
