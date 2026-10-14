from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    ENVIRONMENT: str = "development"
    DEBUG: bool = Field(default=False, validation_alias="APP_DEBUG")
    APP_NAME: str = "FLUID API"
    APP_VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    JWT_SECRET_KEY: str = "change-me-super-secret-key"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14
    SECURITY_HEADERS_ENABLED: bool = True
    MAX_AUTH_HEADER_LENGTH: int = 4096
    DATABASE_URL: str = "postgresql+asyncpg://fluid_user:change-me@localhost:5432/fluid_db"
    FRONTEND_URL: str = "http://localhost:3000"
    VERIFICATION_UPLOAD_DIR: Path = BASE_DIR / "backend" / "private_uploads" / "hospital_verifications"
    VERIFICATION_MAX_FILE_BYTES: int = 10 * 1024 * 1024
    ADMIN_VERIFICATION_EMAIL: str | None = None
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM_EMAIL: str | None = None
    INVENTORY_EXPIRY_WARNING_DAYS: int = Field(default=7, ge=1, le=90)
    DONATION_POLICY_APPROVED: bool = False
    DONATION_INTERVAL_DAYS: int = Field(default=112, ge=1, le=730)
    DONOR_MIN_AGE: int = Field(default=18, ge=16, le=100)
    DONOR_MAX_AGE: int = Field(default=65, ge=18, le=100)
    CORS_ORIGINS: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000"],
        validation_alias=AliasChoices("CORS_ORIGINS", "BACKEND_CORS_ORIGINS"),
    )


settings = Settings()
