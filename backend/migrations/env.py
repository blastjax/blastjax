"""Runs migrations against DATABASE_URL, or against the connection a caller hands over in
config.attributes["connection"] (how test_core.py migrates its throwaway schema)."""

from __future__ import annotations

import sys
from pathlib import Path

from alembic import context
from sqlalchemy import create_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import db
import schema


def run(connection) -> None:
    context.configure(connection=connection, target_metadata=schema.Base.metadata)
    with context.begin_transaction():
        context.run_migrations()


given = context.config.attributes.get("connection")
if given is not None:
    run(given)
else:
    if not db.database_url():
        sys.exit("DATABASE_URL is not set to a Postgres URL")
    engine = create_engine(db.sqlalchemy_url())
    with engine.connect() as connection:
        run(connection)
    engine.dispose()
