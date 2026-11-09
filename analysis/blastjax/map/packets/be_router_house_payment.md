# Node be:router:house_payment: routers/house_payment.py
Kind: module
Language: python, 113 lines of code, location: backend/app/routers/house_payment.py

Source excerpt: backend/app/routers/house_payment.py (first 137 lines)
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
  10  from app.schemas.house_payment import (
  11      HousePaymentCreate,
  12      HousePaymentEntryCreate,
  13      HousePaymentEntryUpdate,
  14  )
  15  from app.services.house_payment_service import (
  16      house_payment_summary,
  17      serialize_house_payment_entry,
  18      serialize_house_payment_row,
  19  )
  20  from db import (
  21      delete_house_payment,
  22      delete_house_payment_entry,
  23      fetch_house_payment_with_entries,
  24      insert_house_payment,
  25      insert_house_payment_entry,
  26      list_house_payments,
  27      update_house_payment,
  28      update_house_payment_entry,
  29  )
  30  
  31  router = APIRouter(tags=["house_payment"], dependencies=[Depends(require_db)])
  32  
  33  
  34  def _clean_notes(notes: str | None) -> str | None:
  35      if notes is None:
  36          return None
  37      trimmed = notes.strip()
  38      return trimmed or None
  39  
  40  
  41  def _serialize_detail(detail: dict[str, Any]) -> dict[str, Any]:
  42      return {
  43          "house_payment": serialize_house_payment_row(detail["house_payment"]),
  44          "entries": [serialize_house_payment_entry(e) for e in detail["entries"]],
  45      }
  46  
  47  
  48  @router.get("/api/house-payment")
  49  def house_payment_list(
  50      limit: int = Query(default=500, ge=1, le=2000),
  51  ) -> dict[str, Any]:
  52      key = f"house_payment:list:{limit}"
  53      hit = cache.get(key)
  54      if hit is not None:
  55          return hit
  56      rows = list_house_payments(limit=limit)
  57      result = {
  58          "house_payments": [serialize_house_payment_row(r) for r in rows],
  59          "summary": house_payment_summary(rows),
  60      }
  61      cache.set(key, result)
  62      return result
  63  
  64  
  65  @router.post("/api/house-payment")
  66  def house_payment_create(body: HousePaymentCreate) -> dict[str, Any]:
  67      row = insert_house_payment(body.name.strip(), _clean_notes(body.notes))
  68      return serialize_house_payment_row(row)
  69  
  70  
  71  @router.get("/api/house-payment/{house_payment_id}")
  72  def house_payment_one(house_payment_id: UUID) -> dict[str, Any]:
  73      key = f"house_payment:{house_payment_id}"
  74      hit = cache.get(key)
  75      if hit is not None:
  76          return hit
  77      detail = fetch_house_payment_with_entries(house_payment_id)
  78      if not detail:
  79          raise HTTPException(status_code=404, detail="House payment not found.")
  80      result = _serialize_detail(detail)
  81      cache.set(key, result)
  82      return result
  83  
  84  
  85  @router.put("/api/house-payment/{house_payment_id}")
  86  def house_payment_replace(
  87      house_payment_id: UUID, body: HousePaymentCreate
  88  ) -> dict[str, Any]:
  89      row = update_house_payment(
  90          house_payment_id, body.name.strip(), _clean_notes(body.notes)
  91      )
  92      if row is None:
  93          raise HTTPException(status_code=404, detail="House payment not found.")
  94      return serialize_house_payment_row(row)
  95  
  96  
  97  @router.delete("/api/house-payment/{house_payment_id}")
  98  def house_payment_remove(house_payment_id: UUID) -> dict[str, Any]:
  99      if not delete_house_payment(house_payment_id):
 100          raise HTTPException(status_code=404, detail="House payment not found.")
 101      return {"ok": True}
 102  
 103  
 104  @router.post("/api/house-payment/{house_payment_id}/entry")
 105  def house_payment_entry_create(
 106      house_payment_id: UUID, body: HousePaymentEntryCreate
 107  ) -> dict[str, Any]:
 108      detail = insert_house_payment_entry(
 109          house_payment_id, body.paid_on, body.amount
 110      )
 111      if detail is None:
 112          raise HTTPException(status_code=404, detail="House payment not found.")
 113      return _serialize_detail(detail)
 114  
 115  
 116  @router.put("/api/house-payment/{house_payment_id}/entry/{entry_id}")
 117  def house_payment_entry_update(
 118      house_payment_id: UUID,
 119      entry_id: UUID,
 120      body: HousePaymentEntryUpdate,
 121  ) -> dict[str, Any]:
 122      detail = update_house_payment_entry(
 123          house_payment_id, entry_id, body.paid_on, body.amount
 124      )
 125      if detail is None:
 126          raise HTTPException(status_code=404, detail="Payment entry not found.")
 127      return _serialize_detail(detail)
 128  
 129  
 130  @router.delete("/api/house-payment/{house_payment_id}/entry/{entry_id}")
 131  def house_payment_entry_remove(
 132      house_payment_id: UUID, entry_id: UUID
 133  ) -> dict[str, Any]:
 134      detail = delete_house_payment_entry(house_payment_id, entry_id)
 135      if detail is None:
 136          raise HTTPException(status_code=404, detail="Payment entry not found.")
 137      return _serialize_detail(detail)
```

## Outgoing connections
- call -> cache.py (be:core:cache)
- call -> db.py (be:core:db)
- call -> deps.py (be:core:deps)
- call -> schemas/ (Pydantic) (be:schemas)
- call -> services/house_payment_service.py (be:service:house_payment_service)
- read -> house_payment (ds:house_payment)
- write -> house_payment (ds:house_payment)
- read -> house_payment_entry (ds:house_payment_entry)
- write -> house_payment_entry (ds:house_payment_entry)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- /house-payments (web:house-payments) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
- /monthly-expenses (web:monthly-expenses) -> dispatch
