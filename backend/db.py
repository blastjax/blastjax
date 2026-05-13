"""
Payslip and installment storage: PostgreSQL (``DATABASE_URL`` or ``DB_*``).
"""

from __future__ import annotations

import logging
import os
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
    Resolve Postgres URL. When ``DB_HOST`` and ``DB_NAME`` (and other DB_* parts) are set,
    those win over ``DATABASE_URL`` so a machine-level ``DATABASE_URL`` cannot silently
    override Neon's ``DB_*`` from the project ``.env``.
    """
    from_parts = _database_url_from_db_parts()
    if from_parts:
        return from_parts
    direct = (os.environ.get("DATABASE_URL") or "").strip()
    if direct:
        return direct
    return None


def _postgres_connect_url(url: str) -> str:
    """Neon rejects non-TLS handshakes unless ``sslmode=require`` (or stricter) is set."""
    u = url.strip()
    low = u.lower()
    if not (low.startswith("postgresql:") or low.startswith("postgres:")):
        return u
    parsed = urlparse(u)
    host = (parsed.hostname or "").lower()
    if "neon.tech" not in host:
        return u
    pairs = parse_qsl(parsed.query, keep_blank_values=True)
    keys_lower = {k.lower() for k, _ in pairs}
    if "sslmode" in keys_lower:
        return u
    merged = list(pairs) + [("sslmode", "require")]
    new_query = urlencode(merged)
    return urlunparse(parsed._replace(query=new_query))


def storage_kind() -> str:
    u = (database_url() or "").strip().lower()
    if u.startswith("postgresql:") or u.startswith("postgres:"):
        return "postgres"
    return "none"


def use_database() -> bool:
    return storage_kind() == "postgres"


_pg_pool: pool.ThreadedConnectionPool | None = None


def _pool_bounds() -> tuple[int, int]:
    mn = int(os.environ.get("DB_POOL_MIN") or "1")
    mx = int(os.environ.get("DB_POOL_MAX") or "10")
    mn = max(1, mn)
    mx = max(mn, min(mx, 50))
    return mn, mx


def _ensure_pool() -> pool.ThreadedConnectionPool:
    """Lazy pool: reuse TCP/TLS sessions to Postgres (Neon) instead of connecting per request."""
    global _pg_pool
    if _pg_pool is not None:
        return _pg_pool
    url = (database_url() or "").strip()
    if storage_kind() != "postgres":
        raise RuntimeError(
            "DATABASE_URL must be a postgresql://... URL (or set DB_HOST, DB_NAME, …).",
        )
    mn, mx = _pool_bounds()
    _pg_pool = pool.ThreadedConnectionPool(mn, mx, dsn=_postgres_connect_url(url))
    return _pg_pool


def close_connection_pool() -> None:
    """Release pooled connections on process shutdown (e.g. uvicorn reload)."""
    global _pg_pool
    if _pg_pool is not None:
        _pg_pool.closeall()
        _pg_pool = None


@contextmanager
def get_connection():
    if storage_kind() != "postgres":
        raise RuntimeError(
            "DATABASE_URL must be a postgresql://... URL (or set DB_HOST, DB_NAME, …).",
        )
    p = _ensure_pool()
    conn = p.getconn()
    try:
        # Neon/pooled roles sometimes get an empty search_path; unqualified DDL then fails with
        # InvalidSchemaName: no schema has been selected to create in.
        with conn.cursor() as cur:
            cur.execute("SET search_path TO public")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        p.putconn(conn)


_MINIMAL_PERF_INDEX_DDL = """
CREATE INDEX IF NOT EXISTS idx_payslip_period_sort ON payslip(
    period_year DESC, period_month DESC, period_half DESC, created_at DESC
);
CREATE INDEX IF NOT EXISTS idx_installment_finish_name ON installment(finish_date, name);
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
    cur.execute("ANALYZE")


def _migrate_payslip_rename_employee_hdmf_to_pag_ibig() -> None:
    """Rename legacy payslip column employee_hdmf -> pag_ibig (once)."""
    if not use_database():
        return
    with get_connection() as conn:
        with db_cursor(conn) as cur:
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


def _migrate_payslip_drop_source_filename() -> None:
    if not use_database():
        return
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "ALTER TABLE payslip DROP COLUMN IF EXISTS source_filename"
            )


def _migrate_payslip_thirteenth_month() -> None:
    """Add 13th month pay column if missing (existing DBs)."""
    if not use_database():
        return
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "ALTER TABLE payslip ADD COLUMN IF NOT EXISTS thirteenth_month DOUBLE PRECISION"
            )


def _migrate_payslip_basic_salary() -> None:
    """Add basic salary column if missing (existing DBs)."""
    if not use_database():
        return
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "ALTER TABLE payslip ADD COLUMN IF NOT EXISTS basic_salary DOUBLE PRECISION"
            )


def _migrate_payslip_created_at_default() -> None:
    """Ensure older payslip tables can create rows without explicit timestamps."""
    if not use_database():
        return
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                "ALTER TABLE payslip ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ"
            )
            cur.execute("UPDATE payslip SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL")
            cur.execute(
                "ALTER TABLE payslip ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP"
            )
            cur.execute("ALTER TABLE payslip ALTER COLUMN created_at SET NOT NULL")


def _migrate_payslip_deduction_columns() -> None:
    """Add withholding / statutory deduction columns if missing (existing DBs)."""
    if not use_database():
        return
    new_cols: tuple[tuple[str, str], ...] = (
        ("withholding_tax", "REAL"),
        ("sss_contribution", "REAL"),
        ("philhealth", "REAL"),
        ("pag_ibig", "REAL"),
    )
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            for name, typ in new_cols:
                cur.execute(
                    f"ALTER TABLE payslip ADD COLUMN IF NOT EXISTS {name} {typ.replace('REAL', 'DOUBLE PRECISION')}"
                )


def _init_schema_minimal() -> None:
    stmts = [
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


def _migrate_installment_original_total_from_principal() -> None:
    """Keep installment.original_total equal to sum(principal) on schedule lines (not payment_total)."""
    if not use_database():
        return
    with get_connection() as conn:
        with db_cursor(conn) as cur:
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


def init_schema() -> None:
    if not use_database():
        return
    _init_schema_minimal()
    _migrate_payslip_drop_source_filename()
    _migrate_payslip_rename_employee_hdmf_to_pag_ibig()
    _migrate_payslip_deduction_columns()
    _migrate_payslip_thirteenth_month()
    _migrate_payslip_basic_salary()
    _migrate_payslip_created_at_default()
    _migrate_installment_original_total_from_principal()


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
) -> int:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO payslip (
                    total, commission, reimbursement,
                    medical_reimbursement, others, mp2, allowances,
                    thirteenth_month, basic_salary,
                    period_year, period_month, period_half, notes,
                    withholding_tax, sss_contribution, philhealth, pag_ibig
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                       thirteenth_month, basic_salary,
                       period_year, period_month, period_half, notes,
                       withholding_tax, sss_contribution, philhealth, pag_ibig,
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
                       thirteenth_month, basic_salary,
                       period_year, period_month, period_half, notes,
                       withholding_tax, sss_contribution, philhealth, pag_ibig,
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
) -> bool:
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


def _installment_row_dict(cur: Any, installment_id: int) -> dict[str, Any] | None:
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
    out: list[dict[str, Any]] = []
    for r in cur.fetchall():
        out.append(dict(zip(cols, r)))
    return out


def get_installment(installment_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            return _installment_row_dict(cur, installment_id)


def fetch_installment_with_lines(
    installment_id: int,
) -> dict[str, Any] | None:
    """Single transaction: installment row + schedule lines (halves round trips vs two calls)."""
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            inst = _installment_row_dict(cur, installment_id)
            if not inst:
                return None
            lines = _installment_lines_rows(cur, installment_id)
            return {"installment": inst, "lines": lines}


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
            return _installment_lines_rows(cur, installment_id)


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
        SELECT COALESCE(SUM(principal), 0)
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
    """
    UPDATE line, recompute aggregates, return installment + lines in one transaction.
    Returns None if the schedule row did not exist (rowcount 0).
    """
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
            inst = _installment_row_dict(cur, installment_id)
            if not inst:
                return None
            lines = _installment_lines_rows(cur, installment_id)
            return {"installment": inst, "lines": lines}


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
            cur.execute(
                "UPDATE installment_line SET seq = id + 1000000 WHERE installment_id = ?",
                (installment_id,),
            )
            for i, lid in enumerate(ordered_line_ids):
                cur.execute(
                    """
                    UPDATE installment_line SET seq = ?
                    WHERE installment_id = ? AND id = ?
                    """,
                    (i + 1, installment_id, lid),
                )
            _recompute_installment_aggregates(cur, installment_id)
            inst = _installment_row_dict(cur, installment_id)
            if not inst:
                return None
            lines = _installment_lines_rows(cur, installment_id)
            return {"installment": inst, "lines": lines}


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
            UPDATE installment_line SET
                principal = ?,
                interest = ?,
                payment_total = ?
            WHERE installment_id = ? AND seq = ?
            """,
            (principal, interest, ptot, installment_id, seq),
        )
        if cur.rowcount == 0:
            cur.execute(
                """
                INSERT INTO installment_line (installment_id, seq, principal, interest, payment_total)
                VALUES (?, ?, ?, ?, ?)
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
