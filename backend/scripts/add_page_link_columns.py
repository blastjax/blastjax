#!/usr/bin/env python3
"""
Add what links monthly expenses to the Bills and House Payments pages. Additive,
one transaction, safe to re-run (``ADD COLUMN IF NOT EXISTS``):

  - ``monthly_expense.bill_category_id`` UUID (nullable), references
    ``bill_category(id)`` ON DELETE SET NULL -- whose real bills replace the
    expense's amount and date in the months they land in
  - ``monthly_expense.house_payment_id`` UUID (nullable), references
    ``house_payment(id)`` ON DELETE SET NULL -- where a month marked paid is logged

Run it before deploying the backend that selects these columns, or the Monthly
Expenses and Calendar pages fail with "column ... does not exist".

Usage (from the repo root, with the backend venv):

    backend/venv/Scripts/python.exe backend/scripts/add_page_link_columns.py [--dry-run]

Reads the Postgres URL from ``.env.local`` (``DATABASE_URL_UNPOOLED``
preferred: this is DDL, so it wants the direct endpoint, not the pooler).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]

DDL = [
    "ALTER TABLE monthly_expense ADD COLUMN IF NOT EXISTS bill_category_id UUID"
    " CONSTRAINT fk_monthly_expense_bill_category_id REFERENCES bill_category (id) ON DELETE SET NULL",
    "ALTER TABLE monthly_expense ADD COLUMN IF NOT EXISTS house_payment_id UUID"
    " CONSTRAINT fk_monthly_expense_house_payment_id REFERENCES house_payment (id) ON DELETE SET NULL",
]


def main() -> int:
    ap = argparse.ArgumentParser(description="Add the columns linking monthly expenses to Bills and House Payments.")
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
