#!/usr/bin/env python3
"""
Link the credit card to a Bills category. Additive, one transaction, safe to
re-run (``ADD COLUMN IF NOT EXISTS``):

  - ``credit_card.bill_category_id`` INTEGER (nullable), references
    ``bill_category(id)`` ON DELETE SET NULL -- when set, the Credit Card page
    reads its statement (balance, minimum due, statement and due dates) from
    that category's latest bill

Run it before deploying the backend that selects the column, or the Credit
Card endpoints fail with "column bill_category_id does not exist".

Usage (from the repo root, with the venv active):

    python backend/scripts/add_credit_card_bill_link.py [--dry-run]

Reads the Postgres URL from ``.env.local`` (``DATABASE_URL_UNPOOLED``
preferred: this is DDL, so it wants the direct endpoint, not the pooler).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]

DDL = [
    "ALTER TABLE credit_card ADD COLUMN IF NOT EXISTS bill_category_id INTEGER"
    " CONSTRAINT fk_credit_card_bill_category_id REFERENCES bill_category (id) ON DELETE SET NULL",
]


def main() -> int:
    ap = argparse.ArgumentParser(description="Add the credit card's Bills category link.")
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
