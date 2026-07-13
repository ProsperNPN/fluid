from pydantic import BaseModel


class AnalyticsOverviewRead(BaseModel):
    scope: str
    total_requests: int
    open_requests: int
    urgent_requests: int
    filled_requests: int
    fill_rate_percent: float
    urgent_rate_percent: float
    most_requested_blood_type: str | None
