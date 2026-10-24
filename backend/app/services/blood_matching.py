from __future__ import annotations
from datetime import datetime, timezone, timedelta
from math import asin, cos, radians, sin, sqrt, isfinite
from app.core.config import settings

# Referral matching only. Crossmatching and clinical clearance belong to the hospital.
# Sources: Canadian Blood Services ABO compatibility guide; WHO donor selection.
COMPATIBLE_RECIPIENTS = {
    "O-": {"O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"},
    "O+": {"O+", "A+", "B+", "AB+"},
    "A-": {"A-", "A+", "AB-", "AB+"}, "A+": {"A+", "AB+"},
    "B-": {"B-", "B+", "AB-", "AB+"}, "B+": {"B+", "AB+"},
    "AB-": {"AB-", "AB+"}, "AB+": {"AB+"},
}
PLASMA_RECIPIENTS = {"AB": {"O", "A", "B", "AB"}, "A": {"A", "O"}, "B": {"B", "O"}, "O": {"O"}}


def can_donate_to(donor_type: str, requested_type: str, component: str = "red_cells") -> bool:
    if donor_type not in COMPATIBLE_RECIPIENTS or requested_type not in COMPATIBLE_RECIPIENTS:
        return False
    if component == "red_cells":
        return requested_type in COMPATIBLE_RECIPIENTS[donor_type]
    if component == "plasma":
        return requested_type[:-1] in PLASMA_RECIPIENTS[donor_type[:-1]]
    # Conservative identical-group referrals for whole blood/platelets. No substitutions.
    if component in {"whole_blood", "platelets"}:
        return donor_type == requested_type
    return False


def valid_coordinates(latitude, longitude):
    return (latitude is not None and longitude is not None
            and isfinite(latitude) and isfinite(longitude)
            and abs(latitude) <= 90 and abs(longitude) <= 180)


def exclusion_reasons(profile, request, now=None, radius_km=None):
    """Shared referral rules for matching and diagnostics; never medical clearance."""
    now = now or datetime.now(timezone.utc)
    reasons = []
    if not settings.DONATION_POLICY_APPROVED: reasons.append("clinical_policy_not_approved")
    if request.status not in {"published", "partially_fulfilled"}: reasons.append("request_inactive")
    for field in ("expires_at", "required_by"):
        value = getattr(request, field, None)
        if value and (value if value.tzinfo else value.replace(tzinfo=timezone.utc)) <= now:
            reasons.append("request_deadline_passed")
            break
    if not getattr(request, "hospital_verified", False): reasons.append("hospital_unverified")
    if not profile.is_available: reasons.append("donor_unavailable")
    if not getattr(profile, "matching_opt_in", False): reasons.append("matching_consent_missing")
    if not profile.is_eligible: reasons.append("known_screening_exclusion")
    if not getattr(profile, "blood_type_known", False): reasons.append("blood_type_unknown")
    elif not can_donate_to(profile.blood_type, request.blood_type, request.component): reasons.append("component_incompatible")
    dob = getattr(profile, "date_of_birth", None)
    if dob:
        age = now.year - dob.year - ((now.month, now.day) < (dob.month, dob.day))
        if not settings.DONOR_MIN_AGE <= age <= settings.DONOR_MAX_AGE: reasons.append("outside_age_policy")
    next_date = next_eligible_date(profile)
    if next_date and next_date > now.date(): reasons.append("donation_interval_not_met")
    if not valid_coordinates(request.latitude, request.longitude): reasons.append("hospital_location_missing_or_invalid")
    if not valid_coordinates(profile.latitude, profile.longitude): reasons.append("donor_location_missing_or_invalid")
    km = precise_distance_km(profile.latitude, profile.longitude, request.latitude, request.longitude)
    if km is not None:
        if km > profile.preferred_radius_km: reasons.append("outside_donor_radius")
        if radius_km is not None and km > radius_km: reasons.append("outside_request_search_radius")
    return reasons


def precise_distance_km(lat1, lon1, lat2, lon2):
    if not valid_coordinates(lat1, lon1) or not valid_coordinates(lat2, lon2): return None
    d_lat, d_lon = radians(lat2 - lat1), radians(lon2 - lon1)
    value = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return 6371 * 2 * asin(sqrt(min(1, max(0, value))))


def distance_km(lat1, lon1, lat2, lon2):
    value = precise_distance_km(lat1, lon1, lat2, lon2)
    return round(value, 1) if value is not None else None


def next_eligible_date(profile):
    return profile.last_donation_date + timedelta(days=settings.DONATION_INTERVAL_DAYS) if profile.last_donation_date else None


def is_donor_eligible(profile, now=None):
    now = now or datetime.now(timezone.utc)
    if not settings.DONATION_POLICY_APPROVED or not profile.is_eligible or not getattr(profile, "blood_type_known", False): return False
    dob = getattr(profile, "date_of_birth", None)
    if not dob: return False
    age = now.year - dob.year - ((now.month, now.day) < (dob.month, dob.day))
    if not settings.DONOR_MIN_AGE <= age <= settings.DONOR_MAX_AGE: return False
    next_date = next_eligible_date(profile)
    return not next_date or next_date <= now.date()


def match_request(profile, request, now=None):
    reasons = exclusion_reasons(profile, request, now)
    distance = precise_distance_km(profile.latitude, profile.longitude, request.latitude, request.longitude)
    return not reasons, round(distance, 1) if distance is not None else None


def is_referral_candidate(profile, now=None):
    """Known exclusions block referrals; unknown screening is never clearance."""
    now = now or datetime.now(timezone.utc)
    if not settings.DONATION_POLICY_APPROVED or not profile.is_eligible or not getattr(profile, "blood_type_known", False):
        return False
    if not getattr(profile, "matching_opt_in", False):
        return False
    dob = getattr(profile, "date_of_birth", None)
    if dob:
        age = now.year - dob.year - ((now.month, now.day) < (dob.month, dob.day))
        if not settings.DONOR_MIN_AGE <= age <= settings.DONOR_MAX_AGE:
            return False
    next_date = next_eligible_date(profile)
    return not next_date or next_date <= now.date()
