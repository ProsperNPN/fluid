from datetime import datetime, time
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from pydantic import BaseModel, Field, field_validator, model_validator

AppointmentStatus = Literal['pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show', 'missed']

class OpeningHours(BaseModel):
    weekday: int = Field(ge=0, le=6)
    start: str = Field(pattern=r'^\d{2}:\d{2}$')
    end: str = Field(pattern=r'^\d{2}:\d{2}$')

    @model_validator(mode='after')
    def valid_interval(self):
        if time.fromisoformat(self.start) >= time.fromisoformat(self.end):
            raise ValueError('Opening time must precede closing time; split overnight hours across days')
        return self

class AppointmentPreferences(BaseModel):
    timezone: str = 'Africa/Accra'
    hours: list[OpeningHours] = Field(default_factory=list, max_length=21)

    @field_validator('timezone')
    @classmethod
    def valid_zone(cls, value):
        try: ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError): raise ValueError('Use a valid IANA time zone, such as Africa/Accra')
        return value

    @model_validator(mode='after')
    def no_overlap(self):
        for day in range(7):
            ranges = sorted((h.start, h.end) for h in self.hours if h.weekday == day)
            if any(a[1] > b[0] for a, b in zip(ranges, ranges[1:])):
                raise ValueError('Operating hours cannot overlap')
        return self

class AppointmentPolicyUpdate(AppointmentPreferences):
    enabled: bool = True
    slot_minutes: Literal[15, 30, 45, 60, 90, 120] = 30
    capacity: int = Field(default=1, ge=1, le=20)
    reminder_hours: list[int] = Field(default_factory=lambda: [24, 2], max_length=4)
    preparation_instructions: str = Field(default='', max_length=2000)

    @model_validator(mode="after")
    def hours_required(self):
        if self.enabled and not self.hours: raise ValueError("Add operating hours before enabling appointment bookings")
        return self

    @field_validator('reminder_hours')
    @classmethod
    def valid_reminders(cls, value):
        if len(set(value)) != len(value) or any(h < 1 or h > 168 for h in value):
            raise ValueError('Use distinct reminder hours between 1 and 168')
        return sorted(value, reverse=True)

class AppointmentRead(BaseModel):
    id: str
    blood_request_id: str
    hospital_name: str
    donor_name: str
    blood_type: str
    component: str
    hospital_latitude: float | None = None
    hospital_longitude: float | None = None
    scheduled_at: datetime
    ends_at: datetime | None
    is_scheduled: bool
    timezone: str
    proposed_by: str | None
    donor_confirmed_at: datetime | None
    hospital_confirmed_at: datetime | None
    checked_in_at: datetime | None
    completed_at: datetime | None
    preparation_instructions: str
    cancellation_reason: str | None
    version: int
    status: AppointmentStatus
    location: str
    units: int
    department: str | None
    contact_person: str | None
    internal_notes: str | None

class AppointmentSchedule(BaseModel):
    scheduled_at: datetime
    expected_version: int | None = Field(default=None, ge=0)
    preparation_instructions: str | None = Field(default=None, max_length=2000)
    department: str | None = Field(default=None, max_length=120)
    contact_person: str | None = Field(default=None, max_length=160)
    internal_notes: str | None = Field(default=None, max_length=1000)

class AppointmentCreate(AppointmentSchedule):
    blood_request_id: str
    donor_user_id: str

class AppointmentStatusUpdate(BaseModel):
    status: Literal['confirmed', 'checked_in', 'completed', 'cancelled', 'no_show', 'missed']
    expected_version: int | None = Field(default=None, ge=0)
    screening_confirmed: bool = False
    procedure_confirmed: bool = False
    actual_units: int | None = Field(default=None, ge=1, le=100)
    reason: str | None = Field(default=None, max_length=500)
    internal_notes: str | None = Field(default=None, max_length=1000)

class AppointmentPageRead(BaseModel):
    items: list[AppointmentRead]
    page: int
    page_size: int
    total: int
    total_pages: int
