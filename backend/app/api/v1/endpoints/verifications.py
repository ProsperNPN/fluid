from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import HospitalContext, get_current_user, require_hospital_admin, require_superuser
from app.core.config import settings
from app.core.database import get_db
from app.models import (AuditLog, HospitalProfile, HospitalVerification,
                        HospitalVerificationDocument, HospitalVerificationReview,
                        Notification, User)
from app.schemas.verification import (VerificationDecision, VerificationDocumentRead,
                                      VerificationPageRead, VerificationRead,
                                      VerificationReviewRead)
from app.services.email_service import send_email
from app.services.verification_storage import save_verification_file, verification_file_path

router = APIRouter(prefix="/hospital-verifications", tags=["Hospital Verifications"])
DOCUMENT_TYPES = {"registration_certificate", "operating_license", "blood_bank_license", "administrator_identification", "supporting_document"}


async def _read(db: AsyncSession, item: HospitalVerification, hospital: HospitalProfile | None = None) -> VerificationRead:
    hospital = hospital or await db.get(HospitalProfile, item.hospital_profile_id)
    documents = list((await db.execute(select(HospitalVerificationDocument).where(HospitalVerificationDocument.verification_id == item.id).order_by(HospitalVerificationDocument.created_at))).scalars())
    reviews = list((await db.execute(select(HospitalVerificationReview).where(HospitalVerificationReview.verification_id == item.id).order_by(HospitalVerificationReview.created_at))).scalars())
    return VerificationRead(
        id=item.id, hospital_profile_id=hospital.id, hospital_name=hospital.hospital_name,
        registration_number=hospital.registration_number, hospital_type=hospital.hospital_type,
        city=hospital.city, country=hospital.country, official_email=hospital.official_email,
        address=hospital.address, region=hospital.region, postal_code=hospital.postal_code,
        latitude=hospital.latitude, longitude=hospital.longitude, contact_phone=hospital.contact_phone,
        authorized_representative=hospital.authorized_representative, has_blood_bank=hospital.has_blood_bank,
        status=item.status, submitted_at=item.submitted_at, reviewed_at=item.reviewed_at,
        hospital_message=item.hospital_message,
        documents=[VerificationDocumentRead.model_validate(value) for value in documents],
        reviews=[VerificationReviewRead.model_validate(value) for value in reviews],
    )


@router.get("/mine", response_model=VerificationRead | None)
async def my_verification(db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_admin)):
    item = (await db.execute(select(HospitalVerification).where(HospitalVerification.hospital_profile_id == context.hospital.id).order_by(HospitalVerification.created_at.desc()).limit(1))).scalar_one_or_none()
    return await _read(db, item, context.hospital) if item else None


@router.post("/submit", response_model=VerificationRead, status_code=201)
async def submit_verification(
    document_types: list[str] = Form(...), files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db), context: HospitalContext = Depends(require_hospital_admin),
):
    if len(files) != len(document_types) or not files or len(files) > 10:
        raise HTTPException(status_code=422, detail="Provide one valid document type for each uploaded file")
    if any(value not in DOCUMENT_TYPES for value in document_types):
        raise HTTPException(status_code=422, detail="Unsupported verification document type")
    active = (await db.execute(select(HospitalVerification).where(HospitalVerification.hospital_profile_id == context.hospital.id, HospitalVerification.status == "pending"))).scalar_one_or_none()
    if active:
        raise HTTPException(status_code=409, detail="A verification submission is already pending")
    item = HospitalVerification(hospital_profile_id=context.hospital.id, status="pending")
    db.add(item); await db.flush()
    saved_paths: list[Path] = []
    try:
        for kind, upload in zip(document_types, files):
            key, content_type, size, digest = await save_verification_file(upload)
            saved_paths.append(verification_file_path(key))
            db.add(HospitalVerificationDocument(verification_id=item.id, hospital_profile_id=context.hospital.id, document_type=kind, original_filename=Path(upload.filename or "document").name[:255], storage_key=key, content_type=content_type, size_bytes=size, sha256=digest))
        context.hospital.verification_status = "pending"
        db.add(AuditLog(hospital_profile_id=context.hospital.id, actor_user_id=context.user.id, action="verification.submitted", entity_type="hospital_verification", entity_id=item.id, details={"document_count": len(files)}))
        await db.commit(); await db.refresh(item)
    except Exception:
        await db.rollback()
        for path in saved_paths:
            path.unlink(missing_ok=True)
        raise
    send_email(settings.ADMIN_VERIFICATION_EMAIL, f"Hospital verification: {context.hospital.hospital_name}", f"{context.hospital.hospital_name} submitted verification documents.\nRegistration: {context.hospital.registration_number or 'Not provided'}\nContact: {context.hospital.official_email or context.user.email}\nReview: {settings.FRONTEND_URL}/admin/hospital-verifications/{item.id}")
    return await _read(db, item, context.hospital)


@router.get("", response_model=VerificationPageRead)
async def list_verifications(status_filter: str | None = Query(None, alias="status"), search: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), db: AsyncSession = Depends(get_db), _: User = Depends(require_superuser)):
    filters = []
    if status_filter: filters.append(HospitalVerification.status == status_filter)
    if search:
        term = f"%{search.strip()}%"
        filters.append(or_(HospitalProfile.hospital_name.ilike(term), HospitalProfile.registration_number.ilike(term), HospitalProfile.city.ilike(term), HospitalProfile.official_email.ilike(term)))
    base = select(HospitalVerification, HospitalProfile).join(HospitalProfile, HospitalProfile.id == HospitalVerification.hospital_profile_id).where(*filters)
    total = int((await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one())
    rows = (await db.execute(base.order_by(HospitalVerification.submitted_at.desc()).offset((page - 1) * page_size).limit(page_size))).all()
    return VerificationPageRead(items=[await _read(db, item, hospital) for item, hospital in rows], page=page, page_size=page_size, total=total, total_pages=(total + page_size - 1) // page_size if total else 0)


@router.get("/{verification_id}", response_model=VerificationRead)
async def verification_detail(verification_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_superuser)):
    item = await db.get(HospitalVerification, verification_id)
    if not item: raise HTTPException(status_code=404, detail="Verification request not found")
    return await _read(db, item)


async def _authorized_document(db: AsyncSession, document_id: str, current_user: User) -> HospitalVerificationDocument:
    document = await db.get(HospitalVerificationDocument, document_id)
    if not document: raise HTTPException(status_code=404, detail="Document not found")
    if current_user.is_superuser: return document
    hospital_id = (await db.execute(select(HospitalProfile.id).where(HospitalProfile.user_id == current_user.id))).scalar_one_or_none()
    if hospital_id != document.hospital_profile_id: raise HTTPException(status_code=403, detail="Insufficient permissions")
    return document


@router.get("/documents/{document_id}")
async def get_document(document_id: str, download: bool = False, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    document = await _authorized_document(db, document_id, current_user)
    return FileResponse(verification_file_path(document.storage_key), media_type=document.content_type, filename=document.original_filename if download else None, content_disposition_type="attachment" if download else "inline")


@router.post("/{verification_id}/decision", response_model=VerificationRead)
async def decide_verification(verification_id: str, payload: VerificationDecision, db: AsyncSession = Depends(get_db), admin: User = Depends(require_superuser)):
    item = await db.get(HospitalVerification, verification_id)
    if not item: raise HTTPException(status_code=404, detail="Verification request not found")
    if payload.action in {"rejected", "more_information_required", "suspended"} and not (payload.notes or "").strip():
        raise HTTPException(status_code=422, detail="Review notes are required for this action")
    hospital = await db.get(HospitalProfile, item.hospital_profile_id)
    item.status = payload.action; item.reviewed_by_user_id = admin.id; item.reviewed_at = datetime.now(UTC); item.hospital_message = payload.notes
    hospital.verification_status = payload.action
    db.add(HospitalVerificationReview(verification_id=item.id, reviewer_user_id=admin.id, decision=payload.action, notes=payload.notes))
    db.add(AuditLog(hospital_profile_id=hospital.id, actor_user_id=admin.id, action=f"verification.{payload.action}", entity_type="hospital_verification", entity_id=item.id, details={"notes": payload.notes}))
    db.add(Notification(user_id=hospital.user_id, type="verification_update", title="Hospital verification updated", message=f"Your hospital verification status is now {payload.action.replace('_', ' ')}.", level="success" if payload.action == "verified" else "warning", related_path="/hospital/profile"))
    await db.commit(); await db.refresh(item)
    send_email(hospital.official_email, "FLUID hospital verification update", f"Decision: {payload.action.replace('_', ' ').title()}\nNotes: {payload.notes or 'No additional notes.'}\nNext steps: Sign in to review your hospital verification status.\n{settings.FRONTEND_URL}/hospital/profile")
    return await _read(db, item, hospital)
