from __future__ import annotations
from datetime import date, datetime
from uuid import uuid4
from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class BloodInventory(Base):
    __tablename__ = "blood_inventory"
    __table_args__ = (
        CheckConstraint("units_available >= 0", name="ck_inventory_available_nonnegative"),
        CheckConstraint("units_reserved >= 0", name="ck_inventory_reserved_nonnegative"),
        CheckConstraint("units_reserved <= units_available", name="ck_inventory_reserved_lte_available"),
        UniqueConstraint("hospital_profile_id", "blood_type", "component", "expiration_date", "storage_location", name="uq_inventory_batch"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    hospital_profile_id: Mapped[str] = mapped_column(String(36), ForeignKey("hospital_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    blood_type: Mapped[str] = mapped_column(String(3), nullable=False, index=True)
    component: Mapped[str] = mapped_column(String(40), nullable=False, default="whole_blood", server_default="whole_blood")
    units_available: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    units_reserved: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    expiration_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    collection_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    storage_location: Mapped[str] = mapped_column(String(160), nullable=False)
    minimum_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=5, server_default="5")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
