"""create donor and hospital profiles tables

Revision ID: 20260708_0004
Revises: 20260708_0003
Create Date: 2026-07-08 00:30:00

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260708_0004"
down_revision = "20260708_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "donor_profiles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("blood_type", sa.String(length=3), server_default=sa.text("'O+'"), nullable=False),
        sa.Column("city", sa.String(length=120), server_default=sa.text("'Accra'"), nullable=False),
        sa.Column("availability", sa.String(length=255), server_default=sa.text("'Not set'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_donor_profiles_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_donor_profiles")),
        sa.UniqueConstraint("user_id", name=op.f("uq_donor_profiles_user_id")),
    )
    op.create_index(op.f("ix_donor_profiles_user_id"), "donor_profiles", ["user_id"], unique=True)

    op.create_table(
        "hospital_profiles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("hospital_name", sa.String(length=255), nullable=False),
        sa.Column("city", sa.String(length=120), server_default=sa.text("'Accra'"), nullable=False),
        sa.Column("address", sa.String(length=255), server_default=sa.text("'Not set'"), nullable=False),
        sa.Column("contact_phone", sa.String(length=40), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_hospital_profiles_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_hospital_profiles")),
        sa.UniqueConstraint("user_id", name=op.f("uq_hospital_profiles_user_id")),
    )
    op.create_index(op.f("ix_hospital_profiles_user_id"), "hospital_profiles", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_hospital_profiles_user_id"), table_name="hospital_profiles")
    op.drop_table("hospital_profiles")

    op.drop_index(op.f("ix_donor_profiles_user_id"), table_name="donor_profiles")
    op.drop_table("donor_profiles")
