"""create hospital verification workflow

Revision ID: 20260717_0009
Revises: 20260711_0008
"""
from alembic import op
import sqlalchemy as sa

revision = "20260717_0009"
down_revision = "20260711_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("audit_logs", "hospital_profile_id", existing_type=sa.String(36), nullable=True)
    op.add_column("hospital_profiles", sa.Column("postal_code", sa.String(40), nullable=True))
    op.alter_column("hospital_profiles", "verification_status", type_=sa.String(40), existing_type=sa.String(20), server_default="incomplete")
    op.execute("UPDATE hospital_profiles SET verification_status='incomplete' WHERE verification_status='pending' AND verification_document_url IS NULL")
    op.create_table("hospital_verifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("hospital_profile_id", sa.String(36), sa.ForeignKey("hospital_profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(40), nullable=False, server_default="pending"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("reviewed_by_user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("hospital_message", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_hospital_verifications_hospital_profile_id", "hospital_verifications", ["hospital_profile_id"])
    op.create_index("ix_hospital_verifications_status", "hospital_verifications", ["status"])
    op.create_table("hospital_verification_documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("verification_id", sa.String(36), sa.ForeignKey("hospital_verifications.id", ondelete="CASCADE"), nullable=False),
        sa.Column("hospital_profile_id", sa.String(36), sa.ForeignKey("hospital_profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_type", sa.String(60), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("storage_key", sa.String(255), nullable=False, unique=True),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_hospital_verification_documents_verification_id", "hospital_verification_documents", ["verification_id"])
    op.create_index("ix_hospital_verification_documents_hospital_profile_id", "hospital_verification_documents", ["hospital_profile_id"])
    op.create_table("hospital_verification_reviews",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("verification_id", sa.String(36), sa.ForeignKey("hospital_verifications.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reviewer_user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("decision", sa.String(40), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_hospital_verification_reviews_verification_id", "hospital_verification_reviews", ["verification_id"])
    op.create_index("ix_hospital_verification_reviews_reviewer_user_id", "hospital_verification_reviews", ["reviewer_user_id"])


def downgrade() -> None:
    op.drop_table("hospital_verification_reviews")
    op.drop_table("hospital_verification_documents")
    op.drop_table("hospital_verifications")
    op.alter_column("hospital_profiles", "verification_status", type_=sa.String(20), existing_type=sa.String(40), server_default="pending")
    op.drop_column("hospital_profiles", "postal_code")
    op.alter_column("audit_logs", "hospital_profile_id", existing_type=sa.String(36), nullable=False)
