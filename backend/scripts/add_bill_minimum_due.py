#!/usr/bin/env python3
"""
Add credit card bills' minimum amount due. Additive, one transaction, safe to
re-run (``ADD COLUMN IF NOT EXISTS``):

  - ``bill_category.is_credit_card`` BOOLEAN NOT NULL DEFAULT false -- its
    bills also get a minimum amount due
  - ``bill.minimum_due`` DOUBLE PRECISION (nullable)

Run it before deploying the backend that selects the columns, or the Bills
endpoints fail with "column is_credit_card does not exist".

Usage (from the repo root, with the venv active):

    python backend/scripts/add_bill_minimum_due.py [--dry-run]

Reads the Postgres URL from ``.env.local`` (``DATABASE_URL_UNPOOLED``
preferred: this is DDL, so it wants the direct endpoint, not the pooler).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]

DDL = [
    "ALTER TABLE bill_category ADD COLUMN IF NOT EXISTS is_credit_card BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE bill ADD COLUMN IF NOT EXISTS minimum_due DOUBLE PRECISION",
]


def main() -> int:
    ap = argparse.ArgumentParser(description="Add the Bills minimum amount due columns.")
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
        for sql in DDL:
            print(sql)
            cur.execute(sql)
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
