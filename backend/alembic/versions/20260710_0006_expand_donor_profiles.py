"""expand donor profiles for onboarding and matching

Revision ID: 20260710_0006
Revises: 20260709_0005
"""
from alembic import op
import sqlalchemy as sa

revision = "20260710_0006"
down_revision = "20260709_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = [
        sa.Column("phone", sa.String(40)), sa.Column("date_of_birth", sa.Date()), sa.Column("gender", sa.String(40)),
        sa.Column("emergency_contact", sa.String(255)), sa.Column("preferred_radius_km", sa.Integer(), nullable=False, server_default="25"),
        sa.Column("address", sa.String(255)), sa.Column("region", sa.String(120)), sa.Column("country", sa.String(120), nullable=False, server_default="Ghana"),
        sa.Column("latitude", sa.Float()), sa.Column("longitude", sa.Float()), sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_eligible", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("last_donation_date", sa.Date()),
        sa.Column("notify_urgent_requests", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("notify_appointments", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("notify_eligibility", sa.Boolean(), nullable=False, server_default=sa.true()),
    ]
    for column in columns:
        op.add_column("donor_profiles", column)


def downgrade() -> None:
    for name in ["notify_eligibility", "notify_appointments", "notify_urgent_requests", "last_donation_date", "is_eligible", "is_available", "longitude", "latitude", "country", "region", "address", "preferred_radius_km", "emergency_contact", "gender", "date_of_birth", "phone"]:
        op.drop_column("donor_profiles", name)
