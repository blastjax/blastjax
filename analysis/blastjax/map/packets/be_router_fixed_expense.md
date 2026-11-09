# Node be:router:fixed_expense: routers/fixed_expense.py
Kind: module
Language: python, 57 lines of code, location: backend/app/routers/fixed_expense.py

Source excerpt: backend/app/routers/fixed_expense.py (first 73 lines)
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
  10  from app.schemas.fixed_expense import FixedExpenseCreate, FixedExpenseUpdate
  11  from db import delete_fixed_expense, insert_fixed_expense, list_fixed_expenses, update_fixed_expense
  12  
  13  router = APIRouter(tags=["fixed_expense"], dependencies=[Depends(require_db)])
  14  
  15  
  16  def _serialize(row: dict[str, Any]) -> dict[str, Any]:
  17      out = dict(row)
  18      v = out.get("created_at")
  19      if hasattr(v, "isoformat"):
  20          out["created_at"] = v.isoformat()
  21      return out
  22  
  23  
  24  def _clean_description(description: str | None) -> str | None:
  25      if description is None:
  26          return None
  27      trimmed = description.strip()
  28      return trimmed or None
  29  
  30  
  31  @router.get("/api/fixed-expense")
  32  def fixed_expense_list(
  33      period_half: int | None = Query(default=None, ge=1, le=2),
  34      period_year: int | None = Query(default=None),
  35      period_month: int | None = Query(default=None, ge=1, le=12),
  36  ) -> dict[str, Any]:
  37      key = f"fixed_expense:list:{period_half}:{period_year}:{period_month}"
  38      hit = cache.get(key)
  39      if hit is not None:
  40          return hit
  41      rows = list_fixed_expenses(
  42          period_half=period_half, period_year=period_year, period_month=period_month
  43      )
  44      result = {"expenses": [_serialize(r) for r in rows]}
  45      cache.set(key, result)
  46      return result
  47  
  48  
  49  @router.post("/api/fixed-expense")
  50  def fixed_expense_create(body: FixedExpenseCreate) -> dict[str, Any]:
  51      row = insert_fixed_expense(
  52          body.period_half,
  53          body.amount,
  54          _clean_description(body.description),
  55          body.period_year,
  56          body.period_month,
  57      )
  58      return {"expense": _serialize(row)}
  59  
  60  
  61  @router.put("/api/fixed-expense/{expense_id}")
  62  def fixed_expense_update(expense_id: UUID, body: FixedExpenseUpdate) -> dict[str, Any]:
  63      row = update_fixed_expense(expense_id, body.amount, _clean_description(body.description))
  64      if row is None:
  65          raise HTTPException(status_code=404, detail="Expense not found.")
  66      return {"expense": _serialize(row)}
  67  
  68  
  69  @router.delete("/api/fixed-expense/{expense_id}")
  70  def fixed_expense_remove(expense_id: UUID) -> dict[str, Any]:
  71      if not delete_fixed_expense(expense_id):
  72          raise HTTPException(status_code=404, detail="Expense not found.")
  73      return {"ok": True}
```

## Outgoing connections
- call -> cache.py (be:core:cache)
- call -> db.py (be:core:db)
- call -> deps.py (be:core:deps)
- call -> schemas/ (Pydantic) (be:schemas)
- read -> fixed_expense (ds:fixed_expense)
- write -> fixed_expense (ds:fixed_expense)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- /calendar (web:calendar) -> dispatch
- components/HomeOverview.tsx (web:components:HomeOverview) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
