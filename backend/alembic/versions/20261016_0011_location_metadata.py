"""Explicit location provenance and confirmed facility coordinates."""
from alembic import op
import sqlalchemy as sa

revision = "20261016_0011"
down_revision = "20261014_0010"
branch_labels = None
depends_on = None


def upgrade():
    for table in ["donor_profiles", "hospital_profiles"]:
        op.add_column(table, sa.Column("location_updated_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column(table, sa.Column("location_confirmed_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column(table, sa.Column("location_source", sa.String(12), nullable=True))
        op.add_column(table, sa.Column("location_accuracy_m", sa.Float(), nullable=True))
        op.create_check_constraint(f"ck_{table}_latitude", table, "latitude IS NULL OR (latitude >= -90 AND latitude <= 90)")
        op.create_check_constraint(f"ck_{table}_longitude", table, "longitude IS NULL OR (longitude >= -180 AND longitude <= 180)")


def downgrade():
    for table in ["donor_profiles", "hospital_profiles"]:
        for axis in ["latitude", "longitude"]:
            op.drop_constraint(f"ck_{table}_{axis}", table, type_="check")
        for field in ["location_accuracy_m", "location_source", "location_confirmed_at", "location_updated_at"]:
            op.drop_column(table, field)
