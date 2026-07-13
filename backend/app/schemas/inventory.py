from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, Field
from app.schemas.profile import BloodType

class InventoryCreate(BaseModel):
    blood_type: BloodType
    component: str = Field(default="whole_blood", min_length=2, max_length=40)
    units_available: int = Field(ge=0, le=10000)
    expiration_date: date | None = None
    storage_location: str = Field(min_length=2, max_length=160)
    minimum_threshold: int = Field(default=5, ge=0, le=1000)

class InventoryAdjust(BaseModel):
    action: Literal["add", "remove", "reserve", "release", "use", "expire", "donation_intake"]
    units: int = Field(ge=1, le=10000)
    reason: str | None = Field(default=None, max_length=500)

class InventoryRead(BaseModel):
    id: str
    blood_type: BloodType
    component: str
    units_available: int
    units_reserved: int
    expiration_date: date | None
    storage_location: str
    minimum_threshold: int
    alert_level: Literal["normal", "low", "critical", "expired", "expiring_soon"]
    updated_at: datetime

class InventoryPageRead(BaseModel):
    items: list[InventoryRead]
    total: int
