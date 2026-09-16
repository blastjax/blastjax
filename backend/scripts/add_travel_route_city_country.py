#!/usr/bin/env python3
"""
Add optional ``from_city``/``from_country``/``to_city``/``to_country`` to
``travel_flight`` and ``travel_transport``.

When a flight/transit's From or To field is resolved from a pasted Google
Maps link, the resolver now also reverse-geocodes the link's coordinates
(via OpenStreetMap's free Nominatim service) to a city and country. These
columns hold that, separately from the full place name already stored in
``from_location``/``to_location`` -- the calendar view uses them to build a
"City, Country" (flights) or "City" (transit) title instead of the full
resolved name.

Eight additive ``ADD COLUMN`` statements (all nullable TEXT), applied in one
transaction.

Usage (from the repo root, with the venv active):

    python backend/scripts/add_travel_route_city_country.py [--dry-run]

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

_TABLES = ("travel_flight", "travel_transport")
_COLUMNS = ("from_city", "from_country", "to_city", "to_country")


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
        description="Add from_city/from_country/to_city/to_country to travel_flight and travel_transport."
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
            WHERE table_schema = 'public' AND table_name = ANY(%s) AND column_name = ANY(%s)
            """,
            (list(_TABLES), list(_COLUMNS)),
        )
        existing = cur.fetchall()
        if existing:
            print("pre-flight FAILED; nothing changed:", file=sys.stderr)
            for t, c in existing:
                print(f"  {t}.{c} already exists", file=sys.stderr)
            conn.rollback()
            return 1
        print("pre-flight OK: none of the new columns exist yet")

        if args.dry_run:
            print("\n--dry-run: no changes made")
            conn.rollback()
            return 0

        for table in _TABLES:
            for column in _COLUMNS:
                print(f"adding {table}.{column}")
                cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} TEXT")

        cur.execute(
            """
            SELECT table_name, column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ANY(%s) AND column_name = ANY(%s)
            """,
            (list(_TABLES), list(_COLUMNS)),
        )
        found = {(t, c) for t, c in cur.fetchall()}
        expected = {(t, c) for t in _TABLES for c in _COLUMNS}
        missing = expected - found
        if missing:
            raise RuntimeError(f"post-migration check failed, missing: {sorted(missing)}")

        conn.commit()
        print(f"\ncommitted: {len(_COLUMNS)} columns added to each of {', '.join(_TABLES)}")
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
