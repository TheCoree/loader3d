"""users: deleting the account with a code from email

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-20 23:00:00.000000

Must work on SQLite (development) and Postgres (production).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | Sequence[str] | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("delete_code_hash", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("delete_code_expires_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("delete_code_sent_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("delete_attempts", sa.Integer(), server_default="0", nullable=False))


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("delete_attempts")
        batch_op.drop_column("delete_code_sent_at")
        batch_op.drop_column("delete_code_expires_at")
        batch_op.drop_column("delete_code_hash")
