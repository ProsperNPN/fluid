from __future__ import annotations
from datetime import datetime
from uuid import uuid4
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class Appointment(Base):
    __tablename__ = "appointments"
    __table_args__ = (UniqueConstraint("donor_user_id", "blood_request_id", name="uq_appointment_donor_request"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    donor_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    hospital_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    blood_request_id: Mapped[str] = mapped_column(String(36), ForeignKey("blood_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending", index=True)
    location: Mapped[str] = mapped_column(String(255), nullable=False)
    units: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    department: Mapped[str | None] = mapped_column(String(120), nullable=True)
    contact_person: Mapped[str | None] = mapped_column(String(160), nullable=True)
    internal_notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    is_scheduled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    timezone: Mapped[str] = mapped_column(String(80), default="Africa/Accra", server_default="Africa/Accra")
    preparation_instructions: Mapped[str] = mapped_column(String(2000), default="", server_default="")
    proposed_by: Mapped[str | None] = mapped_column(String(10))
    donor_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    hospital_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str | None] = mapped_column(String(500))
    outcome_confirmed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL", name="fk_appointment_outcome_actor"))
    version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    schedule_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
