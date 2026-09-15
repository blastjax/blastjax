"""
Payslip and installment storage: cloud PostgreSQL (Neon), via ``DATABASE_URL``.

The query layer below is written in SQLite's dialect -- ``?`` placeholders and
all -- because that is what it was when the app ran on a local file. Rather
than rewrite ~2,500 lines of working SQL, ``db_cursor`` hands out a thin
wrapper that translates each statement on its way to psycopg2:

  - ``?`` placeholders become ``%s`` (quote- and comment-aware, so a ``?``
    inside a string literal or a ``--`` comment is left alone)
  - a literal ``%`` is doubled when parameters are present, since psycopg2
    uses ``%`` for its own interpolation

The rest of the dialect already lines up: ``RETURNING``, ``ON CONFLICT ... DO
UPDATE SET ... excluded.x`` and ``NULLS LAST`` are Postgres syntax that SQLite
adopted, and the schema uses no SQLite-only functions.

Values coming back are normalised in ``_row_to_dict`` so callers see exactly
what they saw under SQLite -- JSON-safe primitives:

  - TIMESTAMPTZ(0) / DATE / TIME -> ISO-8601 ``str``
  - NUMERIC                      -> ``float`` (not ``Decimal``)
  - BYTEA                        -> ``bytes`` (not ``memoryview``)

The timestamp columns are ``TIMESTAMPTZ(0)`` -- whole seconds -- so every
rendered value has the same shape. At microsecond precision ``.isoformat()``
drops the fractional part when it happens to be zero, which had one column
emitting both ``...T02:06:38.428777+00:00`` and ``...T08:56:00+00:00``. See
``backend/scripts/normalize_time_types.py``.

That matters beyond tidiness: ``cache.set`` serialises responses with
``json.dumps(..., default=str)``, which renders a ``datetime`` as
``"2026-04-13 02:06:38+00:00"`` while FastAPI renders the same value as
``"2026-04-13T02:06:38+00:00"``. Left alone, a response would change shape
depending on whether it came from Redis or the database. Normalising here
gives one representation everywhere.

The schema itself is owned by ``backend/scripts/migrate_sqlite_to_postgres.py``,
not by this module -- ``init_schema()`` only verifies that the expected tables
are present, so there is no second copy of the DDL to drift out of sync.

Round trips
-----------
Neon is remote -- measured from the dev machine, one round trip to the
ap-southeast-1 endpoint costs 35-80 ms depending on the network -- so what
dominates a request is not how much work Postgres does but how many times we
wait for it. A read used to cost *six* round trips, only one of which was the
query::

    SELECT 1 / ROLLBACK liveness probe   3   (BEGIN, SELECT 1, ROLLBACK)
    the query itself                     2   (BEGIN, SELECT ...)
    COMMIT                               1

Two changes below cut that to one:

  - connections are checked out in **autocommit** mode, and
    ``_TranslatingCursor`` flips autocommit off only when it sees the first
    *write* statement of a block. A read therefore issues no BEGIN and no
    COMMIT; a write still gets a real transaction covering every write in the
    block, so multi-statement writes stay atomic.
  - the liveness probe is **idle-gated**. It exists because Neon suspends an
    idle compute and drops its connections, which is only a risk once a
    connection has actually sat idle -- so it runs only when the connection
    has not been used for ``BUDGET_DB_PROBE_AFTER_SECONDS``, and when it does
    run it is a bare ``SELECT 1`` in autocommit: one round trip, not three.
"""

from __future__ import annotations

import os
import threading
import time as _time
from contextlib import contextmanager
from datetime import date, datetime, time
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extensions
from psycopg2 import pool as _pg_pool

from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND_DIR.parent


def _load_env_files() -> None:
    """Load repo-root ``.env``, ``backend/.env`` (or ``/app/.env`` in the API
    image), then ``.env.local``.

    ``.env.local`` is loaded last but does NOT override a variable already set
    in the real environment: in Docker the compose file supplies
    ``DATABASE_URL`` directly, and a stale ``.env.local`` baked into an image
    must never win over it. Locally, where nothing sets the variable, it is
    what points development at Neon.
    """
    for path in (_REPO_ROOT / ".env", _BACKEND_DIR / ".env"):
        if path.is_file():
            load_dotenv(path, override=True)
    local = _REPO_ROOT / ".env.local"
    if local.is_file():
        load_dotenv(local, override=False)


_load_env_files()


def database_url() -> str:
    """The Postgres database this app reads from and writes to.

    Prefers ``DATABASE_URL`` (Neon's *pooled* endpoint, which is the right one
    for many short web requests). ``DATABASE_URL_UNPOOLED`` is only a fallback
    -- it is meant for DDL and bulk loads, like the migration script.
    """
    for name in ("DATABASE_URL", "DATABASE_URL_UNPOOLED"):
        raw = (os.environ.get(name) or "").strip()
        if raw.startswith(("postgres://", "postgresql://")):
            return raw
    return ""


def storage_kind() -> str:
    return "postgres" if database_url() else "none"


# ---------------------------------------------------------------- connections

_POOL: Any = None
_POOL_LOCK = threading.Lock()


def _probe_after_seconds() -> float:
    """How long a pooled connection may sit idle before it is probed on checkout.

    Neon's pooler and its scale-to-zero both drop connections, but only after
    a spell of inactivity — well over a minute in practice. Anything below
    that is a safe window in which to trust a connection without spending a
    round trip on ``SELECT 1``, which is what makes a burst of requests (one
    page load fanning out to half a dozen endpoints) probe at most once.
    """
    return float(os.environ.get("BUDGET_DB_PROBE_AFTER_SECONDS", "20"))


class _TrackedConnection(psycopg2.extensions.connection):
    """A connection that remembers when it was last known to be alive.

    ``get_connection`` reads ``last_used`` to decide whether the liveness
    probe is worth a round trip. A freshly opened connection starts out
    stamped, since it cannot be stale.
    """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.last_used = _time.monotonic()


def _pool() -> Any:
    """Lazily build the shared connection pool.

    Sync FastAPI endpoints run in a worker threadpool, so this has to be the
    thread-safe pool. TCP keepalives are on because Neon sits behind a network
    that will quietly drop an idle connection.

    psycopg2 overloads ``minconn`` to mean two different things: how many
    connections to open *eagerly* in the constructor, and how many a returned
    connection may find already pooled before ``putconn`` closes it outright
    rather than keeping it. At the old value of 1 the second meaning was the
    expensive one — a page load fanning out to six endpoints opened six
    connections and then threw five away, so the next page paid five fresh
    TLS handshakes (~750 ms each against Neon).

    Raising ``minconn`` outright would fix retention but move the cost to
    startup, opening every connection sequentially before the app serves
    anything. So the two are separated here: build with one connection, then
    raise ``minconn`` to the retention target. ``_putconn`` reads it per call,
    which is the only place it matters once construction is done.
    """
    global _POOL
    if _POOL is None:
        with _POOL_LOCK:
            if _POOL is None:
                url = database_url()
                if not url:
                    raise RuntimeError("DATABASE_URL is not set to a Postgres URL")
                keep = int(os.environ.get("BUDGET_DB_POOL_KEEP", "6"))
                maxconn = int(os.environ.get("BUDGET_DB_POOL_MAX", "10"))
                pool = _pg_pool.ThreadedConnectionPool(
                    minconn=1,
                    maxconn=maxconn,
                    dsn=url,
                    connection_factory=_TrackedConnection,
                    connect_timeout=10,
                    application_name="blastjax-api",
                    # Pin the session to UTC once, at connect time, instead of
                    # issuing a SET on every checkout — the stored timestamps
                    # are UTC and a round-trip to Singapore per request is not
                    # worth spending. Neon's pooled endpoint accepts this.
                    options="-c timezone=UTC",
                    keepalives=1,
                    keepalives_idle=30,
                    keepalives_interval=10,
                    keepalives_count=5,
                )
                pool.minconn = max(1, min(keep, maxconn))
                _POOL = pool
    return _POOL


def close_connection_pool() -> None:
    """Close every pooled connection. Called from the app's lifespan shutdown."""
    global _POOL
    with _POOL_LOCK:
        if _POOL is not None:
            try:
                _POOL.closeall()
            except Exception:
                pass
            _POOL = None


def _usable(conn: Any) -> bool:
    """Cheap liveness probe for a connection taken from the pool.

    Neon suspends an idle compute and closes its connections, and this app is
    idle for long stretches, so a pooled connection that has sat around is
    genuinely likely to be dead on arrival. psycopg2 would not notice until the
    first real statement failed mid-request, so spend one round trip to find
    out up front.

    One round trip, not three: the probe runs in autocommit, so there is no
    BEGIN in front of the ``SELECT 1`` and no ROLLBACK behind it. Callers must
    only invoke this on a connection that is already in autocommit mode, which
    is how ``get_connection`` hands them out.
    """
    if conn.closed:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        return True
    except psycopg2.Error:
        return False


def _checkout(pool: Any) -> Any:
    """One live connection from ``pool``, in autocommit mode.

    Probes only a connection that has been idle past ``_probe_after_seconds``
    — see the round-trips note in the module docstring for why that matters.
    """
    deadline = _time.monotonic() - _probe_after_seconds()
    for _ in range(3):
        conn = pool.getconn()
        # Reset before probing: the probe itself relies on autocommit, and a
        # connection returned by a failed write may still be mid-transaction.
        if not conn.closed and conn.autocommit is False:
            conn.rollback()
            conn.autocommit = True
        if getattr(conn, "last_used", 0.0) > deadline and not conn.closed:
            return conn
        if _usable(conn):
            return conn
        # Dead connection: drop it rather than return it to the pool, so the
        # next getconn() builds a fresh one instead of handing this same
        # corpse back around the loop.
        pool.putconn(conn, close=True)
    raise psycopg2.OperationalError(
        "could not obtain a live database connection from the pool"
    )


@contextmanager
def get_connection():
    """Check out one pooled connection for the duration of the block.

    The connection arrives in autocommit mode, so a block that only reads
    spends exactly one round trip per query. ``_TranslatingCursor`` turns
    autocommit off the moment it sees a write statement, which opens a real
    transaction; this commits it on success and rolls it back on any
    exception, so a failed multi-statement write (e.g. insert + recompute)
    never leaves a partial change committed.
    """
    pool = _pool()
    conn = _checkout(pool)
    try:
        try:
            yield conn
            if not conn.autocommit:
                conn.commit()
        except Exception:
            if not conn.closed and not conn.autocommit:
                conn.rollback()
            raise
    finally:
        if not conn.closed:
            conn.autocommit = True
            conn.last_used = _time.monotonic()
        pool.putconn(conn)


def check_connection() -> bool:
    try:
        with get_connection() as conn:
            with db_cursor(conn) as cur:
                cur.execute("SELECT 1")
        return True
    except Exception:
        return False


# ------------------------------------------------------------ SQL translation


@lru_cache(maxsize=1024)
def _translate_sql(sql: str, has_params: bool) -> str:
    """Rewrite SQLite-dialect ``?`` placeholders into psycopg2's ``%s``.

    Scans rather than regex-replaces so that a ``?`` or ``%`` inside a string
    literal, a quoted identifier, a ``--`` comment or a ``/* */`` block is left
    exactly as written.
    """
    out: list[str] = []
    i = 0
    n = len(sql)
    while i < n:
        ch = sql[i]
        # String literal or quoted identifier: copy through, honouring the
        # doubled-quote escape ('' and "").
        if ch in ("'", '"'):
            quote = ch
            out.append(ch)
            i += 1
            while i < n:
                out.append(sql[i])
                if sql[i] == quote:
                    if i + 1 < n and sql[i + 1] == quote:
                        out.append(sql[i + 1])
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            continue
        # Line comment.
        if ch == "-" and i + 1 < n and sql[i + 1] == "-":
            while i < n and sql[i] != "\n":
                out.append(sql[i])
                i += 1
            continue
        # Block comment.
        if ch == "/" and i + 1 < n and sql[i + 1] == "*":
            out.append(sql[i])
            out.append(sql[i + 1])
            i += 2
            while i < n and not (sql[i] == "*" and i + 1 < n and sql[i + 1] == "/"):
                out.append(sql[i])
                i += 1
            continue
        if ch == "?":
            out.append("%s")
            i += 1
            continue
        if ch == "%" and has_params:
            # psycopg2 only %-interpolates when parameters are supplied, so
            # doubling is correct exactly then.
            out.append("%%")
            i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


@lru_cache(maxsize=1024)
def _is_write(sql: str) -> bool:
    """Whether ``sql`` needs a transaction around it.

    Only a leading ``SELECT`` is treated as read-only, and deliberately so:
    misreading a write as a read would drop it out of its transaction, while
    misreading a read as a write costs nothing but two round trips. ``SELECT
    ... FOR UPDATE`` is the one read that does need a transaction, so it is
    matched as a write too.
    """
    head = sql.lstrip()
    while head.startswith("--") or head.startswith("/*"):
        if head.startswith("--"):
            _, _, head = head.partition("\n")
        else:
            _, _, head = head.partition("*/")
        head = head.lstrip()
    # The whole word, not a prefix of one: an identifier that merely starts
    # with "select" is not a SELECT, and calling it one would quietly run a
    # write outside its transaction.
    rest = head[6:]
    if head[:6].upper() != "SELECT" or (rest[:1].isalnum() or rest[:1] == "_"):
        return True
    upper = sql.upper()
    return "FOR UPDATE" in upper or "FOR SHARE" in upper


class _TranslatingCursor:
    """psycopg2 cursor that accepts the SQLite-dialect SQL used below.

    Also the gate that decides when a block needs a transaction: connections
    are checked out in autocommit (one round trip per read), and the first
    write statement seen here turns autocommit off so psycopg2 opens a real
    transaction that ``get_connection`` then commits or rolls back. Every
    later statement in the same block joins that transaction, so a
    multi-statement write is still all-or-nothing.
    """

    __slots__ = ("_cur",)

    def __init__(self, cur: Any) -> None:
        self._cur = cur

    def _begin_if_write(self, sql: str) -> None:
        conn = self._cur.connection
        if conn.autocommit and _is_write(sql):
            conn.autocommit = False

    def execute(self, sql: str, params: Any = None) -> Any:
        self._begin_if_write(sql)
        if params is None:
            return self._cur.execute(_translate_sql(sql, False))
        return self._cur.execute(_translate_sql(sql, True), tuple(params))

    def executemany(self, sql: str, seq: Any) -> Any:
        self._begin_if_write(sql)
        rows = [tuple(p) for p in seq]
        return self._cur.executemany(_translate_sql(sql, True), rows)

    def __getattr__(self, name: str) -> Any:
        # description, fetchone/fetchall/fetchmany, rowcount, close, ...
        return getattr(self._cur, name)

    def __iter__(self) -> Any:
        return iter(self._cur)


@contextmanager
def db_cursor(conn: Any):
    cur = conn.cursor()
    try:
        yield _TranslatingCursor(cur)
    finally:
        cur.close()


# ------------------------------------------------------------------ row types


def _normalize(value: Any) -> Any:
    """Coerce psycopg2's rich types back to the JSON-safe primitives the rest
    of the app (and the Redis cache) expect. See the module docstring."""
    if isinstance(value, datetime):  # must precede date: datetime subclasses it
        return value.isoformat()
    if isinstance(value, (date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, memoryview):
        return bytes(value)
    return value


def _zip_row(cols: Any, row: Any) -> dict[str, Any]:
    """Normalising ``dict(zip(cols, row))``, for the callers that hoist the
    column names out of the loop rather than re-reading ``cur.description``."""
    return {c: _normalize(v) for c, v in zip(cols, row)}


def _row_to_dict(cur: Any, row: Any) -> dict[str, Any]:
    return {d[0]: _normalize(v) for d, v in zip(cur.description, row)}


def _with_bool(row: dict[str, Any], key: str) -> dict[str, Any]:
    """Kept for callers below. Postgres already returns a real ``bool`` for
    BOOLEAN columns and boolean expressions such as ``(pdf_data IS NOT NULL)``,
    so this is now a no-op guard rather than the coercion it was under SQLite."""
    if key in row and row[key] is not None:
        row[key] = bool(row[key])
    return row


# ------------------------------------------------------------------ schema

# The migration script owns the DDL; this is only what startup asserts is
# present, so the two cannot drift into two different schemas.
_EXPECTED_TABLES = (
    "_app_meta", "app_user", "blood_pressure", "calendar_day_override",
    "credit_card", "credit_card_payment", "fixed_expense", "house_payment",
    "house_payment_entry", "installment", "installment_line", "lotto_attempt",
    "lotto_draw", "monthly_expense", "pay_period_start_override", "payslip",
    "payslip_default", "payslip_default_settings", "travel_accommodation",
    "travel_flight", "travel_itinerary", "travel_transport", "travel_trip",
)


def init_schema() -> None:
    """Verify the expected tables exist. Does not create anything.

    The schema is created and populated by
    ``backend/scripts/migrate_sqlite_to_postgres.py``. Failing loudly here beats
    silently auto-creating an empty table and serving a blank app as if the
    data had never existed.
    """
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
            )
            present = {r[0] for r in cur.fetchall()}
    missing = [t for t in _EXPECTED_TABLES if t not in present]
    if missing:
        raise RuntimeError(
            "Postgres is missing "
            f"{len(missing)} expected table(s): {', '.join(missing)}. "
            "Run: python backend/scripts/migrate_sqlite_to_postgres.py"
        )


_PAYSLIP_RETURN_COLS = """
    id, total, commission, reimbursement,
    medical_reimbursement, others, mp2, allowances,
    thirteenth_month, basic_salary,
    period_year, period_month, period_half, notes,
    withholding_tax, sss_contribution, philhealth, pag_ibig, trust_fund,
    company,
    (pdf_data IS NOT NULL) AS has_pdf,
    created_at
"""


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
    trust_fund: float | None = None,
    *,
    company: str,
) -> dict[str, Any]:
    """Insert and return the full row (single round trip thanks to ``RETURNING``).

    ``company`` is required -- validated non-blank by ``PayslipCreate`` before
    this is ever called. The bulk JSON-import path (``insert_payslips_bulk``)
    is separate and unaffected: its historical records carry no company at
    all, so those rows still fall back to the column's own
    ``DEFAULT 'Sophos'``.
    """
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                INSERT INTO payslip (
                    total, commission, reimbursement,
                    medical_reimbursement, others, mp2, allowances,
                    thirteenth_month, basic_salary,
                    period_year, period_month, period_half, notes,
                    withholding_tax, sss_contribution, philhealth, pag_ibig,
                    trust_fund,
                    company
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    trust_fund,
                    company,
                ),
            )
            return _with_bool(_row_to_dict(cur, cur.fetchone()), "has_pdf")


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
    "trust_fund",
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


def list_payslips(limit: int = 200, company: str | None = None) -> list[dict[str, Any]]:
    """All payslips, or just one company's when ``company`` is given (each
    company's Payslip page passes its own name so pages don't bleed into
    each other's data)."""
    limit = max(1, min(limit, 2000))
    where_sql = "WHERE company = ?" if company is not None else ""
    params: tuple[Any, ...] = (company, limit) if company is not None else (limit,)
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                SELECT {_PAYSLIP_RETURN_COLS}
                FROM payslip
                {where_sql}
                ORDER BY period_year DESC NULLS LAST,
                         period_month DESC NULLS LAST,
                         period_half DESC NULLS LAST,
                         created_at DESC,
                         id DESC
                LIMIT ?
                """,
                params,
            )
            cols = [d[0] for d in cur.description]
            return [_with_bool(_zip_row(cols, r), "has_pdf") for r in cur.fetchall()]


def get_payslip(payslip_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"SELECT {_PAYSLIP_RETURN_COLS} FROM payslip WHERE id = ?",
                (payslip_id,),
            )
            row = cur.fetchone()
            return _with_bool(_row_to_dict(cur, row), "has_pdf") if row else None


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
    trust_fund: float | None = None,
    *,
    company: str,
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
                    pag_ibig = ?,
                    trust_fund = ?,
                    company = ?
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
                    trust_fund,
                    company,
                    payslip_id,
                ),
            )
            row = cur.fetchone()
            return _with_bool(_row_to_dict(cur, row), "has_pdf") if row else None


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
                (data, payslip_id),
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
            return bytes(row[0])


def delete_payslip_pdf(payslip_id: int) -> bool:
    """Detach the PDF from a payslip. False if no such row."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "UPDATE payslip SET pdf_data = NULL WHERE id = ?",
                (payslip_id,),
            )
            return cur.rowcount > 0


_INSTALLMENT_SELECT = """
    SELECT i.id, i.name, i.installment_current, i.installment_total,
           i.principal, i.interest, i.payment_total, i.start_date, i.finish_date,
           i.remaining, i.original_total, i.credit_card_id, i.created_at,
           COALESCE(il.payment_total, i.payment_total) AS due_payment
    FROM installment i
    LEFT JOIN installment_line il
        ON il.installment_id = i.id AND il.seq = i.installment_current
"""


def _installment_rows(
    cur: Any, limit: int, credit_card_id: int | None = None
) -> list[dict[str, Any]]:
    """Installment headers on an existing cursor, so a caller that already
    holds a connection (see ``fetch_credit_card_bundle``) doesn't check out a
    second one just to run this. Clamps ``limit`` for every caller."""
    limit = max(1, min(limit, 2000))
    where = "" if credit_card_id is None else "WHERE i.credit_card_id = ?"
    params = (limit,) if credit_card_id is None else (credit_card_id, limit)
    cur.execute(
        f"""
        {_INSTALLMENT_SELECT}
        {where}
        ORDER BY i.finish_date ASC, i.name ASC
        LIMIT ?
        """,
        params,
    )
    cols = [d[0] for d in cur.description]
    return [_zip_row(cols, r) for r in cur.fetchall()]


def list_installments(
    limit: int = 500, credit_card_id: int | None = None
) -> list[dict[str, Any]]:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            return _installment_rows(cur, limit, credit_card_id)


def list_installments_with_lines(limit: int = 500) -> list[dict[str, Any]]:
    """
    All plans with their schedule lines, fetched in two queries (header list +
    all lines) and grouped in Python. Lets the UI build a payments-by-month view
    in a single request instead of one ``GET /{id}`` detail call per plan.
    """
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            headers = _installment_rows(cur, limit)
            if not headers:
                return []
            ids = [h["id"] for h in headers]
            placeholders = ",".join("?" * len(ids))
            cur.execute(
                f"""
                SELECT installment_id, id, seq, principal, interest, payment_total
                FROM installment_line
                WHERE installment_id IN ({placeholders})
                ORDER BY installment_id ASC, seq ASC
                """,
                ids,
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
    cur.execute(f"{_INSTALLMENT_SELECT} WHERE i.id = ?", (installment_id,))
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
    return [_zip_row(cols, r) for r in cur.fetchall()]


def _installment_detail(cur: Any, installment_id: int) -> dict[str, Any] | None:
    """Header + lines, fetched as two plain queries and combined in Python."""
    header = _installment_row_dict(cur, installment_id)
    if header is None:
        return None
    return {"installment": header, "lines": _installment_lines_rows(cur, installment_id)}


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
    credit_card_id: int | None = None,
) -> dict[str, Any]:
    """Insert + seed lines + return ``{installment, lines}`` (skips a follow-up GET)."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO installment (
                    name, installment_current, installment_total,
                    principal, interest, payment_total,
                    start_date, finish_date, remaining, original_total, credit_card_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    credit_card_id,
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
    """Insert seq 1..N in one batch."""
    n = int(installment_total)
    if n <= 0:
        return
    ptot = _line_payment_total(principal, interest)
    cur.executemany(
        """
        INSERT INTO installment_line (installment_id, seq, principal, interest, payment_total)
        VALUES (?, ?, ?, ?, ?)
        """,
        [(installment_id, seq, principal, interest, ptot) for seq in range(1, n + 1)],
    )


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


def update_installment_lines_bulk(
    installment_id: int,
    items: list[tuple[int, float, float | None]],
) -> dict[str, Any] | None:
    """UPDATE many lines (by seq), then recompute aggregates once."""
    if not items:
        return None
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            updated_any = False
            for seq, principal, interest in items:
                ptot = _line_payment_total(principal, interest)
                cur.execute(
                    """
                    UPDATE installment_line
                    SET principal = ?, interest = ?, payment_total = ?
                    WHERE installment_id = ? AND seq = ?
                    """,
                    (principal, interest, ptot, installment_id, int(seq)),
                )
                if cur.rowcount > 0:
                    updated_any = True
            if not updated_any:
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
            # First, push every seq into a non-overlapping range so the following
            # per-row UPDATEs can renumber freely without violating the
            # ``UNIQUE (installment_id, seq)`` constraint mid-statement.
            cur.execute(
                "UPDATE installment_line SET seq = id + 1000000 WHERE installment_id = ?",
                (installment_id,),
            )
            for i, lid in enumerate(ordered_line_ids):
                cur.execute(
                    "UPDATE installment_line SET seq = ? WHERE installment_id = ? AND id = ?",
                    (i + 1, installment_id, int(lid)),
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
    amounts. A DELETE for any rows past the new tail, plus an UPSERT that
    creates or updates seq 1..new_total.
    """
    n = int(new_total)
    ptot = _line_payment_total(principal, interest)
    cur.execute(
        "DELETE FROM installment_line WHERE installment_id = ? AND seq > ?",
        (installment_id, n),
    )
    if n <= 0:
        return
    cur.executemany(
        """
        INSERT INTO installment_line (installment_id, seq, principal, interest, payment_total)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (installment_id, seq) DO UPDATE SET
            principal = excluded.principal,
            interest = excluded.interest,
            payment_total = excluded.payment_total
        """,
        [(installment_id, seq, principal, interest, ptot) for seq in range(1, n + 1)],
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
    credit_card_id: int | None = None,
) -> dict[str, Any] | None:
    """Update + (re)seed lines if total changed + return ``{installment, lines}`` (or ``None``)."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT installment_total,
                       (SELECT COUNT(*) FROM installment_line
                          WHERE installment_id = installment.id)
                FROM installment WHERE id = ?
                """,
                (installment_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            old_total, line_count = int(row[0] or 0), int(row[1] or 0)
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
                    original_total = ?,
                    credit_card_id = ?
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
                    credit_card_id,
                    installment_id,
                ),
            )
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

    Reads the current state (including line count) first; only advances when
    there's a payment left to apply (``installment_current <= installment_total``
    and ``remaining > 0``) — otherwise returns ``None`` without changing anything.
    """
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT installment_current, installment_total, payment_total, remaining,
                       (SELECT COUNT(*) FROM installment_line il
                          WHERE il.installment_id = installment.id)
                FROM installment WHERE id = ?
                """,
                (installment_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            current, total, pay, rem, line_count = row
            current, total, line_count = int(current), int(total), int(line_count or 0)
            rem = float(rem or 0)
            pay = float(pay or 0)
            if not (current <= total and rem > 0):
                return None
            cur.execute(
                "UPDATE installment SET installment_current = installment_current + 1 WHERE id = ?",
                (installment_id,),
            )
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
    return [_zip_row(cols, r) for r in cur.fetchall()]


def _house_payment_detail(
    cur: Any, house_payment_id: int
) -> dict[str, Any] | None:
    """Plan header (with aggregates) + entries, fetched as two plain queries."""
    header = _house_payment_row_dict(cur, house_payment_id)
    if header is None:
        return None
    return {
        "house_payment": header,
        "entries": _house_payment_entries_rows(cur, house_payment_id),
    }


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
            return [_zip_row(cols, r) for r in cur.fetchall()]


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


_FIXED_EXPENSE_COLS = "id, period_half, period_year, period_month, amount, description, created_at"


def list_fixed_expenses(
    period_half: int | None = None,
    period_year: int | None = None,
    period_month: int | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 2000))
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            clauses = []
            params: list[Any] = []
            if period_half is not None:
                clauses.append("period_half = ?")
                params.append(period_half)
            if period_year is not None:
                clauses.append("period_year = ?")
                params.append(period_year)
            if period_month is not None:
                clauses.append("period_month = ?")
                params.append(period_month)
            where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
            params.append(limit)
            cur.execute(
                f"""
                SELECT {_FIXED_EXPENSE_COLS} FROM fixed_expense
                {where}
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,
                params,
            )
            return [_row_to_dict(cur, r) for r in cur.fetchall()]


def insert_fixed_expense(
    period_half: int,
    amount: float,
    description: str | None,
    period_year: int,
    period_month: int,
) -> dict[str, Any]:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                INSERT INTO fixed_expense (period_half, period_year, period_month, amount, description)
                VALUES (?, ?, ?, ?, ?)
                RETURNING {_FIXED_EXPENSE_COLS}
                """,
                (period_half, period_year, period_month, amount, description),
            )
            return _row_to_dict(cur, cur.fetchone())


def delete_fixed_expense(expense_id: int) -> bool:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("DELETE FROM fixed_expense WHERE id = ?", (expense_id,))
            return cur.rowcount > 0


_MONTHLY_EXPENSE_COLS = (
    "id, name, description, amount, period_half, period_year, period_month, "
    "is_recurring, created_at"
)


def list_monthly_expenses(
    period_half: int | None = None,
    period_year: int | None = None,
    period_month: int | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    """
    ``period_year``/``period_month`` scope the result to a single calendar
    month (used by the calendar page), but a row with ``is_recurring`` set
    always matches regardless of its own period, since it's meant to show up
    every month.
    """
    limit = max(1, min(limit, 2000))
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            clauses = []
            params: list[Any] = []
            if period_half is not None:
                clauses.append("period_half = ?")
                params.append(period_half)
            if period_year is not None and period_month is not None:
                clauses.append("(is_recurring = TRUE OR (period_year = ? AND period_month = ?))")
                params.extend([period_year, period_month])
            elif period_year is not None:
                clauses.append("(is_recurring = TRUE OR period_year = ?)")
                params.append(period_year)
            elif period_month is not None:
                clauses.append("(is_recurring = TRUE OR period_month = ?)")
                params.append(period_month)
            where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
            params.append(limit)
            cur.execute(
                f"""
                SELECT {_MONTHLY_EXPENSE_COLS} FROM monthly_expense
                {where}
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,
                tuple(params),
            )
            return [_with_bool(_row_to_dict(cur, r), "is_recurring") for r in cur.fetchall()]


def insert_monthly_expense(
    name: str,
    description: str | None,
    amount: float,
    period_half: int,
    period_year: int,
    period_month: int,
    is_recurring: bool = False,
) -> dict[str, Any]:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                INSERT INTO monthly_expense
                    (name, description, amount, period_half, period_year, period_month,
                     is_recurring)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                RETURNING {_MONTHLY_EXPENSE_COLS}
                """,
                (name, description, amount, period_half, period_year, period_month, is_recurring),
            )
            return _with_bool(_row_to_dict(cur, cur.fetchone()), "is_recurring")


def update_monthly_expense(
    expense_id: int,
    name: str,
    description: str | None,
    amount: float,
    period_half: int,
    period_year: int,
    period_month: int,
    is_recurring: bool = False,
) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                UPDATE monthly_expense
                SET name = ?, description = ?, amount = ?, period_half = ?,
                    period_year = ?, period_month = ?, is_recurring = ?
                WHERE id = ?
                RETURNING {_MONTHLY_EXPENSE_COLS}
                """,
                (
                    name,
                    description,
                    amount,
                    period_half,
                    period_year,
                    period_month,
                    is_recurring,
                    expense_id,
                ),
            )
            row = cur.fetchone()
            return _with_bool(_row_to_dict(cur, row), "is_recurring") if row else None


def delete_monthly_expense(expense_id: int) -> bool:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("DELETE FROM monthly_expense WHERE id = ?", (expense_id,))
            return cur.rowcount > 0


_CREDIT_CARD_COLS = (
    "id, name, credit_limit, last_statement_balance, current_balance, "
    "minimum_due, interest_rate, statement_date, due_date, created_at"
)


def _credit_card_row(cur: Any) -> dict[str, Any] | None:
    cur.execute(f"SELECT {_CREDIT_CARD_COLS} FROM credit_card ORDER BY id LIMIT 1")
    row = cur.fetchone()
    return _row_to_dict(cur, row) if row else None


def get_credit_card() -> dict[str, Any] | None:
    """The single credit card record, if one has been set up."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            return _credit_card_row(cur)


def fetch_credit_card_bundle(
    installment_limit: int = 2000,
) -> dict[str, Any]:
    """Everything ``GET /api/credit-card`` renders, over one connection.

    The endpoint needs three things — the card, the installments carried on
    it, and its payments — and used to call three separate ``list_*``/``get_*``
    helpers, each checking out its own connection and paying its own round
    trips to Neon for a page that renders them together. They are three
    queries on one connection here instead.
    """
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            card = _credit_card_row(cur)
            if card is None:
                return {"card": None, "installments": [], "payments": []}
            return {
                "card": card,
                "installments": _installment_rows(cur, installment_limit, card["id"]),
                "payments": _credit_card_payment_rows(cur, card["id"]),
            }


def insert_credit_card(
    name: str,
    credit_limit: float,
    last_statement_balance: float,
    minimum_due: float,
    interest_rate: float,
    statement_date: Any,
    due_date: Any,
) -> dict[str, Any]:
    """``current_balance`` starts equal to the statement balance being recorded."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                INSERT INTO credit_card (
                    name, credit_limit, last_statement_balance, current_balance,
                    minimum_due, interest_rate, statement_date, due_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING {_CREDIT_CARD_COLS}
                """,
                (
                    name,
                    credit_limit,
                    last_statement_balance,
                    last_statement_balance,
                    minimum_due,
                    interest_rate,
                    statement_date,
                    due_date,
                ),
            )
            return _row_to_dict(cur, cur.fetchone())


def update_credit_card(
    card_id: int,
    name: str,
    credit_limit: float,
    last_statement_balance: float,
    minimum_due: float,
    interest_rate: float,
    statement_date: Any,
    due_date: Any,
) -> dict[str, Any] | None:
    """Full replace; resets ``current_balance`` to the new statement balance (a fresh cycle)."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                UPDATE credit_card SET
                    name = ?,
                    credit_limit = ?,
                    last_statement_balance = ?,
                    current_balance = ?,
                    minimum_due = ?,
                    interest_rate = ?,
                    statement_date = ?,
                    due_date = ?
                WHERE id = ?
                RETURNING {_CREDIT_CARD_COLS}
                """,
                (
                    name,
                    credit_limit,
                    last_statement_balance,
                    last_statement_balance,
                    minimum_due,
                    interest_rate,
                    statement_date,
                    due_date,
                    card_id,
                ),
            )
            row = cur.fetchone()
            return _row_to_dict(cur, row) if row else None


def adjust_credit_card_balance(
    card_id: int, current_balance: float
) -> dict[str, Any] | None:
    """
    Directly set ``current_balance`` without touching the statement fields.

    Used to reconcile against the bank's real available credit when purchases
    or other transactions happened that this app never recorded as payments.
    """
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                UPDATE credit_card SET current_balance = ?
                WHERE id = ?
                RETURNING {_CREDIT_CARD_COLS}
                """,
                (current_balance, card_id),
            )
            row = cur.fetchone()
            return _row_to_dict(cur, row) if row else None


def delete_credit_card(card_id: int) -> bool:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("DELETE FROM credit_card WHERE id = ?", (card_id,))
            return cur.rowcount > 0


_CREDIT_CARD_PAYMENT_COLS = "id, credit_card_id, amount, payment_date, note, created_at"


def _credit_card_payment_rows(cur: Any, credit_card_id: int) -> list[dict[str, Any]]:
    cur.execute(
        f"""
        SELECT {_CREDIT_CARD_PAYMENT_COLS} FROM credit_card_payment
        WHERE credit_card_id = ?
        ORDER BY payment_date DESC, id DESC
        """,
        (credit_card_id,),
    )
    return [_row_to_dict(cur, r) for r in cur.fetchall()]


def list_credit_card_payments(credit_card_id: int) -> list[dict[str, Any]]:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            return _credit_card_payment_rows(cur, credit_card_id)


def insert_credit_card_payment(
    credit_card_id: int, amount: float, payment_date: Any, note: str | None
) -> dict[str, Any] | None:
    """Insert the payment and decrement the card's ``current_balance`` in one transaction."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("SELECT 1 FROM credit_card WHERE id = ?", (credit_card_id,))
            if not cur.fetchone():
                return None
            cur.execute(
                f"""
                INSERT INTO credit_card_payment (credit_card_id, amount, payment_date, note)
                VALUES (?, ?, ?, ?)
                RETURNING {_CREDIT_CARD_PAYMENT_COLS}
                """,
                (credit_card_id, amount, payment_date, note),
            )
            payment = _row_to_dict(cur, cur.fetchone())
            cur.execute(
                "UPDATE credit_card SET current_balance = current_balance - ? WHERE id = ?",
                (amount, credit_card_id),
            )
            return payment


def delete_credit_card_payment(payment_id: int) -> bool:
    """Delete the payment and restore its amount to the card's balance."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "DELETE FROM credit_card_payment WHERE id = ? RETURNING credit_card_id, amount",
                (payment_id,),
            )
            row = cur.fetchone()
            if not row:
                return False
            credit_card_id, amount = row
            cur.execute(
                "UPDATE credit_card SET current_balance = current_balance + ? WHERE id = ?",
                (amount, credit_card_id),
            )
            return True


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
                    ON CONFLICT (day) DO UPDATE SET amount = excluded.amount
                    """,
                    (day, amount),
                )
            cur.execute(
                f"SELECT {_CALENDAR_DAY_OVERRIDE_COLS} FROM calendar_day_override ORDER BY day"
            )
            return [_row_to_dict(cur, r) for r in cur.fetchall()]


_PP_START_OVERRIDE_COLS = "id, period_year, period_month, period_half, start_date, created_at"


def list_pay_period_start_overrides() -> list[dict[str, Any]]:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                SELECT {_PP_START_OVERRIDE_COLS} FROM pay_period_start_override
                ORDER BY period_year, period_month, period_half
                """
            )
            return [_row_to_dict(cur, r) for r in cur.fetchall()]


def get_pay_period_start_override(
    period_year: int, period_month: int, period_half: int
) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                SELECT {_PP_START_OVERRIDE_COLS} FROM pay_period_start_override
                WHERE period_year = ? AND period_month = ? AND period_half = ?
                """,
                (period_year, period_month, period_half),
            )
            row = cur.fetchone()
            return _row_to_dict(cur, row) if row else None


def upsert_pay_period_start_override(
    period_year: int, period_month: int, period_half: int, start_date: str
) -> dict[str, Any]:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                INSERT INTO pay_period_start_override
                    (period_year, period_month, period_half, start_date)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (period_year, period_month, period_half)
                    DO UPDATE SET start_date = excluded.start_date
                RETURNING {_PP_START_OVERRIDE_COLS}
                """,
                (period_year, period_month, period_half, start_date),
            )
            return _row_to_dict(cur, cur.fetchone())


def delete_pay_period_start_override(
    period_year: int, period_month: int, period_half: int
) -> bool:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                DELETE FROM pay_period_start_override
                WHERE period_year = ? AND period_month = ? AND period_half = ?
                RETURNING id
                """,
                (period_year, period_month, period_half),
            )
            return cur.fetchone() is not None


_PAYSLIP_DEFAULT_FORM_COLS = (
    "period_year",
    "period_month",
    "total",
    "basic_salary",
    "commission",
    "reimbursement",
    "medical_reimbursement",
    "others",
    "mp2",
    "allowances",
    "thirteenth_month",
    "notes",
    "withholding_tax",
    "sss_contribution",
    "philhealth",
    "pag_ibig",
    "trust_fund",
)


def _payslip_default_row_to_form(row: dict[str, Any] | None, half: int) -> dict[str, Any] | None:
    if row is None:
        return None
    out = {k: row.get(k) or "" for k in _PAYSLIP_DEFAULT_FORM_COLS}
    out["period_half"] = str(half)
    return out


def get_payslip_defaults(company: str) -> dict[str, Any]:
    """Saved Settings → Payslip defaults templates for one company, keyed by
    half (1st/2nd).

    Returns ``None`` for a half or for ``settings_half`` when nothing has
    been saved yet for this company — the router fills in the builtin
    fallback."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"SELECT half, {', '.join(_PAYSLIP_DEFAULT_FORM_COLS)} "
                "FROM payslip_default WHERE company = ?",
                (company,),
            )
            rows_by_half = {
                r["half"]: r for r in (_row_to_dict(cur, row) for row in cur.fetchall())
            }
            cur.execute(
                "SELECT settings_half FROM payslip_default_settings WHERE company = ?",
                (company,),
            )
            settings_row = cur.fetchone()
            settings_half = _row_to_dict(cur, settings_row)["settings_half"] if settings_row else None
    return {
        "form_first": _payslip_default_row_to_form(rows_by_half.get(1), 1),
        "form_second": _payslip_default_row_to_form(rows_by_half.get(2), 2),
        "settings_half": settings_half,
    }


def save_payslip_defaults(
    company: str, form_first: dict[str, Any], form_second: dict[str, Any], settings_half: str
) -> None:
    """Upsert both half templates and the active-half toggle for one company,
    in one transaction."""
    cols_sql = ", ".join(_PAYSLIP_DEFAULT_FORM_COLS)
    placeholders_sql = ", ".join("?" for _ in _PAYSLIP_DEFAULT_FORM_COLS)
    updates_sql = ", ".join(f"{c} = excluded.{c}" for c in _PAYSLIP_DEFAULT_FORM_COLS)
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            for half, form in ((1, form_first), (2, form_second)):
                values = [str(form.get(c) or "") for c in _PAYSLIP_DEFAULT_FORM_COLS]
                cur.execute(
                    f"""
                    INSERT INTO payslip_default (company, half, {cols_sql})
                    VALUES (?, ?, {placeholders_sql})
                    ON CONFLICT (company, half) DO UPDATE SET {updates_sql}
                    """,
                    (company, half, *values),
                )
            cur.execute(
                """
                INSERT INTO payslip_default_settings (company, settings_half)
                VALUES (?, ?)
                ON CONFLICT (company) DO UPDATE SET settings_half = excluded.settings_half
                """,
                (company, settings_half),
            )


_LOTTO_DRAW_COLS = (
    "id, draw_date, n1, n2, n3, n4, n5, n6, jackpot_prize, winners, created_at"
)
_LOTTO_ATTEMPT_COLS = "id, draw_id, ticket, n1, n2, n3, n4, n5, n6, created_at"


def _lotto_attempts_rows(cur: Any, draw_id: int) -> list[dict[str, Any]]:
    cur.execute(
        f"""
        SELECT {_LOTTO_ATTEMPT_COLS} FROM lotto_attempt
        WHERE draw_id = ?
        ORDER BY created_at ASC, id ASC
        """,
        (draw_id,),
    )
    return [_row_to_dict(cur, r) for r in cur.fetchall()]


def _lotto_draw_detail(cur: Any, draw_id: int) -> dict[str, Any] | None:
    cur.execute(
        f"SELECT {_LOTTO_DRAW_COLS} FROM lotto_draw WHERE id = ?",
        (draw_id,),
    )
    row = cur.fetchone()
    if row is None:
        return None
    draw = _row_to_dict(cur, row)
    return {"draw": draw, "attempts": _lotto_attempts_rows(cur, draw_id)}


def list_lotto_draws(limit: int = 200) -> list[dict[str, Any]]:
    """Every draw (newest first), each with its attempts nested."""
    limit = max(1, min(limit, 2000))
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                SELECT {_LOTTO_DRAW_COLS} FROM lotto_draw
                ORDER BY draw_date DESC, id DESC
                LIMIT ?
                """,
                (limit,),
            )
            draws = [_row_to_dict(cur, r) for r in cur.fetchall()]
            if not draws:
                return []
            ids = [d["id"] for d in draws]
            cur.execute(
                f"""
                SELECT {_LOTTO_ATTEMPT_COLS} FROM lotto_attempt
                WHERE draw_id IN ({",".join("?" * len(ids))})
                ORDER BY created_at ASC, id ASC
                """,
                ids,
            )
            attempts_by_draw: dict[int, list[dict[str, Any]]] = {}
            for r in cur.fetchall():
                a = _row_to_dict(cur, r)
                attempts_by_draw.setdefault(a["draw_id"], []).append(a)
            return [
                {"draw": d, "attempts": attempts_by_draw.get(d["id"], [])}
                for d in draws
            ]


def list_lotto_draw_results() -> list[dict[str, Any]]:
    """Every draw with an announced result, oldest first — date, winning
    numbers, jackpot and winner count, and no attempts.

    This is exactly what ``GET /api/lotto/analysis`` needs for *both* halves of
    its answer. It used to read the numbers here and then call
    ``list_lotto_draws(limit=2000)`` for the prize columns, which fetched all
    1,500-odd draws a second time and dragged every attempt row along with them
    only to throw them away."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                SELECT draw_date, n1, n2, n3, n4, n5, n6, jackpot_prize, winners
                FROM lotto_draw
                WHERE n1 IS NOT NULL
                ORDER BY draw_date ASC, id ASC
                """
            )
            return [_row_to_dict(cur, r) for r in cur.fetchall()]


def upsert_lotto_draw(
    draw_date: Any,
    numbers: list[int] | None,
    jackpot_prize: float | None = None,
    winners: int = 0,
) -> dict[str, Any]:
    """Create the result for a date, or overwrite it if one already exists.
    ``numbers`` may be None to log just the date before the result is known.
    Overwrites ``jackpot_prize``/``winners`` too, same as the numbers — posting
    the same date again replaces that date's result wholesale."""
    n1, n2, n3, n4, n5, n6 = numbers if numbers is not None else (None,) * 6
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO lotto_draw (draw_date, n1, n2, n3, n4, n5, n6, jackpot_prize, winners)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (draw_date) DO UPDATE SET
                    n1 = excluded.n1, n2 = excluded.n2, n3 = excluded.n3,
                    n4 = excluded.n4, n5 = excluded.n5, n6 = excluded.n6,
                    jackpot_prize = excluded.jackpot_prize, winners = excluded.winners
                RETURNING id
                """,
                (draw_date, n1, n2, n3, n4, n5, n6, jackpot_prize, winners),
            )
            draw_id = cur.fetchone()[0]
            return _lotto_draw_detail(cur, draw_id)


def upsert_lotto_draws_bulk(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Bulk-upsert draws by date in one transaction (the whole batch commits or
    none of it does) — used by the historic-results text import. Each row:
    ``{"draw_date": iso date str, "numbers": [n1..n6], "jackpot_prize": float | None,
    "winners": int}``. Re-uploading the same date overwrites it, so importing
    the same file twice (or a file that repeats a date) is safe.
    """
    if not rows:
        return {"inserted": 0, "updated": 0, "total": 0}
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            dates = [r["draw_date"] for r in rows]
            placeholders = ",".join("?" * len(dates))
            cur.execute(
                f"SELECT draw_date FROM lotto_draw WHERE draw_date IN ({placeholders})",
                dates,
            )
            seen = {r[0] for r in cur.fetchall()}
            inserted = updated = 0
            for row in rows:
                draw_date = row["draw_date"]
                n1, n2, n3, n4, n5, n6 = row["numbers"]
                cur.execute(
                    """
                    INSERT INTO lotto_draw (draw_date, n1, n2, n3, n4, n5, n6, jackpot_prize, winners)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (draw_date) DO UPDATE SET
                        n1 = excluded.n1, n2 = excluded.n2, n3 = excluded.n3,
                        n4 = excluded.n4, n5 = excluded.n5, n6 = excluded.n6,
                        jackpot_prize = excluded.jackpot_prize, winners = excluded.winners
                    """,
                    (
                        draw_date,
                        n1,
                        n2,
                        n3,
                        n4,
                        n5,
                        n6,
                        row.get("jackpot_prize"),
                        row.get("winners", 0),
                    ),
                )
                if draw_date in seen:
                    updated += 1
                else:
                    inserted += 1
                    seen.add(draw_date)
            return {"inserted": inserted, "updated": updated, "total": len(rows)}


def get_lotto_draw_id_by_date(draw_date: Any) -> int | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("SELECT id FROM lotto_draw WHERE draw_date = ?", (draw_date,))
            row = cur.fetchone()
            return row[0] if row else None


def update_lotto_draw(
    draw_id: int,
    draw_date: Any,
    numbers: list[int] | None,
    jackpot_prize: float | None = None,
    winners: int = 0,
) -> dict[str, Any] | None:
    """Update an existing draw's date, numbers, jackpot prize, and winner count
    in place, keeping its id and attempts. ``numbers`` may be None to
    clear/leave the result unset."""
    n1, n2, n3, n4, n5, n6 = numbers if numbers is not None else (None,) * 6
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE lotto_draw SET draw_date = ?, n1 = ?, n2 = ?, n3 = ?, n4 = ?, n5 = ?, n6 = ?,
                    jackpot_prize = ?, winners = ?
                WHERE id = ?
                RETURNING id
                """,
                (draw_date, n1, n2, n3, n4, n5, n6, jackpot_prize, winners, draw_id),
            )
            row = cur.fetchone()
            if row is None:
                return None
            return _lotto_draw_detail(cur, draw_id)


def delete_lotto_draw(draw_id: int) -> bool:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("DELETE FROM lotto_draw WHERE id = ?", (draw_id,))
            return cur.rowcount > 0


def insert_lotto_attempt(
    draw_id: int, numbers: list[int], ticket: int | None = None
) -> dict[str, Any] | None:
    """Add one attempt under a draw and return the refreshed draw detail.
    ``ticket`` groups this attempt with the other board plays on the same
    physical ticket, so the UI can cluster them; leave it None otherwise."""
    n1, n2, n3, n4, n5, n6 = numbers
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO lotto_attempt (draw_id, ticket, n1, n2, n3, n4, n5, n6)
                SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM lotto_draw WHERE id = ?)
                RETURNING id
                """,
                (draw_id, ticket, n1, n2, n3, n4, n5, n6, draw_id),
            )
            if not cur.fetchone():
                return None
            return _lotto_draw_detail(cur, draw_id)


def update_lotto_attempt(
    draw_id: int, attempt_id: int, numbers: list[int], ticket: int | None = None
) -> dict[str, Any] | None:
    n1, n2, n3, n4, n5, n6 = numbers
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE lotto_attempt SET ticket = ?, n1 = ?, n2 = ?, n3 = ?, n4 = ?, n5 = ?, n6 = ?
                WHERE id = ? AND draw_id = ?
                RETURNING id
                """,
                (ticket, n1, n2, n3, n4, n5, n6, attempt_id, draw_id),
            )
            if not cur.fetchone():
                return None
            return _lotto_draw_detail(cur, draw_id)


def delete_lotto_attempt(draw_id: int, attempt_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "DELETE FROM lotto_attempt WHERE id = ? AND draw_id = ? RETURNING id",
                (attempt_id, draw_id),
            )
            if not cur.fetchone():
                return None
            return _lotto_draw_detail(cur, draw_id)


_APP_USER_PUBLIC_COLS = "id, username, created_at"


def any_app_users() -> bool:
    """True once at least one user has been added (Settings → Users).

    Login is opt-in the same way OTP used to be: ``require_session`` (see
    app/deps.py) only starts requiring a session once this flips to True, so
    a fresh checkout stays usable until someone deliberately adds a user.
    """
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("SELECT 1 FROM app_user LIMIT 1")
            return cur.fetchone() is not None


def list_app_users() -> list[dict[str, Any]]:
    """All app users, newest first. Never includes ``password_hash``."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                # LOWER(): Postgres has no NOCASE collation, so the
                # case-insensitive ordering SQLite got from the column's
                # COLLATE NOCASE has to be spelled out.
                f"SELECT {_APP_USER_PUBLIC_COLS} FROM app_user ORDER BY LOWER(username) ASC"
            )
            return [_row_to_dict(cur, r) for r in cur.fetchall()]


def insert_app_user(username: str, password_hash: str) -> dict[str, Any]:
    """Insert one user and return the public row (no ``password_hash``).

    Raises ``psycopg2.IntegrityError`` if ``username`` (case-insensitively)
    already exists — the caller turns that into a 409.
    """
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                INSERT INTO app_user (username, password_hash)
                VALUES (?, ?)
                RETURNING {_APP_USER_PUBLIC_COLS}
                """,
                (username, password_hash),
            )
            return _row_to_dict(cur, cur.fetchone())


def get_app_user_by_username(username: str) -> dict[str, Any] | None:
    """Full row (including ``password_hash``) for credential checks. Not used
    by any endpoint yet — kept for the login wiring this table is meant for."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                # LOWER() on both sides: SQLite matched case-insensitively via
                # the column's COLLATE NOCASE, and login must keep doing so.
                # The unique index on LOWER(username) serves this lookup.
                "SELECT id, username, password_hash, created_at FROM app_user "
                "WHERE LOWER(username) = LOWER(?)",
                (username,),
            )
            row = cur.fetchone()
            return _row_to_dict(cur, row) if row else None


def update_app_user(
    user_id: int,
    username: str | None,
    password_hash: str | None,
) -> dict[str, Any] | None:
    """Update whichever of ``username``/``password_hash`` is not None and
    return the refreshed public row (or ``None`` if no such user).

    Raises ``psycopg2.IntegrityError`` on a username collision.
    """
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            if username is not None:
                cur.execute(
                    "UPDATE app_user SET username = ? WHERE id = ?",
                    (username, user_id),
                )
            if password_hash is not None:
                cur.execute(
                    "UPDATE app_user SET password_hash = ? WHERE id = ?",
                    (password_hash, user_id),
                )
            cur.execute(
                f"SELECT {_APP_USER_PUBLIC_COLS} FROM app_user WHERE id = ?",
                (user_id,),
            )
            row = cur.fetchone()
            return _row_to_dict(cur, row) if row else None


def delete_app_user(user_id: int) -> bool:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("DELETE FROM app_user WHERE id = ?", (user_id,))
            return cur.rowcount > 0


_COMPANY_FLAG_COLUMNS: tuple[str, ...] = (
    # Income-side (Settings → Companies "Income" group; main grid in
    # PayslipFormFields).
    "show_total",
    "show_basic_salary",
    "show_commission",
    "show_reimbursement",
    "show_medical_reimbursement",
    "show_others",
    "show_allowances",
    "show_thirteenth_month",
    # Deduction-side ("Deductions" group; the aside in PayslipFormFields).
    "show_withholding_tax",
    "show_sss_contribution",
    "show_philhealth",
    "show_pag_ibig",
    "show_mp2",
    "show_trust_fund",
)

# Every flag defaults to shown -- that was every column's behavior before
# per-company visibility existed -- except Trust Fund, which is new and off
# everywhere until a company turns it on.
_COMPANY_FLAG_DEFAULTS: dict[str, bool] = {c: True for c in _COMPANY_FLAG_COLUMNS}
_COMPANY_FLAG_DEFAULTS["show_trust_fund"] = False

_COMPANY_PUBLIC_COLS = (
    "id, name, created_at, sort_order, " + ", ".join(_COMPANY_FLAG_COLUMNS)
)


def list_companies() -> list[dict[str, Any]]:
    """All companies, in their drag-to-reorder order (Settings → Companies)."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"SELECT {_COMPANY_PUBLIC_COLS} FROM company ORDER BY sort_order ASC"
            )
            return [_row_to_dict(cur, r) for r in cur.fetchall()]


def insert_company(name: str, flags: dict[str, bool] | None = None) -> dict[str, Any]:
    """Insert one company at the end of the order and return its row.

    ``flags`` maps a subset (or none) of ``_COMPANY_FLAG_COLUMNS`` to a bool;
    anything omitted falls back to ``_COMPANY_FLAG_DEFAULTS``.

    Raises ``psycopg2.IntegrityError`` if ``name`` (case-insensitively)
    already exists -- the caller turns that into a 409.
    """
    merged = {**_COMPANY_FLAG_DEFAULTS, **(flags or {})}
    values = [merged[c] for c in _COMPANY_FLAG_COLUMNS]
    cols_sql = ", ".join(_COMPANY_FLAG_COLUMNS)
    placeholders_sql = ", ".join("?" for _ in _COMPANY_FLAG_COLUMNS)
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                INSERT INTO company (name, sort_order, {cols_sql})
                VALUES (
                    ?, COALESCE((SELECT MAX(sort_order) FROM company), -1) + 1,
                    {placeholders_sql}
                )
                RETURNING {_COMPANY_PUBLIC_COLS}
                """,
                (name, *values),
            )
            return _row_to_dict(cur, cur.fetchone())


def reorder_companies(ordered_ids: list[int]) -> list[dict[str, Any]] | None:
    """Renumber ``sort_order`` so companies appear in ``ordered_ids`` order.

    Returns ``None`` if ``ordered_ids`` is not exactly the set of existing
    company ids (the caller turns that into a 400) -- otherwise the freshly
    reordered list, same shape as ``list_companies``.
    """
    if not ordered_ids:
        return None
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("SELECT id FROM company")
            existing_ids = {r[0] for r in cur.fetchall()}
            if set(ordered_ids) != existing_ids or len(ordered_ids) != len(existing_ids):
                return None
            # Push every sort_order into a non-overlapping range first so the
            # per-row UPDATEs below can renumber freely without tripping the
            # UNIQUE (sort_order) index mid-statement.
            cur.execute("UPDATE company SET sort_order = id + 1000000")
            for i, cid in enumerate(ordered_ids):
                cur.execute(
                    "UPDATE company SET sort_order = ? WHERE id = ?", (i, int(cid))
                )
            cur.execute(
                f"SELECT {_COMPANY_PUBLIC_COLS} FROM company ORDER BY sort_order ASC"
            )
            return [_row_to_dict(cur, r) for r in cur.fetchall()]


def update_company(
    company_id: int, name: str, flags: dict[str, bool] | None = None
) -> dict[str, Any] | None:
    """Rename/retag a company and return its refreshed row (or ``None`` if no
    such company). ``flags`` -- see ``insert_company``. Raises
    ``psycopg2.IntegrityError`` on a name collision."""
    merged = {**_COMPANY_FLAG_DEFAULTS, **(flags or {})}
    values = [merged[c] for c in _COMPANY_FLAG_COLUMNS]
    set_sql = ", ".join(f"{c} = ?" for c in _COMPANY_FLAG_COLUMNS)
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                UPDATE company SET name = ?, {set_sql}
                WHERE id = ?
                RETURNING {_COMPANY_PUBLIC_COLS}
                """,
                (name, *values, company_id),
            )
            row = cur.fetchone()
            return _row_to_dict(cur, row) if row else None


def delete_company(company_id: int) -> bool:
    """Delete a company, or False if no such id.

    Raises ``ValueError`` (the caller turns that into a 409) if any payslip
    still carries this company's name -- deletion never cascades into
    payslip rows.
    """
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("SELECT name FROM company WHERE id = ?", (company_id,))
            row = cur.fetchone()
            if row is None:
                return False
            name = row[0]
            cur.execute("SELECT COUNT(*) FROM payslip WHERE company = ?", (name,))
            in_use = cur.fetchone()[0]
            if in_use:
                raise ValueError(
                    f'Cannot delete "{name}": {in_use} payslip(s) still use it.'
                )
            cur.execute("DELETE FROM company WHERE id = ?", (company_id,))
            return cur.rowcount > 0


_TRAVEL_TRIP_COLS = "id, title, entry_year, entry_month, entry_month_end, notes, created_at"
_TRAVEL_FLIGHT_COLS = (
    "id, trip_id, flight_number, flight_date, departure_time, arrival_time, "
    "from_location, from_map_url, to_location, to_map_url, notes, created_at"
)
_TRAVEL_TRANSPORT_COLS = (
    "id, trip_id, mode, number, travel_date, departure_time, arrival_time, "
    "from_location, from_map_url, to_location, to_map_url, notes, created_at"
)
_TRAVEL_ITINERARY_COLS = (
    "id, trip_id, item_date, item_end_date, start_time, end_time, activity, "
    "location_name, location_map_url, notes, created_at"
)
_TRAVEL_ACCOMMODATION_COLS = (
    "id, trip_id, name, checkin_date, checkout_date, checkin_time, checkout_time, "
    "booking_confirmation, instructions, location_name, location_map_url, notes, created_at"
)


def _travel_flights_rows(cur: Any, trip_id: int) -> list[dict[str, Any]]:
    cur.execute(
        f"""
        SELECT {_TRAVEL_FLIGHT_COLS} FROM travel_flight
        WHERE trip_id = ?
        ORDER BY flight_date ASC NULLS LAST, created_at ASC, id ASC
        """,
        (trip_id,),
    )
    return [_row_to_dict(cur, r) for r in cur.fetchall()]


def _travel_transport_rows(cur: Any, trip_id: int) -> list[dict[str, Any]]:
    cur.execute(
        f"""
        SELECT {_TRAVEL_TRANSPORT_COLS} FROM travel_transport
        WHERE trip_id = ?
        ORDER BY travel_date ASC NULLS LAST, created_at ASC, id ASC
        """,
        (trip_id,),
    )
    return [_row_to_dict(cur, r) for r in cur.fetchall()]


def _travel_itinerary_rows(cur: Any, trip_id: int) -> list[dict[str, Any]]:
    cur.execute(
        f"""
        SELECT {_TRAVEL_ITINERARY_COLS} FROM travel_itinerary
        WHERE trip_id = ?
        ORDER BY item_date ASC, start_time ASC NULLS LAST, created_at ASC, id ASC
        """,
        (trip_id,),
    )
    return [_row_to_dict(cur, r) for r in cur.fetchall()]


def _travel_accommodations_rows(cur: Any, trip_id: int) -> list[dict[str, Any]]:
    cur.execute(
        f"""
        SELECT {_TRAVEL_ACCOMMODATION_COLS} FROM travel_accommodation
        WHERE trip_id = ?
        ORDER BY checkin_date ASC, created_at ASC, id ASC
        """,
        (trip_id,),
    )
    return [_row_to_dict(cur, r) for r in cur.fetchall()]


def _travel_trip_detail(cur: Any, trip_id: int) -> dict[str, Any] | None:
    cur.execute(f"SELECT {_TRAVEL_TRIP_COLS} FROM travel_trip WHERE id = ?", (trip_id,))
    row = cur.fetchone()
    if row is None:
        return None
    trip = _row_to_dict(cur, row)
    return {
        "trip": trip,
        "flights": _travel_flights_rows(cur, trip_id),
        "transport": _travel_transport_rows(cur, trip_id),
        "itinerary": _travel_itinerary_rows(cur, trip_id),
        "accommodations": _travel_accommodations_rows(cur, trip_id),
    }


def list_travel_trips(limit: int = 500) -> list[dict[str, Any]]:
    """Every trip (newest entry-period first), each with its flights,
    itinerary, and accommodations nested — one query per sub-table rather
    than N+1 per-trip queries."""
    limit = max(1, min(limit, 2000))
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                f"""
                SELECT {_TRAVEL_TRIP_COLS} FROM travel_trip
                ORDER BY entry_year DESC, entry_month DESC, id DESC
                LIMIT ?
                """,
                (limit,),
            )
            trips = [_row_to_dict(cur, r) for r in cur.fetchall()]
            if not trips:
                return []
            ids = [t["id"] for t in trips]
            placeholders = ",".join("?" * len(ids))

            cur.execute(
                f"""
                SELECT {_TRAVEL_FLIGHT_COLS} FROM travel_flight
                WHERE trip_id IN ({placeholders})
                ORDER BY flight_date ASC NULLS LAST, created_at ASC, id ASC
                """,
                ids,
            )
            flights_by_trip: dict[int, list[dict[str, Any]]] = {}
            for r in cur.fetchall():
                f = _row_to_dict(cur, r)
                flights_by_trip.setdefault(f["trip_id"], []).append(f)

            cur.execute(
                f"""
                SELECT {_TRAVEL_TRANSPORT_COLS} FROM travel_transport
                WHERE trip_id IN ({placeholders})
                ORDER BY travel_date ASC NULLS LAST, created_at ASC, id ASC
                """,
                ids,
            )
            transport_by_trip: dict[int, list[dict[str, Any]]] = {}
            for r in cur.fetchall():
                tr = _row_to_dict(cur, r)
                transport_by_trip.setdefault(tr["trip_id"], []).append(tr)

            cur.execute(
                f"""
                SELECT {_TRAVEL_ITINERARY_COLS} FROM travel_itinerary
                WHERE trip_id IN ({placeholders})
                ORDER BY item_date ASC, start_time ASC NULLS LAST, created_at ASC, id ASC
                """,
                ids,
            )
            itinerary_by_trip: dict[int, list[dict[str, Any]]] = {}
            for r in cur.fetchall():
                i = _row_to_dict(cur, r)
                itinerary_by_trip.setdefault(i["trip_id"], []).append(i)

            cur.execute(
                f"""
                SELECT {_TRAVEL_ACCOMMODATION_COLS} FROM travel_accommodation
                WHERE trip_id IN ({placeholders})
                ORDER BY checkin_date ASC, created_at ASC, id ASC
                """,
                ids,
            )
            accommodations_by_trip: dict[int, list[dict[str, Any]]] = {}
            for r in cur.fetchall():
                a = _row_to_dict(cur, r)
                accommodations_by_trip.setdefault(a["trip_id"], []).append(a)

            return [
                {
                    "trip": t,
                    "flights": flights_by_trip.get(t["id"], []),
                    "transport": transport_by_trip.get(t["id"], []),
                    "itinerary": itinerary_by_trip.get(t["id"], []),
                    "accommodations": accommodations_by_trip.get(t["id"], []),
                }
                for t in trips
            ]


def insert_travel_trip(
    title: str,
    entry_year: int,
    entry_month: int,
    entry_month_end: int,
    notes: str | None,
) -> dict[str, Any]:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO travel_trip (title, entry_year, entry_month, entry_month_end, notes)
                VALUES (?, ?, ?, ?, ?)
                RETURNING id
                """,
                (title, entry_year, entry_month, entry_month_end, notes),
            )
            trip_id = cur.fetchone()[0]
            detail = _travel_trip_detail(cur, trip_id)
            assert detail is not None
            return detail


def update_travel_trip(
    trip_id: int,
    title: str,
    entry_year: int,
    entry_month: int,
    entry_month_end: int,
    notes: str | None,
) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE travel_trip SET
                    title = ?, entry_year = ?, entry_month = ?, entry_month_end = ?, notes = ?
                WHERE id = ?
                RETURNING id
                """,
                (title, entry_year, entry_month, entry_month_end, notes, trip_id),
            )
            if not cur.fetchone():
                return None
            return _travel_trip_detail(cur, trip_id)


def delete_travel_trip(trip_id: int) -> bool:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute("DELETE FROM travel_trip WHERE id = ?", (trip_id,))
            return cur.rowcount > 0


def insert_travel_flight(
    trip_id: int,
    flight_number: str,
    flight_date: Any,
    departure_time: str | None,
    arrival_time: str | None,
    from_location: str | None,
    from_map_url: str | None,
    to_location: str | None,
    to_map_url: str | None,
    notes: str | None,
) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO travel_flight (
                    trip_id, flight_number, flight_date, departure_time, arrival_time,
                    from_location, from_map_url, to_location, to_map_url, notes
                )
                SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                WHERE EXISTS (SELECT 1 FROM travel_trip WHERE id = ?)
                RETURNING id
                """,
                (
                    trip_id, flight_number, flight_date, departure_time, arrival_time,
                    from_location, from_map_url, to_location, to_map_url, notes, trip_id,
                ),
            )
            if not cur.fetchone():
                return None
            return _travel_trip_detail(cur, trip_id)


def update_travel_flight(
    trip_id: int,
    flight_id: int,
    flight_number: str,
    flight_date: Any,
    departure_time: str | None,
    arrival_time: str | None,
    from_location: str | None,
    from_map_url: str | None,
    to_location: str | None,
    to_map_url: str | None,
    notes: str | None,
) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE travel_flight SET
                    flight_number = ?, flight_date = ?, departure_time = ?, arrival_time = ?,
                    from_location = ?, from_map_url = ?, to_location = ?, to_map_url = ?, notes = ?
                WHERE id = ? AND trip_id = ?
                RETURNING id
                """,
                (
                    flight_number, flight_date, departure_time, arrival_time,
                    from_location, from_map_url, to_location, to_map_url, notes,
                    flight_id, trip_id,
                ),
            )
            if not cur.fetchone():
                return None
            return _travel_trip_detail(cur, trip_id)


def delete_travel_flight(trip_id: int, flight_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "DELETE FROM travel_flight WHERE id = ? AND trip_id = ? RETURNING id",
                (flight_id, trip_id),
            )
            if not cur.fetchone():
                return None
            return _travel_trip_detail(cur, trip_id)


def insert_travel_transport(
    trip_id: int,
    mode: str,
    number: str | None,
    travel_date: Any,
    departure_time: str | None,
    arrival_time: str | None,
    from_location: str | None,
    from_map_url: str | None,
    to_location: str | None,
    to_map_url: str | None,
    notes: str | None,
) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO travel_transport (
                    trip_id, mode, number, travel_date, departure_time, arrival_time,
                    from_location, from_map_url, to_location, to_map_url, notes
                )
                SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                WHERE EXISTS (SELECT 1 FROM travel_trip WHERE id = ?)
                RETURNING id
                """,
                (
                    trip_id, mode, number, travel_date, departure_time, arrival_time,
                    from_location, from_map_url, to_location, to_map_url, notes, trip_id,
                ),
            )
            if not cur.fetchone():
                return None
            return _travel_trip_detail(cur, trip_id)


def update_travel_transport(
    trip_id: int,
    transport_id: int,
    mode: str,
    number: str | None,
    travel_date: Any,
    departure_time: str | None,
    arrival_time: str | None,
    from_location: str | None,
    from_map_url: str | None,
    to_location: str | None,
    to_map_url: str | None,
    notes: str | None,
) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE travel_transport SET
                    mode = ?, number = ?, travel_date = ?, departure_time = ?, arrival_time = ?,
                    from_location = ?, from_map_url = ?, to_location = ?, to_map_url = ?, notes = ?
                WHERE id = ? AND trip_id = ?
                RETURNING id
                """,
                (
                    mode, number, travel_date, departure_time, arrival_time,
                    from_location, from_map_url, to_location, to_map_url, notes,
                    transport_id, trip_id,
                ),
            )
            if not cur.fetchone():
                return None
            return _travel_trip_detail(cur, trip_id)


def delete_travel_transport(trip_id: int, transport_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "DELETE FROM travel_transport WHERE id = ? AND trip_id = ? RETURNING id",
                (transport_id, trip_id),
            )
            if not cur.fetchone():
                return None
            return _travel_trip_detail(cur, trip_id)


def insert_travel_itinerary(
    trip_id: int,
    item_date: Any,
    item_end_date: Any,
    start_time: str | None,
    end_time: str | None,
    activity: str,
    location_name: str | None,
    location_map_url: str | None,
    notes: str | None,
) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO travel_itinerary (
                    trip_id, item_date, item_end_date, start_time, end_time, activity,
                    location_name, location_map_url, notes
                )
                SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
                WHERE EXISTS (SELECT 1 FROM travel_trip WHERE id = ?)
                RETURNING id
                """,
                (
                    trip_id, item_date, item_end_date, start_time, end_time, activity,
                    location_name, location_map_url, notes, trip_id,
                ),
            )
            if not cur.fetchone():
                return None
            return _travel_trip_detail(cur, trip_id)


def update_travel_itinerary(
    trip_id: int,
    item_id: int,
    item_date: Any,
    item_end_date: Any,
    start_time: str | None,
    end_time: str | None,
    activity: str,
    location_name: str | None,
    location_map_url: str | None,
    notes: str | None,
) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE travel_itinerary SET
                    item_date = ?, item_end_date = ?, start_time = ?, end_time = ?, activity = ?,
                    location_name = ?, location_map_url = ?, notes = ?
                WHERE id = ? AND trip_id = ?
                RETURNING id
                """,
                (
                    item_date, item_end_date, start_time, end_time, activity,
                    location_name, location_map_url, notes,
                    item_id, trip_id,
                ),
            )
            if not cur.fetchone():
                return None
            return _travel_trip_detail(cur, trip_id)


def delete_travel_itinerary(trip_id: int, item_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "DELETE FROM travel_itinerary WHERE id = ? AND trip_id = ? RETURNING id",
                (item_id, trip_id),
            )
            if not cur.fetchone():
                return None
            return _travel_trip_detail(cur, trip_id)


def insert_travel_accommodation(
    trip_id: int,
    name: str,
    checkin_date: Any,
    checkout_date: Any,
    checkin_time: str | None,
    checkout_time: str | None,
    booking_confirmation: str | None,
    instructions: str | None,
    location_name: str | None,
    location_map_url: str | None,
    notes: str | None,
) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO travel_accommodation (
                    trip_id, name, checkin_date, checkout_date, checkin_time, checkout_time,
                    booking_confirmation, instructions, location_name, location_map_url, notes
                )
                SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                WHERE EXISTS (SELECT 1 FROM travel_trip WHERE id = ?)
                RETURNING id
                """,
                (
                    trip_id, name, checkin_date, checkout_date, checkin_time, checkout_time,
                    booking_confirmation, instructions, location_name, location_map_url, notes,
                    trip_id,
                ),
            )
            if not cur.fetchone():
                return None
            return _travel_trip_detail(cur, trip_id)


def update_travel_accommodation(
    trip_id: int,
    accommodation_id: int,
    name: str,
    checkin_date: Any,
    checkout_date: Any,
    checkin_time: str | None,
    checkout_time: str | None,
    booking_confirmation: str | None,
    instructions: str | None,
    location_name: str | None,
    location_map_url: str | None,
    notes: str | None,
) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                UPDATE travel_accommodation SET
                    name = ?, checkin_date = ?, checkout_date = ?, checkin_time = ?,
                    checkout_time = ?, booking_confirmation = ?, instructions = ?,
                    location_name = ?, location_map_url = ?, notes = ?
                WHERE id = ? AND trip_id = ?
                RETURNING id
                """,
                (
                    name, checkin_date, checkout_date, checkin_time, checkout_time,
                    booking_confirmation, instructions, location_name, location_map_url, notes,
                    accommodation_id, trip_id,
                ),
            )
            if not cur.fetchone():
                return None
            return _travel_trip_detail(cur, trip_id)


def delete_travel_accommodation(trip_id: int, accommodation_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "DELETE FROM travel_accommodation WHERE id = ? AND trip_id = ? RETURNING id",
                (accommodation_id, trip_id),
            )
            if not cur.fetchone():
                return None
            return _travel_trip_detail(cur, trip_id)
