#!/usr/bin/env python3
"""
Copy all application tables from PostgreSQL into a new SQLite database file.

Requires: psycopg2-binary (listed in backend/requirements.txt).

Usage (from repo root or backend):

  set POSTGRES_URL=postgresql://user:pass@localhost:5432/budgetapp
  python scripts/migrate_postgres_to_sqlite.py sqlite:///./data/budget.sqlite

Or pass the Postgres URL as the first argument:

  python scripts/migrate_postgres_to_sqlite.py postgresql://... sqlite:///./data/budget.sqlite

Datetime columns (timestamptz, date) are written as ISO-8601 text. JSON/JSONB is stored as
TEXT. BYTEA and other binary types are copied as BLOB-compatible bytes.
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any

# backend/ scripts/ -> backend is parent
_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

os.chdir(_BACKEND)


def _adapt_for_sqlite(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date) and not isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, time):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    if isinstance(value, memoryview):
        return value.tobytes()
    if isinstance(value, bytes):
        return value
    return value


def _pg_connect(url: str):
    import psycopg2

    return psycopg2.connect(url)


def main() -> int:
    argv = [a for a in sys.argv[1:] if a]
    postgres_url = os.environ.get("POSTGRES_URL") or os.environ.get("SOURCE_DATABASE_URL")
    sqlite_url: str | None = None

    if len(argv) == 1:
        if not postgres_url:
            print(
                "Set POSTGRES_URL or SOURCE_DATABASE_URL, or pass postgres URL as first arg.",
                file=sys.stderr,
            )
            return 1
        sqlite_url = argv[0]
    elif len(argv) == 2:
        postgres_url = argv[0]
        sqlite_url = argv[1]
    else:
        print(
            "Usage: migrate_postgres_to_sqlite.py [POSTGRES_URL] SQLITE_URL\n"
            "  SQLITE_URL example: sqlite:///./data/budget.sqlite",
            file=sys.stderr,
        )
        return 1

    if not postgres_url or not sqlite_url:
        return 1
    if not sqlite_url.strip().lower().startswith("sqlite:"):
        print("Second argument must be a sqlite: URL.", file=sys.stderr)
        return 1

    os.environ["DATABASE_URL"] = sqlite_url

    import db

    import importlib

    importlib.reload(db)

    from db import _parse_sqlite_url, init_schema

    dest_path = _parse_sqlite_url(sqlite_url.strip())
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    if dest_path.exists():
        dest_path.unlink()

    init_schema()

    table_order = [
        "category_catalog_removed",
        "subcategory_catalog_removed",
        "category_catalog",
        "subcategory_catalog",
        "budget_data",
        "payslip",
        "installment",
        "installment_line",
        "recurring_rule",
        "user_ui_preferences",
    ]

    # Empty tables created by init_schema (including default UI prefs) before bulk copy.
    lite = sqlite3.connect(str(dest_path), timeout=60.0)
    try:
        lite.execute("PRAGMA foreign_keys = OFF")
        for t in reversed(table_order):
            lite.execute(f'DELETE FROM "{t}"')
        lite.execute("DELETE FROM sqlite_sequence")
        lite.commit()
    finally:
        lite.close()

    pg = _pg_connect(postgres_url)
    lite = sqlite3.connect(str(dest_path), timeout=60.0)
    lite.execute("PRAGMA foreign_keys = OFF")

    try:
        pg_cur = pg.cursor()
        lite_cur = lite.cursor()
        for table in table_order:
            pg_cur.execute(f'SELECT * FROM "{table}"')
            rows = pg_cur.fetchall()
            if not rows:
                continue
            colnames = [d[0] for d in pg_cur.description]
            placeholders = ",".join("?" * len(colnames))
            cols_sql = ",".join(f'"{c}"' for c in colnames)
            sql = f'INSERT INTO "{table}" ({cols_sql}) VALUES ({placeholders})'
            adapted = [
                tuple(_adapt_for_sqlite(v) for v in row) for row in rows
            ]
            lite_cur.executemany(sql, adapted)

        lite.commit()
    finally:
        lite.execute("PRAGMA foreign_keys = ON")
        lite.close()
        pg.close()

    # Resequence AUTOINCREMENT metadata for each table that uses it
    lite = sqlite3.connect(str(dest_path), timeout=60.0)
    try:
        cur = lite.cursor()
        for table in (
            "budget_data",
            "payslip",
            "installment",
            "installment_line",
            "recurring_rule",
            "category_catalog",
            "subcategory_catalog",
        ):
            cur.execute(f'SELECT MAX("id") FROM "{table}"')
            m = cur.fetchone()[0]
            if m is not None:
                cur.execute(
                    "INSERT OR REPLACE INTO sqlite_sequence(name,seq) VALUES (?,?)",
                    (table, int(m)),
                )
        lite.commit()
    finally:
        lite.close()

    print(f"Wrote SQLite database: {dest_path}")
    print(f"Set DATABASE_URL={sqlite_url!r} in .env to use it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
