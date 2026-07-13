"""add role column to users

Revision ID: 20260708_0003
Revises: 20260707_0002
Create Date: 2026-07-08 00:00:00

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260708_0003"
down_revision = "20260707_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("role", sa.String(length=20), nullable=False, server_default=sa.text("'donor'")))
    op.create_index(op.f("ix_users_role"), "users", ["role"], unique=False)

    op.execute("UPDATE users SET role = 'admin' WHERE is_superuser = true")
    op.execute("UPDATE users SET role = 'donor' WHERE role IS NULL OR role NOT IN ('donor', 'hospital', 'admin')")


def downgrade() -> None:
    op.drop_index(op.f("ix_users_role"), table_name="users")
    op.drop_column("users", "role")
