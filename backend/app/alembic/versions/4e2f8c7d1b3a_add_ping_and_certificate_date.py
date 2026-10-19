"""Add ping checks and certificate expiration dates.

Revision ID: 4e2f8c7d1b3a
Revises: 8d3b6c2a9f1e
"""

from alembic import op
import sqlalchemy as sa


revision = "4e2f8c7d1b3a"
down_revision = "8d3b6c2a9f1e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE checkmethod ADD VALUE IF NOT EXISTS 'ping'")
    op.create_table(
        "service_agent",
        sa.Column("service_id", sa.UUID(), nullable=False),
        sa.Column("agent_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["service_id"], ["monitored_service.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agent_id"], ["monitoring_agent.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("service_id", "agent_id"),
    )
    op.execute(
        "INSERT INTO service_agent (service_id, agent_id) "
        "SELECT id, agent_id FROM monitored_service WHERE agent_id IS NOT NULL"
    )
    op.add_column(
        "check_report",
        sa.Column("certificate_expires_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("check_report", "certificate_expires_at")
    op.drop_table("service_agent")
