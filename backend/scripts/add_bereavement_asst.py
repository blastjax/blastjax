#!/usr/bin/env python3
"""
Add a Bereavement asst deduction to payslips and turn it on for Questronix
(Settings -> Companies). Additive, one transaction, safe to re-run
(``ADD COLUMN IF NOT EXISTS``):

  - ``payslip.bereavement_asst`` DOUBLE PRECISION (nullable)
  - ``payslip_default.bereavement_asst`` TEXT NOT NULL DEFAULT ''
  - ``company.show_bereavement_asst`` BOOLEAN NOT NULL DEFAULT false,
    then set true for Questronix

Usage (from the repo root, with the venv active):

    python backend/scripts/add_bereavement_asst.py [--dry-run]

Reads the Postgres URL from ``.env.local`` (``DATABASE_URL_UNPOOLED``
preferred: this is DDL, so it wants the direct endpoint, not the pooler).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]

DDL = [
    "ALTER TABLE payslip ADD COLUMN IF NOT EXISTS bereavement_asst DOUBLE PRECISION",
    "ALTER TABLE payslip_default ADD COLUMN IF NOT EXISTS bereavement_asst TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE company ADD COLUMN IF NOT EXISTS show_bereavement_asst BOOLEAN NOT NULL DEFAULT false",
]


def main() -> int:
    ap = argparse.ArgumentParser(description="Add the payslip Bereavement asst deduction.")
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
        cur.execute(
            "UPDATE company SET show_bereavement_asst = true "
            "WHERE name = 'Questronix' RETURNING id"
        )
        print(f"Questronix: {cur.rowcount} company row(s) switched on")
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
