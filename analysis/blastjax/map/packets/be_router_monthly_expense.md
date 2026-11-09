# Node be:router:monthly_expense: routers/monthly_expense.py
Kind: module
Language: python, 93 lines of code, location: backend/app/routers/monthly_expense.py

Source excerpt: backend/app/routers/monthly_expense.py (first 113 lines)
```
   1  from __future__ import annotations
   2  
   3  from typing import Any
   4  from uuid import UUID
   5  
   6  from fastapi import APIRouter, Depends, HTTPException, Query
   7  from sqlalchemy.exc import IntegrityError
   8  
   9  import cache
  10  from app.deps import require_db
  11  from app.schemas.monthly_expense import MonthlyExpenseCreate
  12  from db import (
  13      delete_monthly_expense,
  14      insert_monthly_expense,
  15      list_monthly_expenses,
  16      update_monthly_expense,
  17  )
  18  
  19  router = APIRouter(tags=["monthly_expense"], dependencies=[Depends(require_db)])
  20  
  21  
  22  def _serialize(row: dict[str, Any]) -> dict[str, Any]:
  23      out = dict(row)
  24      v = out.get("created_at")
  25      if hasattr(v, "isoformat"):
  26          out["created_at"] = v.isoformat()
  27      return out
  28  
  29  
  30  def _clean_description(description: str | None) -> str | None:
  31      if description is None:
  32          return None
  33      trimmed = description.strip()
  34      return trimmed or None
  35  
  36  
  37  def _charged_months(body: MonthlyExpenseCreate) -> dict[str, str | None]:
  38      return {month: str(card_id) if card_id else None for month, card_id in body.charged_months.items()}
  39  
  40  
  41  @router.get("/api/monthly-expense")
  42  def monthly_expense_list(
  43      period_half: int | None = Query(default=None, ge=1, le=2),
  44      period_year: int | None = Query(default=None),
  45      period_month: int | None = Query(default=None, ge=1, le=12),
  46  ) -> dict[str, Any]:
  47      key = f"monthly_expense:list:{period_half}:{period_year}:{period_month}"
  48      hit = cache.get(key)
  49      if hit is not None:
  50          return hit
  51      rows = list_monthly_expenses(
  52          period_half=period_half, period_year=period_year, period_month=period_month
  53      )
  54      result = {"expenses": [_serialize(r) for r in rows]}
  55      cache.set(key, result)
  56      return result
  57  
  58  
  59  _NO_LINK = "That bill category or house payment doesn't exist."
  60  
  61  
  62  @router.post("/api/monthly-expense")
  63  def monthly_expense_create(body: MonthlyExpenseCreate) -> dict[str, Any]:
  64      try:
  65          row = insert_monthly_expense(
  66              body.name.strip(),
  67              _clean_description(body.description),
  68              body.amount,
  69              body.period_half,
  70              body.period_year,
  71              body.period_month,
  72              body.is_recurring,
  73              body.expense_date,
  74              sorted(set(body.skipped_months)),
  75              _charged_months(body),
  76              body.bill_category_id,
  77              body.house_payment_id,
  78          )
  79      except IntegrityError:
  80          raise HTTPException(status_code=404, detail=_NO_LINK)
  81      return {"expense": _serialize(row)}
  82  
  83  
  84  @router.put("/api/monthly-expense/{expense_id}")
  85  def monthly_expense_replace(expense_id: UUID, body: MonthlyExpenseCreate) -> dict[str, Any]:
  86      try:
  87          row = update_monthly_expense(
  88              expense_id,
  89              body.name.strip(),
  90              _clean_description(body.description),
  91              body.amount,
  92              body.period_half,
  93              body.period_year,
  94              body.period_month,
  95              body.is_recurring,
  96              body.expense_date,
  97              sorted(set(body.skipped_months)),
  98              _charged_months(body),
  99              body.bill_category_id,
 100              body.house_payment_id,
 101          )
 102      except IntegrityError:
 103          raise HTTPException(status_code=404, detail=_NO_LINK)
 104      if row is None:
 105          raise HTTPException(status_code=404, detail="Expense not found.")
 106      return {"expense": _serialize(row)}
 107  
 108  
 109  @router.delete("/api/monthly-expense/{expense_id}")
 110  def monthly_expense_remove(expense_id: UUID) -> dict[str, Any]:
 111      if not delete_monthly_expense(expense_id):
 112          raise HTTPException(status_code=404, detail="Expense not found.")
 113      return {"ok": True}
```

## Outgoing connections
- call -> cache.py (be:core:cache)
- call -> db.py (be:core:db)
- call -> deps.py (be:core:deps)
- call -> schemas/ (Pydantic) (be:schemas)
- read -> monthly_expense (ds:monthly_expense)
- write -> monthly_expense (ds:monthly_expense)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- /bills (web:bills) -> dispatch
- /calendar (web:calendar) -> dispatch
- components/HomeOverview.tsx (web:components:HomeOverview) -> dispatch
- /credit-card (web:credit-card) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
- /monthly-expenses (web:monthly-expenses) -> dispatch
