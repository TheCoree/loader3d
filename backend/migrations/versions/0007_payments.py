"""payments: online payment of tiers; users: the last «тариф заканчивается» letter

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-19 12:00:00.000000

Must work on SQLite (development) and Postgres (production).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("tier_reminder_for", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "payments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("tier", sa.String(length=20), nullable=False),
        sa.Column("period", sa.String(length=10), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("provider_payment_id", sa.String(length=100), nullable=True),
        sa.Column("payment_url", sa.String(length=2000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_until", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_payments_user_id_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payments")),
    )
    with op.batch_alter_table("payments", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_payments_created_at"), ["created_at"], unique=False)
        batch_op.create_index(
            batch_op.f("ix_payments_provider_payment_id"), ["provider_payment_id"], unique=False
        )
        batch_op.create_index(batch_op.f("ix_payments_user_id"), ["user_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("payments", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_payments_user_id"))
        batch_op.drop_index(batch_op.f("ix_payments_provider_payment_id"))
        batch_op.drop_index(batch_op.f("ix_payments_created_at"))
    op.drop_table("payments")

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("tier_reminder_for")
