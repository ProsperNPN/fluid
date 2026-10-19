from pathlib import Path

from pydantic import AliasChoices, Field, model_validator
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
    ALERT_EMAIL_ENABLED: bool = False
    ALERT_SMS_ENABLED: bool = False
    TWILIO_ACCOUNT_SID: str | None = None
    TWILIO_AUTH_TOKEN: str | None = None
    TWILIO_FROM_NUMBER: str | None = None
    ALERT_ESCALATION_WAIT_SECONDS: int = Field(default=300, ge=0, le=86400)
    ALERT_RETRY_LIMIT: int = Field(default=4, ge=1, le=10)

    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM_EMAIL: str | None = None
    INVENTORY_EXPIRY_WARNING_DAYS: int = Field(default=7, ge=1, le=90)
    GEOCODING_ENABLED: bool = True
    GEOCODING_BASE_URL: str = "https://photon.komoot.io"
    GEOCODING_USER_AGENT: str = "FLUID/0.1 location lookup"
    GEOCODING_MIN_INTERVAL_SECONDS: float = Field(default=1.0, ge=0.5, le=10)
    DONATION_POLICY_APPROVED: bool = False
    DONATION_INTERVAL_DAYS: int = Field(default=112, ge=1, le=730)
    DONOR_MIN_AGE: int = Field(default=18, ge=16, le=100)
    DONOR_MAX_AGE: int = Field(default=65, ge=18, le=100)
    CORS_ORIGINS: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000"],
        validation_alias=AliasChoices("CORS_ORIGINS", "BACKEND_CORS_ORIGINS"),
    )

    @model_validator(mode="after")
    def validate_deployed_security(self):
        if self.ENVIRONMENT.lower() in {"production", "staging"}:
            if self.JWT_SECRET_KEY == "change-me-super-secret-key" or len(self.JWT_SECRET_KEY.encode("utf-8")) < 32:
                raise ValueError("Deployed environments require a unique JWT secret of at least 32 bytes")
            if self.DEBUG:
                raise ValueError("APP_DEBUG must be disabled in deployed environments")
            if "*" in self.CORS_ORIGINS:
                raise ValueError("Deployed environments require explicit CORS origins")
        return self


settings = Settings()
