#!/usr/bin/env python3
"""
Create every table ``schema.py`` defines that Postgres doesn't have yet, so the
API (which refuses to start while one is missing) comes up after a deploy that
adds a model. Additive only: existing tables are never altered, so a new
column on an existing table still needs its own ``add_*.py`` script. Safe to
re-run.

The deploy runs it with the new API image just before starting the API:

    docker compose run --rm --no-deps api python scripts/create_missing_tables.py

Reads the Postgres URL from ``DATABASE_URL``, like the API.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> int:
    from sqlalchemy import create_engine, inspect

    import db
    import schema

    url = db.database_url()
    if not url:
        sys.exit("DATABASE_URL is not set to a Postgres URL")

    engine = create_engine("postgresql+psycopg2://" + url.split("://", 1)[1])
    with engine.begin() as conn:
        present = set(inspect(conn).get_table_names())
        missing = [t for t in schema.Base.metadata.tables if t not in present]
        schema.Base.metadata.create_all(conn)
    engine.dispose()
    print(f"created {len(missing)} table(s): {', '.join(missing)}" if missing else "no missing tables")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
