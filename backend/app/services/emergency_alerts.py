"""Consent-aware, request-locked emergency fanout. No medical clearance."""
from datetime import datetime, timezone
from sqlalchemy import select
from app.models import (EmergencyAlert, AlertDelivery, Notification, DonorProfile,
                        DonorResponse, HospitalMembership, AuditLog)
from app.services.intelligent_matching import evaluate_candidates

ACTIVE = {"published", "partially_fulfilled"}


async def request_changed(db, request):
    """Refresh stored cards and stop unsent deliveries when a request closes."""
    alerts = (await db.execute(select(EmergencyAlert).where(EmergencyAlert.blood_request_id == request.id))).scalars().all()
    for alert in alerts:
        notification = await db.get(Notification, alert.notification_id) if alert.notification_id else None
        if notification:
            notification.title = f"{request.urgency.title()} blood request"
            notification.message = f"{request.hospital_name} needs {request.units} units of {request.blood_type} {request.component.replace('_', ' ')}. Clinical screening required."
            notification.payload = {**(notification.payload or {}), "status": request.status,
                "units": request.units, "urgency": request.urgency,
                "deadline": request.required_by.isoformat() if request.required_by else None}
        if request.status not in ACTIVE:
            jobs = (await db.execute(select(AlertDelivery).where(AlertDelivery.alert_id == alert.id,
                AlertDelivery.status.in_(["queued", "retry"])))).scalars().all()
            for job in jobs:
                job.status, job.error_code = "cancelled", "request_closed"
    if request.status not in ACTIVE:
        from app.services.appointment_scheduling import close_for_request
        await close_for_request(db, request, f"Blood request {request.status}")
    await hospital_notice(db, request, "Blood request updated", f"{request.blood_type} request is {request.status.replace('_', ' ')}.")


async def hospital_notice(db, request, title, message):
    members = (await db.execute(select(HospitalMembership.user_id).where(
        HospitalMembership.hospital_profile_id == request.hospital_profile_id,
        HospitalMembership.is_active.is_(True), HospitalMembership.role.in_(["hospital_admin", "blood_bank_manager", "hospital_staff"])))).scalars().all()
    for user_id in set(members):
        db.add(Notification(user_id=user_id, type="emergency_update", title=title,
            message=message, level="info", related_path="/hospital/emergencies"))


async def queue_alerts(db, request):
    """Caller holds request row lock (new inserts also serialize publication)."""
    if request.status not in ACTIVE or request.urgency == "routine":
        return 0
    page, count, candidates = 1, 0, []
    while True:
        result = await evaluate_candidates(db, request, radius_km=request.alert_radius_km or 10,
                                          page=page, page_size=100)
        candidates.extend(result["items"])
        if page >= result["total_pages"]:
            break
        page += 1
    # Stable lock ordering prevents cross-request fanouts from deadlocking.
    for candidate in sorted(candidates, key=lambda row: row["donor_user_id"]):
        uid = candidate["donor_user_id"]
        profile = (await db.execute(select(DonorProfile).where(DonorProfile.user_id == uid).with_for_update().execution_options(populate_existing=True))).scalar_one()
        # Evaluate again after acquiring the profile lock, including consent changes.
        from app.services.blood_matching import match_request
        from app.services.blood_matching import precise_distance_km
        km = precise_distance_km(profile.latitude, profile.longitude, request.latitude, request.longitude)
        if not profile.notify_urgent_requests or not match_request(profile, request)[0] or km is None or km > (request.alert_radius_km or 10):
            continue
        existing = (await db.execute(select(EmergencyAlert.id).where(
            EmergencyAlert.blood_request_id == request.id, EmergencyAlert.donor_user_id == uid))).first()
        response = (await db.execute(select(DonorResponse).where(
            DonorResponse.blood_request_id == request.id, DonorResponse.donor_user_id == uid))).scalar_one_or_none()
        if existing or response is not None:
            continue
        await record_alert(db, request, profile, candidate["distance_km"], request.alert_radius_km or 10)
        count += 1
    if count:
        db.add(AuditLog(hospital_profile_id=request.hospital_profile_id, actor_user_id=request.created_by_user_id,
            action="emergency.fanout", entity_type="blood_request", entity_id=request.id,
            details={"radius_km": request.alert_radius_km or 10, "new_alerts": count}))
    if count:
        await hospital_notice(db, request, "Emergency alerts published", f"{count} potential donors notified in FLUID.")
    return count


async def record_alert(db, request, profile, distance, radius):
    """Shared automatic/manual emergency invitation; caller holds request/profile locks."""
    notification = Notification(user_id=profile.user_id, type="blood_request", title=f"{request.urgency.title()} blood request",
        message=f"{request.hospital_name} needs {request.units} units of {request.blood_type} {request.component.replace('_', ' ')}. Clinical screening required.",
        level="warning", related_path=f"/donor/requests?request={request.id}",
        payload={"request_id": request.id, "hospital": request.hospital_name,
            "location": request.location, "blood_type": request.blood_type,
            "component": request.component, "units": request.units,
            "urgency": request.urgency, "distance_km": distance,
            "deadline": request.required_by.isoformat() if request.required_by else None})
    db.add(notification)
    await db.flush()
    alert = EmergencyAlert(blood_request_id=request.id, donor_user_id=profile.user_id,
                           notification_id=notification.id, radius_km=radius)
    db.add(alert)
    db.add(DonorResponse(blood_request_id=request.id, donor_user_id=profile.user_id,
        status="invited", invited_at=datetime.now(timezone.utc)))
    await db.flush()
    for channel, consent in (("email", profile.notify_email_alerts), ("sms", profile.notify_sms_alerts)):
        if consent:
            db.add(AlertDelivery(alert_id=alert.id, channel=channel, status="queued"))
