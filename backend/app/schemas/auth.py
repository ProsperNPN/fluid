from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator
from app.schemas.location import LocationSelection


class TokenPayload(BaseModel):
    sub: str
    type: str
    exp: int
    iat: int
    jti: str | None = None


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    access_token_expires_at: datetime
    refresh_token_expires_at: datetime


class RegisterRequest(BaseModel):
    location: LocationSelection | None = None
    email: str
    password: str = Field(min_length=8)
    full_name: str | None = None
    role: Literal["donor", "hospital"] = "donor"

    @field_validator("password")
    @classmethod
    def validate_password_bcrypt_limit(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be 72 characters or fewer.")
        return value


class LoginRequest(BaseModel):
    email: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_token: str | None = None


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)

    @field_validator("new_password")
    @classmethod
    def validate_new_password_bcrypt_limit(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be 72 characters or fewer.")
        return value


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class MessageResponse(BaseModel):
    message: str
