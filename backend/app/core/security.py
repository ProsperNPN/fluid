from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings
from app.schemas import TokenPair, TokenPayload

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class InvalidTokenError(Exception):
    pass


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def _build_expiry(delta: timedelta) -> tuple[datetime, int]:
    expires_at = datetime.now(UTC) + delta
    return expires_at, int(expires_at.timestamp())


def create_access_token(subject: str, additional_claims: dict[str, Any] | None = None) -> tuple[str, datetime]:
    now = datetime.now(UTC)
    expires_at, exp_ts = _build_expiry(timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))

    payload: dict[str, Any] = {
        "sub": subject,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": exp_ts,
    }
    if additional_claims:
        payload.update(additional_claims)

    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, expires_at


def create_refresh_token(subject: str) -> tuple[str, datetime, str]:
    now = datetime.now(UTC)
    expires_at, exp_ts = _build_expiry(timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))
    jti = str(uuid4())

    payload: dict[str, Any] = {
        "sub": subject,
        "type": "refresh",
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": exp_ts,
    }

    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, expires_at, jti


def decode_token(token: str, expected_type: str | None = None) -> TokenPayload:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        token_payload = TokenPayload.model_validate(payload)
    except (JWTError, ValueError) as exc:
        raise InvalidTokenError("Invalid token") from exc

    if expected_type and token_payload.type != expected_type:
        raise InvalidTokenError("Unexpected token type")

    return token_payload


def create_token_pair(subject: str, additional_claims: dict[str, Any] | None = None) -> TokenPair:
    access_token, access_expires_at = create_access_token(subject, additional_claims=additional_claims)
    refresh_token, refresh_expires_at, _ = create_refresh_token(subject)

    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        access_token_expires_at=access_expires_at,
        refresh_token_expires_at=refresh_expires_at,
    )
