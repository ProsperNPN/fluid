from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class UserRead(BaseModel):
    id: str
    email: str
    full_name: str | None
    role: Literal["donor", "hospital", "admin"]
    is_active: bool
    is_superuser: bool
    created_at: datetime

    model_config = {"from_attributes": True}
