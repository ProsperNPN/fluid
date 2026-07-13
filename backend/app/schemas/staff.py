from datetime import datetime
from typing import Literal
from pydantic import BaseModel

HospitalRole = Literal["hospital_admin", "blood_bank_manager", "hospital_staff", "viewer"]

class StaffInvite(BaseModel):
    email: str
    role: HospitalRole = "hospital_staff"

class StaffRoleUpdate(BaseModel):
    role: HospitalRole

class StaffRead(BaseModel):
    id: str
    user_id: str
    full_name: str | None
    email: str
    role: HospitalRole
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime

class StaffPageRead(BaseModel):
    items: list[StaffRead]
    total: int
