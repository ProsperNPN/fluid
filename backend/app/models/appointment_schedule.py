"""Availability, database-enforced occupancy, history, and reminder ledger."""
from datetime import datetime
from uuid import uuid4
from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class AppointmentPolicy(Base):
    __tablename__ = "appointment_policies"
    hospital_profile_id: Mapped[str] = mapped_column(ForeignKey("hospital_profiles.id", ondelete="CASCADE"), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    timezone: Mapped[str] = mapped_column(String(80), default="Africa/Accra")
    slot_minutes: Mapped[int] = mapped_column(Integer, default=30)
    capacity: Mapped[int] = mapped_column(Integer, default=1)
    hours: Mapped[list] = mapped_column(JSON, default=list)
    reminder_hours: Mapped[list] = mapped_column(JSON, default=lambda: [24, 2])
    preparation_instructions: Mapped[str] = mapped_column(String(2000), default="")


class AppointmentOccupancy(Base):
    __tablename__ = "appointment_occupancy"
    __table_args__ = (
        UniqueConstraint("donor_user_id", "minute", name="uq_appointment_donor_minute"),
        UniqueConstraint("hospital_profile_id", "minute", "seat", name="uq_appointment_hospital_minute_seat"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    appointment_id: Mapped[str] = mapped_column(ForeignKey("appointments.id", ondelete="CASCADE"), index=True)
    donor_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    hospital_profile_id: Mapped[str] = mapped_column(ForeignKey("hospital_profiles.id", ondelete="CASCADE"), index=True)
    minute: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    seat: Mapped[int] = mapped_column(Integer)


class AppointmentEvent(Base):
    __tablename__ = "appointment_events"
    __table_args__ = (UniqueConstraint("appointment_id", "version", name="uq_appointment_event_version"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    appointment_id: Mapped[str] = mapped_column(ForeignKey("appointments.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(40))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AppointmentReminder(Base):
    __tablename__ = "appointment_reminders"
    __table_args__ = (UniqueConstraint("appointment_id", "schedule_version", "hours_before", name="uq_appointment_reminder"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    appointment_id: Mapped[str] = mapped_column(ForeignKey("appointments.id", ondelete="CASCADE"), index=True)
    schedule_version: Mapped[int] = mapped_column(Integer)
    hours_before: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
