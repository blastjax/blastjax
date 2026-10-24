#!/usr/bin/env python3
"""
Add the passkeys table. Additive, one transaction, safe to re-run
(only creates what's missing, straight from the model in ``schema.py``):

  - ``app_user_passkey`` -- one WebAuthn credential (public key, sign count,
    a name) belonging to an ``app_user``; deleting the user deletes its passkeys

Run it before deploying the backend that has it in ``schema.py``, or the
API refuses to start ("Postgres is missing 1 expected table(s)").

Usage (from the repo root, with the venv active):

    python backend/scripts/add_passkeys.py [--dry-run]

Reads the Postgres URL from ``.env.local`` (``DATABASE_URL_UNPOOLED``
preferred: this is DDL, so it wants the direct endpoint, not the pooler).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT / "backend"))


def main() -> int:
    ap = argparse.ArgumentParser(description="Add the passkeys table.")
    ap.add_argument("--env-file", type=Path, default=_REPO_ROOT / ".env.local")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    from dotenv import dotenv_values
    from sqlalchemy import create_engine

    import schema

    values = dotenv_values(args.env_file)
    url = (values.get("DATABASE_URL_UNPOOLED") or values.get("DATABASE_URL") or "").strip()
    if not url.startswith(("postgres://", "postgresql://")):
        sys.exit(f"no Postgres URL in {args.env_file}")

    engine = create_engine("postgresql+psycopg2://" + url.split("://", 1)[1], echo=True)
    with engine.connect() as conn:
        tx = conn.begin()
        schema.Base.metadata.create_all(conn, tables=[schema.AppUserPasskey.__table__])
        if args.dry_run:
            tx.rollback()
            print("\n--dry-run: rolled back, nothing changed")
        else:
            tx.commit()
            print("\ncommitted")
    engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
