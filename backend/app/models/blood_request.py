from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class BloodRequest(Base):
    __tablename__ = "blood_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    created_by_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    hospital_profile_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("hospital_profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    hospital_name: Mapped[str] = mapped_column(String(255), nullable=False)
    blood_type: Mapped[str] = mapped_column(String(3), nullable=False, index=True)
    units: Mapped[int] = mapped_column(Integer, nullable=False)
    units_fulfilled: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    component: Mapped[str] = mapped_column(String(40), nullable=False, default="whole_blood", server_default="whole_blood")
    urgency: Mapped[str] = mapped_column(String(20), nullable=False, default="routine", server_default="routine", index=True)
    patient_category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    required_by: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    department: Mapped[str | None] = mapped_column(String(120), nullable=True)
    contact_person: Mapped[str | None] = mapped_column(String(160), nullable=True)
    appointment_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="matched", server_default="matched")
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    location: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open", server_default="open", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    hospital_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    created_by = relationship("User", back_populates="blood_requests")
