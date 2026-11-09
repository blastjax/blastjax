# Node be:router:pay_period_start_override: routers/pay_period_start_override.py
Kind: module
Language: python, 83 lines of code, location: backend/app/routers/pay_period_start_override.py

Source excerpt: backend/app/routers/pay_period_start_override.py (first 99 lines)
```
   1  from __future__ import annotations
   2  
   3  from datetime import date
   4  from typing import Any
   5  
   6  from fastapi import APIRouter, Depends, HTTPException, Query
   7  
   8  import cache
   9  from app.deps import require_db
  10  from app.schemas.pay_period_start_override import PayPeriodStartOverrideUpsert
  11  from db import (
  12      delete_pay_period_start_override,
  13      get_pay_period_start_override,
  14      list_pay_period_start_overrides,
  15      upsert_pay_period_start_override,
  16  )
  17  
  18  router = APIRouter(tags=["pay_period_start_override"], dependencies=[Depends(require_db)])
  19  
  20  
  21  def _serialize(row: dict[str, Any]) -> dict[str, Any]:
  22      out = dict(row)
  23      for key in ("start_date", "created_at"):
  24          v = out.get(key)
  25          if hasattr(v, "isoformat"):
  26              out[key] = v.isoformat()
  27      return out
  28  
  29  
  30  def _prev_month(year: int, month: int) -> tuple[int, int]:
  31      return (year - 1, 12) if month == 1 else (year, month - 1)
  32  
  33  
  34  @router.get("/api/pay-period-start-override")
  35  def pay_period_start_override_list() -> dict[str, Any]:
  36      key = "pay_period_start_override:list"
  37      hit = cache.get(key)
  38      if hit is not None:
  39          return hit
  40      rows = list_pay_period_start_overrides()
  41      result = {"overrides": [_serialize(r) for r in rows]}
  42      cache.set(key, result)
  43      return result
  44  
  45  
  46  @router.put("/api/pay-period-start-override")
  47  def pay_period_start_override_upsert(body: PayPeriodStartOverrideUpsert) -> dict[str, Any]:
  48      try:
  49          start_date = date.fromisoformat(body.start_date)
  50      except ValueError as exc:
  51          raise HTTPException(status_code=400, detail="start_date must be YYYY-MM-DD.") from exc
  52  
  53      if body.period_half == 1:
  54          default_boundary = date(body.period_year, body.period_month, 1)
  55          if start_date > default_boundary:
  56              raise HTTPException(
  57                  status_code=400,
  58                  detail=f"Start date can't be later than {default_boundary.isoformat()}.",
  59              )
  60          prev_year, prev_month = _prev_month(body.period_year, body.period_month)
  61          prev_half2 = get_pay_period_start_override(prev_year, prev_month, 2)
  62          prev_half2_start = (
  63              date.fromisoformat(str(prev_half2["start_date"]))
  64              if prev_half2 is not None
  65              else date(prev_year, prev_month, 16)
  66          )
  67          if start_date <= prev_half2_start:
  68              raise HTTPException(
  69                  status_code=400,
  70                  detail=(
  71                      f"Start date must be after {prev_half2_start.isoformat()} "
  72                      "(the previous 16th-end period's start) so that period keeps at least one day."
  73                  ),
  74              )
  75      else:
  76          low = date(body.period_year, body.period_month, 2)
  77          high = date(body.period_year, body.period_month, 16)
  78          if not (low <= start_date <= high):
  79              raise HTTPException(
  80                  status_code=400,
  81                  detail=(
  82                      f"Start date must be between {low.isoformat()} and {high.isoformat()}."
  83                  ),
  84              )
  85  
  86      row = upsert_pay_period_start_override(
  87          body.period_year, body.period_month, body.period_half, body.start_date
  88      )
  89      return {"override": _serialize(row)}
  90  
  91  
  92  @router.delete("/api/pay-period-start-override")
  93  def pay_period_start_override_remove(
  94      period_year: int = Query(...),
  95      period_month: int = Query(..., ge=1, le=12),
  96      period_half: int = Query(..., ge=1, le=2),
  97  ) -> dict[str, Any]:
  98      ok = delete_pay_period_start_override(period_year, period_month, period_half)
  99      return {"ok": ok}
```

## Outgoing connections
- call -> cache.py (be:core:cache)
- call -> db.py (be:core:db)
- call -> deps.py (be:core:deps)
- call -> schemas/ (Pydantic) (be:schemas)
- read -> pay_period_start_override (ds:pay_period_start_override)
- write -> pay_period_start_override (ds:pay_period_start_override)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- /bills (web:bills) -> dispatch
- /calendar (web:calendar) -> dispatch
- components/HomeOverview.tsx (web:components:HomeOverview) -> dispatch
- /credit-card (web:credit-card) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
- /monthly-expenses (web:monthly-expenses) -> dispatch
