"""
Local-mirror reconciliation.

When ``LOCAL_DB_*`` is configured alongside the cloud ``DB_*``/``DATABASE_URL``,
the app serves from the local Postgres and keeps it in sync with the cloud:

    Read  (any request): if the cloud changed since our last pull, mirror cloud -> local; serve local.
    Write (POST/PUT/...): apply on local -> push local -> cloud.

If the cloud is unreachable the app falls back to local and flags the local DB as
having unpushed changes (``_sync_state.local_dirty``); while that flag is set we
never pull cloud -> local (that would clobber the offline writes). The flag is
cleared on the next successful push.

Change detection uses a per-database content *fingerprint* stored in the local
``_sync_state`` table, not a direct cloud-vs-local row comparison. The two
databases can legitimately differ row-for-row (the cloud carries dropped legacy
columns and some duplicate/un-keyed rows the canonical schema can't hold), so we
instead track "did this database change since we last synced it" and copy in the
appropriate direction when it did.

The copy is tolerant of that drift: only columns common to both schemas are
copied, primary-key ids are preserved only for tables referenced by a foreign key
(so child rows still resolve), leaf-table ids are left for ``SERIAL`` to reassign,
and ``ON CONFLICT DO NOTHING`` skips rows that would violate a constraint.
"""

from __future__ import annotations

import hashlib
import logging
import threading
from typing import Any

from db import (
    db_cursor,
    get_cloud_connection,
    get_connection,
    sync_configured,
)

_log = logging.getLogger(__name__)

# Mirror tables in insert-safe order (parents before children). The same list is
# safe to TRUNCATE in one CASCADE statement. ``_app_meta`` / ``_sync_state`` are
# per-database bookkeeping and intentionally excluded.
_TABLES: tuple[str, ...] = (
    "payslip",
    "house_payment",
    "house_payment_entry",
    "installment",
    "installment_line",
    "blood_pressure",
)

# Subset of _TABLES that carry a ``created_at`` column, used for recency comparison.
_TIMESTAMPED_TABLES: tuple[str, ...] = (
    "payslip",
    "house_payment",
    "house_payment_entry",
    "installment",
    "blood_pressure",
)

# Tables whose ``id`` must be kept across the mirror: foreign-key targets (so
# child rows still resolve) plus clean, app-managed tables where preserving the
# id keeps the UI's references stable. Every other (leaf) table lets the
# destination's ``SERIAL`` assign fresh ids, which sidesteps duplicate ids in the
# dirty cloud data.
_PRESERVE_ID: frozenset[str] = frozenset(
    {"installment", "house_payment", "blood_pressure"}
)

_SYNC_STATE_DDL = (
    "CREATE TABLE IF NOT EXISTS _sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
)

# Serializes the actual copy operations so a background push (local->cloud) and a
# pull (cloud->local) from another request can't run at the same time and corrupt
# a half-mirrored table.
_recon_lock = threading.Lock()


def sync_enabled() -> bool:
    return sync_configured()


def cloud_reachable() -> bool:
    """Cheap liveness probe for the cloud DB (connect + ``SELECT 1``)."""
    try:
        with get_cloud_connection() as conn:
            with db_cursor(conn) as cur:
                cur.execute("SELECT 1")
        return True
    except Exception:
        return False


# --- sync state (stored in the local DB) --------------------------------------------


def _get_state(key: str) -> str | None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(_SYNC_STATE_DDL)
            cur.execute("SELECT value FROM _sync_state WHERE key = ?", (key,))
            row = cur.fetchone()
            return row[0] if row else None


def _set_state(key: str, value: str) -> None:
    with get_connection() as conn:
        with db_cursor(conn) as cur:
            cur.execute(_SYNC_STATE_DDL)
            cur.execute(
                "INSERT INTO _sync_state (key, value) VALUES (?, ?) "
                "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
                (key, value),
            )


def mark_local_dirty() -> None:
    """
    Flag the local DB as having changes not yet confirmed in the cloud.

    Called synchronously right after a write (a cheap local-only upsert) so that
    if the background push doesn't finish — process restart, crash, cloud down —
    a later read won't pull cloud over the unpushed local change. Cleared by the
    next successful push.
    """
    if not sync_enabled():
        return
    try:
        _set_state("local_dirty", "1")
    except Exception as e:  # noqa: BLE001 - never break the request
        _log.warning("could not mark local dirty: %s", e)


# --- fingerprints + copy -------------------------------------------------------------


def _fingerprint(cur: Any) -> str:
    """Order-independent content hash of the whole mirror, as seen by ``cur``'s DB."""
    parts: list[str] = []
    for table in _TABLES:
        cur.execute(
            f"SELECT COALESCE(md5(string_agg(r, ',' ORDER BY r)), '') "
            f"FROM (SELECT md5({table}::text) AS r FROM {table}) s"
        )
        parts.append(f"{table}={cur.fetchone()[0]}")
    return hashlib.md5("|".join(parts).encode("utf-8")).hexdigest()


def _latest_entry_ts(cur: Any) -> Any:
    """Return the MAX created_at across all timestamped tables, or None if all are empty."""
    union = " UNION ALL ".join(
        f"SELECT MAX(created_at) AS ts FROM {t}" for t in _TIMESTAMPED_TABLES
    )
    cur.execute(f"SELECT MAX(ts) FROM ({union}) sub")
    row = cur.fetchone()
    return row[0] if row else None


def _columns(cur: Any, table: str) -> list[str]:
    cur.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = ? "
        "ORDER BY ordinal_position",
        (table,),
    )
    return [r[0] for r in cur.fetchall()]


def _common_columns(src_cur: Any, dst_cur: Any, table: str) -> list[str]:
    dst = set(_columns(dst_cur, table))
    return [c for c in _columns(src_cur, table) if c in dst]


def _copy_all(src_cur: Any, dst_cur: Any) -> None:
    """Replace every mirror table in ``dst`` with ``src``'s rows (shared columns only)."""
    snapshot: dict[str, tuple[list[str], list[tuple[Any, ...]]]] = {}
    for table in _TABLES:
        cols = _common_columns(src_cur, dst_cur, table)
        if table not in _PRESERVE_ID:
            cols = [c for c in cols if c != "id"]
        # ORDER BY id keeps reassigned (SERIAL) ids stable across repeated copies.
        src_cur.execute(f"SELECT {', '.join(cols)} FROM {table} ORDER BY id")
        snapshot[table] = (cols, src_cur.fetchall())

    dst_cur.execute("TRUNCATE " + ", ".join(_TABLES) + " RESTART IDENTITY CASCADE")
    for table in _TABLES:
        cols, rows = snapshot[table]
        if rows:
            collist = ", ".join(cols)
            placeholders = ", ".join(["%s"] * len(cols))
            dst_cur.executemany(
                f"INSERT INTO {table} ({collist}) VALUES ({placeholders}) "
                f"ON CONFLICT DO NOTHING",
                rows,
            )
        if table in _PRESERVE_ID:
            # We inserted explicit ids, so advance the identity sequence past them.
            dst_cur.execute(
                f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                f"COALESCE((SELECT MAX(id) FROM {table}), 0) + 1, false)"
            )


# --- request hooks -------------------------------------------------------------------


def pull_before_request() -> None:
    """Mirror cloud -> local when the cloud changed since our last pull."""
    if not sync_enabled():
        return
    try:
        if _get_state("local_dirty") == "1":
            # Local has changes not yet pushed; pulling would clobber them.
            return
        if not cloud_reachable():
            return
        with _recon_lock:
            with get_cloud_connection() as cloud, db_cursor(cloud) as ccur:
                cloud_fp = _fingerprint(ccur)
                if cloud_fp == _get_state("cloud_fp"):
                    return  # cloud unchanged since last pull
                with get_connection() as local, db_cursor(local) as lcur:
                    _copy_all(ccur, lcur)
                    local_fp = _fingerprint(lcur)
            _set_state("cloud_fp", cloud_fp)
            _set_state("local_fp", local_fp)
    except Exception as e:  # noqa: BLE001 - sync must never break the request
        _log.warning("cloud->local mirror (pull) failed: %s", e)


def push_after_write() -> None:
    """Mirror local -> cloud after a write that changed local."""
    if not sync_enabled():
        return
    try:
        with _recon_lock:
            with get_connection() as local, db_cursor(local) as lcur:
                local_fp = _fingerprint(lcur)
            if local_fp == _get_state("local_fp") and _get_state("local_dirty") != "1":
                return  # local unchanged since last push
            if not cloud_reachable():
                _set_state("local_dirty", "1")
                return
            with get_connection() as local, db_cursor(local) as lcur, (
                get_cloud_connection()
            ) as cloud, db_cursor(cloud) as ccur:
                _copy_all(lcur, ccur)
                cloud_fp = _fingerprint(ccur)
                local_fp = _fingerprint(lcur)
            _set_state("cloud_fp", cloud_fp)
            _set_state("local_fp", local_fp)
            _set_state("local_dirty", "0")
    except Exception as e:  # noqa: BLE001 - sync must never break the request
        _log.warning("local->cloud mirror (push) failed: %s", e)
        try:
            _set_state("local_dirty", "1")
        except Exception:
            pass


def force_push_to_cloud() -> dict[str, Any]:
    """
    Manually mirror local -> cloud right now (used by the settings "Sync"
    button). Unlike :func:`push_after_write`, it copies regardless of the
    change fingerprint, so it works as an explicit "make the cloud match local"
    action. Returns a small status dict for the API to surface.
    """
    if not sync_enabled():
        return {"ok": False, "synced": False, "detail": "Mirror not configured."}
    if not cloud_reachable():
        try:
            _set_state("local_dirty", "1")
        except Exception:
            pass
        return {"ok": False, "synced": False, "detail": "Cloud is unreachable."}
    try:
        with _recon_lock:
            with get_connection() as local, db_cursor(local) as lcur, (
                get_cloud_connection()
            ) as cloud, db_cursor(cloud) as ccur:
                _copy_all(lcur, ccur)
                cloud_fp = _fingerprint(ccur)
                local_fp = _fingerprint(lcur)
            _set_state("cloud_fp", cloud_fp)
            _set_state("local_fp", local_fp)
            _set_state("local_dirty", "0")
        return {"ok": True, "synced": True}
    except Exception as e:  # noqa: BLE001
        _log.warning("manual local->cloud sync failed: %s", e)
        try:
            _set_state("local_dirty", "1")
        except Exception:
            pass
        return {"ok": False, "synced": False, "detail": str(e)}


def force_pull_from_cloud() -> dict[str, Any]:
    """
    Manually mirror cloud -> local right now (used by the settings "Sync from Cloud"
    button). Unconditionally overwrites local with cloud data.
    Returns a small status dict for the API to surface.
    """
    if not sync_enabled():
        return {"ok": False, "synced": False, "detail": "Mirror not configured."}
    if not cloud_reachable():
        return {"ok": False, "synced": False, "detail": "Cloud is unreachable."}
    try:
        with _recon_lock:
            with get_cloud_connection() as cloud, db_cursor(cloud) as ccur, (
                get_connection()
            ) as local, db_cursor(local) as lcur:
                _copy_all(ccur, lcur)
                cloud_fp = _fingerprint(ccur)
                local_fp = _fingerprint(lcur)
            _set_state("cloud_fp", cloud_fp)
            _set_state("local_fp", local_fp)
            _set_state("local_dirty", "0")
        return {"ok": True, "synced": True, "direction": "pull"}
    except Exception as e:  # noqa: BLE001
        _log.warning("manual cloud->local sync failed: %s", e)
        return {"ok": False, "synced": False, "detail": str(e)}


def get_latest_transaction_info() -> dict[str, Any]:
    """
    Return the latest transaction timestamps for local and cloud DBs.
    When sync is not configured only the cloud timestamp is available.
    """
    result: dict[str, Any] = {"sync_enabled": sync_enabled(), "local_ts": None, "cloud_ts": None}
    try:
        if sync_enabled():
            with get_connection() as conn:
                with db_cursor(conn) as cur:
                    ts = _latest_entry_ts(cur)
                    result["local_ts"] = ts.isoformat() if ts is not None else None
            with get_cloud_connection() as conn:
                with db_cursor(conn) as cur:
                    ts = _latest_entry_ts(cur)
                    result["cloud_ts"] = ts.isoformat() if ts is not None else None
        else:
            with get_connection() as conn:
                with db_cursor(conn) as cur:
                    ts = _latest_entry_ts(cur)
                    result["cloud_ts"] = ts.isoformat() if ts is not None else None
    except Exception as e:  # noqa: BLE001
        _log.warning("could not get latest transaction info: %s", e)
    return result


def smart_sync() -> dict[str, Any]:
    """
    Bidirectional sync: whichever database has the most recent entry wins and
    is copied to the other. If local has dirty (unpushed) changes it always
    pushes regardless of timestamps. Returns a status dict including
    ``direction`` (``"push"`` or ``"pull"``).
    """
    if not sync_enabled():
        return {"ok": False, "synced": False, "detail": "Mirror not configured."}
    if not cloud_reachable():
        try:
            _set_state("local_dirty", "1")
        except Exception:
            pass
        return {"ok": False, "synced": False, "detail": "Cloud is unreachable."}
    try:
        local_dirty = _get_state("local_dirty") == "1"
        with _recon_lock:
            with get_connection() as local, db_cursor(local) as lcur, (
                get_cloud_connection()
            ) as cloud, db_cursor(cloud) as ccur:
                if local_dirty:
                    direction = "push"
                else:
                    local_ts = _latest_entry_ts(lcur)
                    cloud_ts = _latest_entry_ts(ccur)
                    if cloud_ts is not None and (
                        local_ts is None or cloud_ts > local_ts
                    ):
                        direction = "pull"
                    else:
                        direction = "push"

                if direction == "pull":
                    _copy_all(ccur, lcur)
                else:
                    _copy_all(lcur, ccur)

                cloud_fp = _fingerprint(ccur)
                local_fp = _fingerprint(lcur)
            _set_state("cloud_fp", cloud_fp)
            _set_state("local_fp", local_fp)
            _set_state("local_dirty", "0")
        return {"ok": True, "synced": True, "direction": direction}
    except Exception as e:  # noqa: BLE001
        _log.warning("smart sync failed: %s", e)
        try:
            _set_state("local_dirty", "1")
        except Exception:
            pass
        return {"ok": False, "synced": False, "detail": str(e)}
