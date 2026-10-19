from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, Field, model_validator
from app.schemas.profile import BloodType

class InventoryCreate(BaseModel):
    blood_type: BloodType
    component: Literal["whole_blood", "red_cells", "platelets", "plasma"] = "whole_blood"
    units_available: int = Field(ge=0, le=10000)
    collection_date: date | None = None
    expiration_date: date
    storage_location: str = Field(min_length=2, max_length=160)
    minimum_threshold: int = Field(default=5, ge=0, le=1000)

    @model_validator(mode="after")
    def dates(self):
        if self.collection_date and self.collection_date > date.today(): raise ValueError("Collection date cannot be in the future")
        if self.expiration_date and self.collection_date and self.expiration_date < self.collection_date: raise ValueError("Expiration cannot precede collection")
        return self

class InventoryAdjust(BaseModel):
    action: Literal["add", "remove", "reserve", "release", "use", "expire", "donation_intake"]
    units: int = Field(ge=1, le=10000)
    request_id: str | None = None
    clinical_authorization: bool = False
    compatibility_verified: bool = False
    reason: str | None = Field(default=None, max_length=500)

class InventoryRead(BaseModel):
    physical_units: int = 0
    quarantined_units: int = 0
    id: str
    blood_type: BloodType
    component: str
    units_available: int
    units_reserved: int
    collection_date: date | None = None
    expiration_date: date | None
    storage_location: str
    minimum_threshold: int
    alert_level: Literal["normal", "low", "critical", "expired", "expiring_soon", "unknown"]
    updated_at: datetime

class InventoryPageRead(BaseModel):
    items: list[InventoryRead]
    total: int
