"""Replace a single port with a port list.

Revision ID: 6c4f1f0d7a2b
Revises: 2b7e18f90d4c
Create Date: 2026-09-22 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "6c4f1f0d7a2b"
down_revision = "2b7e18f90d4c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Старый одиночный порт переносим в массив, чтобы не терять настройки.
    op.add_column(
        "monitored_service",
        sa.Column(
            "ports",
            postgresql.ARRAY(sa.Integer()),
            nullable=False,
            server_default="{}",
        ),
    )
    op.execute("UPDATE monitored_service SET ports = ARRAY[port] WHERE port IS NOT NULL")
    op.alter_column("monitored_service", "ports", server_default=None)
    op.drop_column("monitored_service", "port")


def downgrade() -> None:
    op.add_column("monitored_service", sa.Column("port", sa.Integer(), nullable=True))
    op.execute("UPDATE monitored_service SET port = ports[1] WHERE cardinality(ports) > 0")
    op.drop_column("monitored_service", "ports")
