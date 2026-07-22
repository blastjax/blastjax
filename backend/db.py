"""
Payslip and installment storage: PostgreSQL (``DATABASE_URL`` or ``DB_*``).
"""

from __future__ import annotations

import logging
import os
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, quote, quote_plus, urlencode, urlparse, urlunparse

import psycopg2
from psycopg2 import pool
from dotenv import load_dotenv

_log = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parent


def _load_env_files() -> None:
    """Load repo-root `.env` then `backend/.env` (or `/app/.env` in the API image)."""
    for path in (_BACKEND_DIR.parent / ".env", _BACKEND_DIR / ".env"):
        if path.is_file():
            # Prefer values from these files over inherited OS/env vars so local Neon `DB_*`
            # is not shadowed by a leftover machine-level `DATABASE_URL`.
            load_dotenv(path, override=True)


def _rewrite_database_url_for_docker() -> None:
    """
    In Docker, ``127.0.0.1`` / ``localhost`` in ``DATABASE_URL`` point at the container itself.
    When using Compose, Postgres is reachable as ``db:5432``. Rewrite so one root ``.env``
    can keep ``@127.0.0.1:5433`` for local ``uvicorn`` while ``docker compose`` still works.
    """
    if not Path("/.dockerenv").exists():
        return
    raw = (os.environ.get("DATABASE_URL") or "").strip()
    if not raw:
        return
    low = raw.lower()
    if not (low.startswith("postgresql:") or low.startswith("postgres:")):
        return
    parsed = urlparse(raw)
    host = (parsed.hostname or "").lower()
    if host not in ("127.0.0.1", "localhost"):
        return
    user = parsed.username or ""
    password = parsed.password or ""
    if user and password:
        netloc = f"{quote_plus(user)}:{quote_plus(password)}@db:5432"
    elif user:
        netloc = f"{quote_plus(user)}@db:5432"
    elif password:
        netloc = f":{quote_plus(password)}@db:5432"
    else:
        netloc = "db:5432"
    new_url = urlunparse(
        (
            parsed.scheme,
            netloc,
            parsed.path or "",
            parsed.params,
            parsed.query,
            parsed.fragment,
        )
    )
    os.environ["DATABASE_URL"] = new_url
    _log.debug(
        "Docker: DATABASE_URL host %s → db:5432 (same credentials and database path)",
        host,
    )


_load_env_files()
_rewrite_database_url_for_docker()


class _PostgresCursorProxy:
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
    raw = conn.cursor()
    cur: Any = _PostgresCursorProxy(raw)
    try:
        yield cur
    finally:
        raw.close()


def _database_url_from_db_parts() -> str | None:
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
    """
    Resolve the *cloud* Postgres URL. When ``DB_HOST`` and ``DB_NAME`` (and other DB_* parts)
    are set, those win over ``DATABASE_URL`` so a machine-level ``DATABASE_URL`` cannot silently
    override Neon's ``DB_*`` from the project ``.env``.
    """
    from_parts = _database_url_from_db_parts()
    if from_parts:
        return from_parts
    direct = (os.environ.get("DATABASE_URL") or "").strip()
    if direct:
        return direct
    return None


def cloud_database_url() -> str | None:
    """The remote/source-of-truth database (Neon ``DB_*`` / ``DATABASE_URL``)."""
    return database_url()


def local_database_url() -> str | None:
    """
    Resolve the local mirror DB from ``LOCAL_DB_*``. When set, the app reads from and
    writes to this database; changes are pushed up to :func:`cloud_database_url` and the
    cloud is mirrored back down on reads (see ``db_sync``).
    """
    host = (os.environ.get("LOCAL_DB_HOST") or "").strip()
    dbname = (os.environ.get("LOCAL_DB_NAME") or "").strip()
    if not host or not dbname:
        return None
    user = (os.environ.get("LOCAL_DB_USER") or "").strip()
    password = os.environ.get("LOCAL_DB_PASSWORD") or ""
    port = (os.environ.get("LOCAL_DB_PORT") or "5432").strip() or "5432"
    # In Docker, ``localhost`` points at the api container itself; the local mirror
    # Postgres is the Compose ``db`` service, reachable as ``db:5432`` on the
    # internal network (host-mapped to 5433, but that mapping doesn't apply here).
    if Path("/.dockerenv").exists() and host.lower() in ("localhost", "127.0.0.1"):
        host = "db"
        port = "5432"
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


def primary_database_url() -> str | None:
    """
    The database the app actually serves from: the local mirror when ``LOCAL_DB_*`` is
    configured, otherwise the cloud DB. ``get_connection`` uses this.
    """
    return local_database_url() or cloud_database_url()


def sync_configured() -> bool:
    """True when both a local mirror and a cloud DB are configured (mirroring is active)."""
    return bool(local_database_url()) and bool(cloud_database_url())


_LIBPQ_DEFAULT_PARAMS: tuple[tuple[str, str], ...] = (
    # Faster detection of half-open sockets (Neon / PgBouncer / NAT idle kills).
    # Without these, a dropped TCP socket isn't noticed until the next query
    # actually tries to write — which is exactly the case our pre-ping is for.
    ("keepalives", "1"),
    ("keepalives_idle", "30"),
    ("keepalives_interval", "10"),
    ("keepalives_count", "3"),
    # Tag connections so they're easy to spot in pg_stat_activity. Allowed by
    # Neon's pooler (which has a strict allow-list for startup parameters).
    ("application_name", "budgetapp"),
    # Fail fast when the cloud DB is unreachable so the mirror can fall back to
    # local instead of blocking the request on a long TCP connect.
    ("connect_timeout", "8"),
)


def _postgres_connect_url(url: str) -> str:
    """
    Normalize the DSN: enforce TLS for Neon and bake server-side defaults
    (search_path, keepalives) into the connection string so they're applied
    once at connect time instead of on every pool checkout.
    """
    u = url.strip()
    low = u.lower()
    if not (low.startswith("postgresql:") or low.startswith("postgres:")):
        return u
    parsed = urlparse(u)
    pairs = parse_qsl(parsed.query, keep_blank_values=True)
    keys_lower = {k.lower() for k, _ in pairs}
    host = (parsed.hostname or "").lower()
    if "neon.tech" in host and "sslmode" not in keys_lower:
        pairs.append(("sslmode", "require"))
        keys_lower.add("sslmode")
    for key, value in _LIBPQ_DEFAULT_PARAMS:
        if key.lower() not in keys_lower:
            pairs.append((key, value))
            keys_lower.add(key.lower())
    new_query = urlencode(pairs, quote_via=quote)
    return urlunparse(parsed._replace(query=new_query))


def storage_kind() -> str:
    u = (primary_database_url() or "").strip().lower()
    if u.startswith("postgresql:") or u.startswith("postgres:"):
        return "postgres"
    return "none"


def use_database() -> bool:
    return storage_kind() == "postgres"


# One pool per distinct DSN. With a local mirror configured there are two:
# the local (primary) pool the app serves from and the cloud pool used by the
# reconciler in ``db_sync``.
_pg_pools: dict[str, pool.ThreadedConnectionPool] = {}


def _pool_bounds() -> tuple[int, int]:
    mn = int(os.environ.get("DB_POOL_MIN") or "1")
    mx = int(os.environ.get("DB_POOL_MAX") or "10")
    mn = max(1, mn)
    mx = max(mn, min(mx, 50))
    return mn, mx


def _is_postgres_url(url: str | None) -> bool:
    u = (url or "").strip().lower()
    return u.startswith("postgresql:") or u.startswith("postgres:")


def _ensure_pool(url: str) -> pool.ThreadedConnectionPool:
    """Lazy per-DSN pool: reuse TCP/TLS sessions instead of connecting per request."""
    url = (url or "").strip()
    existing = _pg_pools.get(url)
    if existing is not None:
        return existing
    if not _is_postgres_url(url):
        raise RuntimeError(
            "DATABASE_URL must be a postgresql://... URL (or set DB_HOST, DB_NAME, …).",
        )
    mn, mx = _pool_bounds()
    p = pool.ThreadedConnectionPool(mn, mx, dsn=_postgres_connect_url(url))
    _pg_pools[url] = p
    return p


def close_connection_pool() -> None:
    """Release pooled connections on process shutdown (e.g. uvicorn reload)."""
    for p in _pg_pools.values():
        try:
            p.closeall()
        except Exception:
            pass
    _pg_pools.clear()
    _conn_last_seen.clear()
    _conn_initialized.clear()


def _connection_is_closed(conn: Any) -> bool:
    """``psycopg2`` connections expose ``closed != 0`` once the socket is gone."""
    try:
        return bool(getattr(conn, "closed", 1))
    except Exception:
        return True


# Per-connection "last successfully released" timestamps, keyed by ``id(conn)``.
# Used to skip the pre-ping when a connection was used very recently and is
# overwhelmingly likely to still be alive. Cleared whenever we discard a
# connection from the pool.
_conn_last_seen: dict[int, float] = {}

# Tracks which physical connections have already had session-level setup
# applied (e.g. ``SET search_path``). Neon's pooler doesn't allow
# ``search_path`` in libpq startup options, so we have to issue it via
# ``SET`` — but the GUC persists for the life of the connection, so we only
# need to do it once per ``getconn`` of a given connection object.
_conn_initialized: set[int] = set()


def _initialize_session(conn: Any) -> None:
    """Apply per-connection settings that can't be baked into the DSN."""
    if id(conn) in _conn_initialized:
        return
    with conn.cursor() as cur:
        cur.execute("SET search_path TO public")
    _conn_initialized.add(id(conn))


def _ping_after_idle_seconds() -> float:
    raw = os.environ.get("DB_PING_AFTER_IDLE_SECONDS")
    if raw is None or not raw.strip():
        return 30.0
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 30.0


def _acquire_live_connection(p: pool.ThreadedConnectionPool) -> Any:
    """
    Check out a known-good connection, replacing any the server has dropped.

    Pooled Postgres providers (Neon, PgBouncer) silently kill idle TCP sockets.
    ``psycopg2.pool`` doesn't validate connections on checkout, so the first
    cursor on a stale connection raises ``InterfaceError: connection already
    closed`` — and then our cleanup path explodes trying to roll it back.

    To avoid paying a ``SELECT 1`` round-trip on every request, only ping
    connections that have been idle longer than ``DB_PING_AFTER_IDLE_SECONDS``
    (default 30s). Recently-used connections are returned immediately; if one
    happens to be stale anyway, the cleanup path in :func:`get_connection`
    will discard it and the next checkout will receive a fresh one.
    """
    threshold = _ping_after_idle_seconds()
    last_err: Exception | None = None
    for _ in range(3):
        conn = p.getconn()
        if _connection_is_closed(conn):
            _drop_conn_state(conn)
            try:
                p.putconn(conn, close=True)
            except Exception:
                pass
            continue
        last_seen = _conn_last_seen.get(id(conn))
        now = time.monotonic()
        try:
            if last_seen is None or (now - last_seen) >= threshold:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
            _initialize_session(conn)
            _conn_last_seen[id(conn)] = now
            return conn
        except (psycopg2.InterfaceError, psycopg2.OperationalError) as e:
            last_err = e
            _drop_conn_state(conn)
            try:
                p.putconn(conn, close=True)
            except Exception:
                pass
            continue
    assert last_err is not None
    raise last_err


def _drop_conn_state(conn: Any) -> None:
    _conn_last_seen.pop(id(conn), None)
    _conn_initialized.discard(id(conn))


@contextmanager
def _connection_for(url: str | None):
    if not _is_postgres_url(url):
        raise RuntimeError(
            "DATABASE_URL must be a postgresql://... URL (or set DB_HOST, DB_NAME, …).",
        )
    p = _ensure_pool(url or "")
    conn = _acquire_live_connection(p)
    broken = False
    try:
        yield conn
        try:
            conn.commit()
        except (psycopg2.InterfaceError, psycopg2.OperationalError):
            broken = True
            raise
    except Exception:
        # Roll back any partial transaction, but tolerate a connection that
        # was already torn down by the server (otherwise rollback itself raises
        # ``InterfaceError: connection already closed`` and hides the real error).
        try:
            if not _connection_is_closed(conn):
                conn.rollback()
        except (psycopg2.InterfaceError, psycopg2.OperationalError):
            broken = True
        except Exception:
            broken = True
        raise
    finally:
        if _connection_is_closed(conn):
            broken = True
        if broken:
            _drop_conn_state(conn)
        else:
            _conn_last_seen[id(conn)] = time.monotonic()
        try:
            # ``close=True`` makes the pool discard the dead connection so the
            # next checkout opens a fresh one instead of replaying the failure.
            p.putconn(conn, close=broken)
        except Exception:
            pass


@contextmanager
def get_connection():
    """Connection to the primary DB (local mirror when configured, else cloud)."""
    with _connection_for(primary_database_url()) as conn:
        yield conn


@contextmanager
def get_cloud_connection():
    """Connection to the cloud (source-of-truth) DB, used by the mirror reconciler."""
    with _connection_for(cloud_database_url()) as conn:
        yield conn


_MINIMAL_PERF_INDEX_DDL = """
CREATE INDEX IF NOT EXISTS idx_payslip_period_sort ON payslip(
    period_year DESC, period_month DESC, period_half DESC, created_at DESC
);
CREATE INDEX IF NOT EXISTS idx_installment_finish_name ON installment(finish_date, name);
CREATE INDEX IF NOT EXISTS idx_house_payment_name ON house_payment(name);
"""

def _backfill_installment_lines_if_empty(cur: Any) -> None:
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




def _ensure_minimal_performance_indexes(cur: Any) -> None:
    for stmt in _MINIMAL_PERF_INDEX_DDL.strip().split(";"):
        s = stmt.strip()
        if s:
            cur.execute(s)


def _migrate_payslip_rename_employee_hdmf_to_pag_ibig(cur: Any) -> None:
    """Rename legacy payslip column employee_hdmf -> pag_ibig (once)."""
    cur.execute(
        """
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'payslip'
              AND column_name = 'employee_hdmf'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'payslip'
              AND column_name = 'pag_ibig'
          ) THEN
            ALTER TABLE payslip RENAME COLUMN employee_hdmf TO pag_ibig;
          END IF;
        END $$;
        """
    )


def _migrate_payslip_drop_source_filename(cur: Any) -> None:
    cur.execute("ALTER TABLE payslip DROP COLUMN IF EXISTS source_filename")


def _migrate_payslip_thirteenth_month(cur: Any) -> None:
    """Add 13th month pay column if missing (existing DBs)."""
    cur.execute(
        "ALTER TABLE payslip ADD COLUMN IF NOT EXISTS thirteenth_month DOUBLE PRECISION"
    )


def _migrate_payslip_basic_salary(cur: Any) -> None:
    """Add basic salary column if missing (existing DBs)."""
    cur.execute(
        "ALTER TABLE payslip ADD COLUMN IF NOT EXISTS basic_salary DOUBLE PRECISION"
    )


def _migrate_payslip_pdf_columns(cur: Any) -> None:
    """Add the single-PDF attachment column if missing (existing DBs)."""
    cur.execute("ALTER TABLE payslip ADD COLUMN IF NOT EXISTS pdf_data BYTEA")


def _migrate_payslip_drop_pdf_filename(cur: Any) -> None:
    """Drop the original-filename column; PDFs are now served under a fixed name."""
    cur.execute("ALTER TABLE payslip DROP COLUMN IF EXISTS pdf_filename")


def _migrate_payslip_created_at_default(cur: Any) -> None:
    """Ensure older payslip tables can create rows without explicit timestamps."""
    cur.execute("ALTER TABLE payslip ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ")
    cur.execute(
        "UPDATE payslip SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"
    )
    cur.execute(
        "ALTER TABLE payslip ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP"
    )
    cur.execute("ALTER TABLE payslip ALTER COLUMN created_at SET NOT NULL")


def _migrate_payslip_deduction_columns(cur: Any) -> None:
    """Add withholding / statutory deduction columns if missing (existing DBs)."""
    for name in ("withholding_tax", "sss_contribution", "philhealth", "pag_ibig"):
        cur.execute(
            f"ALTER TABLE payslip ADD COLUMN IF NOT EXISTS {name} DOUBLE PRECISION"
        )


def _init_schema_minimal_stmts() -> list[str]:
    return [
        """
        CREATE SCHEMA IF NOT EXISTS public
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
            thirteenth_month DOUBLE PRECISION,
            basic_salary DOUBLE PRECISION,
            period_year INTEGER,
            period_month INTEGER,
            period_half INTEGER,
            notes TEXT,
            withholding_tax DOUBLE PRECISION,
            sss_contribution DOUBLE PRECISION,
            philhealth DOUBLE PRECISION,
            pag_ibig DOUBLE PRECISION,
            pdf_data BYTEA,
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
            CONSTRAINT chk_installment_amounts CHECK (payment_total >= 0 AND remaining >= 0)
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
        CREATE TABLE IF NOT EXISTS house_payment (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_house_payment_created ON house_payment (created_at DESC)
        """,
        """
        CREATE TABLE IF NOT EXISTS house_payment_entry (
            id SERIAL PRIMARY KEY,
            house_payment_id INTEGER NOT NULL REFERENCES house_payment(id) ON DELETE CASCADE,
            paid_on DATE NOT NULL,
            amount DOUBLE PRECISION NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
            CONSTRAINT chk_house_payment_entry_amount CHECK (amount >= 0)
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_house_payment_entry_parent
            ON house_payment_entry (house_payment_id, paid_on DESC)
        """,
        """
        CREATE TABLE IF NOT EXISTS blood_pressure (
            id SERIAL PRIMARY KEY,
            systolic INTEGER,
            diastolic INTEGER,
            pulse INTEGER,
            spo2 INTEGER,
            temperature NUMERIC(5,2),
            weight NUMERIC(6,2),
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
            CONSTRAINT chk_blood_pressure_values CHECK (
                (systolic IS NULL AND diastolic IS NULL AND pulse IS NULL)
                OR (systolic > 0 AND diastolic > 0 AND pulse > 0)
            ),
            CONSTRAINT chk_blood_pressure_spo2 CHECK (
                spo2 IS NULL OR (spo2 > 0 AND spo2 <= 100)
            ),
            CONSTRAINT chk_blood_pressure_temperature CHECK (
                temperature IS NULL OR (temperature > 25 AND temperature <= 45)
            ),
            CONSTRAINT chk_blood_pressure_weight CHECK (
                weight IS NULL OR weight > 0
            ),
            CONSTRAINT chk_blood_pressure_any_field CHECK (
                systolic IS NOT NULL OR diastolic IS NOT NULL OR pulse IS NOT NULL
                OR spo2 IS NOT NULL OR temperature IS NOT NULL OR weight IS NOT NULL
                OR notes IS NOT NULL
            )
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_blood_pressure_created
            ON blood_pressure (created_at DESC)
        """,
        """
        CREATE TABLE IF NOT EXISTS fixed_expense (
            id SERIAL PRIMARY KEY,
            period_half INTEGER NOT NULL,
            amount DOUBLE PRECISION NOT NULL,
            description TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
            CONSTRAINT chk_fixed_expense_half CHECK (period_half IN (1, 2)),
            CONSTRAINT chk_fixed_expense_amount CHECK (amount > 0)
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_fixed_expense_half
            ON fixed_expense (period_half, created_at DESC)
        """,
        """
        CREATE TABLE IF NOT EXISTS calendar_day_override (
            id SERIAL PRIMARY KEY,
            day DATE NOT NULL UNIQUE,
            amount DOUBLE PRECISION NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
            CONSTRAINT chk_calendar_day_override_amount CHECK (amount >= 0)
        )
        """,
    ]


def _migrate_installment_original_total_from_principal(cur: Any) -> None:
    """Keep installment.original_total equal to sum(principal) on schedule lines (not payment_total)."""
    cur.execute(
        """
        UPDATE installment i
        SET original_total = s.sum_p
        FROM (
            SELECT installment_id, COALESCE(SUM(principal), 0) AS sum_p
            FROM installment_line
            GROUP BY installment_id
        ) AS s
        WHERE i.id = s.installment_id
        """
    )


def _migrate_installment_repair_constraints(cur: Any) -> None:
    """
    Add the primary key, unique, and foreign-key constraints that
    ``_init_schema_minimal_stmts`` would have set on a fresh DB but that
    were missing on databases created by earlier versions (where
    ``CREATE TABLE IF NOT EXISTS`` saw an existing table and skipped the
    full DDL). Idempotent — each constraint is added only when not already
    present.

    ``installment_line`` is the only table where the missing
    ``UNIQUE (installment_id, seq)`` constraint is load-bearing for our
    own helpers (``_resync_installment_lines_on_total_change`` uses
    ``ON CONFLICT (installment_id, seq)``).
    """
    cur.execute(
        """
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'installment'::regclass AND contype = 'p'
          ) AND NOT EXISTS (
            SELECT id FROM installment GROUP BY id HAVING COUNT(*) > 1 LIMIT 1
          ) THEN
            ALTER TABLE installment ADD PRIMARY KEY (id);
          END IF;
        END $$;
        """
    )
    cur.execute(
        """
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'installment_line'::regclass AND contype = 'p'
          ) AND NOT EXISTS (
            SELECT id FROM installment_line GROUP BY id HAVING COUNT(*) > 1 LIMIT 1
          ) THEN
            ALTER TABLE installment_line ADD PRIMARY KEY (id);
          END IF;
        END $$;
        """
    )
    cur.execute(
        """
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'installment_line'::regclass
              AND contype = 'u'
              AND conkey = (
                SELECT array_agg(attnum ORDER BY attnum)
                FROM pg_attribute
                WHERE attrelid = 'installment_line'::regclass
                  AND attname IN ('installment_id', 'seq')
              )
          ) AND NOT EXISTS (
            SELECT installment_id, seq FROM installment_line
            GROUP BY installment_id, seq HAVING COUNT(*) > 1 LIMIT 1
          ) THEN
            ALTER TABLE installment_line
              ADD CONSTRAINT installment_line_installment_id_seq_key
              UNIQUE (installment_id, seq);
          END IF;
        END $$;
        """
    )
    cur.execute(
        """
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'installment_line'::regclass AND contype = 'f'
          ) AND EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'installment'::regclass AND contype = 'p'
          ) AND NOT EXISTS (
            SELECT 1 FROM installment_line il
            LEFT JOIN installment i ON i.id = il.installment_id
            WHERE i.id IS NULL
            LIMIT 1
          ) THEN
            ALTER TABLE installment_line
              ADD CONSTRAINT installment_line_installment_id_fkey
              FOREIGN KEY (installment_id) REFERENCES installment(id) ON DELETE CASCADE;
          END IF;
        END $$;
        """
    )
    # Resync SERIAL sequences past existing max(id) so future inserts don't
    # immediately violate the new primary keys. Safe to run unconditionally —
    # ``setval`` accepts the new last-used value and ``nextval`` after this
    # returns ``max+1``.
    cur.execute(
        """
        SELECT setval(
            pg_get_serial_sequence('installment', 'id'),
            GREATEST(1, COALESCE((SELECT MAX(id) FROM installment), 1))
        )
        """
    )
    cur.execute(
        """
        SELECT setval(
            pg_get_serial_sequence('installment_line', 'id'),
            GREATEST(1, COALESCE((SELECT MAX(id) FROM installment_line), 1))
        )
        """
    )


def _migrate_installment_relax_payment_total(cur: Any) -> None:
    """
    Allow amount-less plans (``payment_total = 0``). The Add form no longer
    requires a per-payment total — it's filled in later via the schedule
    editor — but older DBs enforced ``payment_total > 0``. Rebuild the check
    with ``>= 0`` (existing rows already satisfy the looser bound).
    """
    cur.execute(
        "ALTER TABLE installment DROP CONSTRAINT IF EXISTS chk_installment_amounts"
    )
    cur.execute(
        """
        ALTER TABLE installment
          ADD CONSTRAINT chk_installment_amounts
          CHECK (payment_total >= 0 AND remaining >= 0)
        """
    )


def _migrate_installment_recompute_aggregates(cur: Any) -> None:
    """
    Recompute every plan's cached ``remaining`` / ``original_total`` (and the
    current-line principal/interest/payment_total) from its schedule lines, so
    ``remaining`` always equals the sum of the unpaid scheduled payments.

    Repairs rows whose cached ``remaining`` went stale — e.g. a manually entered
    balance left over from before the per-line schedule existed, or lines
    backfilled by a migration without a follow-up recompute.
    """
    cur.execute("SELECT id FROM installment")
    for (iid,) in cur.fetchall():
        _recompute_installment_aggregates(cur, iid)


def _migrate_aux_created_at_defaults(cur: Any) -> None:
    """
    Ensure non-payslip tables created before ``created_at`` had a default
    can still accept inserts that don't supply a timestamp. Idempotent —
    re-applying the default / NOT NULL on a column that already has them
    is a no-op.
    """
    for tbl in ("installment", "house_payment", "house_payment_entry"):
        cur.execute(
            f"UPDATE {tbl} SET created_at = (NOW() AT TIME ZONE 'UTC') WHERE created_at IS NULL"
        )
        cur.execute(
            f"ALTER TABLE {tbl} ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'UTC')"
        )
        cur.execute(
            f"ALTER TABLE {tbl} ALTER COLUMN created_at SET NOT NULL"
        )


def _migrate_blood_pressure_spo2(cur: Any) -> None:
    """Add the nullable ``spo2`` (oxygen saturation %) column to existing
    blood_pressure tables. Idempotent."""
    cur.execute("ALTER TABLE blood_pressure ADD COLUMN IF NOT EXISTS spo2 INTEGER")
    cur.execute(
        "ALTER TABLE blood_pressure DROP CONSTRAINT IF EXISTS chk_blood_pressure_spo2"
    )
    cur.execute(
        """
        ALTER TABLE blood_pressure ADD CONSTRAINT chk_blood_pressure_spo2 CHECK (
            spo2 IS NULL OR (spo2 > 0 AND spo2 <= 100)
        )
        """
    )


def _migrate_blood_pressure_temperature_weight(cur: Any) -> None:
    """Add nullable ``temperature`` (°C) and ``weight`` (kg) columns. Idempotent."""
    cur.execute(
        "ALTER TABLE blood_pressure ADD COLUMN IF NOT EXISTS temperature NUMERIC(5,2)"
    )
    cur.execute(
        "ALTER TABLE blood_pressure ADD COLUMN IF NOT EXISTS weight NUMERIC(6,2)"
    )
    cur.execute(
        "ALTER TABLE blood_pressure DROP CONSTRAINT IF EXISTS chk_blood_pressure_temperature"
    )
    cur.execute(
        """
        ALTER TABLE blood_pressure ADD CONSTRAINT chk_blood_pressure_temperature CHECK (
            temperature IS NULL OR (temperature > 25 AND temperature <= 45)
        )
        """
    )
    cur.execute(
        "ALTER TABLE blood_pressure DROP CONSTRAINT IF EXISTS chk_blood_pressure_weight"
    )
    cur.execute(
        """
        ALTER TABLE blood_pressure ADD CONSTRAINT chk_blood_pressure_weight CHECK (
            weight IS NULL OR weight > 0
        )
        """
    )


def _migrate_blood_pressure_nullable_core(cur: Any) -> None:
    """Allow systolic/diastolic/pulse to be left blank, as long as they're all
    blank together (or all set together), and at least one field on the row
    is populated. Idempotent."""
    cur.execute("ALTER TABLE blood_pressure ALTER COLUMN systolic DROP NOT NULL")
    cur.execute("ALTER TABLE blood_pressure ALTER COLUMN diastolic DROP NOT NULL")
    cur.execute("ALTER TABLE blood_pressure ALTER COLUMN pulse DROP NOT NULL")
    cur.execute(
        "ALTER TABLE blood_pressure DROP CONSTRAINT IF EXISTS chk_blood_pressure_values"
    )
    cur.execute(
        """
        ALTER TABLE blood_pressure ADD CONSTRAINT chk_blood_pressure_values CHECK (
            (systolic IS NULL AND diastolic IS NULL AND pulse IS NULL)
            OR (systolic > 0 AND diastolic > 0 AND pulse > 0)
        )
        """
    )
    cur.execute(
        "ALTER TABLE blood_pressure DROP CONSTRAINT IF EXISTS chk_blood_pressure_any_field"
    )
    cur.execute(
        """
        ALTER TABLE blood_pressure ADD CONSTRAINT chk_blood_pressure_any_field CHECK (
            systolic IS NOT NULL OR diastolic IS NOT NULL OR pulse IS NOT NULL
            OR spo2 IS NOT NULL OR temperature IS NOT NULL OR weight IS NOT NULL
            OR notes IS NOT NULL
        )
        """
    )


def _migrate_house_payment_simplify(cur: Any) -> None:
    """
    Simplified house-payment model: only ``name`` + ``notes`` on the plan, with
    individual payments stored in ``house_payment_entry`` (date + amount).
    Drops the prior installment-style columns and the legacy ``house_payment_line``
    table.
    """
    cur.execute("DROP TABLE IF EXISTS house_payment_line CASCADE")
    cur.execute(
        "ALTER TABLE house_payment DROP CONSTRAINT IF EXISTS chk_house_payment_n"
    )
    cur.execute(
        "ALTER TABLE house_payment DROP CONSTRAINT IF EXISTS chk_house_payment_amounts"
    )
    for col in (
        "installment_current",
        "installment_total",
        "principal",
        "interest",
        "payment_total",
        "start_date",
        "finish_date",
        "remaining",
        "original_total",
        "down_payment",
    ):
        cur.execute(f"ALTER TABLE house_payment DROP COLUMN IF EXISTS {col}")


# Bump this whenever the DDL or migrations below change. ``init_schema()``
# uses it to skip the entire migration block on warm starts (very common
# on Neon, where containers cold-start often).
_SCHEMA_VERSION = 13


def init_schema() -> None:
    """
    Ensure the database matches the expected schema. On warm starts (when
    ``_app_meta.schema_version`` already equals ``_SCHEMA_VERSION``), this is
    a single ``SELECT`` round-trip and returns immediately. On a fresh DB or
    after ``_SCHEMA_VERSION`` bumps, it runs the minimal DDL plus all
    migrations in a single transaction and stamps the new version.
    """
    if not use_database():
        return
    # Bring the primary (local mirror when configured) up to date first; the app
    # serves from it. Then try the cloud so the first push has tables to target —
    # but don't fail startup if the cloud is unreachable (offline-friendly).
    _init_schema_on(get_connection)
    if sync_configured():
        try:
            _init_schema_on(get_cloud_connection)
        except Exception as e:  # noqa: BLE001 - offline cloud must not block startup
            _log.warning("Could not initialize cloud schema (offline?): %s", e)


def _init_schema_on(conn_factory: Any) -> None:
    with conn_factory() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS _app_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
                """
            )
            cur.execute(
                "SELECT value FROM _app_meta WHERE key = 'schema_version'"
            )
            row = cur.fetchone()
            current = 0
            if row:
                try:
                    current = int(row[0])
                except (TypeError, ValueError):
                    current = 0
            if current >= _SCHEMA_VERSION:
                return
            for stmt in _init_schema_minimal_stmts():
                cur.execute(stmt.strip())
            _backfill_installment_lines_if_empty(cur)
            _ensure_minimal_performance_indexes(cur)
            _migrate_payslip_drop_source_filename(cur)
            _migrate_payslip_rename_employee_hdmf_to_pag_ibig(cur)
            _migrate_payslip_deduction_columns(cur)
            _migrate_payslip_thirteenth_month(cur)
            _migrate_payslip_basic_salary(cur)
            _migrate_payslip_pdf_columns(cur)
            _migrate_payslip_drop_pdf_filename(cur)
            _migrate_payslip_created_at_default(cur)
            _migrate_installment_original_total_from_principal(cur)
            _migrate_house_payment_simplify(cur)
            _migrate_blood_pressure_spo2(cur)
            _migrate_blood_pressure_temperature_weight(cur)
            _migrate_blood_pressure_nullable_core(cur)
            _migrate_aux_created_at_defaults(cur)
            _migrate_installment_repair_constraints(cur)
            _migrate_installment_relax_payment_total(cur)
            _migrate_installment_recompute_aggregates(cur)
            cur.execute(
                """
                INSERT INTO _app_meta (key, value)
                VALUES ('schema_version', ?)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """,
                (str(_SCHEMA_VERSION),),
            )


_PAYSLIP_RETURN_COLS = """
    id, total, commission, reimbursement,
    medical_reimbursement, others, mp2, allowances,
    thirteenth_month, basic_salary,
    period_year, period_month, period_half, notes,
    withholding_tax, sss_contribution, philhealth, pag_ibig,
    (pdf_data IS NOT NULL) AS has_pdf,
    created_at
"""


def _row_to_dict(cur: Any, row: Any) -> dict[str, Any]:
    return dict(zip([d[0] for d in cur.description], row))


def insert_payslip(
    total: float | None,
    commission: float | None,
    reimbursement: float | None,
    medical_reimbursement: float | None,
    others: float | None,
    mp2: float | None,
    allowances: float | None,
    thirteenth_month: float | None,
    basic_salary: float | None,
    period_year: int | None,
    period_month: int | None,
    period_half: int | None,
    notes: str | None,
    withholding_tax: float | None = None,
    sss_contribution: float | None = None,
    philhealth: float | None = None,
    pag_ibig: float | None = None,
) -> dict[str, Any]:
    """Insert and return the full row (single round trip thanks to ``RETURNING``)."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                INSERT INTO payslip (
                    total, commission, reimbursement,
                    medical_reimbursement, others, mp2, allowances,
                    thirteenth_month, basic_salary,
                    period_year, period_month, period_half, notes,
                    withholding_tax, sss_contribution, philhealth, pag_ibig
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING {_PAYSLIP_RETURN_COLS}
                """,
                (
                    total,
                    commission,
                    reimbursement,
                    medical_reimbursement,
                    others,
                    mp2,
                    allowances,
                    thirteenth_month,
                    basic_salary,
                    period_year,
                    period_month,
                    period_half,
                    notes,
                    withholding_tax,
                    sss_contribution,
                    philhealth,
                    pag_ibig,
                ),
            )
            return _row_to_dict(cur, cur.fetchone())


_PAYSLIP_INSERT_COLS: tuple[str, ...] = (
    "total",
    "commission",
    "reimbursement",
    "medical_reimbursement",
    "others",
    "mp2",
    "allowances",
    "thirteenth_month",
    "basic_salary",
    "period_year",
    "period_month",
    "period_half",
    "notes",
    "withholding_tax",
    "sss_contribution",
    "philhealth",
    "pag_ibig",
)


def insert_payslips_bulk(records: list[dict[str, Any]]) -> list[int]:
    """Insert many payslips in a single transaction; returns the new ids in order.

    Used by the JSON import so a multi-row file is all-or-nothing: if any row
    fails, ``get_connection`` rolls the whole batch back instead of leaving a
    partial import committed. One ``INSERT ... VALUES (...), (...)`` round trip
    replaces the previous per-row connect + insert loop.
    """
    if not records:
        return []
    placeholders = "(" + ", ".join(["?"] * len(_PAYSLIP_INSERT_COLS)) + ")"
    values_sql = ", ".join([placeholders] * len(records))
    params: list[Any] = []
    for rec in records:
        for col in _PAYSLIP_INSERT_COLS:
            params.append(rec.get(col))
    sql = (
        f"INSERT INTO payslip ({', '.join(_PAYSLIP_INSERT_COLS)}) "
        f"VALUES {values_sql} RETURNING id"
    )
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(sql, params)
            return [int(r[0]) for r in cur.fetchall()]


def list_payslips(limit: int = 200) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 2000))
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                SELECT {_PAYSLIP_RETURN_COLS}
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
            return [dict(zip(cols, r)) for r in cur.fetchall()]


def get_payslip(payslip_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"SELECT {_PAYSLIP_RETURN_COLS} FROM payslip WHERE id = ?",
                (payslip_id,),
            )
            row = cur.fetchone()
            return _row_to_dict(cur, row) if row else None


def update_payslip(
    payslip_id: int,
    total: float | None,
    commission: float | None,
    reimbursement: float | None,
    medical_reimbursement: float | None,
    others: float | None,
    mp2: float | None,
    allowances: float | None,
    thirteenth_month: float | None,
    basic_salary: float | None,
    period_year: int | None,
    period_month: int | None,
    period_half: int | None,
    notes: str | None,
    withholding_tax: float | None = None,
    sss_contribution: float | None = None,
    philhealth: float | None = None,
    pag_ibig: float | None = None,
) -> dict[str, Any] | None:
    """Update and return the full row, or ``None`` if no row matched."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                UPDATE payslip SET
                    total = ?,
                    commission = ?,
                    reimbursement = ?,
                    medical_reimbursement = ?,
                    others = ?,
                    mp2 = ?,
                    allowances = ?,
                    thirteenth_month = ?,
                    basic_salary = ?,
                    period_year = ?,
                    period_month = ?,
                    period_half = ?,
                    notes = ?,
                    withholding_tax = ?,
                    sss_contribution = ?,
                    philhealth = ?,
                    pag_ibig = ?
                WHERE id = ?
                RETURNING {_PAYSLIP_RETURN_COLS}
                """,
                (
                    total,
                    commission,
                    reimbursement,
                    medical_reimbursement,
                    others,
                    mp2,
                    allowances,
                    thirteenth_month,
                    basic_salary,
                    period_year,
                    period_month,
                    period_half,
                    notes,
                    withholding_tax,
                    sss_contribution,
                    philhealth,
                    pag_ibig,
                    payslip_id,
                ),
            )
            row = cur.fetchone()
            return _row_to_dict(cur, row) if row else None


def delete_payslip(payslip_id: int) -> bool:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("DELETE FROM payslip WHERE id = ?", (payslip_id,))
            return cur.rowcount > 0


def set_payslip_pdf(payslip_id: int, data: bytes) -> bool:
    """Attach (or replace) the single PDF for a payslip. False if no such row."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "UPDATE payslip SET pdf_data = ? WHERE id = ?",
                (psycopg2.Binary(data), payslip_id),
            )
            return cur.rowcount > 0


def get_payslip_pdf(payslip_id: int) -> bytes | None:
    """Return the payslip's PDF bytes, or None if unset."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "SELECT pdf_data FROM payslip WHERE id = ?",
                (payslip_id,),
            )
            row = cur.fetchone()
            if not row or row[0] is None:
                return None
            data = row[0]
            # psycopg2 hands bytea back as a memoryview; normalize to bytes.
            if isinstance(data, memoryview):
                data = data.tobytes()
            return bytes(data)


def delete_payslip_pdf(payslip_id: int) -> bool:
    """Detach the PDF from a payslip. False if no such row."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "UPDATE payslip SET pdf_data = NULL WHERE id = ?",
                (payslip_id,),
            )
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


def list_installments_with_lines(limit: int = 500) -> list[dict[str, Any]]:
    """
    All plans with their schedule lines, fetched in two queries (header list +
    all lines) and grouped in Python. Lets the UI build a payments-by-month view
    in a single request instead of one ``GET /{id}`` detail call per plan.
    """
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
            headers = [dict(zip(cols, r)) for r in cur.fetchall()]
            if not headers:
                return []
            ids = [h["id"] for h in headers]
            cur.execute(
                """
                SELECT installment_id, id, seq, principal, interest, payment_total
                FROM installment_line
                WHERE installment_id = ANY(?)
                ORDER BY installment_id ASC, seq ASC
                """,
                (ids,),
            )
            lcols = [d[0] for d in cur.description]
            lines_by_iid: dict[int, list[dict[str, Any]]] = {}
            for r in cur.fetchall():
                d = dict(zip(lcols, r))
                iid = d.pop("installment_id")
                lines_by_iid.setdefault(iid, []).append(d)
            return [
                {"installment": h, "lines": lines_by_iid.get(h["id"], [])}
                for h in headers
            ]


def _installment_row_dict(cur: Any, installment_id: int) -> dict[str, Any] | None:
    """Read one installment header row including the joined ``due_payment`` field."""
    cur.execute(
        """
        SELECT i.id, i.name, i.installment_current, i.installment_total,
               i.principal, i.interest, i.payment_total, i.start_date, i.finish_date,
               i.remaining, i.original_total, i.created_at,
               COALESCE(il.payment_total, i.payment_total) AS due_payment
        FROM installment i
        LEFT JOIN installment_line il
            ON il.installment_id = i.id AND il.seq = i.installment_current
        WHERE i.id = ?
        """,
        (installment_id,),
    )
    row = cur.fetchone()
    if not row:
        return None
    return _row_to_dict(cur, row)


def _installment_lines_rows(cur: Any, installment_id: int) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT id, seq, principal, interest, payment_total
        FROM installment_line
        WHERE installment_id = ?
        ORDER BY seq ASC
        """,
        (installment_id,),
    )
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def _installment_detail(cur: Any, installment_id: int) -> dict[str, Any] | None:
    """Header + lines in a single round trip via ``json_agg``."""
    cur.execute(
        """
        SELECT
            to_jsonb(hdr) AS installment,
            COALESCE(
                (SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', l.id,
                                'seq', l.seq,
                                'principal', l.principal,
                                'interest', l.interest,
                                'payment_total', l.payment_total
                            )
                            ORDER BY l.seq ASC
                        )
                   FROM installment_line l
                   WHERE l.installment_id = hdr.id),
                '[]'::jsonb
            ) AS lines
        FROM (
            SELECT i.id, i.name, i.installment_current, i.installment_total,
                   i.principal, i.interest, i.payment_total,
                   i.start_date, i.finish_date,
                   i.remaining, i.original_total, i.created_at,
                   COALESCE(il.payment_total, i.payment_total) AS due_payment
            FROM installment i
            LEFT JOIN installment_line il
                ON il.installment_id = i.id AND il.seq = i.installment_current
            WHERE i.id = ?
        ) AS hdr
        """,
        (installment_id,),
    )
    row = cur.fetchone()
    if not row:
        return None
    return {"installment": row[0], "lines": list(row[1] or [])}


def get_installment(installment_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            return _installment_row_dict(cur, installment_id)


def fetch_installment_with_lines(
    installment_id: int,
) -> dict[str, Any] | None:
    """Single transaction: installment row + schedule lines."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            return _installment_detail(cur, installment_id)


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
) -> dict[str, Any]:
    """Insert + seed lines + return ``{installment, lines}`` (skips a follow-up GET)."""
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
            iid = int(cur.fetchone()[0])
            _seed_installment_lines(cur, iid, installment_total, principal, interest)
            _recompute_installment_aggregates(cur, iid)
            detail = _installment_detail(cur, iid)
            assert detail is not None
            return detail


def _line_payment_total(principal: float, interest: float | None) -> float:
    return float(principal) + (float(interest) if interest is not None else 0.0)


def _seed_installment_lines(
    cur: Any,
    installment_id: int,
    installment_total: int,
    principal: float,
    interest: float | None,
) -> None:
    """Insert seq 1..N as a single statement using ``generate_series``."""
    n = int(installment_total)
    if n <= 0:
        return
    ptot = _line_payment_total(principal, interest)
    cur.execute(
        """
        INSERT INTO installment_line (installment_id, seq, principal, interest, payment_total)
        SELECT ?, gs, ?, ?, ?
        FROM generate_series(1, ?) AS gs
        """,
        (installment_id, principal, interest, ptot, n),
    )


def list_installment_lines(installment_id: int) -> list[dict[str, Any]]:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            return _installment_lines_rows(cur, installment_id)


def _recompute_installment_aggregates(cur: Any, installment_id: int) -> None:
    """
    Recompute ``original_total`` / ``remaining`` and (if a line exists at
    ``installment_current``) the cached ``principal`` / ``interest`` /
    ``payment_total`` columns. Single SELECT pulls everything we need; a
    single UPDATE applies it.
    """
    cur.execute(
        """
        SELECT
            (SELECT COALESCE(SUM(principal), 0)
               FROM installment_line WHERE installment_id = i.id)             AS sum_p,
            (SELECT COALESCE(SUM(payment_total), 0)
               FROM installment_line
               WHERE installment_id = i.id AND seq >= i.installment_current)  AS sum_pt_rem,
            cl.principal,
            cl.interest,
            cl.payment_total,
            (cl.installment_id IS NOT NULL)                                   AS has_current_line
        FROM installment i
        LEFT JOIN installment_line cl
            ON cl.installment_id = i.id AND cl.seq = i.installment_current
        WHERE i.id = ?
        """,
        (installment_id,),
    )
    row = cur.fetchone()
    if not row:
        return
    sum_p, sum_pt_rem, cl_p, cl_i, cl_pt, has_line = row
    if has_line:
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
            (
                float(sum_p),
                float(sum_pt_rem),
                cl_p,
                cl_i,
                float(cl_pt),
                installment_id,
            ),
        )
    else:
        cur.execute(
            """
            UPDATE installment SET original_total = ?, remaining = ?
            WHERE id = ?
            """,
            (float(sum_p), float(sum_pt_rem), installment_id),
        )


def update_installment_line(
    installment_id: int,
    seq: int,
    principal: float,
    interest: float | None,
) -> bool:
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


def update_installment_line_and_fetch_detail(
    installment_id: int,
    seq: int,
    principal: float,
    interest: float | None,
) -> dict[str, Any] | None:
    """UPDATE line, recompute aggregates, return ``{installment, lines}``."""
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
                return None
            _recompute_installment_aggregates(cur, installment_id)
            return _installment_detail(cur, installment_id)


def reorder_installment_lines(
    installment_id: int,
    ordered_line_ids: list[int],
) -> dict[str, Any] | None:
    """
    Renumber ``seq`` so rows appear in ``ordered_line_ids`` order (top → bottom).
    Returns None if ``ordered_line_ids`` is not exactly the set of line ids for this plan.
    """
    if not ordered_line_ids:
        return None
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT id FROM installment_line
                WHERE installment_id = ?
                ORDER BY seq ASC
                """,
                (installment_id,),
            )
            existing_ids = [r[0] for r in cur.fetchall()]
            if len(ordered_line_ids) != len(existing_ids):
                return None
            if set(ordered_line_ids) != set(existing_ids):
                return None
            # First, push every seq into a non-overlapping range so the second
            # UPDATE can renumber freely without violating the
            # ``UNIQUE (installment_id, seq)`` constraint mid-statement. Then
            # apply the new ordering in a single statement using a VALUES
            # join.
            cur.execute(
                "UPDATE installment_line SET seq = id + 1000000 WHERE installment_id = ?",
                (installment_id,),
            )
            values_sql = ",".join(
                ["(?::integer, ?::integer)"] * len(ordered_line_ids)
            )
            params: list[Any] = []
            for i, lid in enumerate(ordered_line_ids):
                params.append(int(lid))
                params.append(i + 1)
            params.append(installment_id)
            cur.execute(
                f"""
                UPDATE installment_line AS il
                SET seq = data.new_seq
                FROM (VALUES {values_sql}) AS data(id, new_seq)
                WHERE il.installment_id = ? AND il.id = data.id
                """,
                params,
            )
            _recompute_installment_aggregates(cur, installment_id)
            return _installment_detail(cur, installment_id)


def _resync_installment_lines_on_total_change(
    cur: Any,
    installment_id: int,
    new_total: int,
    principal: float,
    interest: float | None,
) -> None:
    """
    Truncate the schedule to ``new_total`` rows and (re)apply the per-line
    amounts. Two statements: a DELETE for any rows past the new tail, plus
    an UPSERT that creates or updates seq 1..new_total in one shot.
    """
    n = int(new_total)
    ptot = _line_payment_total(principal, interest)
    cur.execute(
        "DELETE FROM installment_line WHERE installment_id = ? AND seq > ?",
        (installment_id, n),
    )
    if n <= 0:
        return
    cur.execute(
        """
        INSERT INTO installment_line (installment_id, seq, principal, interest, payment_total)
        SELECT ?, gs, ?, ?, ?
        FROM generate_series(1, ?) AS gs
        ON CONFLICT (installment_id, seq) DO UPDATE SET
            principal = EXCLUDED.principal,
            interest = EXCLUDED.interest,
            payment_total = EXCLUDED.payment_total
        """,
        (installment_id, principal, interest, ptot, n),
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
) -> dict[str, Any] | None:
    """Update + (re)seed lines if total changed + return ``{installment, lines}`` (or ``None``)."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                WITH old AS (
                    SELECT installment_total AS old_total,
                           (SELECT COUNT(*) FROM installment_line
                              WHERE installment_id = installment.id) AS line_count
                    FROM installment WHERE id = ?
                )
                UPDATE installment AS i SET
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
                FROM old
                WHERE i.id = ?
                RETURNING old.old_total, old.line_count
                """,
                (
                    installment_id,
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
            row = cur.fetchone()
            if not row:
                return None
            old_total, line_count = int(row[0] or 0), int(row[1] or 0)
            has_lines = line_count > 0
            if has_lines and old_total != int(installment_total):
                _resync_installment_lines_on_total_change(
                    cur, installment_id, installment_total, principal, interest
                )
            if has_lines:
                _recompute_installment_aggregates(cur, installment_id)
            return _installment_detail(cur, installment_id)


def delete_installment(installment_id: int) -> bool:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("DELETE FROM installment WHERE id = ?", (installment_id,))
            return cur.rowcount > 0


def installment_apply_payment(installment_id: int) -> dict[str, Any] | None:
    """Advance ``installment_current`` by one and return the refreshed header row.

    Combines the read + line-count + update into a single CTE round trip so
    the only follow-up is the recompute / fallback ``UPDATE remaining``.
    """
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                WITH src AS (
                    SELECT id, installment_current, installment_total,
                           payment_total, remaining,
                           (SELECT COUNT(*) FROM installment_line il
                              WHERE il.installment_id = installment.id) AS line_count
                    FROM installment WHERE id = ?
                ),
                upd AS (
                    UPDATE installment AS i
                    SET installment_current = i.installment_current + 1
                    FROM src
                    WHERE i.id = src.id
                      AND src.installment_current <= src.installment_total
                      AND src.remaining > 0
                    RETURNING src.line_count, src.remaining, src.payment_total
                )
                SELECT line_count, remaining, payment_total FROM upd
                """,
                (installment_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            line_count, rem, pay = int(row[0] or 0), float(row[1] or 0), float(row[2] or 0)
            if line_count > 0:
                _recompute_installment_aggregates(cur, installment_id)
            else:
                new_rem = max(0.0, rem - pay)
                cur.execute(
                    "UPDATE installment SET remaining = ? WHERE id = ?",
                    (new_rem, installment_id),
                )
            return _installment_row_dict(cur, installment_id)


_HOUSE_PAYMENT_SELECT = """
    SELECT h.id, h.name, h.notes, h.created_at,
           COALESCE(e.entry_count, 0) AS entry_count,
           COALESCE(e.total_paid, 0) AS total_paid,
           e.last_paid_on
    FROM house_payment h
    LEFT JOIN (
        SELECT house_payment_id,
               COUNT(*) AS entry_count,
               COALESCE(SUM(amount), 0) AS total_paid,
               MAX(paid_on) AS last_paid_on
        FROM house_payment_entry
        GROUP BY house_payment_id
    ) AS e ON e.house_payment_id = h.id
"""


def _house_payment_row_dict(
    cur: Any, house_payment_id: int
) -> dict[str, Any] | None:
    """Read one plan including its joined ``entry_count``/``total_paid``/``last_paid_on``."""
    cur.execute(
        f"{_HOUSE_PAYMENT_SELECT} WHERE h.id = ?",
        (house_payment_id,),
    )
    row = cur.fetchone()
    return _row_to_dict(cur, row) if row else None


def _house_payment_entries_rows(
    cur: Any, house_payment_id: int
) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT id, paid_on, amount, created_at
        FROM house_payment_entry
        WHERE house_payment_id = ?
        ORDER BY paid_on DESC, id DESC
        """,
        (house_payment_id,),
    )
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def _house_payment_detail(
    cur: Any, house_payment_id: int
) -> dict[str, Any] | None:
    """Plan header (with aggregates) + entries in a single round trip."""
    cur.execute(
        """
        SELECT
            to_jsonb(hdr) AS house_payment,
            COALESCE(
                (SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', e.id,
                                'paid_on', e.paid_on,
                                'amount', e.amount,
                                'created_at', e.created_at
                            )
                            ORDER BY e.paid_on DESC, e.id DESC
                        )
                   FROM house_payment_entry e
                   WHERE e.house_payment_id = hdr.id),
                '[]'::jsonb
            ) AS entries
        FROM (
            SELECT h.id, h.name, h.notes, h.created_at,
                   COALESCE(agg.entry_count, 0) AS entry_count,
                   COALESCE(agg.total_paid, 0) AS total_paid,
                   agg.last_paid_on
            FROM house_payment h
            LEFT JOIN (
                SELECT house_payment_id,
                       COUNT(*) AS entry_count,
                       COALESCE(SUM(amount), 0) AS total_paid,
                       MAX(paid_on) AS last_paid_on
                FROM house_payment_entry
                WHERE house_payment_id = ?
                GROUP BY house_payment_id
            ) AS agg ON agg.house_payment_id = h.id
            WHERE h.id = ?
        ) AS hdr
        """,
        (house_payment_id, house_payment_id),
    )
    row = cur.fetchone()
    if not row:
        return None
    return {"house_payment": row[0], "entries": list(row[1] or [])}


def list_house_payments(limit: int = 500) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 2000))
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                {_HOUSE_PAYMENT_SELECT}
                ORDER BY h.name ASC, h.id ASC
                LIMIT ?
                """,
                (limit,),
            )
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, r)) for r in cur.fetchall()]


def get_house_payment(house_payment_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            return _house_payment_row_dict(cur, house_payment_id)


def fetch_house_payment_with_entries(
    house_payment_id: int,
) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            return _house_payment_detail(cur, house_payment_id)


def insert_house_payment(name: str, notes: str | None) -> dict[str, Any]:
    """Insert a plan and return the full row (zero-aggregated)."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO house_payment (name, notes)
                VALUES (?, ?)
                RETURNING id, name, notes, created_at
                """,
                (name, notes),
            )
            row = _row_to_dict(cur, cur.fetchone())
            row["entry_count"] = 0
            row["total_paid"] = 0.0
            row["last_paid_on"] = None
            return row


def update_house_payment(
    house_payment_id: int, name: str, notes: str | None
) -> dict[str, Any] | None:
    """Update the plan and return the full row (or ``None`` if not found)."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE house_payment SET name = ?, notes = ?
                WHERE id = ?
                RETURNING id
                """,
                (name, notes, house_payment_id),
            )
            if not cur.fetchone():
                return None
            return _house_payment_row_dict(cur, house_payment_id)


def delete_house_payment(house_payment_id: int) -> bool:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "DELETE FROM house_payment WHERE id = ?", (house_payment_id,)
            )
            return cur.rowcount > 0


def insert_house_payment_entry(
    house_payment_id: int, paid_on: Any, amount: float
) -> dict[str, Any] | None:
    """Insert one payment entry and return the refreshed plan detail (header + entries)."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO house_payment_entry (house_payment_id, paid_on, amount)
                SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM house_payment WHERE id = ?)
                RETURNING id
                """,
                (house_payment_id, paid_on, amount, house_payment_id),
            )
            if not cur.fetchone():
                return None
            return _house_payment_detail(cur, house_payment_id)


def update_house_payment_entry(
    house_payment_id: int, entry_id: int, paid_on: Any, amount: float
) -> dict[str, Any] | None:
    """Update one entry and return the refreshed plan detail."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE house_payment_entry SET paid_on = ?, amount = ?
                WHERE id = ? AND house_payment_id = ?
                RETURNING id
                """,
                (paid_on, amount, entry_id, house_payment_id),
            )
            if not cur.fetchone():
                return None
            return _house_payment_detail(cur, house_payment_id)


def delete_house_payment_entry(
    house_payment_id: int, entry_id: int
) -> dict[str, Any] | None:
    """Delete one entry and return the refreshed plan detail (or ``None``)."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                DELETE FROM house_payment_entry
                WHERE id = ? AND house_payment_id = ?
                RETURNING id
                """,
                (entry_id, house_payment_id),
            )
            if not cur.fetchone():
                return None
            return _house_payment_detail(cur, house_payment_id)


_BLOOD_PRESSURE_COLS = "id, systolic, diastolic, pulse, spo2, temperature, weight, notes, created_at"


def list_blood_pressures(limit: int = 500) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 2000))
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                SELECT {_BLOOD_PRESSURE_COLS} FROM blood_pressure
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,
                (limit,),
            )
            return [_row_to_dict(cur, r) for r in cur.fetchall()]


def insert_blood_pressure(
    systolic: int | None,
    diastolic: int | None,
    pulse: int | None,
    spo2: int | None,
    temperature: float | None,
    weight: float | None,
    notes: str | None,
) -> dict[str, Any]:
    """Insert one reading (timestamped now) and return the full row."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                INSERT INTO blood_pressure (systolic, diastolic, pulse, spo2, temperature, weight, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                RETURNING {_BLOOD_PRESSURE_COLS}
                """,
                (systolic, diastolic, pulse, spo2, temperature, weight, notes),
            )
            return _row_to_dict(cur, cur.fetchone())


def update_blood_pressure(
    reading_id: int,
    systolic: int | None,
    diastolic: int | None,
    pulse: int | None,
    spo2: int | None,
    temperature: float | None,
    weight: float | None,
    notes: str | None,
) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                UPDATE blood_pressure
                SET systolic = ?, diastolic = ?, pulse = ?, spo2 = ?,
                    temperature = ?, weight = ?, notes = ?
                WHERE id = ?
                RETURNING {_BLOOD_PRESSURE_COLS}
                """,
                (systolic, diastolic, pulse, spo2, temperature, weight, notes, reading_id),
            )
            row = cur.fetchone()
            return _row_to_dict(cur, row) if row else None


def delete_blood_pressure(reading_id: int) -> bool:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("DELETE FROM blood_pressure WHERE id = ?", (reading_id,))
            return cur.rowcount > 0


_FIXED_EXPENSE_COLS = "id, period_half, amount, description, created_at"


def list_fixed_expenses(period_half: int | None = None, limit: int = 500) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 2000))
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            if period_half is None:
                cur.execute(
                    f"""
                    SELECT {_FIXED_EXPENSE_COLS} FROM fixed_expense
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                    """,
                    (limit,),
                )
            else:
                cur.execute(
                    f"""
                    SELECT {_FIXED_EXPENSE_COLS} FROM fixed_expense
                    WHERE period_half = ?
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                    """,
                    (period_half, limit),
                )
            return [_row_to_dict(cur, r) for r in cur.fetchall()]


def insert_fixed_expense(
    period_half: int, amount: float, description: str | None
) -> dict[str, Any]:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                INSERT INTO fixed_expense (period_half, amount, description)
                VALUES (?, ?, ?)
                RETURNING {_FIXED_EXPENSE_COLS}
                """,
                (period_half, amount, description),
            )
            return _row_to_dict(cur, cur.fetchone())


def delete_fixed_expense(expense_id: int) -> bool:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("DELETE FROM fixed_expense WHERE id = ?", (expense_id,))
            return cur.rowcount > 0


_CALENDAR_DAY_OVERRIDE_COLS = "id, day, amount, created_at"


def list_calendar_day_overrides() -> list[dict[str, Any]]:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"SELECT {_CALENDAR_DAY_OVERRIDE_COLS} FROM calendar_day_override ORDER BY day"
            )
            return [_row_to_dict(cur, r) for r in cur.fetchall()]


def upsert_calendar_day_overrides(
    overrides: list[tuple[str, float]],
) -> list[dict[str, Any]]:
    """Upsert one or more (day, amount) pairs in a single transaction and return the full list."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            for day, amount in overrides:
                cur.execute(
                    """
                    INSERT INTO calendar_day_override (day, amount)
                    VALUES (?, ?)
                    ON CONFLICT (day) DO UPDATE SET amount = EXCLUDED.amount
                    """,
                    (day, amount),
                )
            cur.execute(
                f"SELECT {_CALENDAR_DAY_OVERRIDE_COLS} FROM calendar_day_override ORDER BY day"
            )
            return [_row_to_dict(cur, r) for r in cur.fetchall()]


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
