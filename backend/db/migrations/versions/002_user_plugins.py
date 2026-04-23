"""Add user_plugins table

Revision ID: 002
Revises: 001
Create Date: 2026-04-23
"""

from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_plugins",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("plugin_name", sa.String(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "plugin_name", name="uq_user_plugin"),
    )
    op.create_index("ix_user_plugins_user_id", "user_plugins", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_plugins_user_id", table_name="user_plugins")
    op.drop_table("user_plugins")
