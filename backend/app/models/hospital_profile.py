from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class HospitalProfile(Base):
    __tablename__ = "hospital_profiles"
    __table_args__ = (UniqueConstraint("user_id", name="uq_hospital_profiles_user_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    hospital_name: Mapped[str] = mapped_column(String(255), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False, default="Accra", server_default="Accra")
    address: Mapped[str] = mapped_column(String(255), nullable=False, default="Not set", server_default="Not set")
    contact_phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    registration_number: Mapped[str | None] = mapped_column(String(120), nullable=True, unique=True)
    hospital_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    ownership_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    region: Mapped[str | None] = mapped_column(String(120), nullable=True)
    country: Mapped[str] = mapped_column(String(120), nullable=False, default="Ghana", server_default="Ghana")
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    official_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    emergency_contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    has_blood_bank: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    operating_hours: Mapped[str | None] = mapped_column(String(255), nullable=True)
    authorized_representative: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verification_document_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user = relationship("User")
