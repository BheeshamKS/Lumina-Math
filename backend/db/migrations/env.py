"""Alembic migration environment — reads DATABASE_URL from .env."""

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool

# ── 1. Load .env FIRST so DATABASE_URL is in os.environ ──────────
backend_dir = Path(__file__).resolve().parents[2]   # backend/
load_dotenv(backend_dir / ".env")

# ── 2. Make 'backend/' importable ────────────────────────────────
sys.path.insert(0, str(backend_dir))

# ── 3. Import models (registers them with Base.metadata) ─────────
from db.database import Base       # noqa: E402
import db.models                   # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# ── 4. Inject DATABASE_URL into alembic config ────────────────────
database_url = os.environ["DATABASE_URL"]
config.set_main_option("sqlalchemy.url", database_url)


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
