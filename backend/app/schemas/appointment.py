from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

AppointmentStatus = Literal["pending", "confirmed", "completed", "cancelled", "missed"]
class AppointmentRead(BaseModel):
    id: str
    blood_request_id: str
    hospital_name: str
    donor_name: str
    blood_type: str
    scheduled_at: datetime
    status: AppointmentStatus
    location: str
    units: int
    department: str | None
    contact_person: str | None
    internal_notes: str | None
class AppointmentSchedule(BaseModel):
    scheduled_at: datetime
    department: str | None = Field(default=None, max_length=120)
    contact_person: str | None = Field(default=None, max_length=160)
    internal_notes: str | None = Field(default=None, max_length=1000)
class AppointmentStatusUpdate(BaseModel):
    screening_confirmed: bool = False
    status: Literal["confirmed", "completed", "cancelled", "missed"]
    internal_notes: str | None = Field(default=None, max_length=1000)
class AppointmentPageRead(BaseModel):
    items: list[AppointmentRead]
    page: int
    page_size: int
    total: int
    total_pages: int
