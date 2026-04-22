#!/usr/bin/env python3
"""
Copy all application tables from a SQLite file into PostgreSQL.

Requires: psycopg2-binary (backend/requirements.txt).

Usage (from repo root or backend/):

  export DATABASE_URL=postgresql://user:pass@localhost:5432/budgetapp
  python scripts/migrate_sqlite_to_postgres.py sqlite:///./data/budget.sqlite

Or pass both URLs (SQLite first, PostgreSQL second):

  python scripts/migrate_sqlite_to_postgres.py sqlite:///./data/budget.sqlite postgresql://...
"""

from __future__ import annotations

import importlib
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

os.chdir(_BACKEND)

from dotenv import load_dotenv

load_dotenv(_BACKEND.parent / ".env")
load_dotenv(_BACKEND / ".env")


def _truncate_all(pg: Any) -> None:
    cur = pg.cursor()
    try:
        cur.execute(
            """
            TRUNCATE TABLE
                user_ui_preferences,
                subcategory_catalog_removed,
                category_catalog_removed,
                installment_line,
                installment,
                recurring_rule,
                subcategory_catalog,
                category_catalog,
                payslip,
                budget_data
            RESTART IDENTITY CASCADE
            """
        )
        pg.commit()
    finally:
        cur.close()


def _copy_table(lite: sqlite3.Connection, pg: Any, table: str) -> int:
    lite_cur = lite.cursor()
    pg_cur = pg.cursor()
    try:
        lite_cur.execute(f'SELECT * FROM "{table}"')
        rows = lite_cur.fetchall()
        if not rows:
            return 0
        colnames = [d[0] for d in lite_cur.description]
        placeholders = ",".join(["%s"] * len(colnames))
        cols_sql = ",".join(f'"{c}"' for c in colnames)
        sql = f'INSERT INTO "{table}" ({cols_sql}) VALUES ({placeholders})'
        pg_cur.executemany(sql, rows)
        return len(rows)
    finally:
        lite_cur.close()
        pg_cur.close()


def main() -> int:
    argv = [a for a in sys.argv[1:] if a]
    postgres_url = (os.environ.get("DATABASE_URL") or "").strip()
    sqlite_url: str | None = None

    if len(argv) == 1:
        sqlite_url = argv[0]
    elif len(argv) == 2:
        sqlite_url = argv[0]
        postgres_url = argv[1]
    else:
        print(
            "Usage: migrate_sqlite_to_postgres.py SQLITE_URL [POSTGRES_URL]\n"
            "  Example: migrate_sqlite_to_postgres.py sqlite:///./data/budget.sqlite\n"
            "  Set DATABASE_URL to the target PostgreSQL URL if you pass only SQLite.",
            file=sys.stderr,
        )
        return 1

    if not sqlite_url or not sqlite_url.strip().lower().startswith("sqlite:"):
        print("First argument must be a sqlite: URL.", file=sys.stderr)
        return 1
    if not postgres_url or not postgres_url.lower().startswith(
        ("postgresql:", "postgres:")
    ):
        print(
            "PostgreSQL URL missing. Pass as second argument or set DATABASE_URL.",
            file=sys.stderr,
        )
        return 1

    import db as dbmod

    src_path = dbmod._parse_sqlite_url(sqlite_url.strip())

    os.environ["DATABASE_URL"] = postgres_url.strip()
    importlib.reload(dbmod)
    dbmod.init_schema()

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

    import psycopg2

    pg = psycopg2.connect(postgres_url.strip())
    lite = sqlite3.connect(str(src_path), timeout=120.0)
    try:
        _truncate_all(pg)
        lite.execute("PRAGMA foreign_keys = OFF")
        for table in table_order:
            n = _copy_table(lite, pg, table)
            if n:
                print(f"Copied {n} row(s) into {table}")
        pg.commit()
    except Exception:
        pg.rollback()
        raise
    finally:
        lite.close()
        pg.close()

    print(f"Loaded PostgreSQL at {postgres_url.split('@')[-1] if '@' in postgres_url else postgres_url!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
