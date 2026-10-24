"""Recipient deduplication ledger and distinct notification evidence timestamps."""
from alembic import op
import sqlalchemy as sa
revision = "20261019_0017"
down_revision = "20261018_0016"
branch_labels = depends_on = None


def upgrade():
    for name in ("sync_emitted_at", "received_at", "read_at"):
        op.add_column("notifications", sa.Column(name, sa.DateTime(timezone=True), nullable=True))
    op.create_table("request_notification_receipts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("blood_request_id", sa.String(36), sa.ForeignKey("blood_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("notification_id", sa.String(36), sa.ForeignKey("notifications.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("blood_request_id", "user_id", name="uq_request_notification_recipient"))
    op.create_index("ix_request_notification_receipts_blood_request_id", "request_notification_receipts", ["blood_request_id"])
    op.create_index("ix_request_notification_receipts_user_id", "request_notification_receipts", ["user_id"])

    # Retain deduplication for routine cards created before this migration.
    op.execute("""
        INSERT INTO request_notification_receipts (id, blood_request_id, user_id, notification_id)
        SELECT DISTINCT ON (r.id, n.user_id) md5(r.id || ':' || n.user_id), r.id, n.user_id, n.id
        FROM notifications n JOIN blood_requests r ON
            r.id = COALESCE(n.payload->>'request_id', substring(n.related_path from '[?]request=([^&]+)'))
        WHERE r.urgency = 'routine' AND n.type = 'blood_request'
        ORDER BY r.id, n.user_id, n.created_at, n.id
    """)


def downgrade():
    op.drop_table("request_notification_receipts")
    for name in ("sync_emitted_at", "received_at", "read_at"):
        op.drop_column("notifications", name)
