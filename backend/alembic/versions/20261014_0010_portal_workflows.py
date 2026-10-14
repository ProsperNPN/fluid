"""Add private conversation history and explicit donor/stock metadata."""
from alembic import op
import sqlalchemy as sa

revision = "20261014_0010"
down_revision = "20260717_0009"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("donor_profiles", sa.Column("blood_type_known", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("donor_profiles", sa.Column("blood_type_verified", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("appointments", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("blood_inventory", sa.Column("collection_date", sa.Date(), nullable=True))
    op.create_table("conversations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("donor_user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("hospital_profile_id", sa.String(36), sa.ForeignKey("hospital_profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("blood_request_id", sa.String(36), sa.ForeignKey("blood_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("donor_read_at", sa.DateTime(timezone=True)),
        sa.Column("hospital_read_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("donor_user_id", "blood_request_id", name="uq_conversation_donor_request"))
    for field in ["donor_user_id", "hospital_profile_id", "blood_request_id"]:
        op.create_index(f"ix_conversations_{field}", "conversations", [field])
    op.create_table("messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("conversation_id", sa.String(36), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    for field in ["conversation_id", "sender_user_id", "created_at"]:
        op.create_index(f"ix_messages_{field}", "messages", [field])
    op.create_unique_constraint("uq_appointment_donor_request", "appointments", ["donor_user_id", "blood_request_id"])


def downgrade():
    op.drop_constraint("uq_appointment_donor_request", "appointments", type_="unique")
    op.drop_table("messages")
    op.drop_table("conversations")
    op.drop_column("appointments", "completed_at")
    op.drop_column("blood_inventory", "collection_date")
    op.drop_column("donor_profiles", "blood_type_verified")
    op.drop_column("donor_profiles", "blood_type_known")
