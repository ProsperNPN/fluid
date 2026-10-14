from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from datetime import date

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class DonorProfile(Base):
    __tablename__ = "donor_profiles"
    __table_args__ = (UniqueConstraint("user_id", name="uq_donor_profiles_user_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    blood_type: Mapped[str] = mapped_column(String(3), nullable=False, default="O+", server_default="O+")
    blood_type_known: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    blood_type_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    city: Mapped[str] = mapped_column(String(120), nullable=False, default="Accra", server_default="Accra")
    availability: Mapped[str] = mapped_column(String(255), nullable=False, default="Not set", server_default="Not set")
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(40), nullable=True)
    emergency_contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    preferred_radius_km: Mapped[int] = mapped_column(Integer, nullable=False, default=25, server_default="25")
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    region: Mapped[str | None] = mapped_column(String(120), nullable=True)
    country: Mapped[str] = mapped_column(String(120), nullable=False, default="Ghana", server_default="Ghana")
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_eligible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    last_donation_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notify_urgent_requests: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    notify_appointments: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    notify_eligibility: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user = relationship("User")
