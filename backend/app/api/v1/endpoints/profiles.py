from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import HospitalContext, get_current_user, get_hospital_context, require_hospital_admin
from app.core.database import get_db
from app.models import User
from app.repositories import ProfileRepository
from datetime import date
from sqlalchemy import select, func
from app.models import Appointment
from app.core.config import settings
from app.services.blood_matching import is_donor_eligible, next_eligible_date

from app.schemas.profile import DonorAvailabilityUpdate, DonorLocationUpdate, DonorProfileRead, DonorProfileUpdate, HospitalProfileRead, HospitalProfileUpdate

router = APIRouter(prefix="/profiles", tags=["Profiles"])


def _donor_profile_read(profile, user: User) -> DonorProfileRead:
    completed = [profile.blood_type if profile.blood_type_known else None, profile.phone, profile.date_of_birth, profile.city, profile.address, profile.region, profile.country, profile.latitude, profile.longitude, profile.emergency_contact]
    completion = round(sum(value is not None and value != "" for value in completed) / len(completed) * 100)
    next_eligible = next_eligible_date(profile)
    return DonorProfileRead(
        **{column.name: getattr(profile, column.name) for column in profile.__table__.columns if column.name != "is_eligible"},
        is_eligible=is_donor_eligible(profile), policy_approved=settings.DONATION_POLICY_APPROVED,
        full_name=user.full_name,
        email=user.email,
        next_eligible_date=next_eligible,
        profile_completion=completion,
    )


@router.get("/donor/me", response_model=DonorProfileRead)
async def get_my_donor_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DonorProfileRead:
    if current_user.role != "donor" and not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Donor profile access only")

    repository = ProfileRepository(db)
    profile = await repository.get_donor_profile(current_user.id)
    if not profile:
        profile = await repository.create_donor_profile(user_id=current_user.id)
        await db.commit()
        await db.refresh(profile)

    return _donor_profile_read(profile, current_user)


@router.put("/donor/me", response_model=DonorProfileRead)
async def update_my_donor_profile(
    payload: DonorProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DonorProfileRead:
    if current_user.role != "donor" and not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Donor profile access only")

    repository = ProfileRepository(db)
    profile = await repository.get_donor_profile(current_user.id)
    if not profile:
        profile = await repository.create_donor_profile(user_id=current_user.id)

    if payload.date_of_birth and payload.date_of_birth >= date.today():
        raise HTTPException(status_code=422, detail="Date of birth must be in the past")
    if payload.last_donation_date and payload.last_donation_date > date.today():
        raise HTTPException(status_code=422, detail="Last donation date cannot be in the future")
    recorded = (await db.execute(select(func.max(Appointment.completed_at)).where(Appointment.donor_user_id == current_user.id, Appointment.status == "completed"))).scalar_one_or_none()
    if recorded and (not payload.last_donation_date or payload.last_donation_date < recorded.date()):
        raise HTTPException(status_code=409, detail="A hospital-recorded donation date cannot be removed or moved earlier")
    if profile.blood_type != payload.blood_type or not payload.blood_type_known:
        profile.blood_type_verified = False
    current_user.full_name = payload.full_name
    for field, value in payload.model_dump(exclude={"full_name", "is_eligible"}).items():
        setattr(profile, field, value)
    profile.availability = "Available to donate" if payload.is_available else "Temporarily unavailable"

    await db.commit()
    await db.refresh(profile)
    return _donor_profile_read(profile, current_user)


@router.patch("/donor/me/availability", response_model=DonorProfileRead)
async def update_my_donor_availability(payload: DonorAvailabilityUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> DonorProfileRead:
    if current_user.role != "donor" and not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Donor profile access only")
    repository = ProfileRepository(db)
    profile = await repository.get_donor_profile(current_user.id) or await repository.create_donor_profile(user_id=current_user.id)
    profile.is_available = payload.is_available
    profile.availability = "Available to donate" if payload.is_available else "Temporarily unavailable"
    await db.commit()
    await db.refresh(profile)
    return _donor_profile_read(profile, current_user)


@router.patch("/donor/me/location", response_model=DonorProfileRead)
async def update_my_donor_location(payload: DonorLocationUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> DonorProfileRead:
    if current_user.role != "donor" and not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Donor profile access only")
    repository = ProfileRepository(db)
    profile = await repository.get_donor_profile(current_user.id) or await repository.create_donor_profile(user_id=current_user.id)
    for field, value in payload.model_dump().items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return _donor_profile_read(profile, current_user)


@router.get("/hospital/me", response_model=HospitalProfileRead)
async def get_my_hospital_profile(
    context: HospitalContext = Depends(get_hospital_context),
) -> HospitalProfileRead:
    return HospitalProfileRead(**{column.name: getattr(context.hospital, column.name) for column in context.hospital.__table__.columns}, member_role=context.membership.role)


@router.put("/hospital/me", response_model=HospitalProfileRead)
async def update_my_hospital_profile(
    payload: HospitalProfileUpdate,
    db: AsyncSession = Depends(get_db),
    context: HospitalContext = Depends(require_hospital_admin),
) -> HospitalProfileRead:
    profile = context.hospital
    identity_changed = any(getattr(profile, field) != getattr(payload, field) for field in ["hospital_name", "registration_number", "address", "city", "country"])
    for field, value in payload.model_dump().items(): setattr(profile, field, value)
    if identity_changed and profile.verification_status == "verified": profile.verification_status = "more_information_required"

    await db.commit()
    await db.refresh(profile)
    return HospitalProfileRead(**{column.name: getattr(profile, column.name) for column in profile.__table__.columns}, member_role=context.membership.role)
