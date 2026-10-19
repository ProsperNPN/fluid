from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import HospitalContext, require_hospital_operator
from app.core.database import get_db
from app.core.config import settings
from app.models import BloodRequest, EmergencyAlert, DonorResponse, DonorProfile, User, AuditLog, AlertDelivery
from app.services.emergency_alerts import queue_alerts, hospital_notice, ACTIVE
from app.services.request_lifecycle import expire_requests
from app.services.blood_matching import distance_km

router = APIRouter(prefix="/emergencies", tags=["Emergency coordination"])


@router.get("")
async def overview(db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_operator)):
    await expire_requests(db, context.hospital.id)
    requests = (await db.execute(select(BloodRequest).where(BloodRequest.hospital_profile_id == context.hospital.id,
        BloodRequest.urgency.in_(["urgent", "critical"])).order_by(case((BloodRequest.status.in_(ACTIVE), 0), else_=1), BloodRequest.created_at.desc()).limit(100))).scalars().all()
    result = []
    for item in requests:
        count = (await db.execute(select(func.count(EmergencyAlert.id)).where(EmergencyAlert.blood_request_id == item.id))).scalar_one()
        responses = (await db.execute(select(DonorResponse, User, DonorProfile).join(User, User.id == DonorResponse.donor_user_id)
            .join(DonorProfile, DonorProfile.user_id == User.id).where(DonorResponse.blood_request_id == item.id))).all()
        responded = [r for r, _, _ in responses if r.responded_at is not None]
        accepted = sum(r.status in {"pending", "accepted", "scheduled", "completed"} for r in responded)
        since = item.alert_escalated_at or item.created_at
        wait = max(0, settings.ALERT_ESCALATION_WAIT_SECONDS - int((datetime.now(timezone.utc) - since).total_seconds()))
        radius = item.alert_radius_km
        next_radius = next((r for r in (10, 25, 50, 100) if r > radius), None)
        delivery_rows = (await db.execute(select(AlertDelivery.channel, AlertDelivery.status, func.count(AlertDelivery.id))
            .join(EmergencyAlert, EmergencyAlert.id == AlertDelivery.alert_id).where(EmergencyAlert.blood_request_id == item.id)
            .group_by(AlertDelivery.channel, AlertDelivery.status))).all()
        result.append({"id": item.id, "blood_type": item.blood_type, "component": item.component,
            "units": item.units, "urgency": item.urgency, "status": item.status,
            "deadline": item.required_by, "location": item.location, "radius_km": radius,
            "notified": count, "responded": len(responded), "accepted": accepted,
            "declined": sum(r.status == "declined" for r in responded),
            "suggested_radius_km": next_radius if accepted < 5 and item.status in ACTIVE else None,
            "escalation_wait_seconds": wait, "policy_approved": settings.DONATION_POLICY_APPROVED,
            "deliveries": [{"channel": c, "status": s, "count": n} for c, s, n in delivery_rows],
            "responses": [{"id": r.id, "donor": (u.full_name or "Donor").split()[0], "status": r.status,
                "distance_km": distance_km(p.latitude, p.longitude, item.latitude, item.longitude) if p.matching_opt_in else None,
                "updated_at": r.responded_at or r.invited_at or r.created_at} for r, u, p in responses]})
    return {"items": result}


@router.post("/{request_id}/escalate")
async def escalate(request_id: str, db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_operator)):
    await expire_requests(db, context.hospital.id)
    item = (await db.execute(select(BloodRequest).where(BloodRequest.id == request_id).with_for_update())).scalar_one_or_none()
    if not item or item.hospital_profile_id != context.hospital.id:
        raise HTTPException(404, "Request not found")
    if item.status not in ACTIVE or item.urgency == "routine":
        raise HTTPException(409, "Only active emergency requests can escalate")
    if not settings.DONATION_POLICY_APPROVED:
        raise HTTPException(409, "Clinical referral policy must be approved before alert escalation")
    accepted = (await db.execute(select(func.count(DonorResponse.id)).where(DonorResponse.blood_request_id == item.id, DonorResponse.status.in_(["pending", "accepted", "scheduled", "completed"])))).scalar_one()
    if accepted >= 5:
        raise HTTPException(409, "Review existing availability responses before expanding outreach")
    now = datetime.now(timezone.utc)
    if (now - (item.alert_escalated_at or item.created_at)).total_seconds() < settings.ALERT_ESCALATION_WAIT_SECONDS:
        raise HTTPException(429, "Allow time for responses before expanding the alert radius")
    radius = next((r for r in (25, 50, 100) if r > item.alert_radius_km), None)
    if radius is None:
        raise HTTPException(409, "Maximum alert radius reached")
    item.alert_radius_km, item.alert_escalated_at = radius, now
    count = await queue_alerts(db, item)
    db.add(AuditLog(hospital_profile_id=context.hospital.id, actor_user_id=context.user.id,
        action="emergency.escalated", entity_type="blood_request", entity_id=item.id,
        details={"radius_km": radius, "new_alerts": count}))
    await hospital_notice(db, item, "Emergency radius expanded", f"Alert search expanded to {radius} km by hospital staff.")
    await db.commit()
    return {"radius_km": radius, "new_alerts": count}
