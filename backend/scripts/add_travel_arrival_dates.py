#!/usr/bin/env python3
"""
Add an optional ``arrival_date`` to ``travel_flight`` and ``travel_transport``,
so an overnight flight/train/bus/ferry that lands on a later calendar day can
say so -- the itinerary UI uses this to span the leg across every day column
it's actually in transit, the same way an accommodation already spans its
check-in to check-out dates.

Two additive ``ADD COLUMN`` statements, applied in one transaction:

  1. ``travel_flight.arrival_date`` (DATE, nullable) -- NULL means the flight
     lands the same day it departs.
  2. ``travel_transport.arrival_date`` (DATE, nullable) -- same, for a bus/
     train/ferry leg.

Usage (from the repo root, with the venv active):

    python backend/scripts/add_travel_arrival_dates.py [--dry-run]

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
        description="Add travel_flight.arrival_date and travel_transport.arrival_date."
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
        cur.execute(
            """
            SELECT table_name, column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND column_name = 'arrival_date'
              AND table_name IN ('travel_flight', 'travel_transport')
            """
        )
        existing = cur.fetchall()
        if existing:
            print("pre-flight FAILED; nothing changed:", file=sys.stderr)
            for t, c in existing:
                print(f"  {t}.{c} already exists", file=sys.stderr)
            conn.rollback()
            return 1
        print("pre-flight OK: neither table has arrival_date yet")

        if args.dry_run:
            print("\n--dry-run: no changes made")
            conn.rollback()
            return 0

        print("adding travel_flight.arrival_date")
        cur.execute("ALTER TABLE travel_flight ADD COLUMN arrival_date DATE")

        print("adding travel_transport.arrival_date")
        cur.execute("ALTER TABLE travel_transport ADD COLUMN arrival_date DATE")

        cur.execute(
            """
            SELECT table_name FROM information_schema.columns
            WHERE table_schema = 'public' AND column_name = 'arrival_date'
              AND table_name IN ('travel_flight', 'travel_transport')
            """
        )
        found = {r[0] for r in cur.fetchall()}
        missing = {"travel_flight", "travel_transport"} - found
        if missing:
            raise RuntimeError(f"post-migration check failed, missing: {sorted(missing)}")

        conn.commit()
        print("\ncommitted: arrival_date added to travel_flight and travel_transport")
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
