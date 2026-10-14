from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

BloodType = Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]


class DonorProfileRead(BaseModel):
    blood_type_verified: bool = False
    policy_approved: bool = False
    id: str
    user_id: str
    blood_type: BloodType
    blood_type_known: bool = False
    city: str
    availability: str
    full_name: str | None = None
    email: str
    phone: str | None
    date_of_birth: date | None
    gender: str | None
    emergency_contact: str | None
    preferred_radius_km: int
    address: str | None
    region: str | None
    country: str
    latitude: float | None
    longitude: float | None
    is_available: bool
    is_eligible: bool
    last_donation_date: date | None
    next_eligible_date: date | None
    notify_urgent_requests: bool
    notify_appointments: bool
    notify_eligibility: bool
    profile_completion: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DonorProfileUpdate(BaseModel):
    model_config = {"str_strip_whitespace": True}
    blood_type: BloodType
    blood_type_known: bool = False
    city: str = Field(min_length=2, max_length=120)
    full_name: str = Field(min_length=2, max_length=255)
    phone: str | None = Field(default=None, max_length=40)
    date_of_birth: date | None = None
    gender: str | None = Field(default=None, max_length=40)
    emergency_contact: str | None = Field(default=None, max_length=255)
    preferred_radius_km: int = Field(default=25, ge=1, le=500)
    address: str | None = Field(default=None, max_length=255)
    region: str | None = Field(default=None, max_length=120)
    country: str = Field(default="Ghana", min_length=2, max_length=120)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    is_available: bool = False
    is_eligible: bool = True
    last_donation_date: date | None = None
    notify_urgent_requests: bool = True
    notify_appointments: bool = True
    notify_eligibility: bool = True


class DonorAvailabilityUpdate(BaseModel):
    is_available: bool


class DonorLocationUpdate(BaseModel):
    city: str = Field(min_length=2, max_length=120)
    address: str | None = Field(default=None, max_length=255)
    region: str | None = Field(default=None, max_length=120)
    country: str = Field(default="Ghana", min_length=2, max_length=120)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class HospitalProfileRead(BaseModel):
    id: str
    user_id: str
    hospital_name: str
    city: str
    address: str
    contact_phone: str | None
    registration_number: str | None
    hospital_type: str | None
    ownership_type: str | None
    region: str | None
    country: str
    postal_code: str | None
    latitude: float | None
    longitude: float | None
    official_email: str | None
    website: str | None
    emergency_contact: str | None
    has_blood_bank: bool
    operating_hours: str | None
    authorized_representative: str | None
    verification_document_url: str | None
    verification_status: Literal["incomplete", "pending", "more_information_required", "verified", "rejected", "suspended"]
    member_role: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class HospitalProfileUpdate(BaseModel):
    model_config = {"str_strip_whitespace": True}
    hospital_name: str = Field(min_length=2, max_length=255)
    city: str = Field(min_length=2, max_length=120)
    address: str = Field(min_length=2, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=40)
    registration_number: str | None = Field(default=None, max_length=120)
    hospital_type: str | None = Field(default=None, max_length=80)
    ownership_type: Literal["public", "private", "nonprofit"] | None = None
    region: str | None = Field(default=None, max_length=120)
    country: str = Field(default="Ghana", min_length=2, max_length=120)
    postal_code: str | None = Field(default=None, max_length=40)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    official_email: str | None = Field(default=None, max_length=255)
    website: str | None = Field(default=None, max_length=255)
    emergency_contact: str | None = Field(default=None, max_length=255)
    has_blood_bank: bool = False
    operating_hours: str | None = Field(default=None, max_length=255)
    authorized_representative: str | None = Field(default=None, max_length=255)
    verification_document_url: str | None = None
