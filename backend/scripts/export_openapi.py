#!/usr/bin/env python3
"""Write the API's OpenAPI schema, which the web generates its TypeScript types from (npm run api:types).

    python backend/scripts/export_openapi.py [path]    # default: web/openapi.json

Needs no database: it only builds the app and asks it to describe itself.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))


def main() -> int:
    from app.factory import create_app

    out = Path(sys.argv[1]) if len(sys.argv) > 1 else _BACKEND.parent / "web" / "openapi.json"
    out.write_text(json.dumps(create_app().openapi(), indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
