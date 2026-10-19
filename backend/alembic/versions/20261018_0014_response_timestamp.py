"""Distinguish actual donor responses from cancelled/expired invitations."""
from alembic import op
import sqlalchemy as sa

revision = "20261018_0014"
down_revision = "20261018_0013"
branch_labels = depends_on = None


def upgrade():
    op.add_column("donor_responses", sa.Column("responded_at", sa.DateTime(timezone=True)))
    # Legacy records do not retain the original reply time; use their last update.
    op.execute("UPDATE donor_responses SET responded_at = updated_at WHERE status IN ('pending', 'accepted', 'declined', 'rejected', 'scheduled', 'completed')")


def downgrade():
    op.drop_column("donor_responses", "responded_at")
