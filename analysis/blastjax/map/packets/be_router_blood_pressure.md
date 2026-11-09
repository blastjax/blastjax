# Node be:router:blood_pressure: routers/blood_pressure.py
Kind: module
Language: python, 66 lines of code, location: backend/app/routers/blood_pressure.py

Source excerpt: backend/app/routers/blood_pressure.py (first 82 lines)
```
   1  from __future__ import annotations
   2  
   3  from typing import Any
   4  from uuid import UUID
   5  
   6  from fastapi import APIRouter, Depends, HTTPException, Query
   7  
   8  import cache
   9  from app.deps import require_db
  10  from app.schemas.blood_pressure import BloodPressureCreate
  11  from db import (
  12      delete_blood_pressure,
  13      insert_blood_pressure,
  14      list_blood_pressures,
  15      update_blood_pressure,
  16  )
  17  
  18  router = APIRouter(tags=["blood_pressure"], dependencies=[Depends(require_db)])
  19  
  20  
  21  def _serialize(row: dict[str, Any]) -> dict[str, Any]:
  22      out = dict(row)
  23      v = out.get("created_at")
  24      if hasattr(v, "isoformat"):
  25          out["created_at"] = v.isoformat()
  26      return out
  27  
  28  
  29  def _clean_notes(notes: str | None) -> str | None:
  30      if notes is None:
  31          return None
  32      trimmed = notes.strip()
  33      return trimmed or None
  34  
  35  
  36  @router.get("/api/blood-pressure")
  37  def blood_pressure_list(
  38      limit: int = Query(default=500, ge=1, le=2000),
  39  ) -> dict[str, Any]:
  40      key = f"bp:list:{limit}"
  41      hit = cache.get(key)
  42      if hit is not None:
  43          return hit
  44      rows = list_blood_pressures(limit=limit)
  45      result = {"readings": [_serialize(r) for r in rows]}
  46      cache.set(key, result)
  47      return result
  48  
  49  
  50  @router.post("/api/blood-pressure")
  51  def blood_pressure_create(body: BloodPressureCreate) -> dict[str, Any]:
  52      row = insert_blood_pressure(
  53          body.systolic, body.diastolic, body.pulse, body.spo2,
  54          body.temperature, body.weight, _clean_notes(body.notes)
  55      )
  56      return {"reading": _serialize(row)}
  57  
  58  
  59  @router.put("/api/blood-pressure/{reading_id}")
  60  def blood_pressure_replace(
  61      reading_id: UUID, body: BloodPressureCreate
  62  ) -> dict[str, Any]:
  63      row = update_blood_pressure(
  64          reading_id,
  65          body.systolic,
  66          body.diastolic,
  67          body.pulse,
  68          body.spo2,
  69          body.temperature,
  70          body.weight,
  71          _clean_notes(body.notes),
  72      )
  73      if row is None:
  74          raise HTTPException(status_code=404, detail="Reading not found.")
  75      return {"reading": _serialize(row)}
  76  
  77  
  78  @router.delete("/api/blood-pressure/{reading_id}")
  79  def blood_pressure_remove(reading_id: UUID) -> dict[str, Any]:
  80      if not delete_blood_pressure(reading_id):
  81          raise HTTPException(status_code=404, detail="Reading not found.")
  82      return {"ok": True}
```

## Outgoing connections
- call -> cache.py (be:core:cache)
- call -> db.py (be:core:db)
- call -> deps.py (be:core:deps)
- call -> schemas/ (Pydantic) (be:schemas)
- read -> blood_pressure (ds:blood_pressure)
- write -> blood_pressure (ds:blood_pressure)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- /blood-pressure (web:blood-pressure) -> dispatch
- components/HomeOverview.tsx (web:components:HomeOverview) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
