"""create hospital operations domain

Revision ID: 20260711_0008
Revises: 20260710_0007
"""
from alembic import op
import sqlalchemy as sa

revision = "20260711_0008"
down_revision = "20260710_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for column in [
        sa.Column("registration_number", sa.String(120), nullable=True),
        sa.Column("hospital_type", sa.String(80), nullable=True),
        sa.Column("ownership_type", sa.String(30), nullable=True),
        sa.Column("region", sa.String(120), nullable=True),
        sa.Column("country", sa.String(120), nullable=False, server_default="Ghana"),
        sa.Column("latitude", sa.Float(), nullable=True), sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("official_email", sa.String(255), nullable=True), sa.Column("website", sa.String(255), nullable=True),
        sa.Column("emergency_contact", sa.String(255), nullable=True),
        sa.Column("has_blood_bank", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("operating_hours", sa.String(255), nullable=True),
        sa.Column("authorized_representative", sa.String(255), nullable=True),
        sa.Column("verification_document_url", sa.Text(), nullable=True),
        sa.Column("verification_status", sa.String(20), nullable=False, server_default="pending"),
    ]: op.add_column("hospital_profiles", column)
    op.create_unique_constraint("uq_hospital_profiles_registration_number", "hospital_profiles", ["registration_number"])
    op.create_index("ix_hospital_profiles_verification_status", "hospital_profiles", ["verification_status"])
    op.execute("UPDATE hospital_profiles SET verification_status = 'verified'")

    op.create_table("hospital_memberships",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("hospital_profile_id", sa.String(36), sa.ForeignKey("hospital_profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(30), nullable=False, server_default="hospital_admin"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("hospital_profile_id", "user_id", name="uq_hospital_member"),
    )
    op.create_index("ix_hospital_memberships_hospital_profile_id", "hospital_memberships", ["hospital_profile_id"])
    op.create_index("ix_hospital_memberships_user_id", "hospital_memberships", ["user_id"])
    op.execute("INSERT INTO hospital_memberships (id, hospital_profile_id, user_id, role, is_active) SELECT gen_random_uuid()::text, id, user_id, 'hospital_admin', true FROM hospital_profiles")

    op.add_column("blood_requests", sa.Column("hospital_profile_id", sa.String(36), nullable=True))
    op.create_foreign_key("fk_blood_requests_hospital_profile_id_hospital_profiles", "blood_requests", "hospital_profiles", ["hospital_profile_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_blood_requests_hospital_profile_id", "blood_requests", ["hospital_profile_id"])
    op.execute("UPDATE blood_requests br SET hospital_profile_id = hp.id FROM hospital_profiles hp WHERE hp.user_id = br.created_by_user_id")
    for column in [
        sa.Column("units_fulfilled", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("component", sa.String(40), nullable=False, server_default="whole_blood"),
        sa.Column("urgency", sa.String(20), nullable=False, server_default="routine"),
        sa.Column("patient_category", sa.String(80), nullable=True),
        sa.Column("required_by", sa.DateTime(timezone=True), nullable=True),
        sa.Column("department", sa.String(120), nullable=True),
        sa.Column("contact_person", sa.String(160), nullable=True),
        sa.Column("appointment_available", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("visibility", sa.String(20), nullable=False, server_default="matched"),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
    ]: op.add_column("blood_requests", column)
    op.create_index("ix_blood_requests_urgency", "blood_requests", ["urgency"])
    op.execute("UPDATE blood_requests SET urgency = CASE WHEN status = 'urgent' THEN 'urgent' ELSE 'routine' END, status = CASE WHEN status IN ('open','urgent') THEN 'published' WHEN status = 'filled' THEN 'fulfilled' ELSE status END")

    for column in [sa.Column("department", sa.String(120)), sa.Column("contact_person", sa.String(160)), sa.Column("internal_notes", sa.String(1000))]: op.add_column("appointments", column)

    op.create_table("blood_inventory",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("hospital_profile_id", sa.String(36), sa.ForeignKey("hospital_profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("blood_type", sa.String(3), nullable=False), sa.Column("component", sa.String(40), nullable=False, server_default="whole_blood"),
        sa.Column("units_available", sa.Integer(), nullable=False, server_default="0"), sa.Column("units_reserved", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expiration_date", sa.Date(), nullable=True), sa.Column("storage_location", sa.String(160), nullable=False),
        sa.Column("minimum_threshold", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("units_available >= 0", name="ck_inventory_available_nonnegative"), sa.CheckConstraint("units_reserved >= 0", name="ck_inventory_reserved_nonnegative"), sa.CheckConstraint("units_reserved <= units_available", name="ck_inventory_reserved_lte_available"),
        sa.UniqueConstraint("hospital_profile_id", "blood_type", "component", "expiration_date", "storage_location", name="uq_inventory_batch"),
    )
    for column in ["hospital_profile_id", "blood_type", "expiration_date"]: op.create_index(f"ix_blood_inventory_{column}", "blood_inventory", [column])
    op.create_table("audit_logs",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("hospital_profile_id", sa.String(36), sa.ForeignKey("hospital_profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False), sa.Column("action", sa.String(80), nullable=False),
        sa.Column("entity_type", sa.String(60), nullable=False), sa.Column("entity_id", sa.String(36), nullable=True), sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    for column in ["hospital_profile_id", "actor_user_id", "action", "created_at"]: op.create_index(f"ix_audit_logs_{column}", "audit_logs", [column])


def downgrade() -> None:
    op.drop_table("audit_logs"); op.drop_table("blood_inventory")
    for name in ["internal_notes", "contact_person", "department"]: op.drop_column("appointments", name)
    for name in ["is_archived", "visibility", "appointment_available", "contact_person", "department", "required_by", "patient_category", "urgency", "component", "units_fulfilled"]: op.drop_column("blood_requests", name)
    op.drop_index("ix_blood_requests_hospital_profile_id", table_name="blood_requests"); op.drop_constraint("fk_blood_requests_hospital_profile_id_hospital_profiles", "blood_requests", type_="foreignkey"); op.drop_column("blood_requests", "hospital_profile_id")
    op.drop_table("hospital_memberships")
    op.drop_index("ix_hospital_profiles_verification_status", table_name="hospital_profiles"); op.drop_constraint("uq_hospital_profiles_registration_number", "hospital_profiles", type_="unique")
    for name in ["verification_status", "verification_document_url", "authorized_representative", "operating_hours", "has_blood_bank", "emergency_contact", "website", "official_email", "longitude", "latitude", "country", "region", "ownership_type", "hospital_type", "registration_number"]: op.drop_column("hospital_profiles", name)
