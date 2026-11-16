"""users: email verification by code

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-15 18:00:00.000000

Accounts made before verification existed count as verified (from their creation), so nobody is
locked out of their plans. Must work on SQLite (development) and Postgres (production).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("verify_code_hash", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("verify_code_expires_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("verify_code_sent_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("verify_attempts", sa.Integer(), server_default="0", nullable=False))
    op.execute("UPDATE users SET email_verified_at = created_at")


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("verify_attempts")
        batch_op.drop_column("verify_code_sent_at")
        batch_op.drop_column("verify_code_expires_at")
        batch_op.drop_column("verify_code_hash")
        batch_op.drop_column("email_verified_at")
