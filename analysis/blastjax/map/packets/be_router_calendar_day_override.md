# Node be:router:calendar_day_override: routers/calendar_day_override.py
Kind: module
Language: python, 29 lines of code, location: backend/app/routers/calendar_day_override.py

Source excerpt: backend/app/routers/calendar_day_override.py (first 39 lines)
```
   1  from __future__ import annotations
   2  
   3  from typing import Any
   4  
   5  from fastapi import APIRouter, Depends
   6  
   7  import cache
   8  from app.deps import require_db
   9  from app.schemas.calendar_day_override import CalendarDayOverrideBulkUpsert
  10  from db import list_calendar_day_overrides, upsert_calendar_day_overrides
  11  
  12  router = APIRouter(tags=["calendar_day_override"], dependencies=[Depends(require_db)])
  13  
  14  
  15  def _serialize(row: dict[str, Any]) -> dict[str, Any]:
  16      out = dict(row)
  17      for key in ("day", "created_at"):
  18          v = out.get(key)
  19          if hasattr(v, "isoformat"):
  20              out[key] = v.isoformat()
  21      return out
  22  
  23  
  24  @router.get("/api/calendar-day-override")
  25  def calendar_day_override_list() -> dict[str, Any]:
  26      key = "calendar_day_override:list"
  27      hit = cache.get(key)
  28      if hit is not None:
  29          return hit
  30      rows = list_calendar_day_overrides()
  31      result = {"overrides": [_serialize(r) for r in rows]}
  32      cache.set(key, result)
  33      return result
  34  
  35  
  36  @router.put("/api/calendar-day-override/bulk")
  37  def calendar_day_override_bulk(body: CalendarDayOverrideBulkUpsert) -> dict[str, Any]:
  38      rows = upsert_calendar_day_overrides([(o.day, o.amount, o.saved) for o in body.overrides])
  39      return {"overrides": [_serialize(r) for r in rows]}
```

## Outgoing connections
- call -> cache.py (be:core:cache)
- call -> db.py (be:core:db)
- call -> deps.py (be:core:deps)
- call -> schemas/ (Pydantic) (be:schemas)
- read -> calendar_day_override (ds:calendar_day_override)
- write -> calendar_day_override (ds:calendar_day_override)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- /calendar (web:calendar) -> dispatch
- components/HomeOverview.tsx (web:components:HomeOverview) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
- lib/payPeriods.ts (web:lib:payPeriods) -> dispatch
