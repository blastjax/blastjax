#!/usr/bin/env python3
"""
Drop ``lotto_attempt.hidden`` -- the hide/unhide feature has been removed
from the app, so the column (and whatever hide state was already set on
existing attempts) is dropped too.

This is destructive and irreversible: any attempt currently hidden loses
that flag for good. There's no data to preserve here (hidden attempts are
already visible everywhere in the app now that the feature is gone), but
run with ``--dry-run`` first if you want to double-check before committing.

Usage (from the repo root, with the venv active):

    python backend/scripts/drop_lotto_attempt_hidden_column.py [--dry-run]

Reads the Postgres URL from ``.env.local`` (``DATABASE_URL_UNPOOLED``
preferred: this is DDL, so it wants the direct endpoint, not the pooler),
same convention as ``normalize_time_types.py`` / ``add_trust_fund_and_company_flags.py``.
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
    ap = argparse.ArgumentParser(description="Drop lotto_attempt.hidden.")
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
        # ---- pre-flight: refuse to run if the column is already gone ----
        cur.execute(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'lotto_attempt' AND column_name = 'hidden'
            """
        )
        if not cur.fetchone():
            print("pre-flight FAILED: lotto_attempt.hidden does not exist -- nothing to do")
            conn.rollback()
            return 1
        print("pre-flight OK: lotto_attempt.hidden exists")

        cur.execute("SELECT count(*) FROM lotto_attempt WHERE hidden <> 0")
        (hidden_count,) = cur.fetchone()
        print(f"{hidden_count} attempt(s) currently hidden -- that flag will be lost")

        if args.dry_run:
            print("\n--dry-run: no changes made")
            conn.rollback()
            return 0

        print("dropping lotto_attempt.hidden")
        cur.execute("ALTER TABLE lotto_attempt DROP COLUMN hidden")

        # ---- verify before committing ----
        cur.execute(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'lotto_attempt' AND column_name = 'hidden'
            """
        )
        if cur.fetchone():
            raise RuntimeError("post-migration check failed: lotto_attempt.hidden still exists")

        conn.commit()
        print("\ncommitted: lotto_attempt.hidden dropped")
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
