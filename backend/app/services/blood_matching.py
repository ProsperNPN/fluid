from __future__ import annotations
from datetime import datetime, timezone, timedelta
from math import asin, cos, radians, sin, sqrt
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


def precise_distance_km(lat1, lon1, lat2, lon2):
    if None in (lat1, lon1, lat2, lon2): return None
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
    now = now or datetime.now(timezone.utc)
    expiry = request.expires_at
    if expiry and expiry.tzinfo is None: expiry = expiry.replace(tzinfo=timezone.utc)
    deadline = getattr(request, "required_by", None)
    if deadline and deadline.tzinfo is None: deadline = deadline.replace(tzinfo=timezone.utc)
    if request.status not in {"published", "partially_fulfilled"} or (expiry and expiry <= now) or (deadline and deadline <= now): return False, None
    if not getattr(request, "hospital_verified", False) or not profile.is_available: return False, None
    if not is_referral_candidate(profile, now) or not can_donate_to(profile.blood_type, request.blood_type, request.component): return False, None
    distance = precise_distance_km(profile.latitude, profile.longitude, request.latitude, request.longitude)
    if distance is not None and distance > profile.preferred_radius_km: return False, round(distance, 1)
    # Manual coordinates are supported. Without coordinates, never invent a nearby distance.
    if distance is None: return False, None
    return True, round(distance, 1)


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
