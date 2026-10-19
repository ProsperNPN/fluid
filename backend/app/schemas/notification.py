from datetime import datetime
from typing import Literal
from pydantic import BaseModel

class NotificationRead(BaseModel):
    id: str
    type: str
    title: str
    message: str
    level: Literal["info", "warning", "success"]
    is_read: bool
    related_path: str | None
    payload: dict | None = None
    created_at: datetime
    model_config = {"from_attributes": True}

class NotificationPageRead(BaseModel):
    items: list[NotificationRead]
    unread_count: int
    total: int = 0
    page: int = 1
    total_pages: int = 0
