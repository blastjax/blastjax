# Node be:router:installment: routers/installment.py
Kind: module
Language: python, 212 lines of code, location: backend/app/routers/installment.py

Source excerpt: backend/app/routers/installment.py (first 150 lines)
```
   1  from __future__ import annotations
   2  from typing import Any
   3  from uuid import UUID
   4  from fastapi import APIRouter, Depends, HTTPException, Query
   5  
   6  import cache
   7  from app.deps import require_db
   8  from app.schemas.installment import (
   9      InstallmentCreate,
  10      InstallmentLineUpdate,
  11      InstallmentLinesBulkUpdate,
  12      InstallmentLinesReorder,
  13  )
  14  from app.services.installment_service import (
  15      installment_summary,
  16      serialize_installment_row,
  17  )
  18  from db import (
  19      delete_installment,
  20      fetch_installment_with_lines,
  21      get_installment,
  22      insert_installment,
  23      installment_apply_payment,
  24      list_installments,
  25      list_installments_with_lines,
  26      reorder_installment_lines,
  27      update_installment,
  28      update_installment_line_and_fetch_detail,
  29      update_installment_lines_bulk,
  30  )
  31  
  32  router = APIRouter(tags=["installment"], dependencies=[Depends(require_db)])
  33  
  34  
  35  def _serialize_detail(detail: dict[str, Any]) -> dict[str, Any]:
  36      return {
  37          "installment": serialize_installment_row(detail["installment"]),
  38          "lines": detail["lines"],
  39      }
  40  
  41  
  42  def _validate_installment_body(body: InstallmentCreate) -> tuple[float, float]:
  43      if body.installment_current > body.installment_total + 1:
  44          raise HTTPException(
  45              status_code=400,
  46              detail="installment_current cannot exceed installment_total + 1.",
  47          )
  48      payments_left = body.installment_total - body.installment_current + 1
  49      if payments_left < 0:
  50          raise HTTPException(status_code=400, detail="Invalid installment counts.")
  51      rem = (
  52          body.remaining
  53          if body.remaining is not None
  54          else payments_left * body.payment_total
  55      )
  56      orig = (
  57          body.original_total
  58          if body.original_total is not None
  59          else float(body.installment_total) * float(body.principal)
  60      )
  61      if rem < 0:
  62          raise HTTPException(status_code=400, detail="remaining cannot be negative.")
  63      return rem, orig
  64  
  65  
  66  @router.get("/api/installment")
  67  def installment_list(
  68      limit: int = Query(default=500, ge=1, le=2000),
  69  ) -> dict[str, Any]:
  70      key = f"installment:list:{limit}"
  71      hit = cache.get(key)
  72      if hit is not None:
  73          return hit
  74      rows = list_installments(limit=limit)
  75      result = {
  76          "installments": [serialize_installment_row(r) for r in rows],
  77          "summary": installment_summary(rows),
  78      }
  79      cache.set(key, result)
  80      return result
  81  
  82  
  83  @router.get("/api/installment-schedules")
  84  def installment_schedules(
  85      limit: int = Query(default=500, ge=1, le=2000),
  86  ) -> dict[str, Any]:
  87      key = f"installment:schedules:{limit}"
  88      hit = cache.get(key)
  89      if hit is not None:
  90          return hit
  91      items = list_installments_with_lines(limit=limit)
  92      result = {
  93          "schedules": [
  94              {
  95                  "installment": serialize_installment_row(it["installment"]),
  96                  "lines": it["lines"],
  97              }
  98              for it in items
  99          ]
 100      }
 101      cache.set(key, result)
 102      return result
 103  
 104  
 105  @router.post("/api/installment")
 106  def installment_create(body: InstallmentCreate) -> dict[str, Any]:
 107      rem, orig = _validate_installment_body(body)
 108      detail = insert_installment(
 109          body.name.strip(),
 110          body.installment_current,
 111          body.installment_total,
 112          body.principal,
 113          body.interest,
 114          body.payment_total,
 115          body.start_date,
 116          body.finish_date,
 117          rem,
 118          orig,
 119          body.credit_card_id,
 120      )
 121      return _serialize_detail(detail)
 122  
 123  
 124  @router.get("/api/installment/{installment_id}")
 125  def installment_one(installment_id: UUID) -> dict[str, Any]:
 126      key = f"installment:{installment_id}"
 127      hit = cache.get(key)
 128      if hit is not None:
 129          return hit
 130      detail = fetch_installment_with_lines(installment_id)
 131      if not detail:
 132          raise HTTPException(status_code=404, detail="Installment not found.")
 133      result = _serialize_detail(detail)
 134      cache.set(key, result)
 135      return result
 136  
 137  
 138  @router.put("/api/installment/{installment_id}/line/{seq}")
 139  def installment_line_update(
 140      installment_id: UUID,
 141      seq: int,
 142      body: InstallmentLineUpdate,
 143  ) -> dict[str, Any]:
 144      if seq < 1:
 145          raise HTTPException(status_code=400, detail="seq must be >= 1.")
 146      row = get_installment(installment_id)
 147      if not row:
 148          raise HTTPException(status_code=404, detail="Installment not found.")
 149      if seq > int(row.get("installment_total") or 0):
 150          raise HTTPException(status_code=400, detail="seq exceeds installment total.")
```

## Outgoing connections
- call -> cache.py (be:core:cache)
- call -> db.py (be:core:db)
- call -> deps.py (be:core:deps)
- call -> schemas/ (Pydantic) (be:schemas)
- call -> services/installment_service.py (be:service:installment_service)
- read -> installment (ds:installment)
- write -> installment (ds:installment)
- read -> installment_line (ds:installment_line)
- write -> installment_line (ds:installment_line)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- /credit-card (web:credit-card) -> dispatch
- /installments (web:installments) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
