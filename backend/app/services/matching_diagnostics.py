"""Counts and reason codes only. No donor identifiers, coordinates or screening values."""
from collections import Counter
from datetime import datetime, timezone
from sqlalchemy import select, func
from app.core.config import settings
from app.models import DonorProfile, User, AuditLog, Notification, EmergencyAlert, RequestNotificationReceipt
from app.services.blood_matching import exclusion_reasons


async def matching_summary(db, request):
    reasons = Counter()
    evaluated = matched = recipients = 0
    radius = request.alert_radius_km or 10
    rows = await db.stream(select(DonorProfile, User.is_active).join(User, User.id == DonorProfile.user_id)
                           .where(User.role == "donor").execution_options(yield_per=250))
    async for profile, active in rows:
        evaluated += 1
        excluded = exclusion_reasons(profile, request, radius_km=radius)
        if not active: excluded.append("account_inactive")
        if not excluded:
            matched += 1
            if request.urgency == "routine" or profile.notify_urgent_requests: recipients += 1
        if request.urgency != "routine" and not profile.notify_urgent_requests:
            excluded.append("urgent_notifications_disabled")
        reasons.update(set(excluded))
    return {"evaluated": evaluated, "matched": matched, "notification_candidates": recipients,
            "excluded": evaluated - recipients, "exclusion_reasons": dict(reasons),
            "policy_approved": settings.DONATION_POLICY_APPROVED, "radius_km": radius,
            "status": "evaluated" if settings.DONATION_POLICY_APPROVED else "blocked_by_clinical_policy",
            "evaluated_at": datetime.now(timezone.utc).isoformat()}


async def record_execution(db, request, created):
    summary = await matching_summary(db, request)
    db.add(AuditLog(hospital_profile_id=request.hospital_profile_id, actor_user_id=request.created_by_user_id,
        action="matching.evaluated", entity_type="blood_request", entity_id=request.id,
        details={**summary, "notifications_created": created, "correlation_id": request.id}))
