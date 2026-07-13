"""create blood requests table

Revision ID: 20260707_0002
Revises: 20260707_0001
Create Date: 2026-07-07 00:15:00

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260707_0002"
down_revision = "20260707_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "blood_requests",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_by_user_id", sa.String(length=36), nullable=False),
        sa.Column("hospital_name", sa.String(length=255), nullable=False),
        sa.Column("blood_type", sa.String(length=3), nullable=False),
        sa.Column("units", sa.Integer(), nullable=False),
        sa.Column("location", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), server_default=sa.text("'open'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name=op.f("fk_blood_requests_created_by_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_blood_requests")),
    )
    op.create_index(op.f("ix_blood_requests_blood_type"), "blood_requests", ["blood_type"], unique=False)
    op.create_index(op.f("ix_blood_requests_created_by_user_id"), "blood_requests", ["created_by_user_id"], unique=False)
    op.create_index(op.f("ix_blood_requests_status"), "blood_requests", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_blood_requests_status"), table_name="blood_requests")
    op.drop_index(op.f("ix_blood_requests_created_by_user_id"), table_name="blood_requests")
    op.drop_index(op.f("ix_blood_requests_blood_type"), table_name="blood_requests")
    op.drop_table("blood_requests")
