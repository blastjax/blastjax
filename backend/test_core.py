#!/usr/bin/env python
"""Self-checks for the logic that would fail silently if it broke.

Plain asserts, stdlib only -- run with ``python backend/test_core.py``.
No database is touched: everything here is pure.

Scope is deliberate. The SQL translation and write-detection helpers decide
whether a statement reaches Postgres correctly and whether it runs inside a
transaction, so a regression there corrupts data rather than raising. The
travel checks pin the column-list/serializer equivalence that the travel
layer's table-driven form depends on.
"""

from __future__ import annotations

import datetime as dt
import os
import re
import sys
import time
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import db
import schema
from app import security
from app.routers import travel


def check_translate_sql() -> None:
    t = db._translate_sql
    assert t("SELECT a FROM t WHERE id = ?", True) == "SELECT a FROM t WHERE id = %s"
    assert t("SELECT 1", False) == "SELECT 1"

    # A ? inside a string literal or quoted identifier is data, not a placeholder.
    assert t("SELECT '?' FROM t", False) == "SELECT '?' FROM t"
    assert t('SELECT "we?rd" FROM t', False) == 'SELECT "we?rd" FROM t'
    # Doubled-quote escape must not end the literal early.
    assert t("SELECT 'it''s ?' FROM t WHERE a = ?", True) == "SELECT 'it''s ?' FROM t WHERE a = %s"

    # Comments are copied through verbatim.
    assert t("SELECT a -- ? not a param\nFROM t WHERE b = ?", True) == (
        "SELECT a -- ? not a param\nFROM t WHERE b = %s"
    )
    assert t("SELECT /* ? */ a FROM t WHERE b = ?", True) == "SELECT /* ? */ a FROM t WHERE b = %s"

    # psycopg2 only %-interpolates when params are supplied, so a literal %
    # is doubled exactly then -- and never inside a string literal.
    assert t("SELECT 50 % 7", False) == "SELECT 50 % 7"
    assert t("SELECT 50 % 7 WHERE a = ?", True) == "SELECT 50 %% 7 WHERE a = %s"
    assert t("SELECT a FROM t WHERE b LIKE '100%'", True) == "SELECT a FROM t WHERE b LIKE '100%'"


def check_is_write() -> None:
    w = db._is_write
    assert w("SELECT * FROM payslip") is False
    assert w("  \n  select 1") is False
    assert w("-- comment\nSELECT 1") is False
    assert w("/* block */ SELECT 1") is False

    assert w("INSERT INTO t VALUES (1)") is True
    assert w("UPDATE t SET a = 1") is True
    assert w("DELETE FROM t") is True

    # A read that holds locks still needs a transaction.
    assert w("SELECT * FROM t FOR UPDATE") is True
    assert w("SELECT * FROM t FOR SHARE") is True

    # An identifier that merely starts with "select" is not a SELECT.
    # Misreading one as a read would run a write outside its transaction.
    assert w("selectivity_refresh()") is True
    assert w("SELECTED_INTO t") is True


def check_normalize() -> None:
    n = db._normalize
    # datetime must be tested before date: datetime subclasses date, and
    # checking date first would truncate every timestamp to its day.
    assert n(dt.datetime(2026, 4, 13, 2, 6, 38)) == "2026-04-13T02:06:38"
    assert n(dt.date(2026, 4, 13)) == "2026-04-13"
    assert n(dt.time(2, 6, 38)) == "02:06:38"
    assert n(Decimal("12.50")) == 12.5
    assert isinstance(n(Decimal("12.50")), float)
    assert n(memoryview(b"pdf")) == b"pdf"
    assert n(None) is None
    assert n("plain") == "plain"
    assert n(7) == 7


def check_nights_and_days() -> None:
    # Both dates are required by TravelAccommodationCreate and NOT NULL in the
    # table, so this only ever sees two real dates -- no None cases to pin.
    nd = travel._nights_and_days
    assert nd("2026-04-13", "2026-04-16") == (3, 4)
    # Same-day stay counts the check-in day: 0 nights, 1 day.
    assert nd("2026-04-13", "2026-04-13") == (0, 1)
    # Crossing a month and a year boundary.
    assert nd("2026-01-30", "2026-02-02") == (3, 4)
    assert nd("2026-12-30", "2027-01-02") == (3, 4)


def check_request_models_match_writable_columns() -> None:
    """Each trip sub-resource's request model must carry exactly the columns
    its table takes from the body.

    The travel writes build their SQL from ``db.travel_child_columns``, so a
    model field added without its column -- or a column renamed without the
    field -- would otherwise be dropped on save with no error. Note what is
    deliberately absent: ``id``/``trip_id``/``created_at`` are server-set, and
    ``sort_order`` is computed by the INSERT rather than sent by the client.
    """
    from app.schemas.travel import (
        TravelAccommodationCreate,
        TravelCityCreate,
        TravelFlightCreate,
        TravelItineraryCreate,
        TravelTransportCreate,
    )

    models = {
        "cities": TravelCityCreate,
        "flights": TravelFlightCreate,
        "transport": TravelTransportCreate,
        "itinerary": TravelItineraryCreate,
        "accommodations": TravelAccommodationCreate,
    }
    assert set(models) == set(db._TRAVEL_CHILDREN), "a child kind has no request model"
    for kind, model in models.items():
        fields = set(model.model_fields)
        cols = set(db.travel_child_columns(kind))
        assert fields == cols, f"{kind}: model/column mismatch {fields ^ cols}"

    # The city's sort_order is the one column the INSERT computes itself.
    assert "sort_order" not in db.travel_child_columns("cities")
    assert set(db.travel_child_columns("cities")) == {"name", "start_date", "end_date"}


def check_write_values_rejects_drift() -> None:
    """A write whose keys do not match the table's columns must fail loudly."""
    for bad in ({"name": "x"}, {"name": "x", "start_date": None, "end_date": None, "oops": 1}):
        try:
            db._travel_write_values("cities", bad)
        except ValueError:
            continue
        raise AssertionError(f"accepted mismatched write values: {bad}")

    ok = {"name": "x", "start_date": None, "end_date": None}
    assert db._travel_write_values("cities", ok) == ("name", "start_date", "end_date")


def _capture_sql(fn, *args) -> list[tuple[str, tuple]]:
    """Run a db write with the connection stubbed out, returning the SQL it
    built and the parameters it bound.

    ``fetchone`` answers ``None``, so each write returns at its
    "row not found" branch without needing a database.
    """

    calls: list[tuple[str, tuple]] = []

    class _Cursor:
        def execute(self, sql, params=None):
            calls.append((" ".join(sql.split()), params))

        def fetchone(self):
            return None

    @contextmanager
    def _conn():
        yield None

    @contextmanager
    def _cursor(_):
        yield _Cursor()

    saved = db.get_connection, db.db_cursor
    db.get_connection, db.db_cursor = _conn, _cursor
    try:
        assert fn(*args) is None
    finally:
        db.get_connection, db.db_cursor = saved
    return calls


def check_child_write_sql() -> None:
    """Pin the SQL and, above all, the parameter order of the generic writes.

    Parameters are positional, so a column list and a value list that drift
    apart would write the right number of values into the wrong columns --
    silently, since the types mostly match.
    """
    city = {"name": "Osaka", "start_date": "2026-04-13", "end_date": "2026-04-16"}

    (sql, params), = _capture_sql(db.insert_travel_child, "cities", 7, city)
    assert sql.startswith(
        "INSERT INTO travel_city (trip_id, name, start_date, end_date, sort_order) SELECT ?, ?, ?, ?,"
    ), sql
    assert "WHERE EXISTS (SELECT 1 FROM travel_trip WHERE id = ?) RETURNING id" in sql
    # trip_id, the three values, the sort_order subquery's trip_id, the EXISTS guard.
    assert params == (7, "Osaka", "2026-04-13", "2026-04-16", 7, 7), params

    (sql, params), = _capture_sql(db.update_travel_child, "cities", 7, 5, city)
    assert sql == (
        "UPDATE travel_city SET name = ?, start_date = ?, end_date = ? "
        "WHERE id = ? AND trip_id = ? RETURNING id"
    ), sql
    # Values first, then the record id, then the parent id.
    assert params == ("Osaka", "2026-04-13", "2026-04-16", 5, 7), params

    (sql, params), = _capture_sql(db.delete_travel_child, "cities", 7, 5)
    assert sql == "DELETE FROM travel_city WHERE id = ? AND trip_id = ? RETURNING id"
    assert params == (5, 7), params

    # A table with no computed column binds trip_id exactly twice: the row's
    # own parent link and the EXISTS guard.
    item = dict.fromkeys(db.travel_child_columns("itinerary"), None)
    (sql, params), = _capture_sql(db.insert_travel_child, "itinerary", 3, item)
    assert sql.startswith("INSERT INTO travel_itinerary (trip_id, "), sql
    assert params == (3, *([None] * len(item)), 3), params


def check_lotto_bulk_attempts_sql() -> None:
    """Pin "Paste attempts"' bulk insert to one multi-row INSERT (not one
    ``POST .../attempts`` per line -- see ``insert_lotto_attempts_bulk``'s
    docstring for why), and pin its existence guard: an empty ``RETURNING``
    means the draw doesn't exist, and the function returns None without
    building a draw detail.
    """
    calls: list[tuple[str, tuple]] = []

    class _Cursor:
        def __init__(self, returning: list[tuple]) -> None:
            self._returning = returning

        def execute(self, sql, params=None):
            calls.append((" ".join(sql.split()), tuple(params) if params else params))

        def fetchall(self):
            return self._returning

    @contextmanager
    def _conn():
        yield None

    def _cursor_factory(returning: list[tuple]):
        @contextmanager
        def _cursor(_):
            yield _Cursor(returning)

        return _cursor

    attempts = [([1, 2, 3, 4, 5, 6], 1), ([7, 8, 9, 10, 11, 12], 1)]

    saved = db.get_connection, db.db_cursor, db._lotto_draw_detail
    db.get_connection = _conn
    db.db_cursor = _cursor_factory([(101,), (102,)])
    db._lotto_draw_detail = lambda cur, draw_id: {"sentinel_draw_id": draw_id}
    try:
        result = db.insert_lotto_attempts_bulk(9, attempts)
    finally:
        db.get_connection, db.db_cursor, db._lotto_draw_detail = saved

    assert result == {"sentinel_draw_id": 9}, result
    assert len(calls) == 1, calls
    sql, params = calls[0]
    assert sql.count("(%s, %s, %s, %s, %s, %s, %s, %s)") == 2, sql
    assert "WHERE EXISTS (SELECT 1 FROM lotto_draw WHERE id = %s)" in sql, sql
    # Each attempt: draw_id, ticket, n1..n6 -- then the trailing draw_id for
    # the existence guard.
    assert params == (9, 1, 1, 2, 3, 4, 5, 6, 9, 1, 7, 8, 9, 10, 11, 12, 9), params

    saved = db.get_connection, db.db_cursor, db._lotto_draw_detail
    db.get_connection = _conn
    db.db_cursor = _cursor_factory([])  # nothing came back -> draw 404 doesn't exist
    db._lotto_draw_detail = lambda cur, draw_id: {"sentinel_draw_id": draw_id}
    try:
        assert db.insert_lotto_attempts_bulk(404, attempts) is None
    finally:
        db.get_connection, db.db_cursor, db._lotto_draw_detail = saved


def check_lotto_bulk_upsert_sql() -> None:
    """Pin the historic-results import's bulk upsert to one multi-row INSERT
    (not one INSERT per row -- see ``upsert_lotto_draws_bulk``'s docstring for
    why that matters), and pin that a date repeated within the same pasted
    batch collapses to a single VALUES row, last occurrence winning.

    Skipping that collapse would build a VALUES list with the same
    (draw_date, game_id) twice, and Postgres rejects an ON CONFLICT DO UPDATE
    that would affect one row a second time in the same statement -- so this
    is the difference between the import working and every re-pasted
    overlap crashing it.
    """
    calls: list[tuple[str, tuple]] = []

    class _Cursor:
        def execute(self, sql, params=None):
            calls.append((" ".join(sql.split()), tuple(params) if params else params))

        def fetchall(self):
            return [("2026-01-01",)]  # pretend this date is already stored

    @contextmanager
    def _conn():
        yield None

    @contextmanager
    def _cursor(_):
        yield _Cursor()

    rows = [
        {"draw_date": "2026-01-01", "numbers": [1, 2, 3, 4, 5, 6], "jackpot_prize": 1.0, "winners": 0},
        {"draw_date": "2026-01-08", "numbers": [7, 8, 9, 10, 11, 12], "jackpot_prize": 2.0, "winners": 1},
        # Same date pasted twice in one batch -- must collapse to one row.
        {"draw_date": "2026-01-08", "numbers": [13, 14, 15, 16, 17, 18], "jackpot_prize": 3.0, "winners": 2},
    ]
    saved = db.get_connection, db.db_cursor
    db.get_connection, db.db_cursor = _conn, _cursor
    try:
        result = db.upsert_lotto_draws_bulk(3, rows)
    finally:
        db.get_connection, db.db_cursor = saved

    # 2026-01-01 was already seen -> updated; 2026-01-08 is new -> inserted
    # once, then updated again by its own within-batch repeat.
    assert result == {"inserted": 1, "updated": 2, "total": 3}, result
    assert len(calls) == 2, calls

    select_sql, select_params = calls[0]
    assert select_sql.startswith(
        "SELECT draw_date FROM lotto_draw WHERE game_id = %s AND draw_date IN"
    ), select_sql
    assert select_params == (3, "2026-01-01", "2026-01-08", "2026-01-08"), select_params

    insert_sql, insert_params = calls[1]
    assert insert_sql.count("(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)") == 2, insert_sql
    assert "ON CONFLICT (draw_date, game_id) DO UPDATE SET" in insert_sql
    assert len(insert_params) == 20, insert_params  # 2 rows (repeat collapsed) x 10 columns
    # The second 2026-01-08 pasted (13..18) wins, not the first (7..12).
    assert insert_params[10] == "2026-01-08", insert_params
    assert insert_params[12:18] == (13, 14, 15, 16, 17, 18), insert_params
    assert insert_params[18:20] == (3.0, 2), insert_params


def check_serialize_detail_shape() -> None:
    """The response carries stored columns through untouched and adds only the
    accommodation's derived stay length."""
    detail: dict[str, object] = {"trip": {"id": 1, "title": "Osaka"}}
    for kind in db._TRAVEL_CHILDREN:
        detail[kind] = []
    detail["accommodations"] = [
        {"id": 9, "name": "Hotel", "checkin_date": "2026-04-13", "checkout_date": "2026-04-16"}
    ]

    out = travel._serialize_detail(detail)
    assert set(out) == set(detail), "response gained or lost a top-level field"
    assert out["trip"] == detail["trip"]
    acc = out["accommodations"][0]
    assert (acc["nights"], acc["days"]) == (3, 4)
    # Stored fields survive the derivation.
    assert acc["id"] == 9 and acc["name"] == "Hotel"


def _schema_columns() -> dict[str, set[str]]:
    """Table -> column names, as schema.py's DDL declares them."""
    tables: dict[str, set[str]] = {}
    for name, ddl in schema.SCHEMA:
        cols = set()
        for line in ddl.strip().splitlines():
            word = re.match(r"[A-Za-z_][A-Za-z0-9_]*", line.strip())
            if word is None:
                continue
            # Match the leading word exactly: a prefix test would read the
            # column `checkin_date` as a CHECK constraint and drop it.
            if word.group(0).upper() in ("CHECK", "UNIQUE", "PRIMARY", "FOREIGN"):
                continue
            cols.add(word.group(0))
        tables[name] = cols
    return tables


def _plain_columns(cols_sql: str) -> set[str]:
    """The bare column names in a SELECT list, skipping computed expressions
    such as ``(pdf_data IS NOT NULL) AS has_pdf``."""
    return {
        part for part in (c.strip() for c in cols_sql.split(","))
        if part.replace("_", "").isalnum()
    }


def check_schema_covers_what_the_app_queries() -> None:
    """The DDL must define every column the query layer selects.

    schema.py is called the single owner of the schema, but that only holds if
    something checks it. It had already drifted while the DDL lived inside the
    migration script: the whole ``company`` table was live and queried while
    absent from it, so rebuilding would have produced a database the app
    errors against on first use.

    Startup needs no separate check here -- ``init_schema`` derives the tables
    it requires from this same DDL.
    """
    columns = _schema_columns()

    selected = {
        "company": db._COMPANY_PUBLIC_COLS,
        "payslip": db._PAYSLIP_RETURN_COLS,
        "travel_trip": db._TRAVEL_TRIP_COLS,
        "travel_city": db._TRAVEL_CITY_COLS,
        "travel_flight": db._TRAVEL_FLIGHT_COLS,
        "travel_transport": db._TRAVEL_TRANSPORT_COLS,
        "travel_itinerary": db._TRAVEL_ITINERARY_COLS,
        "travel_accommodation": db._TRAVEL_ACCOMMODATION_COLS,
    }
    for table, cols_sql in selected.items():
        missing = _plain_columns(cols_sql) - columns[table]
        assert not missing, f"{table}: selected but not in the DDL: {sorted(missing)}"

    # Written by save_payslip_defaults, which builds its INSERT from this
    # tuple rather than from a SELECT list -- exactly what drifted before.
    missing_defaults = set(db._PAYSLIP_DEFAULT_FORM_COLS) - columns["payslip_default"]
    assert not missing_defaults, f"payslip_default: written but not in the DDL: {sorted(missing_defaults)}"

    # Every company visibility flag must exist as a column.
    missing_flags = set(db._COMPANY_FLAG_COLUMNS) - columns["company"]
    assert not missing_flags, f"company flags not in the DDL: {sorted(missing_flags)}"


def check_clean_city() -> None:
    c = travel._clean_city
    assert c("Makati City Municipality") == "Makati"
    assert c("Bangkok Metropolitan Area") == "Bangkok"
    assert c("Cebu") == "Cebu"
    # A name that is only the suffix keeps its name rather than emptying out.
    assert c("Municipality") == "Municipality"


def check_auth_disable_flag() -> None:
    # The local docker override sets this to skip the login screen; anything
    # that made an unset/off value read as "on" would silently unauthenticate
    # the deployed API, so pin both directions.
    d = security._auth_disabled
    for on in ("1", "true", "TRUE", "yes", " 1 "):
        os.environ["BUDGET_DISABLE_AUTH"] = on
        assert d() is True, on
    for off in ("", "0", "false", "no", "maybe"):
        os.environ["BUDGET_DISABLE_AUTH"] = off
        assert d() is False, off
    del os.environ["BUDGET_DISABLE_AUTH"]
    assert d() is False


def check_lotto_game_seed() -> None:
    """The seed rows must stay unique, and their INSERT must read as a write.

    ``init_schema`` runs ``sync_lotto_games`` on a connection that starts in
    autocommit: were the statement misread as a read, it would never open a
    transaction to commit and a newly added game would vanish on restart.
    """
    ids = [i for i, _ in schema.SEED_LOTTO_GAMES]
    names = [n for _, n in schema.SEED_LOTTO_GAMES]
    assert len(set(ids)) == len(ids), f"duplicate seed ids: {ids}"
    assert len(set(names)) == len(names), f"duplicate seed names: {names}"
    # list_lotto_games orders by the trailing field size, so every name needs one.
    for name in names:
        assert re.search(r"/\d+$", name), f"no field size in {name!r}"
    assert db._is_write(
        'INSERT INTO "lotto_game" (id, name) VALUES (%s, %s) ON CONFLICT DO NOTHING'
    )


def check_db_idle_reaper() -> None:
    """The reaper must free the pool only when it is genuinely unused.

    Both directions cost something real: closing a pool with a checkout
    outstanding yanks a connection out of a live request, and never closing
    one leaves Neon's compute billed through every idle night, which is what
    exhausted the quota and took the API down.
    """

    class _FakePool:
        def __init__(self) -> None:
            self.closed = False

        def closeall(self) -> None:
            self.closed = True

    saved = (db._POOL, db._INFLIGHT, db._LAST_ACTIVITY)
    prior = os.environ.get("BUDGET_DB_IDLE_CLOSE_SECONDS")
    try:
        os.environ["BUDGET_DB_IDLE_CLOSE_SECONDS"] = "120"

        # Just used: nothing to reap.
        db._POOL, db._INFLIGHT = _FakePool(), 0
        db._LAST_ACTIVITY = time.monotonic()
        assert db._take_idle_pool() is None, "reaped a pool still in use"

        # Idle long enough, but a request is holding a connection.
        db._LAST_ACTIVITY = time.monotonic() - 600
        db._INFLIGHT = 1
        assert db._take_idle_pool() is None, "reaped under a live checkout"
        assert db._POOL is not None

        # Idle with nothing in flight: hand it over and detach it.
        db._INFLIGHT = 0
        pool = db._take_idle_pool()
        assert isinstance(pool, _FakePool), "idle pool was not reaped"
        assert db._POOL is None, "reaped pool stayed attached"
        assert db._take_idle_pool() is None, "handed the same pool out twice"

        # Opt-out must hold a pool open however long it has idled.
        os.environ["BUDGET_DB_IDLE_CLOSE_SECONDS"] = "0"
        db._POOL = _FakePool()
        db._LAST_ACTIVITY = time.monotonic() - 600
        assert db._take_idle_pool() is None, "reaped while disabled"
    finally:
        db._POOL, db._INFLIGHT, db._LAST_ACTIVITY = saved
        if prior is None:
            os.environ.pop("BUDGET_DB_IDLE_CLOSE_SECONDS", None)
        else:
            os.environ["BUDGET_DB_IDLE_CLOSE_SECONDS"] = prior


def main() -> int:
    checks = [v for k, v in sorted(globals().items()) if k.startswith("check_")]
    for fn in checks:
        fn()
        print(f"  ok  {fn.__name__}")
    print(f"\n{len(checks)} checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
