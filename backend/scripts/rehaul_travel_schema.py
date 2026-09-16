#!/usr/bin/env python3
"""
Rehaul the travel schema to match the new day-by-day itinerary UI.

Two changes, applied in one transaction:

  1. ``travel_trip`` drops its ``entry_year``/``entry_month``/``entry_month_end``
     "filed under a month" fields in favor of real ``start_date``/``end_date``
     DATE columns, which the new per-trip day-column timeline needs. Existing
     trips only ever recorded a month, so they're backfilled by approximation:
     ``start_date`` = the 1st of ``entry_month``/``entry_year``, ``end_date`` =
     the last day of ``entry_month_end`` (or ``entry_month`` if that was never
     set) in the same year.
  2. A new ``travel_city`` table (trip_id FK cascade, name, optional
     start/end date, sort_order) backs the "cities visited" chips the new UI
     shows per trip -- no prior data to migrate, since this concept didn't
     exist before.

The ``idx_travel_trip_period`` index (entry_year/entry_month ordered) is
replaced with one on the new (start_date, id).

Usage (from the repo root, with the venv active):

    python backend/scripts/rehaul_travel_schema.py [--dry-run]

Reads the Postgres URL from ``.env.local`` (``DATABASE_URL_UNPOOLED``
preferred: this is DDL, so it wants the direct endpoint, not the pooler),
same convention as ``normalize_time_types.py`` and
``add_trust_fund_and_company_flags.py``.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _SCRIPTS_DIR.parent
_REPO_ROOT = _BACKEND_DIR.parent
_DEFAULT_ENV_FILE = _REPO_ROOT / ".env.local"


def _resolve_pg_url(env_file: Path) -> str:
    from dotenv import dotenv_values

    if not env_file.is_file():
        sys.exit(f"env file not found: {env_file}")
    values = dotenv_values(env_file)
    url = (values.get("DATABASE_URL_UNPOOLED") or values.get("DATABASE_URL") or "").strip()
    if not url.startswith(("postgres://", "postgresql://")):
        sys.exit(f"no Postgres URL in {env_file}")
    return url


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Replace travel_trip's entry_year/month fields with real "
        "start_date/end_date, and add the travel_city table."
    )
    ap.add_argument("--env-file", type=Path, default=_DEFAULT_ENV_FILE)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    try:
        import psycopg2
    except ImportError:
        sys.exit("psycopg2 is required: pip install psycopg2-binary")

    url = _resolve_pg_url(args.env_file)
    conn = psycopg2.connect(url)
    conn.autocommit = False
    cur = conn.cursor()
    try:
        # ---- pre-flight: refuse to run if this migration already landed ----
        cur.execute(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'travel_trip'
              AND column_name IN ('start_date', 'end_date')
            """
        )
        already = {r[0] for r in cur.fetchall()}
        cur.execute(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'travel_city'"
        )
        city_table_exists = cur.fetchone() is not None
        if already or city_table_exists:
            print("pre-flight FAILED; nothing changed:", file=sys.stderr)
            for c in sorted(already):
                print(f"  travel_trip.{c} already exists", file=sys.stderr)
            if city_table_exists:
                print("  travel_city already exists", file=sys.stderr)
            conn.rollback()
            return 1
        print("pre-flight OK: travel_trip has no start_date/end_date yet, no travel_city table")

        if args.dry_run:
            print("\n--dry-run: no changes made")
            conn.rollback()
            return 0

        # ---- the migration ----
        print("adding travel_trip.start_date / end_date (nullable for now)")
        cur.execute("ALTER TABLE travel_trip ADD COLUMN start_date DATE")
        cur.execute("ALTER TABLE travel_trip ADD COLUMN end_date DATE")

        print("backfilling from entry_year/entry_month/entry_month_end")
        cur.execute(
            """
            UPDATE travel_trip SET
                start_date = make_date(entry_year, entry_month, 1),
                end_date = (
                    make_date(entry_year, COALESCE(entry_month_end, entry_month), 1)
                    + INTERVAL '1 month - 1 day'
                )::date
            """
        )

        print("enforcing NOT NULL on the new columns")
        cur.execute("ALTER TABLE travel_trip ALTER COLUMN start_date SET NOT NULL")
        cur.execute("ALTER TABLE travel_trip ALTER COLUMN end_date SET NOT NULL")
        cur.execute(
            "ALTER TABLE travel_trip ADD CONSTRAINT travel_trip_end_after_start "
            "CHECK (end_date >= start_date)"
        )

        print("dropping entry_year / entry_month / entry_month_end")
        cur.execute("ALTER TABLE travel_trip DROP COLUMN entry_year")
        cur.execute("ALTER TABLE travel_trip DROP COLUMN entry_month")
        cur.execute("ALTER TABLE travel_trip DROP COLUMN entry_month_end")

        print("replacing idx_travel_trip_period")
        cur.execute("DROP INDEX IF EXISTS idx_travel_trip_period")
        cur.execute(
            "CREATE INDEX idx_travel_trip_period ON travel_trip (start_date DESC, id DESC)"
        )

        print("creating travel_city")
        cur.execute(
            """
            CREATE TABLE travel_city (
                id         INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
                trip_id    INTEGER NOT NULL REFERENCES travel_trip (id) ON DELETE CASCADE,
                name       TEXT NOT NULL,
                start_date DATE,
                end_date   DATE,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CHECK (length(trim(name)) > 0)
            )
            """
        )
        cur.execute(
            "CREATE INDEX idx_travel_city_parent ON travel_city (trip_id, sort_order, id)"
        )

        # ---- verify before committing ----
        cur.execute(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'travel_trip'
            """
        )
        cols = {r[0] for r in cur.fetchall()}
        if not {"start_date", "end_date"} <= cols:
            raise RuntimeError(f"post-migration check failed, travel_trip columns: {sorted(cols)}")
        if {"entry_year", "entry_month", "entry_month_end"} & cols:
            raise RuntimeError(f"post-migration check failed, old columns still present: {sorted(cols)}")
        cur.execute("SELECT COUNT(*) FROM travel_trip WHERE start_date IS NULL OR end_date IS NULL")
        (null_count,) = cur.fetchone()
        if null_count:
            raise RuntimeError(f"post-migration check failed: {null_count} trip(s) missing dates")
        cur.execute(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'travel_city'"
        )
        if cur.fetchone() is None:
            raise RuntimeError("post-migration check failed: travel_city was not created")

        cur.execute("SELECT COUNT(*) FROM travel_trip")
        (trip_count,) = cur.fetchone()

        conn.commit()
        print(f"\ncommitted: {trip_count} trip(s) migrated to start_date/end_date; travel_city created")
    except Exception:
        conn.rollback()
        print("\nROLLED BACK - no changes were made", file=sys.stderr)
        raise
    finally:
        cur.close()
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
