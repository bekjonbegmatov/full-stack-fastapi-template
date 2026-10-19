"""Add country to monitoring agent.

Revision ID: 9a3c7e2d4f1b
Revises: 4e2f8c7d1b3a
"""

from alembic import op
import sqlalchemy as sa

revision = "9a3c7e2d4f1b"
down_revision = "4e2f8c7d1b3a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("monitoring_agent", sa.Column("country", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("monitoring_agent", "country")
