"""Explicit opt-in for referral matching; never infer medical clearance."""
from alembic import op
import sqlalchemy as sa

revision = "20261017_0012"
down_revision = "20261016_0011"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("donor_profiles", sa.Column("matching_opt_in", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.add_column("donor_responses", sa.Column("invited_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE donor_responses SET invited_at = created_at WHERE status = 'invited'")

def downgrade():
    op.drop_column("donor_responses", "invited_at")
    op.drop_column("donor_profiles", "matching_opt_in")
