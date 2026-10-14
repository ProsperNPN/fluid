from app.services.request_lifecycle import expire_requests
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import HospitalContext, get_current_user, require_hospital_operator
from app.core.database import get_db
from app.models import Appointment, AuditLog, BloodRequest, DonorProfile, DonorResponse, Notification, User, HospitalProfile
from app.repositories import BloodRequestRepository
from app.schemas.blood_request import BloodRequestCreate, BloodRequestListPageRead, BloodRequestRead, BloodRequestUpdate
from app.services.blood_matching import match_request
from app.schemas.request_transition import RequestTransition

router = APIRouter(prefix="/blood-requests", tags=["Blood Requests"])

async def _read(db: AsyncSession, item: BloodRequest) -> BloodRequestRead:
    responses = int((await db.execute(select(func.count(DonorResponse.id)).where(DonorResponse.blood_request_id == item.id))).scalar_one() or 0)
    appointments = int((await db.execute(select(func.count(Appointment.id)).where(Appointment.blood_request_id == item.id))).scalar_one() or 0)
    data = {column.name: getattr(item, column.name) for column in item.__table__.columns}
    return BloodRequestRead(**data, donor_response_count=responses, appointment_count=appointments)

async def _notify_compatible_donors(db: AsyncSession, item: BloodRequest) -> None:
    profiles = list((await db.execute(select(DonorProfile))).scalars().all())
    for profile in profiles:
        matched, _ = match_request(profile, item)
        if matched:
            if item.urgency != "routine" and not profile.notify_urgent_requests: continue
            db.add(Notification(user_id=profile.user_id, type="blood_request", title=f"{item.urgency.title()} compatible request", message=f"{item.hospital_name} needs {item.units} unit(s) of {item.blood_type}.", level="warning" if item.urgency != "routine" else "info", related_path="/donor/requests"))

@router.get("", response_model=list[BloodRequestRead])
async def list_blood_requests(mine: bool = Query(False), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[BloodRequestRead]:
    await expire_requests(db)
    stmt = select(BloodRequest)
    if current_user.role == "hospital":
        from app.api.deps import get_hospital_context
        context = await require_hospital_operator(await get_hospital_context(db, current_user))
        stmt = stmt.where(BloodRequest.hospital_profile_id == context.hospital.id)
    elif not current_user.is_superuser:
        stmt = stmt.where(BloodRequest.hospital_profile_id.in_(select(HospitalProfile.id).where(HospitalProfile.verification_status == "verified")))
    if mine and current_user.role != "hospital": stmt = stmt.where(BloodRequest.created_by_user_id == current_user.id)
    else: stmt = stmt.where(BloodRequest.status.in_(["published", "partially_fulfilled"]))
    rows = list((await db.execute(stmt.order_by(BloodRequest.created_at.desc()).limit(100))).scalars().all())
    return [await _read(db, item) for item in rows]

@router.get("/page", response_model=BloodRequestListPageRead)
async def list_blood_requests_page(mine: bool = Query(False), page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=50), status_filter: str | None = Query(None, alias="status"), search: str | None = None, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> BloodRequestListPageRead:
    await expire_requests(db)
    if current_user.role == "hospital":
        from app.api.deps import get_hospital_context
        context = await require_hospital_operator(await get_hospital_context(db, current_user))
        filters = [BloodRequest.hospital_profile_id == context.hospital.id]
    else:
        filters = [BloodRequest.status.in_(["published", "partially_fulfilled"]), BloodRequest.hospital_profile_id.in_(select(HospitalProfile.id).where(HospitalProfile.verification_status == "verified"))]
    if status_filter and status_filter != "all": filters.append(BloodRequest.status == status_filter)
    if search: filters.append(BloodRequest.hospital_name.ilike(f"%{search}%"))
    total = int((await db.execute(select(func.count(BloodRequest.id)).where(*filters))).scalar_one() or 0)
    rows = list((await db.execute(select(BloodRequest).where(*filters).order_by(BloodRequest.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all())
    return BloodRequestListPageRead(items=[await _read(db, item) for item in rows], page=page, page_size=page_size, total=total, total_pages=(total + page_size - 1) // page_size if total else 0)

@router.get("/{request_id}", response_model=BloodRequestRead)
async def get_blood_request(request_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> BloodRequestRead:
    item = (await db.execute(select(BloodRequest).where(BloodRequest.id == request_id).with_for_update())).scalar_one_or_none()
    if not item: raise HTTPException(status_code=404, detail="Blood request not found")
    if current_user.role == "hospital":
        from app.api.deps import get_hospital_context
        context = await require_hospital_operator(await get_hospital_context(db, current_user))
        if item.hospital_profile_id != context.hospital.id: raise HTTPException(status_code=404, detail="Blood request not found")
    if current_user.role == "donor":
        hospital = await db.get(HospitalProfile, item.hospital_profile_id)
        if not hospital or hospital.verification_status != "verified": raise HTTPException(404, "Blood request not found")
    if current_user.role == "donor" and item.status not in {"published", "partially_fulfilled"}: raise HTTPException(status_code=404, detail="Blood request not found")
    return await _read(db, item)

@router.post("", response_model=BloodRequestRead, status_code=status.HTTP_201_CREATED)
async def create_blood_request(payload: BloodRequestCreate, db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_operator)) -> BloodRequestRead:
    if payload.status == "published" and context.hospital.verification_status != "verified": raise HTTPException(status_code=403, detail="Hospital verification is required before publishing")
    if payload.status == "published" and (not payload.required_by or not payload.expires_at or payload.expires_at <= datetime.now(timezone.utc)):
        raise HTTPException(422, "Published requests require future required-by and expiration dates")
    if payload.latitude is None or payload.longitude is None:
        payload.latitude, payload.longitude = context.hospital.latitude, context.hospital.longitude
    repository = BloodRequestRepository(db)
    item = await repository.create(created_by_user_id=context.user.id, hospital_profile_id=context.hospital.id, hospital_name=context.hospital.hospital_name, hospital_verified=context.hospital.verification_status == "verified", **payload.model_dump())
    if item.status == "published": await _notify_compatible_donors(db, item)
    db.add(AuditLog(hospital_profile_id=context.hospital.id, actor_user_id=context.user.id, action=f"request.{item.status}", entity_type="blood_request", entity_id=item.id, details={"units": item.units, "blood_type": item.blood_type}))
    await db.commit(); await db.refresh(item); return await _read(db, item)

@router.put("/{request_id}", response_model=BloodRequestRead)
async def update_draft(request_id: str, payload: BloodRequestUpdate, db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_operator)) -> BloodRequestRead:
    item = (await db.execute(select(BloodRequest).where(BloodRequest.id == request_id).with_for_update())).scalar_one_or_none()
    if not item or item.hospital_profile_id != context.hospital.id: raise HTTPException(status_code=404, detail="Blood request not found")
    if item.status != "draft": raise HTTPException(status_code=409, detail="Only drafts can be edited")
    for field, value in payload.model_dump().items(): setattr(item, field, value)
    db.add(AuditLog(hospital_profile_id=context.hospital.id, actor_user_id=context.user.id, action="request.updated", entity_type="blood_request", entity_id=item.id))
    await db.commit(); await db.refresh(item); return await _read(db, item)

@router.post("/{request_id}/publish", response_model=BloodRequestRead)
async def publish_request(request_id: str, db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_operator)) -> BloodRequestRead:
    if context.hospital.verification_status != "verified": raise HTTPException(status_code=403, detail="Hospital verification is required before publishing")
    item = (await db.execute(select(BloodRequest).where(BloodRequest.id == request_id).with_for_update())).scalar_one_or_none()
    if not item or item.hospital_profile_id != context.hospital.id: raise HTTPException(status_code=404, detail="Blood request not found")
    if item.status != "draft": raise HTTPException(status_code=409, detail="Only drafts can be published")
    now = datetime.now(timezone.utc)
    if item.expires_at and item.expires_at <= now: raise HTTPException(status_code=422, detail="Expiration must be in the future")
    if not item.required_by or not item.expires_at: raise HTTPException(status_code=422, detail="Required-by and expiration times are required")
    item.status = "published"; item.hospital_verified = True; await _notify_compatible_donors(db, item)
    db.add(AuditLog(hospital_profile_id=context.hospital.id, actor_user_id=context.user.id, action="request.published", entity_type="blood_request", entity_id=item.id))
    await db.commit(); await db.refresh(item); return await _read(db, item)


@router.post("/{request_id}/transition", response_model=BloodRequestRead)
async def transition_request(request_id: str, payload: RequestTransition, db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_operator)):
    item = (await db.execute(select(BloodRequest).where(BloodRequest.id == request_id).with_for_update())).scalar_one_or_none()
    if not item or item.hospital_profile_id != context.hospital.id: raise HTTPException(404, "Request not found")
    if item.status not in {"published", "partially_fulfilled"}: raise HTTPException(409, "Only active requests can be changed")
    before = {"status": item.status, "urgency": item.urgency, "units_fulfilled": item.units_fulfilled}
    if payload.action == "prioritize":
        if not payload.urgency: raise HTTPException(422, "Choose an urgency")
        item.urgency = payload.urgency
    elif payload.action == "fulfill":
        if not payload.record_confirmed or not payload.confirmed_units: raise HTTPException(422, "Confirm the actual units received")
        if item.units_fulfilled + payload.confirmed_units > item.units: raise HTTPException(409, "Received units exceed the remaining request")
        item.units_fulfilled += payload.confirmed_units
        item.status = "fulfilled" if item.units_fulfilled == item.units else "partially_fulfilled"
    else:
        db.add(AuditLog(hospital_profile_id=context.hospital.id, actor_user_id=context.user.id, action="request.closed", entity_type="blood_request", entity_id=item.id, details={"reason": payload.reason}))
        return await cancel_request(request_id, db, context)
    db.add(AuditLog(hospital_profile_id=context.hospital.id, actor_user_id=context.user.id, action=f"request.{payload.action}", entity_type="blood_request", entity_id=item.id, details={"reason": payload.reason, "before": before, "units_received": payload.confirmed_units}))
    await db.commit(); await db.refresh(item)
    return await _read(db, item)

@router.post("/{request_id}/cancel", response_model=BloodRequestRead)
async def cancel_request(request_id: str, db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_operator)) -> BloodRequestRead:
    item = (await db.execute(select(BloodRequest).where(BloodRequest.id == request_id).with_for_update())).scalar_one_or_none()
    if not item or item.hospital_profile_id != context.hospital.id: raise HTTPException(status_code=404, detail="Blood request not found")
    if item.status in {"fulfilled", "cancelled", "expired"}: raise HTTPException(status_code=409, detail="Request cannot be cancelled")
    item.status = "cancelled"
    donor_ids = list((await db.execute(select(DonorResponse.donor_user_id).where(DonorResponse.blood_request_id == item.id, DonorResponse.status.in_(["invited", "pending", "accepted", "scheduled"])))).scalars().all())
    await db.execute(update(Appointment).where(Appointment.blood_request_id == item.id, Appointment.status.in_(["pending", "confirmed"])).values(status="cancelled"))
    await db.execute(update(DonorResponse).where(DonorResponse.blood_request_id == item.id, DonorResponse.status.in_(["invited", "pending", "accepted", "scheduled"])).values(status="cancelled"))
    for donor_id in donor_ids: db.add(Notification(user_id=donor_id, type="request_cancelled", title="Blood request cancelled", message=f"{item.hospital_name} cancelled the {item.blood_type} request.", level="warning", related_path="/donor/requests"))
    db.add(AuditLog(hospital_profile_id=context.hospital.id, actor_user_id=context.user.id, action="request.cancelled", entity_type="blood_request", entity_id=item.id))
    await db.commit(); await db.refresh(item); return await _read(db, item)
