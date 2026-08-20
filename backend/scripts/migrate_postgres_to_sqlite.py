#!/usr/bin/env python3
"""
Copy every application table from the cloud PostgreSQL database into a local
SQLite file under ``data/`` (gitignored). Read-only against Postgres — it
never writes back, and it does not touch ``backend/db.py`` or any app code.

The SQLite schema mirrors the Postgres DDL in ``backend/db.py`` column-for-
column (types, PRIMARY KEY, UNIQUE, and FOREIGN KEY), so the copy keeps the
same shape and formatting as the source database:

  - SERIAL id            -> INTEGER PRIMARY KEY AUTOINCREMENT (sequence resynced)
  - DOUBLE PRECISION     -> REAL
  - NUMERIC(p, s)        -> NUMERIC(p, s)
  - BOOLEAN              -> BOOLEAN (0/1)
  - TEXT / already-TEXT "date" columns (start_date, finish_date,
    statement_date, due_date, payment_date) -> TEXT, unchanged
  - DATE                 -> DATE, ISO-8601 text (YYYY-MM-DD)
  - TIMESTAMPTZ          -> TIMESTAMP, ISO-8601 text with UTC offset
  - BYTEA (payslip PDFs) -> BLOB

NOT NULL / CHECK constraints from the Postgres DDL are deliberately left off
the SQLite copy. This is a data dump, not a live schema the app writes to,
and the cloud database has some rows that predate a constraint being added
(e.g. a legacy ``payslip.employee_hdmf`` column that a rename migration never
actually dropped, or ``monthly_expense`` rows with a NULL ``period_half`` from
before that column was backfilled and made NOT NULL). Enforcing the
constraints here would make the copy reject real rows instead of preserving
them as they actually are in Postgres. Columns present on the live source
table but missing from this script's schema (schema drift, like
``employee_hdmf`` above) are detected and added automatically at copy time.

Usage (from the repo root, with the venv active):

    python backend/scripts/migrate_postgres_to_sqlite.py

Reads the cloud Postgres connection the same way ``backend/db.py`` does
(``DB_HOST``/``DB_PORT``/``DB_USER``/``DB_PASSWORD``/``DB_NAME``, else
``DATABASE_URL``, from repo-root ``.env`` then ``backend/.env``), and writes
to ``<repo-root>/data/budget.sqlite``.

Optional overrides:

    python backend/scripts/migrate_postgres_to_sqlite.py [POSTGRES_URL] [SQLITE_PATH]

``POSTGRES_URL`` (or the ``POSTGRES_URL`` / ``SOURCE_DATABASE_URL`` env vars)
lets you point at a different source without changing ``DATABASE_URL``.
"""

from __future__ import annotations

import os
import sqlite3
import sys
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, quote, urlencode, urlparse, urlunparse

_SCRIPTS_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _SCRIPTS_DIR.parent
_REPO_ROOT = _BACKEND_DIR.parent
_DEFAULT_SQLITE_PATH = _REPO_ROOT / "data" / "budget.sqlite"


def _load_env_files() -> None:
    from dotenv import load_dotenv

    for path in (_REPO_ROOT / ".env", _BACKEND_DIR / ".env"):
        if path.is_file():
            load_dotenv(path, override=True)


def _database_url_from_db_parts() -> str | None:
    from urllib.parse import quote_plus

    host = (os.environ.get("DB_HOST") or "").strip()
    if not host:
        return None
    dbname = (os.environ.get("DB_NAME") or "").strip()
    if not dbname:
        return None
    user = (os.environ.get("DB_USER") or "").strip()
    password = os.environ.get("DB_PASSWORD") or ""
    port = (os.environ.get("DB_PORT") or "5432").strip() or "5432"
    path = quote(dbname, safe="")
    if user and password:
        return f"postgresql://{quote_plus(user)}:{quote_plus(password)}@{host}:{port}/{path}"
    if user:
        return f"postgresql://{quote_plus(user)}@{host}:{port}/{path}"
    if password:
        return f"postgresql://:{quote_plus(password)}@{host}:{port}/{path}"
    return f"postgresql://{host}:{port}/{path}"


def _resolve_postgres_url(cli_arg: str | None) -> str:
    if cli_arg:
        return cli_arg.strip()
    for var in ("POSTGRES_URL", "SOURCE_DATABASE_URL"):
        v = (os.environ.get(var) or "").strip()
        if v:
            return v
    from_parts = _database_url_from_db_parts()
    if from_parts:
        return from_parts
    direct = (os.environ.get("DATABASE_URL") or "").strip()
    if direct:
        return direct
    raise SystemExit(
        "No Postgres source found. Set DATABASE_URL / DB_HOST+DB_NAME in .env, "
        "or pass POSTGRES_URL as the first argument."
    )


def _postgres_connect_url(url: str) -> str:
    """Match backend/db.py: force sslmode=require for Neon hosts."""
    parsed = urlparse(url)
    pairs = parse_qsl(parsed.query, keep_blank_values=True)
    keys_lower = {k.lower() for k, _ in pairs}
    host = (parsed.hostname or "").lower()
    if "neon.tech" in host and "sslmode" not in keys_lower:
        pairs.append(("sslmode", "require"))
    new_query = urlencode(pairs, quote_via=quote)
    return urlunparse(parsed._replace(query=new_query))


# Postgres type OIDs -> SQLite column type, used only to add columns that
# exist on the live source table but not in ``_SCHEMA_STATEMENTS`` above
# (schema drift: e.g. a rename/drop migration that never ran against this
# particular database). Falls back to TEXT for anything unrecognized.
_PG_OID_TO_SQLITE: dict[int, str] = {
    16: "BOOLEAN",  # bool
    17: "BLOB",  # bytea
    20: "INTEGER",  # int8
    21: "INTEGER",  # int2
    23: "INTEGER",  # int4
    700: "REAL",  # float4
    701: "REAL",  # float8
    1082: "DATE",  # date
    1114: "TIMESTAMP",  # timestamp
    1184: "TIMESTAMP",  # timestamptz
    1700: "NUMERIC",  # numeric
}


def _infer_sqlite_type(pg_type_oid: int) -> str:
    return _PG_OID_TO_SQLITE.get(pg_type_oid, "TEXT")


def _reconcile_columns(lite: sqlite3.Connection, table: str, pg_cur: Any) -> None:
    """Add any column present on the live Postgres table but missing from our
    predefined SQLite schema, so the copy stays faithful to the actual source
    database even where it has drifted from the idealized DDL in db.py."""
    existing = {row[1] for row in lite.execute(f'PRAGMA table_info("{table}")')}
    for col in pg_cur.description:
        if col.name not in existing:
            sqlite_type = _infer_sqlite_type(col.type_code)
            print(
                f"  {table}: source has extra column '{col.name}' not in the "
                f"current app schema - adding it as {sqlite_type}"
            )
            lite.execute(f'ALTER TABLE "{table}" ADD COLUMN "{col.name}" {sqlite_type}')
            existing.add(col.name)


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
    if isinstance(value, memoryview):
        return value.tobytes()
    return value


# One CREATE TABLE (plus its indexes) per statement, in FK-safe dependency
# order: ``credit_card`` and ``house_payment`` before the tables that
# reference them, ``installment`` before ``installment_line``.
#
# NOT NULL / CHECK constraints from the Postgres DDL are intentionally left
# off here (only column types, defaults, PRIMARY KEY, UNIQUE, and FOREIGN KEY
# are kept). This is a data dump, not a live schema the app writes to, and
# the constraints in db.py describe the *intended* schema, not necessarily
# every row already sitting in the cloud database (e.g. a NOT NULL added
# after a backfill migration that never ran against older rows). Enforcing
# them here would make the copy reject real rows instead of preserving them.
_SCHEMA_STATEMENTS: list[str] = [
    """
    CREATE TABLE _app_meta (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """,
    """
    CREATE TABLE credit_card (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        credit_limit REAL,
        last_statement_balance REAL DEFAULT 0,
        current_balance REAL DEFAULT 0,
        minimum_due REAL DEFAULT 0,
        interest_rate REAL DEFAULT 3.5,
        statement_date TEXT,
        due_date TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE payslip (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total REAL,
        commission REAL,
        reimbursement REAL,
        medical_reimbursement REAL,
        others REAL,
        mp2 REAL,
        allowances REAL,
        thirteenth_month REAL,
        basic_salary REAL,
        period_year INTEGER,
        period_month INTEGER,
        period_half INTEGER,
        notes TEXT,
        withholding_tax REAL,
        sss_contribution REAL,
        philhealth REAL,
        pag_ibig REAL,
        pdf_data BLOB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX idx_payslip_created ON payslip (created_at DESC)",
    """
    CREATE INDEX idx_payslip_period_sort ON payslip (
        period_year DESC, period_month DESC, period_half DESC, created_at DESC
    )
    """,
    """
    CREATE TABLE installment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        installment_current INTEGER,
        installment_total INTEGER,
        principal REAL,
        interest REAL,
        payment_total REAL,
        start_date TEXT,
        finish_date TEXT,
        remaining REAL,
        original_total REAL,
        credit_card_id INTEGER REFERENCES credit_card(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX idx_installment_created ON installment (created_at DESC)",
    "CREATE INDEX idx_installment_finish_name ON installment (finish_date, name)",
    "CREATE INDEX idx_installment_credit_card_id ON installment (credit_card_id)",
    """
    CREATE TABLE installment_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        installment_id INTEGER REFERENCES installment(id) ON DELETE CASCADE,
        seq INTEGER,
        principal REAL DEFAULT 0,
        interest REAL,
        payment_total REAL,
        UNIQUE (installment_id, seq)
    )
    """,
    "CREATE INDEX idx_installment_line_parent ON installment_line (installment_id)",
    """
    CREATE TABLE house_payment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX idx_house_payment_created ON house_payment (created_at DESC)",
    "CREATE INDEX idx_house_payment_name ON house_payment (name)",
    """
    CREATE TABLE house_payment_entry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        house_payment_id INTEGER REFERENCES house_payment(id) ON DELETE CASCADE,
        paid_on DATE,
        amount REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE INDEX idx_house_payment_entry_parent
        ON house_payment_entry (house_payment_id, paid_on DESC)
    """,
    """
    CREATE TABLE blood_pressure (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        systolic INTEGER,
        diastolic INTEGER,
        pulse INTEGER,
        spo2 INTEGER,
        temperature NUMERIC(5, 2),
        weight NUMERIC(6, 2),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX idx_blood_pressure_created ON blood_pressure (created_at DESC)",
    """
    CREATE TABLE fixed_expense (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_half INTEGER,
        period_year INTEGER,
        period_month INTEGER,
        amount REAL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE INDEX idx_fixed_expense_period
        ON fixed_expense (period_year, period_month, period_half, created_at DESC)
    """,
    """
    CREATE TABLE monthly_expense (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        description TEXT,
        amount REAL,
        period_half INTEGER,
        period_year INTEGER,
        period_month INTEGER,
        is_recurring BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE INDEX idx_monthly_expense_period
        ON monthly_expense (period_year, period_month, period_half, created_at DESC)
    """,
    """
    CREATE TABLE calendar_day_override (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day DATE UNIQUE,
        amount REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE pay_period_start_override (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_year INTEGER,
        period_month INTEGER,
        period_half INTEGER,
        start_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (period_year, period_month, period_half)
    )
    """,
    """
    CREATE TABLE credit_card_payment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        credit_card_id INTEGER REFERENCES credit_card(id) ON DELETE CASCADE,
        amount REAL,
        payment_date TEXT,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE INDEX idx_credit_card_payment_parent
        ON credit_card_payment (credit_card_id, payment_date DESC)
    """,
]

# Table copy order == FK-safe creation order (parents before children).
_TABLES_IN_ORDER: list[str] = [
    "_app_meta",
    "credit_card",
    "payslip",
    "installment",
    "installment_line",
    "house_payment",
    "house_payment_entry",
    "blood_pressure",
    "fixed_expense",
    "monthly_expense",
    "calendar_day_override",
    "pay_period_start_override",
    "credit_card_payment",
]

# Tables with an AUTOINCREMENT ``id`` whose sqlite_sequence needs resyncing
# after a bulk copy (``_app_meta`` has a text primary key, not ``id``).
_AUTOINCREMENT_TABLES: list[str] = [t for t in _TABLES_IN_ORDER if t != "_app_meta"]


def main() -> int:
    argv = [a for a in sys.argv[1:] if a]
    if len(argv) > 2:
        print(
            "Usage: migrate_postgres_to_sqlite.py [POSTGRES_URL] [SQLITE_PATH]",
            file=sys.stderr,
        )
        return 1

    _load_env_files()

    postgres_arg = argv[0] if len(argv) >= 1 else None
    sqlite_path = Path(argv[1]) if len(argv) >= 2 else _DEFAULT_SQLITE_PATH

    postgres_url = _resolve_postgres_url(postgres_arg)
    low = postgres_url.lower()
    if not (low.startswith("postgresql:") or low.startswith("postgres:")):
        print("Source URL must start with postgresql:// or postgres://", file=sys.stderr)
        return 1

    import psycopg2

    print(f"Connecting to Postgres: {urlparse(postgres_url).hostname}")
    pg = psycopg2.connect(_postgres_connect_url(postgres_url))

    sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    if sqlite_path.exists():
        sqlite_path.unlink()

    lite = sqlite3.connect(str(sqlite_path))
    try:
        lite.execute("PRAGMA foreign_keys = OFF")
        for stmt in _SCHEMA_STATEMENTS:
            lite.execute(stmt)
        lite.commit()

        pg_cur = pg.cursor()
        for table in _TABLES_IN_ORDER:
            pg_cur.execute(f'SELECT * FROM "{table}"')
            rows = pg_cur.fetchall()
            _reconcile_columns(lite, table, pg_cur)
            if not rows:
                print(f"  {table}: 0 rows")
                continue
            colnames = [d[0] for d in pg_cur.description]
            cols_sql = ", ".join(f'"{c}"' for c in colnames)
            placeholders = ", ".join("?" * len(colnames))
            insert_sql = f'INSERT INTO "{table}" ({cols_sql}) VALUES ({placeholders})'
            adapted = [tuple(_adapt_for_sqlite(v) for v in row) for row in rows]
            lite.executemany(insert_sql, adapted)
            print(f"  {table}: {len(rows)} rows")

        for table in _AUTOINCREMENT_TABLES:
            row = lite.execute(f'SELECT MAX("id") FROM "{table}"').fetchone()
            max_id = row[0] if row else None
            if max_id is not None:
                lite.execute(
                    "INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES (?, ?)",
                    (table, int(max_id)),
                )

        lite.commit()
    finally:
        lite.execute("PRAGMA foreign_keys = ON")
        lite.close()
        pg.close()

    print(f"\nWrote SQLite database: {sqlite_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
