from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from dataclasses import dataclass
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import InvalidTokenError, decode_token
from app.models import HospitalMembership, HospitalProfile, User
from app.repositories import UserRepository

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: str = Depends(oauth2_scheme),
) -> User:
    try:
        payload = decode_token(token, expected_type="access")
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(payload.sub)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    return user


async def require_superuser(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    return current_user


@dataclass
class HospitalContext:
    user: User
    hospital: HospitalProfile
    membership: HospitalMembership


async def get_hospital_context(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> HospitalContext:
    if current_user.role != "hospital":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hospital access only")
    result = await db.execute(
        select(HospitalMembership, HospitalProfile)
        .join(HospitalProfile, HospitalProfile.id == HospitalMembership.hospital_profile_id)
        .where(HospitalMembership.user_id == current_user.id, HospitalMembership.is_active.is_(True))
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No active hospital membership")
    membership, hospital = row
    return HospitalContext(user=current_user, hospital=hospital, membership=membership)


async def require_hospital_admin(context: HospitalContext = Depends(get_hospital_context)) -> HospitalContext:
    if context.membership.role != "hospital_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hospital administrator access required")
    return context


async def require_hospital_operator(context: HospitalContext = Depends(get_hospital_context)) -> HospitalContext:
    if context.hospital.verification_status != "verified":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Approved hospital verification required for operations")
    if context.membership.role not in {"hospital_admin", "blood_bank_manager", "hospital_staff"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hospital operations access required")
    return context


async def require_verified_hospital_admin(context: HospitalContext = Depends(require_hospital_admin)) -> HospitalContext:
    if context.hospital.verification_status != "verified":
        raise HTTPException(status_code=403, detail="Approved hospital verification required")
    return context
