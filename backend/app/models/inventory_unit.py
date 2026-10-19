from datetime import datetime
from uuid import uuid4
from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, JSON, String, UniqueConstraint, func, event, DDL
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class InventoryUnit(Base):
    __tablename__ = "inventory_units"
    __table_args__ = (
        UniqueConstraint("hospital_profile_id", "official_identifier", "product_code", name="uq_inventory_official_product"),
        CheckConstraint("status IN ('quarantined','testing','available','reserved','used','expired','discarded')", name="inventory_unit_status"),
        CheckConstraint("status NOT IN ('available','reserved') OR (testing_status = 'passed' AND released_at IS NOT NULL AND expires_at IS NOT NULL)", name="inventory_release_required"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    hospital_profile_id: Mapped[str] = mapped_column(ForeignKey("hospital_profiles.id", ondelete="RESTRICT"), index=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("blood_inventory.id", ondelete="RESTRICT"), index=True)
    internal_identifier: Mapped[str] = mapped_column(String(40), unique=True, default=lambda: "FLU-" + uuid4().hex.upper())
    official_identifier: Mapped[str | None] = mapped_column(String(80))
    product_code: Mapped[str | None] = mapped_column(String(40))
    label_standard: Mapped[str | None] = mapped_column(String(20))
    blood_type: Mapped[str] = mapped_column(String(3), index=True)
    component: Mapped[str] = mapped_column(String(40), index=True)
    collected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(20), default="quarantined", index=True)
    testing_status: Mapped[str] = mapped_column(String(20), default="not_tested")
    storage_location: Mapped[str] = mapped_column(String(160))
    temperature_c: Mapped[float | None] = mapped_column(Float)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    released_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    reserved_request_id: Mapped[str | None] = mapped_column(ForeignKey("blood_requests.id", ondelete="SET NULL"), index=True)
    recall_active: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class InventoryComponentPolicy(Base):
    __tablename__ = "inventory_component_policies"
    __table_args__ = (UniqueConstraint("hospital_profile_id", "component", name="uq_inventory_component_policy"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    hospital_profile_id: Mapped[str] = mapped_column(ForeignKey("hospital_profiles.id", ondelete="CASCADE"), index=True)
    component: Mapped[str] = mapped_column(String(40))
    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    standard_reference: Mapped[str] = mapped_column(String(500), default="")
    max_shelf_life_hours: Mapped[int | None] = mapped_column(Integer)
    temperature_min_c: Mapped[float | None] = mapped_column(Float)
    temperature_max_c: Mapped[float | None] = mapped_column(Float)
    storage_requirements: Mapped[str] = mapped_column(String(1000), default="")
    expiry_warning_hours: Mapped[int] = mapped_column(Integer, default=168)
    version: Mapped[int] = mapped_column(Integer, default=0)


class InventoryStockPolicy(Base):
    __tablename__ = "inventory_stock_policies"
    __table_args__ = (UniqueConstraint("hospital_profile_id", "blood_type", "component", name="uq_inventory_stock_policy"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    hospital_profile_id: Mapped[str] = mapped_column(ForeignKey("hospital_profiles.id", ondelete="CASCADE"), index=True)
    blood_type: Mapped[str] = mapped_column(String(3))
    component: Mapped[str] = mapped_column(String(40))
    minimum: Mapped[int] = mapped_column(Integer, default=5)
    critical: Mapped[int] = mapped_column(Integer, default=0)


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    hospital_profile_id: Mapped[str] = mapped_column(ForeignKey("hospital_profiles.id", ondelete="RESTRICT"), index=True)
    unit_id: Mapped[str] = mapped_column(ForeignKey("inventory_units.id", ondelete="RESTRICT"), index=True)
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    action: Mapped[str] = mapped_column(String(40))
    details: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class InventoryAlertState(Base):
    __tablename__ = "inventory_alert_states"
    __table_args__ = (UniqueConstraint("hospital_profile_id", "key", name="uq_inventory_alert_state"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    hospital_profile_id: Mapped[str] = mapped_column(ForeignKey("hospital_profiles.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(150))
    state: Mapped[str] = mapped_column(String(100))


IMMUTABLE_SQL = """CREATE OR REPLACE FUNCTION fluid_inventory_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Inventory movement history is append-only'; END; $$"""
TRIGGER_SQL = """CREATE TRIGGER inventory_movement_immutable BEFORE UPDATE OR DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION fluid_inventory_immutable()"""
event.listen(InventoryMovement.__table__, "after_create", DDL(IMMUTABLE_SQL))
event.listen(InventoryMovement.__table__, "after_create", DDL(TRIGGER_SQL))
