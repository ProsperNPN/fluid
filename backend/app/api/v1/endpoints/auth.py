from datetime import UTC, datetime, timedelta
from hashlib import sha256
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import InvalidTokenError, decode_token, get_password_hash, verify_password
from app.models import HospitalMembership, User
from app.repositories import PasswordResetTokenRepository, ProfileRepository, RefreshTokenRepository, UserRepository
from app.schemas import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LogoutRequest,
    MessageResponse,
    ResetPasswordRequest,
    RefreshTokenRequest,
    RegisterRequest,
    TokenPair,
    UserRead,
)
from app.services import AuthTokenService

router = APIRouter(prefix="/auth", tags=["Auth"])


def _hash_reset_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register_user(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> UserRead:
    user_repo = UserRepository(db)
    existing_user = await user_repo.get_by_email(payload.email.lower())
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = await user_repo.create(
        email=payload.email.lower(),
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        role=payload.role,
    )

    profile_repo = ProfileRepository(db)
    if payload.role == "hospital":
        hospital_profile = await profile_repo.create_hospital_profile(
            user_id=user.id,
            hospital_name=payload.full_name or payload.email,
        )
        db.add(HospitalMembership(hospital_profile_id=hospital_profile.id, user_id=user.id, role="hospital_admin"))
    else:
        await profile_repo.create_donor_profile(user_id=user.id)

    await db.commit()
    await db.refresh(user)
    return UserRead.model_validate(user)


@router.post("/login", response_model=TokenPair)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    user_repo = UserRepository(db)
    user = await user_repo.get_by_email(payload.email.lower())

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    token_service = AuthTokenService(db)
    tokens = await token_service.issue_token_pair(subject=user.id)
    await db.commit()
    return tokens


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)) -> ForgotPasswordResponse:
    user_repo = UserRepository(db)
    user = await user_repo.get_by_email(payload.email.lower())

    generic_message = "If an account exists for this email, a password reset link has been sent."
    if not user or not user.is_active:
        return ForgotPasswordResponse(message=generic_message)

    reset_repo = PasswordResetTokenRepository(db)
    await reset_repo.invalidate_all_for_user(user.id)

    raw_token = secrets.token_urlsafe(48)
    token_hash = _hash_reset_token(raw_token)
    expires_at = datetime.now(UTC) + timedelta(minutes=30)
    await reset_repo.create(user_id=user.id, token_hash=token_hash, expires_at=expires_at)
    await db.commit()

    return ForgotPasswordResponse(message=generic_message, reset_token=raw_token)


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)) -> MessageResponse:
    reset_repo = PasswordResetTokenRepository(db)
    token_hash = _hash_reset_token(payload.token)
    token_record = await reset_repo.get_active_by_hash(token_hash)

    if not token_record:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(token_record.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    user.hashed_password = get_password_hash(payload.new_password)

    await reset_repo.mark_used(token_record.id)
    refresh_repo = RefreshTokenRepository(db)
    await refresh_repo.revoke_all_for_user(user.id)

    await db.commit()
    return MessageResponse(message="Password reset successful. Please sign in with your new password.")


@router.post("/refresh", response_model=TokenPair)
async def refresh_tokens(payload: RefreshTokenRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    try:
        token_payload = decode_token(payload.refresh_token, expected_type="refresh")
    except InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc

    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(token_payload.sub)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    token_service = AuthTokenService(db)
    active = await token_service.is_refresh_token_active(token_payload, payload.refresh_token)
    if not active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked or expired")

    if token_payload.jti:
        await token_service.revoke_refresh_token(token_payload.jti)

    new_tokens = await token_service.issue_token_pair(subject=user.id)
    await db.commit()
    return new_tokens


@router.post("/logout", response_model=MessageResponse)
async def logout(
    payload: LogoutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    refresh_repo = RefreshTokenRepository(db)

    if payload.refresh_token:
        try:
            token_payload = decode_token(payload.refresh_token, expected_type="refresh")
        except InvalidTokenError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc

        if token_payload.sub != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Token does not belong to current user")

        if token_payload.jti:
            token_record = await refresh_repo.get_by_jti(token_payload.jti)
            if token_record and token_record.user_id == current_user.id:
                await refresh_repo.revoke_by_jti(token_payload.jti)
    else:
        await refresh_repo.revoke_all_for_user(current_user.id)

    await db.commit()
    return MessageResponse(message="Logged out successfully")
