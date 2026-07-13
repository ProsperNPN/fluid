from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import HospitalContext, get_current_user, require_hospital_operator
from app.core.database import get_db
from app.models import Appointment, AuditLog, BloodRequest, DonorProfile, DonorResponse, Notification, User
from app.schemas.donor_match import CompatibleRequestPageRead, CompatibleRequestRead, DonorMatchPageRead, DonorMatchRead
from app.services.blood_matching import match_request

router = APIRouter(prefix="/donor-matches", tags=["Donor Matches"])

def _display_name(user: User) -> str:
    if not user.full_name: return "Verified donor"
    parts = user.full_name.split()
    return parts[0] + (f" {parts[-1][0]}." if len(parts) > 1 else "")

def _hospital_read(response: DonorResponse, request: BloodRequest, profile: DonorProfile, donor: User) -> DonorMatchRead:
    return DonorMatchRead(id=response.id, donor=_display_name(donor), blood_type=profile.blood_type, response=response.status.title(), eta="Ready" if profile.is_available else "Unavailable", request_id=request.id, donor_user_id=donor.id, compatibility="Compatible", availability=profile.availability, approximate_location=profile.city, last_donation_date=profile.last_donation_date.isoformat() if profile.last_donation_date else None, eligibility_status="Eligible" if profile.is_eligible else "Ineligible", response_status=response.status, responded_at=response.created_at.isoformat())

@router.get("/compatible", response_model=CompatibleRequestPageRead)
async def list_compatible_requests(page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=50), urgency: str | None = None, search: str | None = None, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> CompatibleRequestPageRead:
    if current_user.role != "donor" and not current_user.is_superuser: raise HTTPException(status_code=403, detail="Donor access only")
    profile = (await db.execute(select(DonorProfile).where(DonorProfile.user_id == current_user.id))).scalar_one_or_none()
    if not profile: return CompatibleRequestPageRead(items=[], page=page, page_size=page_size, total=0, total_pages=0)
    rows = list((await db.execute(select(BloodRequest).where(BloodRequest.status.in_(["published", "partially_fulfilled"])).order_by(BloodRequest.urgency.desc(), BloodRequest.created_at.desc()))).scalars().all())
    responses = {row.blood_request_id: row.status for row in list((await db.execute(select(DonorResponse).where(DonorResponse.donor_user_id == current_user.id))).scalars().all())}
    matched = []
    for request in rows:
        ok, distance = match_request(profile, request)
        if not ok or (urgency and urgency != "all" and request.urgency != urgency) or (search and search.lower() not in f"{request.hospital_name} {request.location}".lower()): continue
        matched.append((request, distance))
    total = len(matched); selected = matched[(page - 1) * page_size:page * page_size]
    items = [CompatibleRequestRead(id=row.id, hospital_name=row.hospital_name, hospital_verified=row.hospital_verified, blood_type=row.blood_type, units=row.units, location=row.location, status=row.status, notes=row.notes, distance_km=distance, created_at=row.created_at, expires_at=row.expires_at, response_status=responses.get(row.id)) for row, distance in selected]
    return CompatibleRequestPageRead(items=items, page=page, page_size=page_size, total=total, total_pages=(total + page_size - 1) // page_size if total else 0)

@router.post("/{request_id}/responses/{response_status}", response_model=CompatibleRequestRead)
async def respond_to_request(request_id: str, response_status: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> CompatibleRequestRead:
    if response_status not in {"accepted", "declined", "saved"}: raise HTTPException(status_code=422, detail="Invalid response")
    profile = (await db.execute(select(DonorProfile).where(DonorProfile.user_id == current_user.id))).scalar_one_or_none(); request = await db.get(BloodRequest, request_id)
    if not profile or not request: raise HTTPException(status_code=404, detail="Request not found")
    matched, distance = match_request(profile, request)
    if not matched: raise HTTPException(status_code=409, detail="This request is no longer available to you")
    existing = (await db.execute(select(DonorResponse).where(DonorResponse.donor_user_id == current_user.id, DonorResponse.blood_request_id == request_id))).scalar_one_or_none()
    stored_status = "pending" if response_status == "accepted" else response_status
    if existing and existing.status in {"pending", "accepted", "scheduled", "completed"} and response_status == "accepted": raise HTTPException(status_code=409, detail="Request already accepted")
    if existing: existing.status = stored_status
    else: db.add(DonorResponse(donor_user_id=current_user.id, blood_request_id=request_id, status=stored_status))
    if response_status == "accepted":
        db.add(Notification(user_id=request.created_by_user_id, type="donor_response", title="New donor response", message=f"A compatible donor responded to the {request.blood_type} request.", level="success", related_path="/hospital/donors"))
        db.add(Notification(user_id=current_user.id, type="donor_response", title="Response sent", message=f"Your response to {request.hospital_name} is awaiting review.", level="success", related_path="/donor/requests"))
    await db.commit(); await db.refresh(request)
    return CompatibleRequestRead(id=request.id, hospital_name=request.hospital_name, hospital_verified=request.hospital_verified, blood_type=request.blood_type, units=request.units, location=request.location, status=request.status, notes=request.notes, distance_km=distance, created_at=request.created_at, expires_at=request.expires_at, response_status=stored_status)

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
    if response.status != "pending": raise HTTPException(status_code=409, detail="Response already decided")
    response.status = "rejected" if decision == "reject" else "accepted"
    if decision == "accept":
        existing = (await db.execute(select(Appointment).where(Appointment.blood_request_id == request.id, Appointment.donor_user_id == donor.id))).scalar_one_or_none()
        if not existing: db.add(Appointment(donor_user_id=donor.id, hospital_user_id=context.user.id, blood_request_id=request.id, scheduled_at=request.required_by or request.created_at, status="pending", location=request.location, department=request.department, contact_person=request.contact_person))
    db.add(Notification(user_id=donor.id, type="donor_response", title=f"Hospital {decision}ed your response", message=f"{context.hospital.hospital_name} {decision}ed your response for {request.blood_type}.", level="success" if decision == "accept" else "info", related_path="/donor/appointments" if decision == "accept" else "/donor/requests"))
    db.add(AuditLog(hospital_profile_id=context.hospital.id, actor_user_id=context.user.id, action=f"donor_response.{decision}", entity_type="donor_response", entity_id=response.id))
    await db.commit(); return _hospital_read(response, request, profile, donor)
