"""
SQLAlchemy engine + session factory.

DATABASE_URL must be the Supabase **Session Pooler** URI (port 5432, IPv4).
The direct connection host (db.xxx.supabase.co) only returns IPv6 on the
free tier; the pooler is the correct endpoint.

Pooler URL format:
  postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

_engine = None
_SessionLocal = None


def _get_engine():
    global _engine
    if _engine is None:
        url = os.environ["DATABASE_URL"]
        # Ensure SSL — required by Supabase pooler
        if "sslmode" not in url:
            sep = "&" if "?" in url else "?"
            url = url + sep + "sslmode=require"
        _engine = create_engine(
            url,
            pool_pre_ping=True,
            # No connect_args "options" — the pooler rejects SET commands on connect
        )
    return _engine


def get_session_factory():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            autocommit=False, autoflush=False, bind=_get_engine()
        )
    return _SessionLocal


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency — yields a DB session and closes it after the request."""
    db = get_session_factory()()
    try:
        yield db
    finally:
        db.close()
