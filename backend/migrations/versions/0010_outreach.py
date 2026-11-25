"""outreach_contacts: letters to companies; users.ref: the referral code an account came with

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-25 15:00:00.000000

Must work on SQLite (development) and Postgres (production).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | Sequence[str] | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "outreach_contacts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company", sa.String(length=200), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("note", sa.String(length=300), nullable=True),
        sa.Column("ref", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="new", nullable=False),
        sa.Column("queued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("message_id", sa.String(length=250), nullable=True),
        sa.Column("error", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_outreach_contacts")),
        sa.UniqueConstraint("email", name=op.f("uq_outreach_contacts_email")),
        sa.UniqueConstraint("ref", name=op.f("uq_outreach_contacts_ref")),
    )
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("ref", sa.String(length=40), nullable=True))
        batch_op.create_index(batch_op.f("ix_users_ref"), ["ref"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_users_ref"))
        batch_op.drop_column("ref")
    op.drop_table("outreach_contacts")
