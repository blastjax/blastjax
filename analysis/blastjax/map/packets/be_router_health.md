# Node be:router:health: routers/health.py
Kind: module
Language: python, 16 lines of code, location: backend/app/routers/health.py

Source excerpt: backend/app/routers/health.py (first 20 lines)
```
   1  from __future__ import annotations
   2  from typing import Any
   3  from fastapi import APIRouter
   4  from db import database_url, storage_kind
   5  
   6  router = APIRouter(tags=["health"])
   7  
   8  
   9  @router.get("/api/health")
  10  def health() -> dict[str, Any]:
  11      has_db = bool(database_url())
  12      out: dict[str, Any] = {
  13          "status": "ok" if has_db else "degraded",
  14          "storage": storage_kind(),
  15          "database": "configured" if has_db else "unset",
  16      }
  17      if not has_db:
  18          out["detail"] = "DATABASE_URL (or DB_*) missing in .env"
  19      return out
  20  
```

## Outgoing connections
- call -> db.py (be:core:db)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
