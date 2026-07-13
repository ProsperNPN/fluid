from datetime import datetime
from pydantic import BaseModel

class DonorMatchRead(BaseModel):
    id: str
    donor: str
    blood_type: str
    response: str
    eta: str
    request_id: str | None = None
    donor_user_id: str | None = None
    compatibility: str | None = None
    availability: str | None = None
    approximate_location: str | None = None
    distance_km: float | None = None
    last_donation_date: str | None = None
    eligibility_status: str | None = None
    response_status: str | None = None
    responded_at: str | None = None

class DonorMatchPageRead(BaseModel):
    items: list[DonorMatchRead]
    page: int
    page_size: int
    total: int
    total_pages: int

class CompatibleRequestRead(BaseModel):
    id: str
    hospital_name: str
    hospital_verified: bool
    blood_type: str
    units: int
    location: str
    status: str
    notes: str | None
    distance_km: float | None
    created_at: datetime
    expires_at: datetime | None
    response_status: str | None

class CompatibleRequestPageRead(BaseModel):
    items: list[CompatibleRequestRead]
    page: int
    page_size: int
    total: int
    total_pages: int
