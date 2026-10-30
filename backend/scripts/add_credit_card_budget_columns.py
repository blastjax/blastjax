#!/usr/bin/env python3
"""
Add what ties credit cards to the calendar budget. Additive, one transaction,
safe to re-run (``ADD COLUMN IF NOT EXISTS``):

  - ``monthly_expense.charged_months`` JSONB NOT NULL DEFAULT '{}' -- the
    "YYYY-MM" pay-period months an expense went on a credit card instead of the
    calendar budget, each with that card's id
  - ``fixed_expense.credit_card_payment_id`` UUID (nullable), references
    ``credit_card_payment(id)`` ON DELETE SET NULL -- the card payment this
    budget expense was recorded for

Run it before deploying the backend that selects these columns, or the Monthly
Expenses, Calendar and Credit Cards pages fail with "column ... does not exist".

Usage (from the repo root, with the venv active):

    python backend/scripts/add_credit_card_budget_columns.py [--dry-run]

Reads the Postgres URL from ``.env.local`` (``DATABASE_URL_UNPOOLED``
preferred: this is DDL, so it wants the direct endpoint, not the pooler).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]

DDL = [
    "ALTER TABLE monthly_expense ADD COLUMN IF NOT EXISTS charged_months JSONB NOT NULL DEFAULT '{}'::jsonb",
    "ALTER TABLE fixed_expense ADD COLUMN IF NOT EXISTS credit_card_payment_id UUID"
    " CONSTRAINT fk_fixed_expense_credit_card_payment_id REFERENCES credit_card_payment (id) ON DELETE SET NULL",
]


def main() -> int:
    ap = argparse.ArgumentParser(description="Add the columns tying credit cards to the calendar budget.")
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
