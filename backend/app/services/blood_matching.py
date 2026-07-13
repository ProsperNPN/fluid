from __future__ import annotations
from datetime import datetime, timezone, timedelta
from math import asin, cos, radians, sin, sqrt
from app.models import BloodRequest, DonorProfile

COMPATIBLE_RECIPIENTS = {
    "O-": {"O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"},
    "O+": {"O+", "A+", "B+", "AB+"},
    "A-": {"A-", "A+", "AB-", "AB+"}, "A+": {"A+", "AB+"},
    "B-": {"B-", "B+", "AB-", "AB+"}, "B+": {"B+", "AB+"},
    "AB-": {"AB-", "AB+"}, "AB+": {"AB+"},
}


def can_donate_to(donor_type: str, requested_type: str) -> bool:
    return requested_type in COMPATIBLE_RECIPIENTS.get(donor_type, set())


def distance_km(lat1: float | None, lon1: float | None, lat2: float | None, lon2: float | None) -> float | None:
    if None in (lat1, lon1, lat2, lon2): return None
    d_lat, d_lon = radians(lat2 - lat1), radians(lon2 - lon1)
    value = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return round(6371 * 2 * asin(sqrt(value)), 1)


def is_donor_eligible(profile: DonorProfile, now: datetime | None = None) -> bool:
    now = now or datetime.now(timezone.utc)
    if not profile.is_available or not profile.is_eligible: return False
    return not profile.last_donation_date or profile.last_donation_date + timedelta(days=56) <= now.date()


def match_request(profile: DonorProfile, request: BloodRequest, now: datetime | None = None) -> tuple[bool, float | None]:
    now = now or datetime.now(timezone.utc)
    if request.status not in {"published", "partially_fulfilled"} or (request.expires_at and request.expires_at <= now): return False, None
    if not is_donor_eligible(profile, now) or not can_donate_to(profile.blood_type, request.blood_type): return False, None
    distance = distance_km(profile.latitude, profile.longitude, request.latitude, request.longitude)
    if distance is not None and distance > profile.preferred_radius_km: return False, distance
    if distance is None and profile.city and profile.city.lower() not in request.location.lower(): return False, None
    return True, distance
