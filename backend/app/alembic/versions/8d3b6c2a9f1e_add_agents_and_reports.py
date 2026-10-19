"""Add monitoring agents and check reports.

Revision ID: 8d3b6c2a9f1e
Revises: 6c4f1f0d7a2b
Create Date: 2026-10-19 00:00:00.000000
"""

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "8d3b6c2a9f1e"
down_revision = "6c4f1f0d7a2b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    http_method_type = postgresql.ENUM(
        "GET", "POST", "HEAD", name="httpmethod", create_type=False
    )
    check_status_type = postgresql.ENUM(
        "up", "down", "error", name="checkstatus", create_type=False
    )
    # Enum-типы PostgreSQL нужно создать до ALTER TABLE.
    http_method_type.create(op.get_bind(), checkfirst=True)
    check_status_type.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "monitoring_agent",
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("location", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("token", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("owner_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["owner_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("ix_monitoring_agent_token", "monitoring_agent", ["token"])
    op.add_column(
        "monitored_service", sa.Column("agent_id", sa.UUID(), nullable=True)
    )
    op.create_foreign_key(
        None,
        "monitored_service",
        "monitoring_agent",
        ["agent_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column(
        "monitored_service",
        sa.Column("http_method", http_method_type, nullable=False, server_default="GET"),
    )
    op.add_column(
        "monitored_service",
        sa.Column("http_path", sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default="/"),
    )
    op.add_column(
        "monitored_service",
        sa.Column("expected_status", sa.Integer(), nullable=False, server_default="200"),
    )
    op.alter_column("monitored_service", "http_method", server_default=None)
    op.alter_column("monitored_service", "http_path", server_default=None)
    op.alter_column("monitored_service", "expected_status", server_default=None)
    op.create_table(
        "check_report",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("agent_id", sa.UUID(), nullable=False),
        sa.Column("service_id", sa.UUID(), nullable=False),
        sa.Column("port", sa.Integer(), nullable=True),
        sa.Column("status", check_status_type, nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("detail", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["monitoring_agent.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_id"], ["monitored_service.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("check_report")
    op.execute("DROP TYPE checkstatus")
    op.drop_column("monitored_service", "expected_status")
    op.drop_column("monitored_service", "http_path")
    op.drop_column("monitored_service", "http_method")
    op.execute("DROP TYPE httpmethod")
    op.drop_constraint(None, "monitored_service", type_="foreignkey")
    op.drop_column("monitored_service", "agent_id")
    op.drop_index("ix_monitoring_agent_token", table_name="monitoring_agent")
    op.drop_table("monitoring_agent")
