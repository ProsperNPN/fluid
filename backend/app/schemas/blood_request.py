from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, model_validator

BloodType = Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
RequestStatus = Literal["draft", "published", "partially_fulfilled", "fulfilled", "cancelled", "expired"]
Urgency = Literal["routine", "urgent", "critical"]

class BloodRequestCreate(BaseModel):
    blood_type: BloodType
    component: str = Field(default="whole_blood", min_length=2, max_length=40)
    units: int = Field(ge=1, le=100)
    urgency: Urgency = "routine"
    patient_category: str | None = Field(default=None, max_length=80)
    required_by: datetime | None = None
    expires_at: datetime | None = None
    location: str = Field(min_length=2, max_length=255)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    department: str | None = Field(default=None, max_length=120)
    contact_person: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=2000)
    appointment_available: bool = True
    visibility: Literal["matched", "regional"] = "matched"
    status: Literal["draft", "published"] = "draft"

    @model_validator(mode="after")
    def validate_dates(self):
        if self.required_by and self.expires_at and self.expires_at > self.required_by: raise ValueError("Expiration must be on or before the required-by time")
        return self

class BloodRequestUpdate(BloodRequestCreate):
    status: Literal["draft"] = "draft"

class BloodRequestRead(BaseModel):
    id: str
    hospital_profile_id: str | None
    hospital_name: str
    hospital_verified: bool
    blood_type: BloodType
    component: str
    units: int
    units_fulfilled: int
    urgency: Urgency
    patient_category: str | None
    required_by: datetime | None
    expires_at: datetime | None
    location: str
    latitude: float | None
    longitude: float | None
    department: str | None
    contact_person: str | None
    notes: str | None
    appointment_available: bool
    visibility: str
    status: RequestStatus
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    donor_response_count: int = 0
    appointment_count: int = 0
    model_config = {"from_attributes": True}

class BloodRequestListPageRead(BaseModel):
    items: list[BloodRequestRead]
    page: int
    page_size: int
    total: int
    total_pages: int
