"""user_messages: messages of the team to a user, shown in the app, with what the user did with them

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-25 22:00:00.000000

Must work on SQLite (development) and Postgres (production).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | Sequence[str] | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("body", sa.String(length=2000), nullable=False),
        sa.Column("button", sa.String(length=40), nullable=False),
        sa.Column("gift_days", sa.Integer(), nullable=True),
        sa.Column("ask_reply", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("action", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("shown_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("outcome", sa.String(length=20), nullable=True),
        sa.Column("reply", sa.String(length=2000), nullable=True),
        sa.Column("gift_until", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], name=op.f("fk_user_messages_author_id_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_user_messages_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_messages")),
    )
    with op.batch_alter_table("user_messages", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_user_messages_user_id"), ["user_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("user_messages", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_user_messages_user_id"))
    op.drop_table("user_messages")
