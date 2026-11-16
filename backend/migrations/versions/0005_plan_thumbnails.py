"""plans: preview pictures for the home page

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-15 20:00:00.000000

The picture lives in its own table so the plan list never loads it; `plans.thumbnail_at` tells the
client whether there is one and versions its URL. Must work on SQLite (development) and Postgres.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("plans", schema=None) as batch_op:
        batch_op.add_column(sa.Column("thumbnail_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "plan_thumbnails",
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("media_type", sa.String(length=20), nullable=False),
        sa.Column("image", sa.LargeBinary(), nullable=False),
        sa.ForeignKeyConstraint(
            ["plan_id"], ["plans.id"], name=op.f("fk_plan_thumbnails_plan_id_plans"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("plan_id", name=op.f("pk_plan_thumbnails")),
    )


def downgrade() -> None:
    op.drop_table("plan_thumbnails")
    with op.batch_alter_table("plans", schema=None) as batch_op:
        batch_op.drop_column("thumbnail_at")
