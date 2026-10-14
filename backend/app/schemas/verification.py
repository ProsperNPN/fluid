from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

VerificationStatus = Literal["incomplete", "pending", "more_information_required", "verified", "rejected", "suspended"]


class VerificationDocumentRead(BaseModel):
    id: str
    document_type: str
    original_filename: str
    content_type: str
    size_bytes: int
    sha256: str
    created_at: datetime
    model_config = {"from_attributes": True}


class VerificationReviewRead(BaseModel):
    id: str
    decision: str
    notes: str | None
    reviewer_user_id: str
    created_at: datetime
    model_config = {"from_attributes": True}


class VerificationRead(BaseModel):
    id: str
    hospital_profile_id: str
    hospital_name: str
    registration_number: str | None
    hospital_type: str | None
    city: str
    country: str
    official_email: str | None
    address: str
    region: str | None
    postal_code: str | None
    latitude: float | None
    longitude: float | None
    contact_phone: str | None
    authorized_representative: str | None
    has_blood_bank: bool
    status: VerificationStatus
    submitted_at: datetime
    reviewed_at: datetime | None
    hospital_message: str | None
    documents: list[VerificationDocumentRead]
    reviews: list[VerificationReviewRead]


class VerificationPageRead(BaseModel):
    items: list[VerificationRead]
    page: int
    page_size: int
    total: int
    total_pages: int


class VerificationDecision(BaseModel):
    action: Literal["verified", "rejected", "more_information_required", "suspended"]
    notes: str | None = Field(default=None, max_length=4000)
