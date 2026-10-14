from typing import Literal
from pydantic import BaseModel, Field

class RequestTransition(BaseModel):
    model_config = {"str_strip_whitespace": True}
    action: Literal["prioritize", "fulfill", "close"]
    urgency: Literal["routine", "urgent", "critical"] | None = None
    confirmed_units: int | None = Field(default=None, ge=1, le=100)
    reason: str = Field(min_length=5, max_length=500)
    record_confirmed: bool = False
