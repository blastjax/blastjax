"""
Budget workbook storage: SQLite file or PostgreSQL (``DATABASE_URL``).

Excel headers map to fixed SQL columns. Uploading an Excel file replaces all
existing ``budget_data`` rows, then inserts rows from every worksheet (duplicate
rows are skipped by row hash). There is no per-row sheet name in the database.

Timestamps are stored as ISO-8601 text (UTC) for stable sorting. JSON preferences
are stored as TEXT. Binary blobs are not used.
"""

from __future__ import annotations

import datetime as dt_module
import hashlib
import json
import logging
import os
import secrets
import shutil
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote, quote_plus

import psycopg2

from app.reserved_names import is_reserved_category_label

from dotenv import load_dotenv

import pandas as pd

_log = logging.getLogger(__name__)

# Project root (parent of backend/). Load env before reading DATABASE_URL.
_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_ROOT / ".env")
load_dotenv(Path(__file__).resolve().parent / ".env")


def _parse_sqlite_url(url: str) -> Path:
    """Resolve `sqlite:///relative/db.sqlite` or `sqlite:///C:/abs/db.sqlite` to a path."""
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        raise ValueError(
            f"DATABASE_URL must start with {prefix!r} (e.g. sqlite:///./data/budget.sqlite)"
        )
    rest = url[len(prefix) :]
    if rest.startswith("//"):
        p = Path(rest[2:])
    else:
        p = Path(rest)
        if not p.is_absolute():
            p = (_ROOT / rest).resolve()
    return p.resolve()


def _sqlite_url_for_absolute_path(path: Path) -> str:
    """``sqlite:////abs/path`` form expected by :func:`_parse_sqlite_url`."""
    posix = path.resolve().as_posix()
    if not posix.startswith("/"):
        raise ValueError(f"SQLite path must be absolute for URL encoding: {path}")
    return "sqlite:///" + posix


# When ``BUDGET_SQLITE_WORKING_COPY`` is set: host bind path → tmp file; see ``apply_sqlite_working_copy_maybe``.
_SQLITE_WORKING_HOST: Path | None = None
_SQLITE_WORKING_TMP: Path | None = None


def apply_sqlite_working_copy_maybe() -> None:
    """
    Docker Desktop (Windows) bind mounts often break SQLite entirely (disk I/O on
    any journal mode). Copy ``DATABASE_URL``'s file to a container-local path
    (default ``/tmp/...``), point ``DATABASE_URL`` there for the process lifetime,
    then :func:`sync_sqlite_working_copy_maybe` copies back on shutdown.

    Enable with ``BUDGET_SQLITE_WORKING_COPY=1``. Optional ``BUDGET_SQLITE_WORKING_COPY_PATH``.
    """
    global _SQLITE_WORKING_HOST, _SQLITE_WORKING_TMP
    _SQLITE_WORKING_HOST = None
    _SQLITE_WORKING_TMP = None
    flag = (os.environ.get("BUDGET_SQLITE_WORKING_COPY") or "").strip().lower()
    if flag not in ("1", "true", "yes", "on"):
        return
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url.lower().startswith("sqlite:"):
        return
    try:
        host_path = _parse_sqlite_url(url)
    except ValueError:
        _log.warning("BUDGET_SQLITE_WORKING_COPY: invalid DATABASE_URL")
        return
    tmp_raw = (os.environ.get("BUDGET_SQLITE_WORKING_COPY_PATH") or "").strip()
    tmp_path = Path(tmp_raw or "/tmp/budget.sqlite.working").expanduser()
    if not tmp_path.is_absolute():
        _log.warning("BUDGET_SQLITE_WORKING_COPY_PATH must be absolute; got %s", tmp_path)
        return
    tmp_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        if host_path.is_file():
            shutil.copy2(host_path, tmp_path)
        else:
            host_path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path.unlink(missing_ok=True)
    except OSError as e:
        _log.warning(
            "BUDGET_SQLITE_WORKING_COPY: disabled (%s). Using DATABASE_URL on the host volume.",
            e,
        )
        return
    _SQLITE_WORKING_HOST = host_path
    _SQLITE_WORKING_TMP = tmp_path
    os.environ["DATABASE_URL"] = _sqlite_url_for_absolute_path(tmp_path)
    _log.info(
        "SQLite working copy: %s → %s (writes here; synced back on clean shutdown)",
        host_path,
        tmp_path,
    )


def sync_sqlite_working_copy_maybe() -> None:
    """Persist working-copy DB back to the host path set by :func:`apply_sqlite_working_copy_maybe`."""
    global _SQLITE_WORKING_HOST, _SQLITE_WORKING_TMP
    host = _SQLITE_WORKING_HOST
    tmp = _SQLITE_WORKING_TMP
    _SQLITE_WORKING_HOST = None
    _SQLITE_WORKING_TMP = None
    if host is None or tmp is None:
        return
    if not tmp.is_file():
        return
    try:
        host.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(tmp, host)
        _log.info("SQLite working copy synced to %s", host)
    except OSError as e:
        _log.error(
            "SQLite working copy: could not write to host path %s (%s). "
            "Current database file is still at %s inside the container.",
            host,
            e,
            tmp,
        )


def _is_unique_constraint(err: BaseException) -> bool:
    if isinstance(err, sqlite3.IntegrityError):
        return "UNIQUE" in str(err).upper()
    if type(err).__module__.startswith("psycopg2"):
        msg = str(err).lower()
        return "unique" in msg and "violates" in msg
    return False


class _PostgresCursorProxy:
    """psycopg2 uses ``%s`` placeholders; app SQL is written with ``?`` like sqlite3."""

    __slots__ = ("_cur",)

    def __init__(self, cur: Any) -> None:
        self._cur = cur

    def execute(self, operation: str, parameters: Any | None = None) -> Any:
        op = operation.replace("?", "%s")
        if parameters is not None:
            return self._cur.execute(op, parameters)
        return self._cur.execute(op)

    def executemany(self, operation: str, seq_of_parameters: Any) -> Any:
        return self._cur.executemany(operation.replace("?", "%s"), seq_of_parameters)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._cur, name)


@contextmanager
def db_cursor(conn: Any):
    """Yield a cursor; PostgreSQL connections get ``?`` → ``%s`` translation."""
    raw = conn.cursor()
    cur: Any = _PostgresCursorProxy(raw) if storage_kind() == "postgres" else raw
    try:
        yield cur
    finally:
        raw.close()

EXCEL_TO_SQL: list[tuple[str, str]] = [
    ("Period", "period"),
    ("Accounts", "accounts"),
    ("Category", "category"),
    ("Subcategory", "subcategory"),
    ("Note", "note"),
    ("PHP", "php"),
    ("Income/Expense", "income_expense"),
    ("Description", "description"),
    ("Amount", "amount"),
    ("Currency", "currency"),
]

EXPECTED_EXCEL_COLS = [e for e, _ in EXCEL_TO_SQL]

# Headers present in older templates; stripped before validation (not stored in SQLite).
IGNORED_LEGACY_EXCEL_COLS = frozenset({"Accounts.1"})

# Single logical workbook tab exposed by the API (no sheet_name stored in SQLite).
WORKBOOK_SHEET_KEY = os.environ.get("BUDGET_WORKBOOK_SHEET", "Budget")


def _database_url_from_db_parts() -> str | None:
    """
    Build ``postgresql://...`` when ``DATABASE_URL`` is unset but Postgres parts are.

    Uses ``DB_HOST``, ``DB_NAME`` (required), ``DB_USER``, ``DB_PASSWORD``, ``DB_PORT``
    (default ``5432``). User and password are URL-encoded for special characters.
    """
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
        return (
            f"postgresql://{quote_plus(user)}:{quote_plus(password)}"
            f"@{host}:{port}/{path}"
        )
    if user:
        return f"postgresql://{quote_plus(user)}@{host}:{port}/{path}"
    if password:
        return f"postgresql://:{quote_plus(password)}@{host}:{port}/{path}"
    return f"postgresql://{host}:{port}/{path}"


def database_url() -> str | None:
    direct = (os.environ.get("DATABASE_URL") or "").strip()
    if direct:
        return direct
    return _database_url_from_db_parts()


def storage_kind() -> str:
    """``sqlite`` | ``postgres`` | ``none`` from ``DATABASE_URL`` or ``DB_*`` parts."""
    u = (database_url() or "").strip().lower()
    if u.startswith("sqlite:"):
        return "sqlite"
    if u.startswith("postgresql:") or u.startswith("postgres:"):
        return "postgres"
    return "none"


def use_database() -> bool:
    return storage_kind() in ("sqlite", "postgres")


def minimal_schema_enabled() -> bool:
    """When true, ``init_schema`` creates only payslip, installment, and installment_line."""
    v = (os.environ.get("BUDGET_DB_MINIMAL_SCHEMA") or "").strip().lower()
    return v in ("1", "true", "yes", "on")


_SQLITE_JOURNAL_MODES = frozenset(
    {"delete", "truncate", "persist", "memory", "wal", "off"}
)


def _sqlite_journal_io_error(e: BaseException) -> bool:
    msg = str(e).lower()
    return "i/o" in msg or "disk" in msg


def _set_sqlite_journal_mode(conn: sqlite3.Connection) -> None:
    """
    Pick a journal mode the filesystem allows. Host bind mounts often reject
    any on-disk journal (WAL sidecars, or DELETE rollback files) → try MEMORY.
    """
    env = (os.environ.get("BUDGET_SQLITE_JOURNAL_MODE") or "").strip().lower()
    modes: list[str] = []
    if env in _SQLITE_JOURNAL_MODES:
        modes.append(env)
    for m in ("wal", "delete", "memory"):
        if m not in modes:
            modes.append(m)
    first = modes[0]
    last_io: sqlite3.OperationalError | None = None
    for mode in modes:
        try:
            conn.execute(f"PRAGMA journal_mode = {mode}")
            row = conn.execute("PRAGMA journal_mode").fetchone()
            actual = str(row[0]).lower() if row else mode
            if mode != first:
                _log.warning(
                    "SQLite journal_mode: could not use %r on this storage; using %r. "
                    "Set BUDGET_SQLITE_JOURNAL_MODE=memory for Docker bind mounts if needed.",
                    first,
                    actual,
                )
            return
        except sqlite3.OperationalError as e:
            last_io = e
            if not _sqlite_journal_io_error(e):
                raise
    assert last_io is not None
    _log.error("SQLite journal_mode: exhausted wal/delete/memory (%s)", last_io)
    raise last_io


def _configure_sqlite_connection(conn: sqlite3.Connection) -> None:
    """
    Per-connection settings for read-heavy workloads (WAL + larger cache).
    Override with BUDGET_SQLITE_CACHE_KB (negative = KiB, e.g. 65536 → 64 MiB)
    and BUDGET_SQLITE_MMAP_MB (0 to disable).

    ``BUDGET_SQLITE_JOURNAL_MODE`` (delete, wal, memory, …): tried first; on disk
    I/O errors the code falls back through wal → delete → memory. Docker bind
    mounts often need ``memory`` (journal in RAM, DB file still on the volume).
    """
    conn.execute("PRAGMA foreign_keys = ON")
    _set_sqlite_journal_mode(conn)
    # WAL + NORMAL is a common balance; FULL is slower on every commit.
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA temp_store = MEMORY")
    try:
        cache_kb = int(os.environ.get("BUDGET_SQLITE_CACHE_KB", "65536"))
    except ValueError:
        cache_kb = 65536
    cache_kb = max(1, min(abs(cache_kb), 2_000_000))  # cap ~2 GB KiB units
    if cache_kb != 0:
        conn.execute(f"PRAGMA cache_size = {-cache_kb}")
    try:
        mmap_mb = int(os.environ.get("BUDGET_SQLITE_MMAP_MB", "128"))
    except ValueError:
        mmap_mb = 128
    mmap_mb = max(0, min(mmap_mb, 2048))
    if mmap_mb > 0:
        try:
            conn.execute(f"PRAGMA mmap_size = {mmap_mb * 1024 * 1024}")
        except sqlite3.OperationalError as e:
            if _sqlite_journal_io_error(e):
                _log.warning("PRAGMA mmap_size failed (%s); continuing with mmap disabled", e)
            else:
                raise
    # Milliseconds; complements connect(timeout=...).
    conn.execute("PRAGMA busy_timeout = 30000")


@contextmanager
def get_connection():
    url = (database_url() or "").strip()
    kind = storage_kind()
    if kind == "sqlite":
        if not url.lower().startswith("sqlite:"):
            raise RuntimeError(
                "DATABASE_URL must be a SQLite URL (e.g. sqlite:///./data/budget.sqlite)"
            )
        path = _parse_sqlite_url(url)
        path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(path), timeout=30.0)
        try:
            _configure_sqlite_connection(conn)
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    elif kind == "postgres":
        conn = psycopg2.connect(url)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    else:
        raise RuntimeError(
            "DATABASE_URL must be set to sqlite:///... or postgresql://... "
            "(e.g. postgresql://user:pass@localhost:5432/budgetapp)"
        )


def _ie_norm_sql() -> str:
    """Normalize income_expense cell for income vs expense detection (matches common sheet values)."""
    return "LOWER(TRIM(COALESCE(income_expense, '')))"


def _seed_category_catalog_from_budget_data(cur: Any) -> tuple[int, int]:
    """
    Copy distinct Category / Subcategory values from budget_data into the catalog
    tables. Category `kind` is derived from Income/Expense column (income, expense,
    or mixed). Idempotent: ON CONFLICT updates `kind` from current data.
    Returns counts of rows touched in each insert.
    """
    ie = _ie_norm_sql()
    cur.execute(
        f"""
        INSERT INTO category_catalog (name, kind)
        SELECT cname, k
        FROM (
            SELECT
                TRIM(COALESCE(category, '')) AS cname,
                CASE
                    WHEN MAX(CASE WHEN {ie} IN ('income', 'transfer-in') THEN 1 ELSE 0 END) = 1
                         AND MAX(CASE WHEN {ie} IN ('expense', 'transfer-out') THEN 1 ELSE 0 END) = 1
                        THEN 'mixed'
                    WHEN MAX(CASE WHEN {ie} IN ('income', 'transfer-in') THEN 1 ELSE 0 END) = 1
                        THEN 'income'
                    ELSE 'expense'
                END AS k
            FROM budget_data
            WHERE TRIM(COALESCE(category, '')) <> ''
              AND LOWER(TRIM(COALESCE(category, ''))) <> 'accounts'
            GROUP BY TRIM(COALESCE(category, ''))
        ) AS cat_kinds
        WHERE NOT EXISTS (
            SELECT 1 FROM category_catalog_removed r WHERE r.name = cat_kinds.cname
        )
        ON CONFLICT (name) DO UPDATE SET kind = excluded.kind
        """
    )
    cat_n = cur.rowcount if cur.rowcount is not None and cur.rowcount >= 0 else 0
    cur.execute(
        """
        INSERT INTO subcategory_catalog (category_id, name)
        SELECT DISTINCT cc.id, d.s
        FROM (
            SELECT DISTINCT
                TRIM(COALESCE(category, '')) AS c,
                TRIM(COALESCE(subcategory, '')) AS s
            FROM budget_data
            WHERE TRIM(COALESCE(category, '')) <> ''
              AND TRIM(COALESCE(subcategory, '')) <> ''
              AND LOWER(TRIM(COALESCE(category, ''))) <> 'accounts'
        ) d
        INNER JOIN category_catalog cc ON cc.name = d.c
        WHERE NOT EXISTS (
            SELECT 1 FROM subcategory_catalog_removed sr
            WHERE sr.parent_category_name = d.c AND sr.name = d.s
        )
        ON CONFLICT (category_id, name) DO NOTHING
        """
    )
    sub_n = cur.rowcount if cur.rowcount is not None and cur.rowcount >= 0 else 0
    return cat_n, sub_n


def _purge_reserved_accounts_category_rows(cur: Any) -> None:
    """Remove mistaken 'Accounts' category labels; Accounts belongs in the Accounts column only."""
    cur.execute(
        """
        UPDATE budget_data
        SET category = ''
        WHERE LOWER(TRIM(COALESCE(category, ''))) = 'accounts'
        """
    )
    cur.execute(
        """
        DELETE FROM category_catalog
        WHERE LOWER(TRIM(name)) = 'accounts'
        """
    )


def seed_category_catalog_from_budget_data() -> dict[str, int]:
    """Public entry: merge budget_data distinct labels into catalog tables."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            c, s = _seed_category_catalog_from_budget_data(cur)
    return {"categories_inserted": c, "subcategories_inserted": s}


def _backfill_installment_lines_if_empty(cur: Any) -> None:
    """One row per installment period when lines are missing (replaces PG generate_series)."""
    cur.execute(
        """
        SELECT id, installment_total, principal, interest, payment_total
        FROM installment
        """
    )
    for iid, total, principal, interest, payment_total in cur.fetchall():
        cur.execute(
            "SELECT 1 FROM installment_line WHERE installment_id = ? LIMIT 1",
            (iid,),
        )
        if cur.fetchone():
            continue
        ptot = _line_payment_total(float(principal or 0), interest)
        for seq in range(1, int(total) + 1):
            cur.execute(
                """
                INSERT INTO installment_line (installment_id, seq, principal, interest, payment_total)
                VALUES (?, ?, ?, ?, ?)
                """,
                (iid, seq, principal, interest, ptot),
            )


def _ensure_category_catalog_hide_from_preview_column(cur: Any) -> None:
    """Add hide_from_data_preview to category_catalog on older DBs (idempotent)."""
    if storage_kind() == "postgres":
        cur.execute(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'category_catalog'
              AND column_name = 'hide_from_data_preview'
            LIMIT 1
            """
        )
        if cur.fetchone():
            return
        cur.execute(
            """
            ALTER TABLE category_catalog
            ADD COLUMN hide_from_data_preview INTEGER NOT NULL DEFAULT 0
            """
        )
        return
    cur.execute("PRAGMA table_info(category_catalog)")
    cols = [row[1] for row in cur.fetchall()]
    if "hide_from_data_preview" in cols:
        return
    cur.execute(
        """
        ALTER TABLE category_catalog ADD COLUMN hide_from_data_preview INTEGER NOT NULL DEFAULT 0
        """
    )


_MINIMAL_PERF_INDEX_DDL = """
CREATE INDEX IF NOT EXISTS idx_payslip_period_sort ON payslip(
    period_year DESC, period_month DESC, period_half DESC, created_at DESC
);
CREATE INDEX IF NOT EXISTS idx_installment_finish_name ON installment(finish_date, name);
"""

_MINIMAL_SCHEMA_SQLITE = """
CREATE TABLE IF NOT EXISTS payslip (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total REAL,
    commission REAL,
    reimbursement REAL,
    medical_reimbursement REAL,
    others REAL,
    mp2 REAL,
    allowances REAL,
    period_year INTEGER,
    period_month INTEGER,
    period_half INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payslip_created ON payslip (created_at DESC);

CREATE TABLE IF NOT EXISTS installment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    installment_current INTEGER NOT NULL,
    installment_total INTEGER NOT NULL,
    principal REAL NOT NULL,
    interest REAL,
    payment_total REAL NOT NULL,
    start_date TEXT NOT NULL,
    finish_date TEXT NOT NULL,
    remaining REAL NOT NULL,
    original_total REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CONSTRAINT chk_installment_n CHECK (
        installment_total >= 1
        AND installment_current >= 1
        AND installment_current <= installment_total + 1
    ),
    CONSTRAINT chk_installment_amounts CHECK (payment_total > 0 AND remaining >= 0)
);
CREATE INDEX IF NOT EXISTS idx_installment_created ON installment (created_at DESC);

CREATE TABLE IF NOT EXISTS installment_line (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    installment_id INTEGER NOT NULL REFERENCES installment(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    principal REAL NOT NULL DEFAULT 0,
    interest REAL,
    payment_total REAL NOT NULL,
    UNIQUE (installment_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_installment_line_parent
    ON installment_line (installment_id);
"""


_PERFORMANCE_INDEX_DDL = """
CREATE INDEX IF NOT EXISTS idx_budget_data_period ON budget_data(period);
CREATE INDEX IF NOT EXISTS idx_budget_data_period_id ON budget_data(period, id);
CREATE INDEX IF NOT EXISTS idx_budget_data_created_at ON budget_data(created_at);
CREATE INDEX IF NOT EXISTS idx_budget_accounts_norm_id
    ON budget_data (LOWER(TRIM(COALESCE(accounts, ''))), id);
CREATE INDEX IF NOT EXISTS idx_budget_currency_norm_id
    ON budget_data (LOWER(TRIM(COALESCE(currency, ''))), id);
CREATE INDEX IF NOT EXISTS idx_budget_accounts_nonempty ON budget_data(accounts)
    WHERE accounts IS NOT NULL AND TRIM(accounts) <> '';
CREATE INDEX IF NOT EXISTS idx_budget_currency_nonempty ON budget_data(currency)
    WHERE currency IS NOT NULL AND TRIM(currency) <> '';
CREATE INDEX IF NOT EXISTS idx_payslip_period_sort ON payslip(
    period_year DESC, period_month DESC, period_half DESC, created_at DESC
);
CREATE INDEX IF NOT EXISTS idx_installment_finish_name ON installment(finish_date, name);
CREATE INDEX IF NOT EXISTS idx_category_catalog_name_lower ON category_catalog(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_subcategory_cat_lower ON subcategory_catalog(category_id, LOWER(name));
"""


def _ensure_performance_indexes(cur: Any) -> None:
    """
    Secondary indexes for common filters and ORDER BY paths (idempotent).
    Run after base schema; safe on existing DBs.
    """
    if storage_kind() == "postgres":
        for stmt in _PERFORMANCE_INDEX_DDL.strip().split(";"):
            s = stmt.strip()
            if s:
                cur.execute(s)
        cur.execute("ANALYZE")
        return
    cur.executescript(_PERFORMANCE_INDEX_DDL)
    cur.execute("ANALYZE")


def _ensure_minimal_performance_indexes(cur: Any) -> None:
    if storage_kind() == "postgres":
        for stmt in _MINIMAL_PERF_INDEX_DDL.strip().split(";"):
            s = stmt.strip()
            if s:
                cur.execute(s)
        cur.execute("ANALYZE")
        return
    cur.executescript(_MINIMAL_PERF_INDEX_DDL)
    cur.execute("ANALYZE")


def _migrate_payslip_drop_source_filename() -> None:
    """Remove legacy payslip.source_filename column if present."""
    if not use_database():
        return
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            if storage_kind() == "postgres":
                cur.execute(
                    "ALTER TABLE payslip DROP COLUMN IF EXISTS source_filename"
                )
                return
            cur.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='payslip'"
            )
            if cur.fetchone() is None:
                return
            cur.execute("PRAGMA table_info(payslip)")
            cols = [row[1] for row in cur.fetchall()]
            if "source_filename" in cols:
                cur.execute("ALTER TABLE payslip DROP COLUMN source_filename")


def init_schema() -> None:
    if not use_database():
        return
    if minimal_schema_enabled():
        if storage_kind() == "postgres":
            _init_schema_minimal_postgres()
        else:
            _init_schema_minimal_sqlite()
    elif storage_kind() == "postgres":
        _init_schema_postgres()
    else:
        _init_schema_sqlite()
    _migrate_payslip_drop_source_filename()


def _init_schema_minimal_sqlite() -> None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.executescript(_MINIMAL_SCHEMA_SQLITE)
            _backfill_installment_lines_if_empty(cur)
            _ensure_minimal_performance_indexes(cur)


def _init_schema_minimal_postgres() -> None:
    stmts = [
        """
        CREATE TABLE IF NOT EXISTS payslip (
            id SERIAL PRIMARY KEY,
            total DOUBLE PRECISION,
            commission DOUBLE PRECISION,
            reimbursement DOUBLE PRECISION,
            medical_reimbursement DOUBLE PRECISION,
            others DOUBLE PRECISION,
            mp2 DOUBLE PRECISION,
            allowances DOUBLE PRECISION,
            period_year INTEGER,
            period_month INTEGER,
            period_half INTEGER,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_payslip_created ON payslip (created_at DESC)
        """,
        """
        CREATE TABLE IF NOT EXISTS installment (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            installment_current INTEGER NOT NULL,
            installment_total INTEGER NOT NULL,
            principal DOUBLE PRECISION NOT NULL,
            interest DOUBLE PRECISION,
            payment_total DOUBLE PRECISION NOT NULL,
            start_date TEXT NOT NULL,
            finish_date TEXT NOT NULL,
            remaining DOUBLE PRECISION NOT NULL,
            original_total DOUBLE PRECISION NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
            CONSTRAINT chk_installment_n CHECK (
                installment_total >= 1
                AND installment_current >= 1
                AND installment_current <= installment_total + 1
            ),
            CONSTRAINT chk_installment_amounts CHECK (payment_total > 0 AND remaining >= 0)
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_installment_created ON installment (created_at DESC)
        """,
        """
        CREATE TABLE IF NOT EXISTS installment_line (
            id SERIAL PRIMARY KEY,
            installment_id INTEGER NOT NULL REFERENCES installment(id) ON DELETE CASCADE,
            seq INTEGER NOT NULL,
            principal DOUBLE PRECISION NOT NULL DEFAULT 0,
            interest DOUBLE PRECISION,
            payment_total DOUBLE PRECISION NOT NULL,
            UNIQUE (installment_id, seq)
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_installment_line_parent
            ON installment_line (installment_id)
        """,
    ]
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            for s in stmts:
                cur.execute(s.strip())
            _backfill_installment_lines_if_empty(cur)
            _ensure_minimal_performance_indexes(cur)


def _init_schema_sqlite() -> None:
    schema_sql = """
    CREATE TABLE IF NOT EXISTS budget_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        row_hash TEXT NOT NULL UNIQUE,
        period TEXT,
        accounts TEXT,
        category TEXT,
        subcategory TEXT,
        note TEXT,
        php REAL,
        income_expense TEXT,
        description TEXT,
        amount REAL,
        currency TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payslip (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total REAL,
        commission REAL,
        reimbursement REAL,
        medical_reimbursement REAL,
        others REAL,
        mp2 REAL,
        allowances REAL,
        period_year INTEGER,
        period_month INTEGER,
        period_half INTEGER,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_payslip_created ON payslip (created_at DESC);

    CREATE TABLE IF NOT EXISTS installment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        installment_current INTEGER NOT NULL,
        installment_total INTEGER NOT NULL,
        principal REAL NOT NULL,
        interest REAL,
        payment_total REAL NOT NULL,
        start_date TEXT NOT NULL,
        finish_date TEXT NOT NULL,
        remaining REAL NOT NULL,
        original_total REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT chk_installment_n CHECK (
            installment_total >= 1
            AND installment_current >= 1
            AND installment_current <= installment_total + 1
        ),
        CONSTRAINT chk_installment_amounts CHECK (payment_total > 0 AND remaining >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_installment_created ON installment (created_at DESC);

    CREATE TABLE IF NOT EXISTS installment_line (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        installment_id INTEGER NOT NULL REFERENCES installment(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        principal REAL NOT NULL DEFAULT 0,
        interest REAL,
        payment_total REAL NOT NULL,
        UNIQUE (installment_id, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_installment_line_parent
        ON installment_line (installment_id);

    CREATE TABLE IF NOT EXISTS recurring_rule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
        frequency TEXT NOT NULL CHECK (
            frequency IN ('monthly', 'weekly', 'quarterly', 'yearly')
        ),
        day_of_month INTEGER,
        weekday INTEGER,
        month_of_year INTEGER,
        accounts TEXT,
        category TEXT,
        subcategory TEXT,
        note TEXT,
        description TEXT,
        amount REAL NOT NULL,
        currency TEXT,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        last_posted_period TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT chk_recurring_monthly CHECK (
            frequency <> 'monthly'
            OR (day_of_month IS NOT NULL AND day_of_month >= 1 AND day_of_month <= 31)
        ),
        CONSTRAINT chk_recurring_weekly CHECK (
            frequency <> 'weekly'
            OR (weekday IS NOT NULL AND weekday >= 0 AND weekday <= 6)
        ),
        CONSTRAINT chk_recurring_quarterly CHECK (
            frequency <> 'quarterly'
            OR (day_of_month IS NOT NULL AND day_of_month >= 1 AND day_of_month <= 31)
        ),
        CONSTRAINT chk_recurring_yearly CHECK (
            frequency <> 'yearly'
            OR (
                day_of_month IS NOT NULL
                AND day_of_month >= 1
                AND day_of_month <= 31
                AND month_of_year IS NOT NULL
                AND month_of_year >= 1
                AND month_of_year <= 12
            )
        )
    );
    CREATE INDEX IF NOT EXISTS idx_recurring_rule_active
        ON recurring_rule (is_active) WHERE is_active != 0;

    CREATE TABLE IF NOT EXISTS category_catalog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1)),
        hide_from_data_preview INTEGER NOT NULL DEFAULT 0 CHECK (hide_from_data_preview IN (0, 1)),
        kind TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense', 'income', 'mixed')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS subcategory_catalog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL REFERENCES category_catalog(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (category_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_subcategory_catalog_cat
        ON subcategory_catalog (category_id);

    CREATE TABLE IF NOT EXISTS category_catalog_removed (
        name TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS subcategory_catalog_removed (
        parent_category_name TEXT NOT NULL,
        name TEXT NOT NULL,
        PRIMARY KEY (parent_category_name, name)
    );

    CREATE TABLE IF NOT EXISTS user_ui_preferences (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    """
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.executescript(schema_sql)
            cur.execute(
                """
                INSERT OR IGNORE INTO user_ui_preferences (id, data)
                VALUES (1, '{}')
                """
            )
            _backfill_installment_lines_if_empty(cur)
            _purge_reserved_accounts_category_rows(cur)
            _ensure_category_catalog_hide_from_preview_column(cur)
            _seed_category_catalog_from_budget_data(cur)
            _ensure_performance_indexes(cur)


def _init_schema_postgres() -> None:
    """Create application tables on PostgreSQL (idempotent)."""
    stmts = [
        """
        CREATE TABLE IF NOT EXISTS budget_data (
            id SERIAL PRIMARY KEY,
            row_hash TEXT NOT NULL UNIQUE,
            period TEXT,
            accounts TEXT,
            category TEXT,
            subcategory TEXT,
            note TEXT,
            php DOUBLE PRECISION,
            income_expense TEXT,
            description TEXT,
            amount DOUBLE PRECISION,
            currency TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS payslip (
            id SERIAL PRIMARY KEY,
            total DOUBLE PRECISION,
            commission DOUBLE PRECISION,
            reimbursement DOUBLE PRECISION,
            medical_reimbursement DOUBLE PRECISION,
            others DOUBLE PRECISION,
            mp2 DOUBLE PRECISION,
            allowances DOUBLE PRECISION,
            period_year INTEGER,
            period_month INTEGER,
            period_half INTEGER,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_payslip_created ON payslip (created_at DESC)
        """,
        """
        CREATE TABLE IF NOT EXISTS installment (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            installment_current INTEGER NOT NULL,
            installment_total INTEGER NOT NULL,
            principal DOUBLE PRECISION NOT NULL,
            interest DOUBLE PRECISION,
            payment_total DOUBLE PRECISION NOT NULL,
            start_date TEXT NOT NULL,
            finish_date TEXT NOT NULL,
            remaining DOUBLE PRECISION NOT NULL,
            original_total DOUBLE PRECISION NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
            CONSTRAINT chk_installment_n CHECK (
                installment_total >= 1
                AND installment_current >= 1
                AND installment_current <= installment_total + 1
            ),
            CONSTRAINT chk_installment_amounts CHECK (payment_total > 0 AND remaining >= 0)
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_installment_created ON installment (created_at DESC)
        """,
        """
        CREATE TABLE IF NOT EXISTS installment_line (
            id SERIAL PRIMARY KEY,
            installment_id INTEGER NOT NULL REFERENCES installment(id) ON DELETE CASCADE,
            seq INTEGER NOT NULL,
            principal DOUBLE PRECISION NOT NULL DEFAULT 0,
            interest DOUBLE PRECISION,
            payment_total DOUBLE PRECISION NOT NULL,
            UNIQUE (installment_id, seq)
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_installment_line_parent
            ON installment_line (installment_id)
        """,
        """
        CREATE TABLE IF NOT EXISTS recurring_rule (
            id SERIAL PRIMARY KEY,
            label TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
            frequency TEXT NOT NULL CHECK (
                frequency IN ('monthly', 'weekly', 'quarterly', 'yearly')
            ),
            day_of_month INTEGER,
            weekday INTEGER,
            month_of_year INTEGER,
            accounts TEXT,
            category TEXT,
            subcategory TEXT,
            note TEXT,
            description TEXT,
            amount DOUBLE PRECISION NOT NULL,
            currency TEXT,
            is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
            last_posted_period TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
            CONSTRAINT chk_recurring_monthly CHECK (
                frequency <> 'monthly'
                OR (day_of_month IS NOT NULL AND day_of_month >= 1 AND day_of_month <= 31)
            ),
            CONSTRAINT chk_recurring_weekly CHECK (
                frequency <> 'weekly'
                OR (weekday IS NOT NULL AND weekday >= 0 AND weekday <= 6)
            ),
            CONSTRAINT chk_recurring_quarterly CHECK (
                frequency <> 'quarterly'
                OR (day_of_month IS NOT NULL AND day_of_month >= 1 AND day_of_month <= 31)
            ),
            CONSTRAINT chk_recurring_yearly CHECK (
                frequency <> 'yearly'
                OR (
                    day_of_month IS NOT NULL
                    AND day_of_month >= 1
                    AND day_of_month <= 31
                    AND month_of_year IS NOT NULL
                    AND month_of_year >= 1
                    AND month_of_year <= 12
                )
            )
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_recurring_rule_active
            ON recurring_rule (is_active) WHERE is_active != 0
        """,
        """
        CREATE TABLE IF NOT EXISTS category_catalog (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1)),
            hide_from_data_preview INTEGER NOT NULL DEFAULT 0 CHECK (hide_from_data_preview IN (0, 1)),
            kind TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense', 'income', 'mixed')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS subcategory_catalog (
            id SERIAL PRIMARY KEY,
            category_id INTEGER NOT NULL REFERENCES category_catalog(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
            UNIQUE (category_id, name)
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_subcategory_catalog_cat
            ON subcategory_catalog (category_id)
        """,
        """
        CREATE TABLE IF NOT EXISTS category_catalog_removed (
            name TEXT PRIMARY KEY
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS subcategory_catalog_removed (
            parent_category_name TEXT NOT NULL,
            name TEXT NOT NULL,
            PRIMARY KEY (parent_category_name, name)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS user_ui_preferences (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data TEXT NOT NULL DEFAULT '{}',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
        )
        """,
    ]
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            for s in stmts:
                cur.execute(s.strip())
            cur.execute(
                """
                INSERT INTO user_ui_preferences (id, data)
                VALUES (1, '{}')
                ON CONFLICT (id) DO NOTHING
                """
            )
            _backfill_installment_lines_if_empty(cur)
            _purge_reserved_accounts_category_rows(cur)
            _ensure_category_catalog_hide_from_preview_column(cur)
            _seed_category_catalog_from_budget_data(cur)
            _ensure_performance_indexes(cur)


def insert_payslip(
    total: float | None,
    commission: float | None,
    reimbursement: float | None,
    medical_reimbursement: float | None,
    others: float | None,
    mp2: float | None,
    allowances: float | None,
    period_year: int | None,
    period_month: int | None,
    period_half: int | None,
    notes: str | None,
) -> int:
    """Insert one payslip row; returns new id."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO payslip (
                    total, commission, reimbursement,
                    medical_reimbursement, others, mp2, allowances,
                    period_year, period_month, period_half, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """,
                (
                    total,
                    commission,
                    reimbursement,
                    medical_reimbursement,
                    others,
                    mp2,
                    allowances,
                    period_year,
                    period_month,
                    period_half,
                    notes,
                ),
            )
            row = cur.fetchone()
            return int(row[0])


def list_payslips(limit: int = 200) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 2000))
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT id, total, commission, reimbursement,
                       medical_reimbursement, others, mp2, allowances,
                       period_year, period_month, period_half, notes,
                       created_at
                FROM payslip
                ORDER BY period_year DESC NULLS LAST,
                         period_month DESC NULLS LAST,
                         period_half DESC NULLS LAST,
                         created_at DESC
                LIMIT ?
                """,
                (limit,),
            )
            cols = [d[0] for d in cur.description]
            out: list[dict[str, Any]] = []
            for r in cur.fetchall():
                out.append(dict(zip(cols, r)))
            return out


def get_payslip(payslip_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT id, total, commission, reimbursement,
                       medical_reimbursement, others, mp2, allowances,
                       period_year, period_month, period_half, notes,
                       created_at
                FROM payslip
                WHERE id = ?
                """,
                (payslip_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            cols = [d[0] for d in cur.description]
            return dict(zip(cols, row))


def update_payslip(
    payslip_id: int,
    total: float | None,
    commission: float | None,
    reimbursement: float | None,
    medical_reimbursement: float | None,
    others: float | None,
    mp2: float | None,
    allowances: float | None,
    period_year: int | None,
    period_month: int | None,
    period_half: int | None,
    notes: str | None,
) -> bool:
    """Update row by id. Returns False if no row matched."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE payslip SET
                    total = ?,
                    commission = ?,
                    reimbursement = ?,
                    medical_reimbursement = ?,
                    others = ?,
                    mp2 = ?,
                    allowances = ?,
                    period_year = ?,
                    period_month = ?,
                    period_half = ?,
                    notes = ?
                WHERE id = ?
                """,
                (
                    total,
                    commission,
                    reimbursement,
                    medical_reimbursement,
                    others,
                    mp2,
                    allowances,
                    period_year,
                    period_month,
                    period_half,
                    notes,
                    payslip_id,
                ),
            )
            return cur.rowcount > 0


def delete_payslip(payslip_id: int) -> bool:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("DELETE FROM payslip WHERE id = ?", (payslip_id,))
            return cur.rowcount > 0


def list_installments(limit: int = 500) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 2000))
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT i.id, i.name, i.installment_current, i.installment_total,
                       i.principal, i.interest, i.payment_total, i.start_date, i.finish_date,
                       i.remaining, i.original_total, i.created_at,
                       COALESCE(il.payment_total, i.payment_total) AS due_payment
                FROM installment i
                LEFT JOIN installment_line il
                    ON il.installment_id = i.id AND il.seq = i.installment_current
                ORDER BY i.finish_date ASC, i.name ASC
                LIMIT ?
                """,
                (limit,),
            )
            cols = [d[0] for d in cur.description]
            out: list[dict[str, Any]] = []
            for r in cur.fetchall():
                out.append(dict(zip(cols, r)))
            return out


def get_installment(installment_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT id, name, installment_current, installment_total,
                       principal, interest, payment_total, start_date, finish_date,
                       remaining, original_total, created_at
                FROM installment WHERE id = ?
                """,
                (installment_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            cols = [d[0] for d in cur.description]
            return dict(zip(cols, row))


def insert_installment(
    name: str,
    installment_current: int,
    installment_total: int,
    principal: float,
    interest: float | None,
    payment_total: float,
    start_date: Any,
    finish_date: Any,
    remaining: float,
    original_total: float,
) -> int:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO installment (
                    name, installment_current, installment_total,
                    principal, interest, payment_total,
                    start_date, finish_date, remaining, original_total
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """,
                (
                    name,
                    installment_current,
                    installment_total,
                    principal,
                    interest,
                    payment_total,
                    start_date,
                    finish_date,
                    remaining,
                    original_total,
                ),
            )
            row = cur.fetchone()
            iid = int(row[0])
            _seed_installment_lines(cur, iid, installment_total, principal, interest)
            _recompute_installment_aggregates(cur, iid)
            return iid


def _line_payment_total(principal: float, interest: float | None) -> float:
    return float(principal) + (float(interest) if interest is not None else 0.0)


def _seed_installment_lines(
    cur: Any,
    installment_id: int,
    installment_total: int,
    principal: float,
    interest: float | None,
) -> None:
    ptot = _line_payment_total(principal, interest)
    for seq in range(1, int(installment_total) + 1):
        cur.execute(
            """
            INSERT INTO installment_line (installment_id, seq, principal, interest, payment_total)
            VALUES (?, ?, ?, ?, ?)
            """,
            (installment_id, seq, principal, interest, ptot),
        )


def list_installment_lines(installment_id: int) -> list[dict[str, Any]]:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT seq, principal, interest, payment_total
                FROM installment_line
                WHERE installment_id = ?
                ORDER BY seq ASC
                """,
                (installment_id,),
            )
            cols = [d[0] for d in cur.description]
            out: list[dict[str, Any]] = []
            for r in cur.fetchall():
                out.append(dict(zip(cols, r)))
            return out


def _recompute_installment_aggregates(cur: Any, installment_id: int) -> None:
    cur.execute(
        "SELECT installment_current FROM installment WHERE id = ?",
        (installment_id,),
    )
    row = cur.fetchone()
    if not row:
        return
    current = int(row[0])
    cur.execute(
        """
        SELECT COALESCE(SUM(payment_total), 0)
        FROM installment_line WHERE installment_id = ?
        """,
        (installment_id,),
    )
    orig = float(cur.fetchone()[0])
    cur.execute(
        """
        SELECT COALESCE(SUM(payment_total), 0)
        FROM installment_line
        WHERE installment_id = ? AND seq >= ?
        """,
        (installment_id, current),
    )
    rem = float(cur.fetchone()[0])
    cur.execute(
        """
        SELECT principal, interest, payment_total FROM installment_line
        WHERE installment_id = ? AND seq = ?
        """,
        (installment_id, current),
    )
    ln = cur.fetchone()
    if ln:
        p, i, pt = ln[0], ln[1], float(ln[2])
        cur.execute(
            """
            UPDATE installment SET
                original_total = ?,
                remaining = ?,
                principal = ?,
                interest = ?,
                payment_total = ?
            WHERE id = ?
            """,
            (orig, rem, p, i, pt, installment_id),
        )
    else:
        cur.execute(
            """
            UPDATE installment SET original_total = ?, remaining = ?
            WHERE id = ?
            """,
            (orig, rem, installment_id),
        )


def update_installment_line(
    installment_id: int,
    seq: int,
    principal: float,
    interest: float | None,
) -> bool:
    """Update one schedule row; recomputes parent totals."""
    ptot = _line_payment_total(principal, interest)
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE installment_line SET
                    principal = ?,
                    interest = ?,
                    payment_total = ?
                WHERE installment_id = ? AND seq = ?
                """,
                (principal, interest, ptot, installment_id, seq),
            )
            if cur.rowcount == 0:
                return False
            _recompute_installment_aggregates(cur, installment_id)
            return True


def _resync_installment_lines_on_total_change(
    cur: Any,
    installment_id: int,
    new_total: int,
    principal: float,
    interest: float | None,
) -> None:
    ptot = _line_payment_total(principal, interest)
    cur.execute(
        "DELETE FROM installment_line WHERE installment_id = ? AND seq > ?",
        (installment_id, new_total),
    )
    for seq in range(1, int(new_total) + 1):
        cur.execute(
            """
            INSERT INTO installment_line (installment_id, seq, principal, interest, payment_total)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (installment_id, seq) DO UPDATE SET
                principal = excluded.principal,
                interest = excluded.interest,
                payment_total = excluded.payment_total
            """,
            (installment_id, seq, principal, interest, ptot),
        )


def update_installment(
    installment_id: int,
    name: str,
    installment_current: int,
    installment_total: int,
    principal: float,
    interest: float | None,
    payment_total: float,
    start_date: Any,
    finish_date: Any,
    remaining: float,
    original_total: float,
) -> bool:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "SELECT installment_total FROM installment WHERE id = ?",
                (installment_id,),
            )
            old = cur.fetchone()
            old_total = int(old[0]) if old else 0
            cur.execute(
                """
                UPDATE installment SET
                    name = ?,
                    installment_current = ?,
                    installment_total = ?,
                    principal = ?,
                    interest = ?,
                    payment_total = ?,
                    start_date = ?,
                    finish_date = ?,
                    remaining = ?,
                    original_total = ?
                WHERE id = ?
                """,
                (
                    name,
                    installment_current,
                    installment_total,
                    principal,
                    interest,
                    payment_total,
                    start_date,
                    finish_date,
                    remaining,
                    original_total,
                    installment_id,
                ),
            )
            if cur.rowcount == 0:
                return False
            cur.execute(
                "SELECT COUNT(*) FROM installment_line WHERE installment_id = ?",
                (installment_id,),
            )
            has_lines = int(cur.fetchone()[0]) > 0
            if has_lines and old_total != int(installment_total):
                _resync_installment_lines_on_total_change(
                    cur, installment_id, installment_total, principal, interest
                )
            if has_lines:
                _recompute_installment_aggregates(cur, installment_id)
            return True


def delete_installment(installment_id: int) -> bool:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("DELETE FROM installment WHERE id = ?", (installment_id,))
            return cur.rowcount > 0


def installment_apply_payment(installment_id: int) -> dict[str, Any] | None:
    """
    Record one installment payment: advances current; remaining comes from line sums.
    """
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT id, installment_current, installment_total, payment_total, remaining
                FROM installment WHERE id = ?
                """,
                (installment_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            _id, cur_n, total_n, pay, rem = row
            if cur_n > total_n or rem <= 0:
                return None
            new_cur = int(cur_n) + 1
            cur.execute(
                "SELECT COUNT(*) FROM installment_line WHERE installment_id = ?",
                (installment_id,),
            )
            has_lines = int(cur.fetchone()[0]) > 0
            cur.execute(
                """
                UPDATE installment SET installment_current = ? WHERE id = ?
                """,
                (new_cur, installment_id),
            )
            if has_lines:
                _recompute_installment_aggregates(cur, installment_id)
            else:
                new_rem = max(0.0, float(rem) - float(pay))
                cur.execute(
                    "UPDATE installment SET remaining = ? WHERE id = ?",
                    (new_rem, installment_id),
                )
            cur.execute(
                """
                SELECT id, name, installment_current, installment_total,
                       principal, interest, payment_total, start_date, finish_date,
                       remaining, original_total, created_at
                FROM installment WHERE id = ?
                """,
                (installment_id,),
            )
            r2 = cur.fetchone()
            cols = [d[0] for d in cur.description]
            return dict(zip(cols, r2))


def _normalize_excel_text_cell(value: Any) -> str | None:
    """Strip leading/trailing space on import so e.g. Accounts 'Cash Savings' and 'Cash Savings ' match."""
    if pd.isna(value):
        return None
    s = str(value).strip()
    return s if s else None


def compute_row_hash(row: pd.Series, excel_columns: list[str]) -> str:
    payload: list[Any] = []
    for c in excel_columns:
        v = row.get(c)
        if pd.isna(v):
            payload.append(None)
        elif isinstance(v, pd.Timestamp):
            payload.append(v.isoformat())
        elif isinstance(v, dt_module.datetime):
            payload.append(v.isoformat())
        elif isinstance(v, (int, float)) and not isinstance(v, bool):
            payload.append(float(v))
        else:
            payload.append(_normalize_excel_text_cell(v))
    canonical = json.dumps(payload, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def empty_workbook_placeholder() -> dict[str, pd.DataFrame]:
    """When the database has no rows, expose one empty sheet so APIs can still run."""
    cols = ["id"] + EXPECTED_EXCEL_COLS
    return {WORKBOOK_SHEET_KEY: pd.DataFrame(columns=cols)}


def _db_row_to_excel_series(
    period: Any,
    accounts: str | None,
    category: str | None,
    subcategory: str | None,
    note: str | None,
    php: float | None,
    income_expense: str | None,
    description: str | None,
    amount: float | None,
    currency: str | None,
) -> pd.Series:
    """Build a Series matching Excel column names for hashing."""
    data: dict[str, Any] = {}
    for excel_name, sql_name in EXCEL_TO_SQL:
        if sql_name == "period":
            data[excel_name] = period
        elif sql_name == "accounts":
            data[excel_name] = accounts
        elif sql_name == "category":
            data[excel_name] = category
        elif sql_name == "subcategory":
            data[excel_name] = subcategory
        elif sql_name == "note":
            data[excel_name] = note
        elif sql_name == "php":
            data[excel_name] = php
        elif sql_name == "income_expense":
            data[excel_name] = income_expense
        elif sql_name == "description":
            data[excel_name] = description
        elif sql_name == "amount":
            data[excel_name] = amount
        elif sql_name == "currency":
            data[excel_name] = currency
    return pd.Series(data)


def canonicalize_account_label(cur: Any, proposed: str | None) -> str | None:
    """
    Reuse an existing `accounts` cell value when it matches after trim + case-fold,
    so new transactions don't split balances across 'Chase', 'chase', and ' Chase '.
    Prefers the spelling from the most recently inserted matching row (ORDER BY id DESC).
    """
    if proposed is None:
        return None
    t = str(proposed).strip()
    if not t:
        return None
    cur.execute(
        """
        SELECT accounts FROM budget_data
        WHERE accounts IS NOT NULL
          AND LOWER(TRIM(accounts)) = LOWER(?)
        ORDER BY id DESC
        LIMIT 1
        """,
        (t,),
    )
    row = cur.fetchone()
    if row and row[0] is not None:
        return str(row[0])
    return t


def insert_budget_transaction(
    *,
    period: Any = None,
    accounts: str | None = None,
    category: str | None = None,
    subcategory: str | None = None,
    note: str | None = None,
    php: float | None = None,
    income_expense: str | None = None,
    description: str | None = None,
    amount: float | None = None,
    currency: str | None = None,
) -> int:
    """Insert one row; uses a random row_hash so it never collides with Excel imports."""
    row_hash = secrets.token_hex(32)
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            acc = canonicalize_account_label(cur, accounts)
            cur.execute(
                """
                INSERT INTO budget_data (row_hash, period, accounts, category,
                  subcategory, note, php, income_expense, description, amount, currency)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """,
                (
                    row_hash,
                    period,
                    acc,
                    category,
                    subcategory,
                    note,
                    php,
                    income_expense,
                    description,
                    amount,
                    currency,
                ),
            )
            row = cur.fetchone()
            return int(row[0])


def insert_budget_transfer(
    *,
    period: Any = None,
    from_account: str,
    to_account: str,
    category: str | None = None,
    subcategory: str | None = None,
    note: str | None = None,
    php: float | None = None,
    amount: float | None = None,
    currency: str | None = None,
    description_out: str | None = None,
    description_in: str | None = None,
    transfer_fee: float | None = None,
) -> tuple[int, int, int | None]:
    """
    Two rows: Transfer-Out from `from_account`, Transfer-In to `to_account`.
    Same amount magnitude for both (classification uses absolute amount).
    Optional `transfer_fee`: extra Expense row on `from_account` (e.g. bank fee).
    """
    id_out = insert_budget_transaction(
        period=period,
        accounts=from_account,
        category=category,
        subcategory=subcategory,
        note=note,
        php=php,
        income_expense="Transfer-Out",
        description=description_out,
        amount=amount,
        currency=currency,
    )
    id_in = insert_budget_transaction(
        period=period,
        accounts=to_account,
        category=category,
        subcategory=subcategory,
        note=note,
        php=php,
        income_expense="Transfer-In",
        description=description_in,
        amount=amount,
        currency=currency,
    )
    id_fee: int | None = None
    if transfer_fee is not None and transfer_fee > 0:
        fee_cat = (category or "").strip() or "Transfer fee"
        fee_desc = f"Transfer fee (→ {to_account})"
        id_fee = insert_budget_transaction(
            period=period,
            accounts=from_account,
            category=fee_cat,
            subcategory=subcategory,
            note=note,
            php=php,
            income_expense="Expense",
            description=fee_desc,
            amount=transfer_fee,
            currency=currency,
        )
    return id_out, id_in, id_fee


def delete_budget_transaction(transaction_id: int) -> bool:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("DELETE FROM budget_data WHERE id = ?", (transaction_id,))
            return cur.rowcount > 0


# SQL column names allowed in PATCH bodies (values merged onto current row).
_BUDGET_PATCH_KEYS = frozenset(
    {
        "period",
        "accounts",
        "category",
        "subcategory",
        "note",
        "php",
        "income_expense",
        "description",
        "amount",
        "currency",
    }
)


def _update_budget_transaction_with_cursor(
    cur: Any, transaction_id: int, updates: dict[str, Any]
) -> bool:
    """Merge `updates` onto the row; recompute hash. Uses existing cursor (one transaction)."""
    if not updates:
        return False
    bad = set(updates) - _BUDGET_PATCH_KEYS
    if bad:
        raise ValueError(f"Unknown fields: {sorted(bad)}")
    cur.execute(
        """
        SELECT id, period, accounts, category, subcategory, note, php,
          income_expense, description, amount, currency
        FROM budget_data WHERE id = ?
        """,
        (transaction_id,),
    )
    row = cur.fetchone()
    if not row:
        return False
    (
        _id,
        cur_period,
        cur_accounts,
        cur_category,
        cur_subcategory,
        cur_note,
        cur_php,
        cur_ie,
        cur_desc,
        cur_amount,
        cur_currency,
    ) = row

    cur_map: dict[str, Any] = {
        "period": cur_period,
        "accounts": cur_accounts,
        "category": cur_category,
        "subcategory": cur_subcategory,
        "note": cur_note,
        "php": cur_php,
        "income_expense": cur_ie,
        "description": cur_desc,
        "amount": cur_amount,
        "currency": cur_currency,
    }
    cur_map.update(updates)
    if cur_map.get("accounts") is not None:
        cur_map["accounts"] = canonicalize_account_label(cur, cur_map["accounts"])

    series = _db_row_to_excel_series(
        cur_map["period"],
        cur_map["accounts"],
        cur_map["category"],
        cur_map["subcategory"],
        cur_map["note"],
        cur_map["php"],
        cur_map["income_expense"],
        cur_map["description"],
        cur_map["amount"],
        cur_map["currency"],
    )
    new_hash = compute_row_hash(series, EXPECTED_EXCEL_COLS)
    cur.execute(
        "SELECT id FROM budget_data WHERE row_hash = ? AND id <> ?",
        (new_hash, transaction_id),
    )
    if cur.fetchone():
        raise ValueError(
            "Update would duplicate another row's content (row hash collision)."
        )

    cur.execute(
        """
        UPDATE budget_data SET
          row_hash = ?,
          period = ?,
          accounts = ?,
          category = ?,
          subcategory = ?,
          note = ?,
          php = ?,
          income_expense = ?,
          description = ?,
          amount = ?,
          currency = ?
        WHERE id = ?
        """,
        (
            new_hash,
            cur_map["period"],
            cur_map["accounts"],
            cur_map["category"],
            cur_map["subcategory"],
            cur_map["note"],
            cur_map["php"],
            cur_map["income_expense"],
            cur_map["description"],
            cur_map["amount"],
            cur_map["currency"],
            transaction_id,
        ),
    )
    return cur.rowcount > 0


def update_budget_transaction(transaction_id: int, updates: dict[str, Any]) -> bool:
    """Merge `updates` onto the existing row; recomputes row_hash from the full row."""
    if not updates:
        return False
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            return _update_budget_transaction_with_cursor(cur, transaction_id, updates)


def list_distinct_budget_accounts() -> list[str]:
    """Non-empty distinct Accounts values in `budget_data`, sorted for display."""
    if not use_database():
        return []
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT DISTINCT accounts FROM budget_data
                WHERE accounts IS NOT NULL AND TRIM(accounts) <> ''
                """
            )
            rows = [str(r[0]) for r in cur.fetchall()]
            rows.sort(key=lambda s: (s.lower(), s))
            return rows


def list_distinct_budget_currencies() -> list[str]:
    """Non-empty distinct Currency values in `budget_data`, sorted for display."""
    if not use_database():
        return []
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT DISTINCT currency FROM budget_data
                WHERE currency IS NOT NULL AND TRIM(currency) <> ''
                """
            )
            rows = [str(r[0]) for r in cur.fetchall()]
            rows.sort(key=lambda s: (s.lower(), s))
            return rows


def clear_budget_accounts_label(label: str) -> tuple[int, int]:
    """
    Clear the Accounts field on all matching rows (case-insensitive trim match).
    Rows stay in `budget_data`; recurring rules with the same account label are cleared too.
    Returns (budget_rows_updated, recurring_rules_updated).
    One DB transaction for all updates (fast path vs per-row connections).
    """
    t = (label or "").strip()
    if not t:
        raise ValueError("Account label is required")
    if not use_database():
        raise RuntimeError("DATABASE_URL is not set")
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT id FROM budget_data
                WHERE accounts IS NOT NULL
                  AND LOWER(TRIM(accounts)) = LOWER(?)
                ORDER BY id
                """,
                (t,),
            )
            ids = [int(r[0]) for r in cur.fetchall()]
            n_budget = 0
            for tid in ids:
                if _update_budget_transaction_with_cursor(cur, tid, {"accounts": None}):
                    n_budget += 1
            cur.execute(
                """
                UPDATE recurring_rule SET accounts = NULL
                WHERE accounts IS NOT NULL
                  AND LOWER(TRIM(accounts)) = LOWER(?)
                """,
                (t,),
            )
            n_rec = cur.rowcount
    return n_budget, n_rec


def clear_budget_currency_label(label: str) -> tuple[int, int]:
    """
    Clear the Currency field on all matching rows (case-insensitive trim match).
    Rows stay in `budget_data`; recurring rules with the same currency are cleared too.
    Returns (budget_rows_updated, recurring_rules_updated).
    One DB transaction for all updates.
    """
    t = (label or "").strip()
    if not t:
        raise ValueError("Currency label is required")
    if not use_database():
        raise RuntimeError("DATABASE_URL is not set")
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT id FROM budget_data
                WHERE currency IS NOT NULL
                  AND LOWER(TRIM(currency)) = LOWER(?)
                ORDER BY id
                """,
                (t,),
            )
            ids = [int(r[0]) for r in cur.fetchall()]
            n_budget = 0
            for tid in ids:
                if _update_budget_transaction_with_cursor(cur, tid, {"currency": None}):
                    n_budget += 1
            cur.execute(
                """
                UPDATE recurring_rule SET currency = NULL
                WHERE currency IS NOT NULL
                  AND LOWER(TRIM(currency)) = LOWER(?)
                """,
                (t,),
            )
            n_rec = cur.rowcount
    return n_budget, n_rec


def rename_budget_accounts_label(old_label: str, new_label: str) -> tuple[int, int]:
    """
    Rename Accounts across `budget_data` and `recurring_rule` (trim, case-insensitive match for old).
    Recomputes row_hash per row. Returns (budget_rows_updated, recurring_rules_updated).
    """
    old_t = (old_label or "").strip()
    new_t = (new_label or "").strip()
    if not new_t:
        raise ValueError("New account name is required")
    # old_t may be "" to rename blank / whitespace-only Accounts values
    if old_t.lower() == new_t.lower():
        return 0, 0
    if not use_database():
        raise RuntimeError("DATABASE_URL is not set")
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT id FROM budget_data
                WHERE accounts IS NOT NULL
                  AND LOWER(TRIM(accounts)) = LOWER(?)
                ORDER BY id
                """,
                (old_t,),
            )
            ids = [int(r[0]) for r in cur.fetchall()]
            n_budget = 0
            for tid in ids:
                if _update_budget_transaction_with_cursor(cur, tid, {"accounts": new_t}):
                    n_budget += 1
            cur.execute(
                """
                UPDATE recurring_rule SET accounts = ?
                WHERE accounts IS NOT NULL
                  AND LOWER(TRIM(accounts)) = LOWER(?)
                """,
                (new_t, old_t),
            )
            n_rec = cur.rowcount
    return n_budget, n_rec


def _row_to_values(row_hash: str, row: pd.Series) -> tuple[Any, ...]:
    vals: list[Any] = [row_hash]
    for excel_name, sql_name in EXCEL_TO_SQL:
        v = row.get(excel_name)
        if pd.isna(v):
            vals.append(None)
            continue
        if excel_name == "Period":
            if isinstance(v, pd.Timestamp):
                vals.append(v.to_pydatetime())
            else:
                ts = pd.to_datetime(v, errors="coerce")
                vals.append(None if pd.isna(ts) else ts.to_pydatetime())
        elif sql_name in ("php", "amount"):
            try:
                vals.append(float(v))
            except (TypeError, ValueError):
                vals.append(None)
        else:
            vals.append(_normalize_excel_text_cell(v))
    return tuple(vals)


def _drop_ignored_excel_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Remove legacy columns so `_validate_excel_columns` accepts older .xlsx files."""
    to_drop = [c for c in df.columns if str(c) in IGNORED_LEGACY_EXCEL_COLS]
    if not to_drop:
        return df
    return df.drop(columns=to_drop, errors="ignore")


def _validate_excel_columns(columns: list[str]) -> None:
    s, e = set(columns), set(EXPECTED_EXCEL_COLS)
    if s != e:
        missing = sorted(e - s)
        extra = sorted(s - e)
        msg = "Excel columns must match the fixed template."
        if missing:
            msg += f" Missing: {missing}."
        if extra:
            msg += f" Unexpected: {extra}."
        raise ValueError(msg)


@dataclass
class SyncResult:
    inserted: int
    skipped: int
    sheets: list[str]


def sync_excel_to_db(path: Path) -> SyncResult:
    """Replace all workbook rows with the contents of the Excel file.

    Clears `budget_data` first, then inserts every row from each sheet.
    Rows identical within the same file (same row hash) are inserted once;
    duplicates after the first are counted as skipped.
    """
    xl = pd.ExcelFile(path)
    inserted_total = 0
    skipped_total = 0
    sheets_out: list[str] = []

    insert_sql = """
    INSERT INTO budget_data (row_hash, period, accounts, category, subcategory,
      note, php, income_expense, description, amount, currency)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """

    with get_connection() as conn:
        with db_cursor(conn) as cur:
            if storage_kind() == "postgres":
                cur.execute(
                    "TRUNCATE budget_data RESTART IDENTITY CASCADE"
                )
            else:
                cur.execute("DELETE FROM budget_data")
                cur.execute("DELETE FROM sqlite_sequence WHERE name = 'budget_data'")

            # row_hash is unique; skip later duplicates (any Excel tab).
            seen_hashes: set[str] = set()

            for excel_tab in xl.sheet_names:
                sheets_out.append(excel_tab)
                df = pd.read_excel(xl, sheet_name=excel_tab)
                df.columns = [str(c) for c in df.columns]
                df = _drop_ignored_excel_columns(df)
                _validate_excel_columns(list(df.columns))

                batch: list[tuple[Any, ...]] = []
                for _, row in df.iterrows():
                    rh = compute_row_hash(row, EXPECTED_EXCEL_COLS)
                    batch.append(_row_to_values(rh, row))

                if not batch:
                    continue

                to_insert: list[tuple[Any, ...]] = []
                for b in batch:
                    h = b[0]
                    if h in seen_hashes:
                        skipped_total += 1
                        continue
                    seen_hashes.add(h)
                    to_insert.append(b)

                if to_insert:
                    cur.executemany(insert_sql, to_insert)
                inserted_total += len(to_insert)

    return SyncResult(
        inserted=inserted_total, skipped=skipped_total, sheets=sheets_out
    )


def load_workbook_from_db() -> dict[str, pd.DataFrame]:
    """One logical sheet: all rows use original Excel column names plus id."""
    select_list = "id, " + ", ".join(
        f'{sql_col} AS "{excel_col}"' for excel_col, sql_col in EXCEL_TO_SQL
    )
    with get_connection() as conn:
        q = f"SELECT {select_list} FROM budget_data ORDER BY id"
        # Keep Period as TEXT/object. `parse_dates=["Period"]` forces a single datetime64
        # dtype and turns mixed ISO strings (naive vs +00:00) into NaT — those rows vanish
        # from calendar APIs and serialize as null.
        df = pd.read_sql_query(q, conn)
        if df.empty:
            return empty_workbook_placeholder()
        return {WORKBOOK_SHEET_KEY: df}


# --- user UI preferences (column visibility, hidden facet values, sidebar, account order) ---


def get_user_ui_preferences() -> dict[str, Any]:
    if not use_database():
        return {}
    try:
        with get_connection() as conn:
            with db_cursor(conn) as cur:
                cur.execute("SELECT data FROM user_ui_preferences WHERE id = 1")
                row = cur.fetchone()
                if not row or row[0] is None:
                    return {}
                d = row[0]
                if isinstance(d, dict):
                    return d
                if isinstance(d, str) and d.strip():
                    return json.loads(d)
                return {}
    except Exception:
        return {}


def replace_user_ui_preferences(data: dict[str, Any]) -> None:
    """Replace stored JSON document (single row)."""
    if not use_database():
        raise RuntimeError("DATABASE_URL is not set")
    if not isinstance(data, dict):
        raise ValueError("Preferences must be a JSON object")
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            if storage_kind() == "postgres":
                cur.execute(
                    """
                    INSERT INTO user_ui_preferences (id, data, updated_at)
                    VALUES (1, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT (id) DO UPDATE SET
                        data = EXCLUDED.data,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (json.dumps(data),),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO user_ui_preferences (id, data, updated_at)
                    VALUES (1, ?, datetime('now'))
                    ON CONFLICT (id) DO UPDATE SET
                        data = excluded.data,
                        updated_at = datetime('now')
                    """,
                    (json.dumps(data),),
                )


def budget_data_is_empty() -> bool:
    """True when `budget_data` has no rows (first run before any import)."""
    if not use_database():
        return True
    try:
        with get_connection() as conn:
            with db_cursor(conn) as cur:
                cur.execute("SELECT NOT EXISTS (SELECT 1 FROM budget_data)")
                row = cur.fetchone()
                return bool(row[0]) if row else True
    except Exception:
        return True


def check_connection() -> bool:
    if not use_database():
        return False
    try:
        with get_connection() as conn:
            with db_cursor(conn) as cur:
                cur.execute("SELECT 1")
        return True
    except Exception:
        return False


# --- category / subcategory catalog (managed labels; synced into budget_data on rename) ---


def list_category_catalog_tree() -> list[dict[str, Any]]:
    """List categories with nested subcategories for the settings UI."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT id, name, (COALESCE(is_hidden, 0) <> 0),
                       COALESCE(kind, 'expense'),
                       (COALESCE(hide_from_data_preview, 0) <> 0)
                FROM category_catalog ORDER BY LOWER(name)
                """
            )
            cats = [
                {
                    "id": int(r[0]),
                    "name": r[1],
                    "is_hidden": bool(r[2]),
                    "kind": r[3] if r[3] in ("expense", "income", "mixed") else "expense",
                    "hide_from_data_preview": bool(r[4]),
                    "subcategories": [],
                }
                for r in cur.fetchall()
                if not is_reserved_category_label(r[1])
            ]
            id_to_subs = {c["id"]: c["subcategories"] for c in cats}
            cur.execute(
                """
                SELECT category_id, id, name FROM subcategory_catalog
                ORDER BY category_id, LOWER(name)
                """
            )
            for cid, sid, sname in cur.fetchall():
                lst = id_to_subs.get(int(cid))
                if lst is not None:
                    lst.append({"id": int(sid), "name": sname})
            return cats


def delete_all_mixed_category_catalog_rows() -> int:
    """
    Delete every `category_catalog` row with `kind = 'mixed'`.
    `subcategory_catalog` rows cascade. `budget_data` category strings are unchanged.
    """
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "DELETE FROM category_catalog WHERE kind = 'mixed' RETURNING name"
            )
            deleted = cur.fetchall()
            n = len(deleted)
            for (name,) in deleted:
                if storage_kind() == "postgres":
                    cur.execute(
                        """
                        INSERT INTO category_catalog_removed (name) VALUES (?)
                        ON CONFLICT (name) DO NOTHING
                        """,
                        (name,),
                    )
                else:
                    cur.execute(
                        "INSERT OR IGNORE INTO category_catalog_removed (name) VALUES (?)",
                        (name,),
                    )
    if n:
        from app.workbook_cache import invalidate_cache

        invalidate_cache()
    return n


def create_category(name: str, *, kind: str = "expense") -> int:
    name = (name or "").strip()
    if not name:
        raise ValueError("Category name is required")
    if is_reserved_category_label(name):
        raise ValueError(
            '"Accounts" is reserved for the workbook Accounts column and cannot be used as a category name'
        )
    k = (kind or "expense").strip().lower()
    if k not in ("expense", "income", "mixed"):
        raise ValueError("kind must be expense, income, or mixed")
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            try:
                cur.execute(
                    "INSERT INTO category_catalog (name, kind) VALUES (?, ?) RETURNING id",
                    (name, k),
                )
                row = cur.fetchone()
                cid = int(row[0])
                cur.execute(
                    "DELETE FROM category_catalog_removed WHERE name = ?",
                    (name,),
                )
                return cid
            except Exception as e:
                if not _is_unique_constraint(e):
                    raise
                raise ValueError("A category with this name already exists") from e


def rename_category(category_id: int, new_name: str) -> None:
    new_name = (new_name or "").strip()
    if not new_name:
        raise ValueError("Category name is required")
    if is_reserved_category_label(new_name):
        raise ValueError(
            '"Accounts" is reserved for the workbook Accounts column and cannot be used as a category name'
        )
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "SELECT name FROM category_catalog WHERE id = ?",
                (category_id,),
            )
            row = cur.fetchone()
            if not row:
                raise LookupError("Category not found")
            old_name = row[0]
            if old_name == new_name:
                return
            try:
                cur.execute(
                    "UPDATE category_catalog SET name = ? WHERE id = ?",
                    (new_name, category_id),
                )
            except Exception as e:
                if not _is_unique_constraint(e):
                    raise
                raise ValueError("A category with this name already exists") from e
            cur.execute(
                """
                UPDATE budget_data SET category = ?
                WHERE TRIM(COALESCE(category, '')) = ?
                """,
                (new_name, old_name.strip()),
            )


def set_category_hidden(category_id: int, is_hidden: bool) -> None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE category_catalog SET is_hidden = ? WHERE id = ?
                """,
                (is_hidden, category_id),
            )
            if cur.rowcount == 0:
                raise LookupError("Category not found")


def set_category_hide_from_data_preview(category_id: int, hide: bool) -> None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE category_catalog SET hide_from_data_preview = ? WHERE id = ?
                """,
                (1 if hide else 0, category_id),
            )
            if cur.rowcount == 0:
                raise LookupError("Category not found")


def set_category_kind(category_id: int, kind: str) -> None:
    k = (kind or "").strip().lower()
    if k not in ("expense", "income", "mixed"):
        raise ValueError("kind must be expense, income, or mixed")
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE category_catalog SET kind = ? WHERE id = ?
                """,
                (k, category_id),
            )
            if cur.rowcount == 0:
                raise LookupError("Category not found")


def apply_category_patch(
    category_id: int,
    *,
    new_name: str | None = None,
    is_hidden: bool | None = None,
    hide_from_data_preview: bool | None = None,
    kind: str | None = None,
) -> None:
    """Rename and/or toggle visibility and/or kind."""
    if (
        new_name is None
        and is_hidden is None
        and hide_from_data_preview is None
        and kind is None
    ):
        raise ValueError("No fields to update")
    if new_name is not None:
        rename_category(category_id, new_name)
    if is_hidden is not None:
        set_category_hidden(category_id, is_hidden)
    if hide_from_data_preview is not None:
        set_category_hide_from_data_preview(category_id, hide_from_data_preview)
    if kind is not None:
        set_category_kind(category_id, kind)


def delete_category(category_id: int) -> None:
    """Remove the catalog row only; `budget_data` rows keep their category text."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "DELETE FROM category_catalog WHERE id = ? RETURNING name",
                (category_id,),
            )
            row = cur.fetchone()
            if not row:
                raise LookupError("Category not found")
            cur.execute(
                """
                INSERT INTO category_catalog_removed (name)
                VALUES (?)
                ON CONFLICT (name) DO NOTHING
                """,
                (row[0],),
            )


def create_subcategory(category_id: int, name: str) -> int:
    name = (name or "").strip()
    if not name:
        raise ValueError("Subcategory name is required")
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "SELECT 1 FROM category_catalog WHERE id = ?",
                (category_id,),
            )
            if not cur.fetchone():
                raise LookupError("Category not found")
            try:
                cur.execute(
                    """
                    INSERT INTO subcategory_catalog (category_id, name)
                    VALUES (?, ?) RETURNING id
                    """,
                    (category_id, name),
                )
                row = cur.fetchone()
                sid = int(row[0])
                cur.execute(
                    "SELECT name FROM category_catalog WHERE id = ?",
                    (category_id,),
                )
                prow = cur.fetchone()
                if prow:
                    cur.execute(
                        """
                        DELETE FROM subcategory_catalog_removed
                        WHERE parent_category_name = ? AND name = ?
                        """,
                        (prow[0], name),
                    )
                return sid
            except Exception as e:
                if not _is_unique_constraint(e):
                    raise
                raise ValueError(
                    "A subcategory with this name already exists under this category"
                ) from e


def rename_subcategory(subcategory_id: int, new_name: str) -> None:
    new_name = (new_name or "").strip()
    if not new_name:
        raise ValueError("Subcategory name is required")
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT c.name, s.name
                FROM subcategory_catalog s
                JOIN category_catalog c ON c.id = s.category_id
                WHERE s.id = ?
                """,
                (subcategory_id,),
            )
            row = cur.fetchone()
            if not row:
                raise LookupError("Subcategory not found")
            parent_name, old_sub = row[0], row[1]
            try:
                cur.execute(
                    "UPDATE subcategory_catalog SET name = ? WHERE id = ?",
                    (new_name, subcategory_id),
                )
            except Exception as e:
                if not _is_unique_constraint(e):
                    raise
                raise ValueError(
                    "A subcategory with this name already exists under this category"
                ) from e
            cur.execute(
                """
                UPDATE budget_data SET subcategory = ?
                WHERE TRIM(COALESCE(category, '')) = ?
                  AND TRIM(COALESCE(subcategory, '')) = ?
                """,
                (new_name, parent_name.strip(), old_sub.strip()),
            )


def delete_subcategory(subcategory_id: int) -> None:
    """Remove the catalog row only; `budget_data` rows keep their subcategory text."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT c.name, s.name
                FROM subcategory_catalog s
                JOIN category_catalog c ON c.id = s.category_id
                WHERE s.id = ?
                """,
                (subcategory_id,),
            )
            row = cur.fetchone()
            if not row:
                raise LookupError("Subcategory not found")
            parent_name, sub_name = row[0], row[1]
            cur.execute(
                "DELETE FROM subcategory_catalog WHERE id = ?",
                (subcategory_id,),
            )
            cur.execute(
                """
                INSERT INTO subcategory_catalog_removed (parent_category_name, name)
                VALUES (?, ?)
                ON CONFLICT (parent_category_name, name) DO NOTHING
                """,
                (parent_name, sub_name),
            )


def list_recurring_rules() -> list[dict[str, Any]]:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT id, label, kind, frequency, day_of_month, weekday,
                       month_of_year,
                       accounts, category, subcategory, note, description,
                       amount, currency, is_active, last_posted_period,
                       created_at
                FROM recurring_rule
                ORDER BY id
                """
            )
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]


def insert_recurring_rule(
    *,
    label: str,
    kind: str,
    frequency: str,
    day_of_month: int | None,
    weekday: int | None,
    month_of_year: int | None,
    accounts: str | None,
    category: str | None,
    subcategory: str | None,
    note: str | None,
    description: str | None,
    amount: float,
    currency: str | None,
    is_active: bool = True,
) -> int:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO recurring_rule (
                    label, kind, frequency, day_of_month, weekday, month_of_year,
                    accounts, category, subcategory, note, description,
                    amount, currency, is_active
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """,
                (
                    label,
                    kind,
                    frequency,
                    day_of_month,
                    weekday,
                    month_of_year,
                    accounts,
                    category,
                    subcategory,
                    note,
                    description,
                    amount,
                    currency,
                    is_active,
                ),
            )
            return int(cur.fetchone()[0])


def update_recurring_rule(rule_id: int, fields: dict[str, Any]) -> bool:
    if not fields:
        return False
    allowed = {
        "label",
        "kind",
        "frequency",
        "day_of_month",
        "weekday",
        "month_of_year",
        "accounts",
        "category",
        "subcategory",
        "note",
        "description",
        "amount",
        "currency",
        "is_active",
        "last_posted_period",
    }
    sets: list[str] = []
    vals: list[Any] = []
    for k, v in fields.items():
        if k not in allowed:
            continue
        sets.append(f"{k} = ?")
        vals.append(v)
    if not sets:
        return False
    vals.append(rule_id)
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"UPDATE recurring_rule SET {', '.join(sets)} WHERE id = ?",
                vals,
            )
            return cur.rowcount > 0


def delete_recurring_rule(rule_id: int) -> bool:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("DELETE FROM recurring_rule WHERE id = ?", (rule_id,))
            return cur.rowcount > 0


def get_recurring_rule(rule_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT id, label, kind, frequency, day_of_month, weekday,
                       month_of_year,
                       accounts, category, subcategory, note, description,
                       amount, currency, is_active, last_posted_period, created_at
                FROM recurring_rule WHERE id = ?
                """,
                (rule_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            cols = [d[0] for d in cur.description]
            return dict(zip(cols, row))
