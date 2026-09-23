#!/usr/bin/env python3
"""
Add the booking-detail columns the redesigned Travels page edits (airline,
seat, gate, room, price, ...) to the four trip child tables. All nullable
TEXT, all additive, applied in one transaction and safe to re-run
(``ADD COLUMN IF NOT EXISTS``).

Usage (from the repo root, with the venv active):

    python backend/scripts/add_travel_booking_fields.py [--dry-run]

Reads the Postgres URL from ``.env.local`` (``DATABASE_URL_UNPOOLED``
preferred: this is DDL, so it wants the direct endpoint, not the pooler).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]

COLUMNS = {
    "travel_flight": ["title", "airline", "seat", "terminal", "gate", "baggage", "confirmation"],
    "travel_transport": ["title", "operator", "seat", "travel_class", "platform", "confirmation"],
    "travel_itinerary": ["booked_via", "price", "confirmation"],
    "travel_accommodation": ["room", "guests", "phone", "booked_via", "price"],
}


def main() -> int:
    ap = argparse.ArgumentParser(description="Add travel booking-detail columns.")
    ap.add_argument("--env-file", type=Path, default=_REPO_ROOT / ".env.local")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    import psycopg2
    from dotenv import dotenv_values

    values = dotenv_values(args.env_file)
    url = (values.get("DATABASE_URL_UNPOOLED") or values.get("DATABASE_URL") or "").strip()
    if not url.startswith(("postgres://", "postgresql://")):
        sys.exit(f"no Postgres URL in {args.env_file}")

    conn = psycopg2.connect(url)
    try:
        cur = conn.cursor()
        for table, cols in COLUMNS.items():
            for col in cols:
                print(f"{table}.{col}")
                cur.execute(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "{col}" TEXT')
        if args.dry_run:
            conn.rollback()
            print("\n--dry-run: rolled back, nothing changed")
        else:
            conn.commit()
            print("\ncommitted")
    except Exception:
        conn.rollback()
        print("\nROLLED BACK - no changes were made", file=sys.stderr)
        raise
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
