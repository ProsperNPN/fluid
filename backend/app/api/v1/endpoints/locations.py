from collections import OrderedDict, deque
from datetime import UTC, datetime
from time import monotonic
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, get_hospital_context, require_hospital_admin
from app.core.database import get_db
from app.models import AuditLog, BloodRequest, HospitalProfile, User
from app.repositories import ProfileRepository
from app.schemas.location import LocationRead, LocationSelection, GeocodedPlace, ReverseLookup, AddressSearch
from app.services.geocoding import geocode
from app.services.blood_matching import match_request, distance_km
from app.services.request_lifecycle import expire_requests

router = APIRouter(prefix="/locations", tags=["Locations"])
_requests: OrderedDict[str, deque] = OrderedDict()


def geocoding_limit(request: Request, response: Response):
    # Public lookups support registration. Do not trust forwarded IP headers.
    key = request.client.host if request.client else "unknown"
    now = monotonic()
    times = _requests.setdefault(key, deque())
    _requests.move_to_end(key)
    while times and times[0] < now - 60:
        times.popleft()
    if len(times) >= 30:
        raise HTTPException(429, "Too many address lookups. Please wait a minute.", headers={"Retry-After": "60"})
    times.append(now)
    while len(_requests) > 2000:
        _requests.popitem(last=False)
    response.headers["Cache-Control"] = "no-store"


@router.post("/search", response_model=list[GeocodedPlace], dependencies=[Depends(geocoding_limit)])
async def search(payload: AddressSearch):
    return await geocode("/api/", {"q": payload.q.strip(), "limit": 5, "lang": "en"})


@router.post("/reverse", response_model=list[GeocodedPlace], dependencies=[Depends(geocoding_limit)])
async def reverse(payload: ReverseLookup):
    return await geocode("/reverse", {"lat": payload.latitude, "lon": payload.longitude, "limit": 1, "lang": "en"})


async def own_profile(db, user):
    if user.role == "donor":
        profile = await ProfileRepository(db).get_donor_profile(user.id)
        if profile is None:
            raise HTTPException(404, "Create your donor profile first")
        return profile
    if user.role == "hospital":
        return (await get_hospital_context(db, user)).hospital
    raise HTTPException(403, "Donor or hospital account required")


def location_read(profile):
    return LocationRead(latitude=profile.latitude, longitude=profile.longitude, city=profile.city,
        region=profile.region, country=profile.country, address=profile.address,
        source=profile.location_source, accuracy_m=profile.location_accuracy_m,
        updated_at=profile.location_updated_at, confirmed_at=profile.location_confirmed_at,
        preferred_radius_km=getattr(profile, "preferred_radius_km", None))


@router.get("/me", response_model=LocationRead)
async def get_location(response: Response, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    response.headers["Cache-Control"] = "no-store"
    return location_read(await own_profile(db, user))


@router.patch("/me", response_model=LocationRead)
async def save_location(payload: LocationSelection, response: Response, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    profile = await own_profile(db, user)
    if user.role == "hospital":
        await require_hospital_admin(await get_hospital_context(db, user))
        if payload.source == "live":
            raise HTTPException(422, "Live tracking is for donors only; confirm your fixed facility location")
        moved = distance_km(profile.latitude, profile.longitude, payload.latitude, payload.longitude)
        identity_changed = any((getattr(profile, field) or "").strip().casefold() != (getattr(payload, field) or "").strip().casefold() for field in ["city", "country"])
        if profile.verification_status == "verified" and ((profile.location_confirmed_at and identity_changed) or (moved is not None and moved > 1)):
            profile.verification_status = "more_information_required"
    for field in ["latitude", "longitude", "city", "region", "country", "address"]:
        setattr(profile, field, getattr(payload, field))
    now = datetime.now(UTC)
    profile.location_updated_at = now
    profile.location_source = payload.source
    profile.location_accuracy_m = payload.accuracy_m
    # An unapproved hospital may prepare its address, but must confirm again after approval.
    profile.location_confirmed_at = now if user.role == "donor" or profile.verification_status == "verified" else None
    if user.role == "donor" and payload.preferred_radius_km is not None:
        profile.preferred_radius_km = payload.preferred_radius_km
    if user.role == "hospital":
        db.add(AuditLog(hospital_profile_id=profile.id, actor_user_id=user.id,
            action="hospital.location_confirmed" if profile.location_confirmed_at else "hospital.location_prepared",
            entity_type="hospital_profile", entity_id=profile.id, details={"source": payload.source}))
    await db.commit()
    response.headers["Cache-Control"] = "no-store"
    return location_read(profile)


@router.patch("/radius")
async def radius(radius_km: int = Query(ge=5, le=100), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "donor":
        raise HTTPException(403, "Donor access only")
    if radius_km not in {5, 10, 25, 50, 100}:
        raise HTTPException(422, "Choose a radius of 5, 10, 25, 50 or 100 km")
    profile = await own_profile(db, user)
    profile.preferred_radius_km = radius_km
    await db.commit()
    return {"radius_km": radius_km}


def sql_distance(lat, lon, target_lat, target_lon):
    return 6371.0 * func.acos(func.least(1.0, func.greatest(-1.0,
        func.sin(func.radians(lat)) * func.sin(func.radians(target_lat)) +
        func.cos(func.radians(lat)) * func.cos(func.radians(target_lat)) * func.cos(func.radians(target_lon - lon)))))


@router.get("/nearby")
async def nearby(response: Response, urgency: Literal["all", "routine", "urgent", "critical"] = "all", db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "donor":
        raise HTTPException(403, "Nearby discovery is for donors; donor coordinates are never shared")
    profile = await own_profile(db, user)
    if profile.latitude is None or profile.longitude is None:
        raise HTTPException(409, "Confirm your location to discover nearby hospitals and requests")
    await expire_requests(db)
    distance = sql_distance(profile.latitude, profile.longitude, HospitalProfile.latitude, HospitalProfile.longitude)
    facilities = (await db.execute(select(HospitalProfile, distance.label("distance")).join(User, User.id == HospitalProfile.user_id).where(
        HospitalProfile.verification_status == "verified", User.is_active.is_(True),
        HospitalProfile.location_confirmed_at.is_not(None), HospitalProfile.latitude.is_not(None),
        HospitalProfile.longitude.is_not(None), distance <= profile.preferred_radius_km).order_by(distance).limit(101))).all()
    rd = sql_distance(profile.latitude, profile.longitude, BloodRequest.latitude, BloodRequest.longitude)
    filters = [HospitalProfile.verification_status == "verified", HospitalProfile.location_confirmed_at.is_not(None),
        User.is_active.is_(True), BloodRequest.status.in_(["published", "partially_fulfilled"]),
        BloodRequest.latitude.is_not(None), BloodRequest.longitude.is_not(None), rd <= profile.preferred_radius_km]
    if urgency != "all":
        filters.append(BloodRequest.urgency == urgency)
    rows = (await db.execute(select(BloodRequest, rd.label("distance")).join(HospitalProfile, HospitalProfile.id == BloodRequest.hospital_profile_id).join(User, User.id == HospitalProfile.user_id).where(*filters).order_by(rd).limit(501))).all()
    requests = []
    for item, km in rows[:500]:
        compatible, _ = match_request(profile, item)
        if compatible:
            requests.append({"id": item.id, "hospital_name": item.hospital_name, "latitude": item.latitude, "longitude": item.longitude,
                "blood_type": item.blood_type, "component": item.component, "urgency": item.urgency,
                "units": max(0, item.units - item.units_fulfilled), "distance_km": round(km, 1), "location": item.location})
    response.headers["Cache-Control"] = "no-store"
    return {"radius_km": profile.preferred_radius_km,
        "hospitals": [{"id": h.id, "name": h.hospital_name, "latitude": h.latitude, "longitude": h.longitude, "city": h.city,
            "distance_km": round(km, 1)} for h, km in facilities[:100]],
        "requests": requests, "has_more": len(facilities) > 100 or len(rows) > 500,
        "notice": "Referrals require eligibility, known blood type, availability and an approved clinical policy. Hospitals must confirm facility location."}
