"""Delete all category_catalog rows where kind = 'mixed'. Run from repo: python backend/scripts/delete_mixed_categories.py"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(BACKEND.parent / ".env")
load_dotenv(BACKEND / ".env")

from db import delete_all_mixed_category_catalog_rows, use_database


def main() -> None:
    if not use_database():
        print("DATABASE_URL is not set.", file=sys.stderr)
        sys.exit(1)
    n = delete_all_mixed_category_catalog_rows()
    print(f"Deleted {n} mixed category_catalog row(s).")


if __name__ == "__main__":
    main()
