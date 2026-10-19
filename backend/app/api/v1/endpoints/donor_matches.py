from app.services.request_lifecycle import expire_requests
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import HospitalContext, get_current_user, require_hospital_operator
from app.core.database import get_db
from app.models import Appointment, AuditLog, BloodRequest, DonorProfile, DonorResponse, Notification, User, HospitalProfile
from app.schemas.donor_match import CompatibleRequestPageRead, CompatibleRequestRead, DonorMatchPageRead, DonorMatchRead
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Literal
from app.schemas.profile import BloodType
from app.services.blood_matching import match_request, distance_km, can_donate_to, precise_distance_km
from app.services.intelligent_matching import evaluate_candidates

router = APIRouter(prefix="/donor-matches", tags=["Donor Matches"])

def _display_name(user: User) -> str:
    if not user.full_name: return "Donor"
    parts = user.full_name.split()
    return parts[0] + (f" {parts[-1][0]}." if len(parts) > 1 else "")

def _hospital_read(response: DonorResponse, request: BloodRequest, profile: DonorProfile, donor: User) -> DonorMatchRead:
    return DonorMatchRead(id=response.id, donor=_display_name(donor), blood_type=profile.blood_type, distance_km=distance_km(profile.latitude, profile.longitude, request.latitude, request.longitude), response=response.status.title(), eta="Available for screening" if profile.is_available else "Unavailable", request_id=request.id, donor_user_id=donor.id, compatibility="Potentially compatible; screening required" if can_donate_to(profile.blood_type, request.blood_type, request.component) else "Compatibility changed; recheck required", availability="Available" if profile.is_available else "Unavailable", approximate_location=profile.city, last_donation_date=profile.last_donation_date.isoformat() if profile.last_donation_date and response.status in {"pending", "accepted", "scheduled", "completed"} else None, eligibility_status="Hospital screening required", response_status=response.status, responded_at=response.responded_at.isoformat() if response.responded_at else None)

def _compatible_read(request, distance, status, can_accept=True):
    return CompatibleRequestRead(component=request.component, urgency=request.urgency, required_by=request.required_by,
        id=request.id, hospital_name=request.hospital_name, hospital_verified=request.hospital_verified, blood_type=request.blood_type,
        units=max(0, request.units - request.units_fulfilled), location=request.location, status=request.status, notes=request.notes,
        distance_km=distance, created_at=request.created_at, expires_at=request.expires_at, response_status=status,
        hospital_latitude=request.latitude, hospital_longitude=request.longitude, can_accept=can_accept)


@router.get("/invitations", response_model=CompatibleRequestPageRead)
async def donor_invitations(page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=50), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role != "donor": raise HTTPException(403, "Donor access only")
    await expire_requests(db)
    profile = (await db.execute(select(DonorProfile).where(DonorProfile.user_id == user.id))).scalar_one_or_none()
    stmt = select(DonorResponse, BloodRequest).join(BloodRequest, BloodRequest.id == DonorResponse.blood_request_id).join(HospitalProfile, HospitalProfile.id == BloodRequest.hospital_profile_id).where(
        DonorResponse.donor_user_id == user.id, DonorResponse.invited_at.is_not(None), HospitalProfile.verification_status == "verified")
    total = int((await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one())
    rows = (await db.execute(stmt.order_by(DonorResponse.invited_at.desc()).offset((page - 1)*page_size).limit(page_size))).all()
    items = []
    for response, request in rows:
        matched, km = match_request(profile, request) if profile else (False, None)
        items.append(_compatible_read(request, km, response.status, matched and response.status == "invited"))
    return CompatibleRequestPageRead(items=items, page=page, page_size=page_size, total=total, total_pages=(total+page_size-1)//page_size)


@router.get("/compatible", response_model=CompatibleRequestPageRead)
async def list_compatible_requests(page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=50), urgency: str | None = None, search: str | None = None, request_id: str | None = None, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> CompatibleRequestPageRead:
    await expire_requests(db)
    if current_user.role != "donor" and not current_user.is_superuser: raise HTTPException(status_code=403, detail="Donor access only")
    profile = (await db.execute(select(DonorProfile).where(DonorProfile.user_id == current_user.id))).scalar_one_or_none()
    if not profile: return CompatibleRequestPageRead(items=[], page=page, page_size=page_size, total=0, total_pages=0)
    rows = list((await db.execute(select(BloodRequest).where(BloodRequest.status.in_(["published", "partially_fulfilled"]), BloodRequest.hospital_profile_id.in_(select(HospitalProfile.id).where(HospitalProfile.verification_status == "verified"))).order_by(BloodRequest.urgency.desc(), BloodRequest.created_at.desc()))).scalars().all())
    if request_id: rows = [row for row in rows if row.id == request_id]
    responses = {row.blood_request_id: row.status for row in list((await db.execute(select(DonorResponse).where(DonorResponse.donor_user_id == current_user.id))).scalars().all())}
    matched = []
    for request in rows:
        ok, distance = match_request(profile, request)
        if not ok or (urgency and urgency != "all" and request.urgency != urgency) or (search and search.lower() not in f"{request.hospital_name} {request.location}".lower()): continue
        matched.append((request, distance))
    total = len(matched); selected = matched[(page - 1) * page_size:page * page_size]
    items = [_compatible_read(row, distance, responses.get(row.id)) for row, distance in selected]
    return CompatibleRequestPageRead(items=items, page=page, page_size=page_size, total=total, total_pages=(total + page_size - 1) // page_size if total else 0)

@router.post("/{request_id}/responses/{response_status}", response_model=CompatibleRequestRead)
async def respond_to_request(request_id: str, response_status: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> CompatibleRequestRead:
    if current_user.role != "donor": raise HTTPException(status_code=403, detail="Donor access only")
    if response_status not in {"accepted", "declined", "saved"}: raise HTTPException(status_code=422, detail="Invalid response")
    await expire_requests(db)
    request = (await db.execute(select(BloodRequest).where(BloodRequest.id == request_id).with_for_update())).scalar_one_or_none()
    profile = (await db.execute(select(DonorProfile).where(DonorProfile.user_id == current_user.id).with_for_update())).scalar_one_or_none()
    if not profile or not request: raise HTTPException(status_code=404, detail="Request not found")
    hospital = await db.get(HospitalProfile, request.hospital_profile_id)
    if not hospital or hospital.verification_status != "verified": raise HTTPException(status_code=409, detail="Hospital verification is no longer approved")
    matched, distance = match_request(profile, request)
    existing = (await db.execute(select(DonorResponse).where(DonorResponse.donor_user_id == current_user.id, DonorResponse.blood_request_id == request_id))).scalar_one_or_none()
    if not matched and not (response_status == "declined" and existing and existing.status == "invited"):
        raise HTTPException(409, "This request is no longer available to you")
    if existing and existing.status in {"declined", "rejected", "cancelled", "expired", "completed"}:
        raise HTTPException(409, "This response is final; a duplicate response is not allowed")
    if existing and existing.status == "invited" and response_status == "saved":
        raise HTTPException(409, "Accept or decline the invitation instead of replacing it with a saved request")
    if existing and existing.status in {"accepted", "scheduled", "completed"} and response_status != "accepted": raise HTTPException(409, "Manage the coordinated appointment instead of overwriting its donor response")
    stored_status = "pending" if response_status == "accepted" else response_status
    if existing and existing.status in {"pending", "accepted", "scheduled", "completed"} and response_status == "accepted": raise HTTPException(status_code=409, detail="Request already accepted")
    if existing:
        existing.status = stored_status
        if response_status in {"accepted", "declined"}: existing.responded_at = datetime.now(timezone.utc)
    else: db.add(DonorResponse(donor_user_id=current_user.id, blood_request_id=request_id, status=stored_status, responded_at=datetime.now(timezone.utc) if response_status in {"accepted", "declined"} else None))
    if response_status in {"accepted", "declined"}:
        db.add(AuditLog(hospital_profile_id=request.hospital_profile_id, actor_user_id=current_user.id, action="donor.responded", entity_type="blood_request", entity_id=request.id, details={"response": stored_status}))
        from app.services.emergency_alerts import hospital_notice
        await hospital_notice(db, request, "Donor response updated", f"A donor {'expressed interest in' if response_status == 'accepted' else 'declined'} the {request.blood_type} request.")
        db.add(Notification(user_id=current_user.id, type="donor_response", title="Response updated", message=f"Your response to {request.hospital_name} {'is awaiting hospital review' if response_status == 'accepted' else 'was declined'}.", level="success", related_path="/donor/requests"))
    await db.commit(); await db.refresh(request)
    return _compatible_read(request, distance, stored_status, matched)

@router.get("", response_model=DonorMatchPageRead)
async def list_donor_matches(page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=50), db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_operator)) -> DonorMatchPageRead:
    filters = [BloodRequest.hospital_profile_id == context.hospital.id]
    total = int((await db.execute(select(func.count(DonorResponse.id)).join(BloodRequest, BloodRequest.id == DonorResponse.blood_request_id).where(*filters))).scalar_one() or 0)
    stmt = select(DonorResponse, BloodRequest, DonorProfile, User).join(BloodRequest, BloodRequest.id == DonorResponse.blood_request_id).join(DonorProfile, DonorProfile.user_id == DonorResponse.donor_user_id).join(User, User.id == DonorResponse.donor_user_id).where(*filters).order_by(DonorResponse.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).all()
    return DonorMatchPageRead(items=[_hospital_read(*row) for row in rows], page=page, page_size=page_size, total=total, total_pages=(total + page_size - 1) // page_size if total else 0)

@router.post("/responses/{response_id}/{decision}", response_model=DonorMatchRead)
async def decide_donor_response(response_id: str, decision: str, db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_operator)) -> DonorMatchRead:
    if decision not in {"accept", "reject"}: raise HTTPException(status_code=422, detail="Invalid decision")
    row = (await db.execute(select(DonorResponse, BloodRequest, DonorProfile, User).join(BloodRequest, BloodRequest.id == DonorResponse.blood_request_id).join(DonorProfile, DonorProfile.user_id == DonorResponse.donor_user_id).join(User, User.id == DonorResponse.donor_user_id).where(DonorResponse.id == response_id, BloodRequest.hospital_profile_id == context.hospital.id))).first()
    if not row: raise HTTPException(status_code=404, detail="Donor response not found")
    response, request, profile, donor = row
    await db.execute(select(BloodRequest).where(BloodRequest.id == request.id).with_for_update())
    await db.refresh(request)
    await db.execute(select(DonorProfile).where(DonorProfile.id == profile.id).with_for_update())
    await db.refresh(profile)
    response = (await db.execute(select(DonorResponse).where(DonorResponse.id == response.id).with_for_update().execution_options(populate_existing=True))).scalar_one()
    if response.status != "pending": raise HTTPException(status_code=409, detail="Response already decided")
    if decision == "accept" and (not donor.is_active or not match_request(profile, request)[0]): raise HTTPException(status_code=409, detail="Match is no longer available; recheck donor and request")
    response.status = "rejected" if decision == "reject" else "accepted"
    if decision == "accept":
        existing = (await db.execute(select(Appointment).where(Appointment.blood_request_id == request.id, Appointment.donor_user_id == donor.id))).scalar_one_or_none()
        if not existing: db.add(Appointment(donor_user_id=donor.id, hospital_user_id=context.user.id, blood_request_id=request.id, scheduled_at=request.required_by or datetime.now(timezone.utc), status="pending", location=request.location, department=request.department, contact_person=request.contact_person))
    db.add(Notification(user_id=donor.id, type="donor_response", title=f"Hospital {decision}ed your response", message=f"{context.hospital.hospital_name} {decision}ed your response for {request.blood_type}.", level="success" if decision == "accept" else "info", related_path="/donor/appointments" if decision == "accept" else "/donor/requests"))
    db.add(AuditLog(hospital_profile_id=context.hospital.id, actor_user_id=context.user.id, action=f"donor_response.{decision}", entity_type="donor_response", entity_id=response.id))
    await db.commit(); return _hospital_read(response, request, profile, donor)


@router.get("/potential")
async def potential_donors(request_id: str, radius_km: int = Query(10, ge=10, le=100),
    status_filter: Literal["all", "new", "invited", "pending", "accepted", "scheduled", "declined", "rejected", "saved"] = Query("all", alias="status"),
    blood_type: BloodType | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_operator)):
    if radius_km not in {10, 25, 50, 100}: raise HTTPException(422, "Choose 10, 25, 50 or 100 km")
    await expire_requests(db, context.hospital.id)
    request = await db.get(BloodRequest, request_id)
    if not request or request.hospital_profile_id != context.hospital.id: raise HTTPException(404, "Request not found")
    return await evaluate_candidates(db, request, radius_km, status_filter, blood_type, page, page_size)


@router.post("/{request_id}/invite/{donor_id}")
async def invite_donor(request_id: str, donor_id: str, radius_km: int = Query(10, ge=10, le=100), db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_operator)):
    if radius_km not in {10, 25, 50, 100}: raise HTTPException(422, "Choose 10, 25, 50 or 100 km")
    request = (await db.execute(select(BloodRequest).where(BloodRequest.id == request_id).with_for_update())).scalar_one_or_none()
    profile = (await db.execute(select(DonorProfile).where(DonorProfile.user_id == donor_id).with_for_update())).scalar_one_or_none()
    donor = await db.get(User, donor_id)
    if not request or request.hospital_profile_id != context.hospital.id: raise HTTPException(404, "Request not found")
    if not donor or not donor.is_active or donor.role != "donor" or not profile or not match_request(profile, request)[0]: raise HTTPException(409, "Donor is not available for this referral")
    km = precise_distance_km(profile.latitude, profile.longitude, request.latitude, request.longitude)
    if km is None or km > radius_km: raise HTTPException(409, "Expand the search radius explicitly before inviting this donor")
    response = (await db.execute(select(DonorResponse).where(DonorResponse.donor_user_id == donor_id, DonorResponse.blood_request_id == request_id))).scalar_one_or_none()
    if response: raise HTTPException(409, "Donor already has an invitation or response")
    if request.urgency != "routine" and not profile.notify_urgent_requests:
        raise HTTPException(409, "Donor has opted out of emergency invitations")
    if request.urgency != "routine":
        from app.services.emergency_alerts import record_alert
        await record_alert(db, request, profile, distance_km(profile.latitude, profile.longitude, request.latitude, request.longitude), radius_km)
    else:
        db.add(DonorResponse(donor_user_id=donor_id, blood_request_id=request_id, status="invited", invited_at=datetime.now(timezone.utc)))
        db.add(Notification(user_id=donor_id, type="donor_invitation", title="Hospital invitation", message=f"{context.hospital.hospital_name} invited you to respond to a compatible request.", level="info", related_path=f"/donor/requests?request={request_id}"))
    db.add(AuditLog(hospital_profile_id=context.hospital.id, actor_user_id=context.user.id, action="donor.invited", entity_type="blood_request", entity_id=request_id))
    await db.commit()
    return {"message": "Invitation sent"}


class VerifiedBloodType(BaseModel):
    blood_type: BloodType
    clinical_confirmation: Literal[True]


@router.post("/responses/{response_id}/blood-type/verify")
async def verify_blood_type(response_id: str, payload: VerifiedBloodType, db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_operator)):
    row = (await db.execute(select(DonorProfile, DonorResponse).join(DonorResponse, DonorResponse.donor_user_id == DonorProfile.user_id).join(BloodRequest, BloodRequest.id == DonorResponse.blood_request_id).where(DonorResponse.id == response_id, BloodRequest.hospital_profile_id == context.hospital.id, DonorResponse.status.in_(["pending", "accepted", "scheduled", "completed"])).with_for_update(of=DonorProfile))).first()
    if not row: raise HTTPException(404, "Consenting donor response not found")
    profile, response = row
    profile.blood_type = payload.blood_type
    profile.blood_type_known = True
    profile.blood_type_verified = True
    db.add(AuditLog(hospital_profile_id=context.hospital.id, actor_user_id=context.user.id, action="donor.blood_type_verified", entity_type="donor_profile", entity_id=profile.id, details={"blood_type": payload.blood_type}))
    await db.commit()
    return {"message": "Hospital-verified blood type recorded"}
