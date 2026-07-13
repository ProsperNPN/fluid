from typing import Literal

from pydantic import BaseModel


class DashboardMetric(BaseModel):
    label: str
    value: str


class DashboardSummaryRead(BaseModel):
    role: Literal["admin", "hospital", "donor"]
    metrics: list[DashboardMetric]
    total_requests: int
    open_requests: int
    urgent_requests: int
    filled_requests: int
    total_hospitals: int
    total_users: int
