#!/usr/bin/env python3
"""
Bring Postgres up to ``schema.py``: add every table and column it defines that
the database lacks. Additive only and safe to re-run, so a new model or column
needs no script of its own (see ``schema.sync_schema`` for what it won't do).

The API does the same on every start. The deploy also runs it with the new API
image first, so a failure stops the deploy while the old API is still running:

    docker compose run --rm --no-deps api python scripts/sync_schema.py

Reads the Postgres URL from ``DATABASE_URL``, like the API.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> int:
    from sqlalchemy import create_engine

    import db
    import schema

    url = db.database_url()
    if not url:
        sys.exit("DATABASE_URL is not set to a Postgres URL")

    engine = create_engine("postgresql+psycopg2://" + url.split("://", 1)[1])
    with engine.begin() as conn:
        added = schema.sync_schema(conn)
    engine.dispose()
    print(f"added: {', '.join(added)}" if added else "schema is up to date")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
