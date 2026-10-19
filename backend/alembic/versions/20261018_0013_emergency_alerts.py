"""Durable emergency alerts and provider delivery outbox."""
from alembic import op
import sqlalchemy as sa

revision = "20261018_0013"
down_revision = "20261017_0012"
branch_labels = depends_on = None


def upgrade():
    op.add_column("notifications", sa.Column("payload", sa.JSON(), nullable=True))
    op.add_column("notifications", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.add_column("blood_requests", sa.Column("alert_radius_km", sa.Integer(), nullable=False, server_default="10"))
    op.add_column("blood_requests", sa.Column("alert_escalated_at", sa.DateTime(timezone=True)))
    for name in ("notify_email_alerts", "notify_sms_alerts"):
        op.add_column("donor_profiles", sa.Column(name, sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table("emergency_alerts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("blood_request_id", sa.String(36), sa.ForeignKey("blood_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("donor_user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("notification_id", sa.String(36), sa.ForeignKey("notifications.id", ondelete="SET NULL")),
        sa.Column("radius_km", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("blood_request_id", "donor_user_id", name="uq_emergency_recipient"))
    op.create_index("ix_emergency_alerts_blood_request_id", "emergency_alerts", ["blood_request_id"])
    op.create_index("ix_emergency_alerts_donor_user_id", "emergency_alerts", ["donor_user_id"])
    op.create_table("alert_deliveries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("alert_id", sa.String(36), sa.ForeignKey("emergency_alerts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channel", sa.String(10), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("provider_id", sa.String(100)),
        sa.Column("error_code", sa.String(80)),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("alert_id", "channel", name="uq_alert_channel"))
    op.create_index("ix_alert_deliveries_alert_id", "alert_deliveries", ["alert_id"])
    op.create_index("ix_alert_deliveries_status", "alert_deliveries", ["status"])


def downgrade():
    op.drop_table("alert_deliveries")
    op.drop_table("emergency_alerts")
    for name in ("notify_email_alerts", "notify_sms_alerts"):
        op.drop_column("donor_profiles", name)
    op.drop_column("blood_requests", "alert_escalated_at")
    op.drop_column("blood_requests", "alert_radius_km")
    op.drop_column("notifications", "updated_at")
    op.drop_column("notifications", "payload")
