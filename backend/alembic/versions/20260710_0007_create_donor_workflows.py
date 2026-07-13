"""create persisted donor workflows

Revision ID: 20260710_0007
Revises: 20260710_0006
"""
from alembic import op
import sqlalchemy as sa

revision = "20260710_0007"
down_revision = "20260710_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("blood_requests", sa.Column("notes", sa.Text()))
    op.add_column("blood_requests", sa.Column("latitude", sa.Float()))
    op.add_column("blood_requests", sa.Column("longitude", sa.Float()))
    op.add_column("blood_requests", sa.Column("expires_at", sa.DateTime(timezone=True)))
    op.add_column("blood_requests", sa.Column("hospital_verified", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_index(op.f("ix_blood_requests_expires_at"), "blood_requests", ["expires_at"])
    op.create_table("donor_responses", sa.Column("id", sa.String(36), primary_key=True), sa.Column("donor_user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("blood_request_id", sa.String(36), sa.ForeignKey("blood_requests.id", ondelete="CASCADE"), nullable=False), sa.Column("status", sa.String(20), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.UniqueConstraint("donor_user_id", "blood_request_id", name="uq_donor_request_response"))
    op.create_index("ix_donor_responses_donor_user_id", "donor_responses", ["donor_user_id"]); op.create_index("ix_donor_responses_blood_request_id", "donor_responses", ["blood_request_id"]); op.create_index("ix_donor_responses_status", "donor_responses", ["status"])
    op.create_table("appointments", sa.Column("id", sa.String(36), primary_key=True), sa.Column("donor_user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("hospital_user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("blood_request_id", sa.String(36), sa.ForeignKey("blood_requests.id", ondelete="CASCADE"), nullable=False), sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False), sa.Column("status", sa.String(20), nullable=False, server_default="pending"), sa.Column("location", sa.String(255), nullable=False), sa.Column("units", sa.Integer(), nullable=False, server_default="1"), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    for column in ["donor_user_id", "hospital_user_id", "blood_request_id", "scheduled_at", "status"]: op.create_index(f"ix_appointments_{column}", "appointments", [column])
    op.create_table("notifications", sa.Column("id", sa.String(36), primary_key=True), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("type", sa.String(40), nullable=False, server_default="general"), sa.Column("title", sa.String(160), nullable=False), sa.Column("message", sa.Text(), nullable=False), sa.Column("level", sa.String(20), nullable=False, server_default="info"), sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("related_path", sa.String(255)), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"]); op.create_index("ix_notifications_is_read", "notifications", ["is_read"])


def downgrade() -> None:
    op.drop_table("notifications"); op.drop_table("appointments"); op.drop_table("donor_responses")
    op.drop_index(op.f("ix_blood_requests_expires_at"), table_name="blood_requests")
    for name in ["hospital_verified", "expires_at", "longitude", "latitude", "notes"]: op.drop_column("blood_requests", name)
