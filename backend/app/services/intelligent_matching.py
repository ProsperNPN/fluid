"""Deterministic, live referral ranking; never clinical eligibility prediction."""
from datetime import datetime, timezone
from sqlalchemy import select, func
from app.core.config import settings
from app.models import DonorProfile, DonorResponse, User
from app.services.blood_matching import match_request, precise_distance_km

RADII = (10, 25, 50, 100)
OUTREACH_TARGET = 5  # Operational outreach goal, not an estimate of donation units.


def matching_explanation(profile, request, distance, now=None):
    now = now or datetime.now(timezone.utc)
    flags = ["Clinical screening and component-specific laboratory confirmation required"]
    if not profile.blood_type_verified:
        flags.append("Blood group is donor-reported, not hospital-confirmed")
    if not profile.date_of_birth:
        flags.append("Age must be confirmed during screening")
    if not profile.last_donation_date:
        flags.append("Last donation date is unknown; interval must be confirmed")
    deadline = request.required_by
    if deadline and deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    hours = max(0, (deadline - now).total_seconds() / 3600) if deadline else None
    urgent = request.urgency in {"critical", "urgent"} or (hours is not None and hours <= 24)
    # All candidates are compatible and available. Distance dominates ranking.
    score = round(max(0, 70 - distance * .6) + (10 if profile.blood_type_verified else 0)
        + (5 if profile.blood_type == request.blood_type else 0) + (10 if urgent else 0), 1)
    priority = "Immediate outreach" if urgent and distance <= 10 else "Nearby priority" if distance <= 10 else "Extended search"
    component = request.component.replace("_", " ")
    rule = "Identical ABO/Rh conservative referral" if request.component in {"whole_blood", "platelets"} else "ABO/Rh red-cell referral" if request.component == "red_cells" else "Reverse ABO plasma referral (Rh does not determine plasma compatibility)"
    return {"priority": priority, "priority_score": score, "compatibility": f"Potentially compatible {component}",
        "explanation": [rule, f"Approximately {distance} km away, within donor-selected radius", "Available and opted in to location-based referrals"] + (["Time-sensitive request; prompt outreach suggested"] if urgent else []),
        "screening_flags": flags, "eligibility_status": "Clinical screening required", "deadline_hours": round(hours, 1) if hours is not None else None}


async def evaluate_candidates(db, request, radius_km=10, status_filter="all", blood_type=None, page=1, page_size=20):
    now = datetime.now(timezone.utc)
    result = {"items": [], "total": 0, "page": page, "total_pages": 0, "radius_km": radius_km,
        "outreach_target": OUTREACH_TARGET, "suggested_radius_km": None, "expansion": [],
        "policy_approved": settings.DONATION_POLICY_APPROVED, "evaluated_at": now.isoformat(), "notice": "Candidates are referrals, not medically cleared donors. Scores rank outreach only."}
    if request.status not in {"published", "partially_fulfilled"}:
        result["notice"] = "This request is not active; publish a current request to find donors."
        return result
    if not settings.DONATION_POLICY_APPROVED:
        result["notice"] = "Referral matching is disabled until the local clinical policy is approved."
        return result
    if request.latitude is None or request.longitude is None:
        result["notice"] = "Request location is missing. Confirm hospital coordinates before matching."
        return result
    # PostgreSQL filters the maximum search area and each donor's permitted radius.
    distance = 6371.0 * func.acos(func.least(1.0, func.greatest(-1.0,
        func.sin(func.radians(request.latitude)) * func.sin(func.radians(DonorProfile.latitude)) +
        func.cos(func.radians(request.latitude)) * func.cos(func.radians(DonorProfile.latitude)) * func.cos(func.radians(DonorProfile.longitude - request.longitude)))))
    rows = (await db.execute(select(DonorProfile, User).join(User, User.id == DonorProfile.user_id).where(
        User.is_active.is_(True), User.role == "donor", DonorProfile.is_available.is_(True),
        DonorProfile.matching_opt_in.is_(True), DonorProfile.latitude.is_not(None), DonorProfile.longitude.is_not(None),
        distance <= 100, distance <= DonorProfile.preferred_radius_km))).all()
    responses = {r.donor_user_id: r.status for r in (await db.execute(select(DonorResponse).where(DonorResponse.blood_request_id == request.id))).scalars()}
    matches = []
    for profile, user in rows:
        matched, km = match_request(profile, request, now)
        if not matched:
            continue
        names = (user.full_name or "Donor").split()
        info = matching_explanation(profile, request, km, now)
        matches.append({"_distance_km": precise_distance_km(profile.latitude, profile.longitude, request.latitude, request.longitude), "donor_user_id": user.id, "donor": names[0] + (f" {names[-1][0]}." if len(names) > 1 else ""),
            "blood_type": profile.blood_type, "distance_km": km, "approximate_location": profile.city,
            "availability": "Available", "response_status": responses.get(user.id), **info})
    matches.sort(key=lambda r: (-r["priority_score"], r["distance_km"], r["donor_user_id"]))
    result["expansion"] = [{"radius_km": radius, "new_candidates": sum(r["_distance_km"] <= radius and r["response_status"] is None for r in matches)} for radius in RADII]
    current = next(step["new_candidates"] for step in result["expansion"] if step["radius_km"] == radius_km)
    if current < OUTREACH_TARGET:
        result["suggested_radius_km"] = next((step["radius_km"] for step in result["expansion"] if step["radius_km"] > radius_km and step["new_candidates"] > current), None)
    filtered = [r for r in matches if r["_distance_km"] <= radius_km and (not blood_type or r["blood_type"] == blood_type)
        and (status_filter == "all" or (status_filter == "new" and r["response_status"] is None) or r["response_status"] == status_filter)]
    result["total"] = len(filtered)
    result["total_pages"] = (len(filtered) + page_size - 1) // page_size
    result["items"] = [{key: value for key, value in row.items() if key != "_distance_km"} for row in filtered[(page - 1) * page_size:page * page_size]]
    return result
