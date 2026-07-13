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
    CORS_ORIGINS: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000"],
        validation_alias=AliasChoices("CORS_ORIGINS", "BACKEND_CORS_ORIGINS"),
    )


settings = Settings()
