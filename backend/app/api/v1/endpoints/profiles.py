from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import HospitalContext, get_current_user, get_hospital_context, require_hospital_admin
from app.core.database import get_db
from app.models import User
from app.repositories import ProfileRepository
from datetime import timedelta

from app.schemas.profile import DonorAvailabilityUpdate, DonorLocationUpdate, DonorProfileRead, DonorProfileUpdate, HospitalProfileRead, HospitalProfileUpdate

router = APIRouter(prefix="/profiles", tags=["Profiles"])


def _donor_profile_read(profile, user: User) -> DonorProfileRead:
    completed = [profile.blood_type, profile.phone, profile.date_of_birth, profile.city, profile.address, profile.region, profile.country, profile.latitude, profile.longitude, profile.emergency_contact]
    completion = round(sum(value is not None and value != "" for value in completed) / len(completed) * 100)
    next_eligible = profile.last_donation_date + timedelta(days=56) if profile.last_donation_date else None
    return DonorProfileRead(
        **{column.name: getattr(profile, column.name) for column in profile.__table__.columns},
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

    current_user.full_name = payload.full_name
    for field, value in payload.model_dump(exclude={"full_name"}).items():
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
    for field, value in payload.model_dump().items(): setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return HospitalProfileRead(**{column.name: getattr(profile, column.name) for column in profile.__table__.columns}, member_role=context.membership.role)
