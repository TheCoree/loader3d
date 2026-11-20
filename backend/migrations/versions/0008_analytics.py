"""analytics_visits, analytics_events: visit statistics of the public pages

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-19 18:00:00.000000

Must work on SQLite (development) and Postgres (production).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | Sequence[str] | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "analytics_visits",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("visitor", sa.String(length=32), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("landing_path", sa.String(length=200), nullable=False),
        sa.Column("referrer_host", sa.String(length=200), nullable=True),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("search_engine", sa.String(length=40), nullable=True),
        sa.Column("utm_source", sa.String(length=200), nullable=True),
        sa.Column("utm_medium", sa.String(length=200), nullable=True),
        sa.Column("utm_campaign", sa.String(length=200), nullable=True),
        sa.Column("utm_term", sa.String(length=200), nullable=True),
        sa.Column("utm_content", sa.String(length=200), nullable=True),
        sa.Column("device", sa.String(length=20), nullable=False),
        sa.Column("browser", sa.String(length=40), nullable=False),
        sa.Column("os", sa.String(length=40), nullable=False),
        sa.Column("screen_width", sa.Integer(), nullable=True),
        sa.Column("language", sa.String(length=35), nullable=True),
        sa.Column("pageviews", sa.Integer(), server_default="0", nullable=False),
        sa.Column("engaged_ms", sa.Integer(), server_default="0", nullable=False),
        sa.Column("signed_up", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_analytics_visits")),
    )
    with op.batch_alter_table("analytics_visits", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_analytics_visits_started_at"), ["started_at"], unique=False)

    op.create_table(
        "analytics_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("visit_id", sa.Uuid(), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("value", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["visit_id"],
            ["analytics_visits.id"],
            name=op.f("fk_analytics_events_visit_id_analytics_visits"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_analytics_events")),
    )
    with op.batch_alter_table("analytics_events", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_analytics_events_visit_id"), ["visit_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("analytics_events", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_analytics_events_visit_id"))
    op.drop_table("analytics_events")
    with op.batch_alter_table("analytics_visits", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_analytics_visits_started_at"))
    op.drop_table("analytics_visits")
