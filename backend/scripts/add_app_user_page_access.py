#!/usr/bin/env python3
"""
Adds per-user page visibility to Settings -> Users:

  app_user.is_superuser  BOOLEAN NOT NULL DEFAULT false
  app_user.allowed_pages TEXT  -- JSON array of nav hrefs, NULL = no restriction

NULL ``allowed_pages`` (the default for every existing user) means "no
restriction" -- nothing changes for anyone until an admin unchecks pages for
a user in Settings -> Users. ``is_superuser`` always bypasses the
restriction regardless of ``allowed_pages``.

Also flips ``is_superuser`` on for the user named ``blastjax`` (case
-insensitive), so the app owner keeps seeing every page by default.

Usage (from the repo root, with the venv active):

    python backend/scripts/add_app_user_page_access.py [--dry-run]

Reads the Postgres URL from ``.env.local`` (``DATABASE_URL_UNPOOLED``
preferred: this is DDL, so it wants the direct endpoint, not the pooler),
same convention as ``add_remaining_company_column_flags.py``.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _SCRIPTS_DIR.parent
_REPO_ROOT = _BACKEND_DIR.parent
_DEFAULT_ENV_FILE = _REPO_ROOT / ".env.local"

_SUPERUSER_USERNAME = "blastjax"


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
        description="Add per-user page-visibility columns to app_user."
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
        # ---- pre-flight: refuse to run if either column already exists ----
        cur.execute(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'app_user'
              AND column_name = ANY(%s)
            """,
            (["is_superuser", "allowed_pages"],),
        )
        existing = [r[0] for r in cur.fetchall()]
        if existing:
            print("pre-flight FAILED; nothing changed:", file=sys.stderr)
            for c in existing:
                print(f"  app_user.{c} already exists", file=sys.stderr)
            conn.rollback()
            return 1
        print("pre-flight OK: neither column exists yet")

        if args.dry_run:
            print("\n--dry-run: no changes made")
            conn.rollback()
            return 0

        # ---- the migration ----
        print("adding app_user.is_superuser and app_user.allowed_pages")
        cur.execute("ALTER TABLE app_user ADD COLUMN is_superuser BOOLEAN NOT NULL DEFAULT false")
        cur.execute("ALTER TABLE app_user ADD COLUMN allowed_pages TEXT")
        cur.execute(
            "UPDATE app_user SET is_superuser = true WHERE LOWER(username) = LOWER(%s)",
            (_SUPERUSER_USERNAME,),
        )
        print(f"marked '{_SUPERUSER_USERNAME}' as superuser ({cur.rowcount} row(s))")

        # ---- verify before committing ----
        cur.execute(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'app_user'
              AND column_name = ANY(%s)
            """,
            (["is_superuser", "allowed_pages"],),
        )
        found = {r[0] for r in cur.fetchall()}
        missing = {"is_superuser", "allowed_pages"} - found
        if missing:
            raise RuntimeError(f"post-migration check failed, missing: {sorted(missing)}")

        conn.commit()
        print("\ncommitted")
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
