from pydantic import BaseModel


class DonorAppointmentRead(BaseModel):
    id: str
    title: str
    date: str
    location: str


class DonationHistoryRead(BaseModel):
    id: str
    hospital: str
    date: str
    blood_type: str
    status: str


class HospitalDonorResponseRead(BaseModel):
    donor: str
    blood_type: str
    response: str
    eta: str


class PendingHospitalRead(BaseModel):
    name: str
    city: str
    submitted: str


class PlatformActivityRead(BaseModel):
    event: str
    actor: str
    time: str


class DonorPortalDataRead(BaseModel):
    donation_history: list[DonationHistoryRead]
    appointments: list[DonorAppointmentRead]


class HospitalPortalDataRead(BaseModel):
    donor_responses: list[HospitalDonorResponseRead]
    appointments: list[DonorAppointmentRead]


class AdminPortalDataRead(BaseModel):
    pending_hospitals: list[PendingHospitalRead]
    platform_activity: list[PlatformActivityRead]
