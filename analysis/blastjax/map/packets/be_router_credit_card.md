# Node be:router:credit_card: routers/credit_card.py
Kind: module
Language: python, 176 lines of code, location: backend/app/routers/credit_card.py

Source excerpt: backend/app/routers/credit_card.py (first 150 lines)
```
   1  from __future__ import annotations
   2  
   3  from typing import Any
   4  from uuid import UUID
   5  
   6  from fastapi import APIRouter, Depends, HTTPException
   7  from sqlalchemy.exc import IntegrityError
   8  
   9  import cache
  10  from app.deps import require_db
  11  from app.schemas.credit_card import (
  12      CreditCardBalanceAdjust,
  13      CreditCardCreate,
  14      CreditCardPaymentCreate,
  15  )
  16  from app.services.installment_service import (
  17      is_installment_due_this_month,
  18      serialize_installment_row,
  19  )
  20  from db import (
  21      adjust_credit_card_balance,
  22      delete_credit_card,
  23      delete_credit_card_payment,
  24      fetch_credit_card_bundles,
  25      get_credit_card,
  26      insert_credit_card,
  27      insert_credit_card_payment,
  28      update_credit_card,
  29      update_credit_card_payment,
  30  )
  31  
  32  router = APIRouter(tags=["credit_card"], dependencies=[Depends(require_db)])
  33  
  34  
  35  def _serialize_card(row: dict[str, Any]) -> dict[str, Any]:
  36      out = dict(row)
  37      for key in ("statement_date", "due_date", "created_at"):
  38          v = out.get(key)
  39          if hasattr(v, "isoformat"):
  40              out[key] = v.isoformat()
  41      credit_limit = float(out.get("credit_limit") or 0)
  42      current_balance = float(out.get("current_balance") or 0)
  43      out["available_limit"] = credit_limit - current_balance
  44      return out
  45  
  46  
  47  def _serialize_payment(row: dict[str, Any]) -> dict[str, Any]:
  48      out = dict(row)
  49      for key in ("payment_date", "created_at"):
  50          v = out.get(key)
  51          if hasattr(v, "isoformat"):
  52              out[key] = v.isoformat()
  53      return out
  54  
  55  
  56  def _clean_note(note: str | None) -> str | None:
  57      if note is None:
  58          return None
  59      trimmed = note.strip()
  60      return trimmed or None
  61  
  62  
  63  def _monthly_dues(card: dict[str, Any], installments: list[dict[str, Any]]) -> float:
  64      total = float(card.get("minimum_due") or 0)
  65      for r in installments:
  66          if is_installment_due_this_month(r):
  67              total += float(r.get("due_payment") or r.get("payment_total") or 0)
  68      return total
  69  
  70  
  71  def _statement_paid(card: dict[str, Any], payments: list[dict[str, Any]]) -> bool:
  72      """Whether payments since the statement date cover it. Partial payments don't count, whatever they add up to."""
  73      since, balance = card.get("statement_date"), float(card.get("last_statement_balance") or 0)
  74      if not since or balance <= 0:
  75          return False
  76      return sum(float(p["amount"]) for p in payments if p["payment_date"] >= since) >= balance
  77  
  78  
  79  def _serialize_bundle(bundle: dict[str, Any]) -> dict[str, Any]:
  80      card, installments, payments = bundle["card"], bundle["installments"], bundle["payments"]
  81      return {
  82          "card": {
  83              **_serialize_card(card),
  84              "monthly_dues": _monthly_dues(card, installments),
  85              "statement_paid": _statement_paid(card, payments),
  86          },
  87          "installments": [
  88              {**serialize_installment_row(r), "due_this_month": is_installment_due_this_month(r)} for r in installments
  89          ],
  90          "payments": [_serialize_payment(p) for p in payments],
  91      }
  92  
  93  
  94  @router.get("/api/credit-card")
  95  def credit_card_list() -> dict[str, Any]:
  96      key = "credit_card:list"
  97      hit = cache.get(key)
  98      if hit is not None:
  99          return hit
 100      result = {"cards": [_serialize_bundle(b) for b in fetch_credit_card_bundles()]}
 101      cache.set(key, result)
 102      return result
 103  
 104  
 105  _NO_BILL_CATEGORY = "That bill category doesn't exist."
 106  
 107  
 108  @router.post("/api/credit-card")
 109  def credit_card_create(body: CreditCardCreate) -> dict[str, Any]:
 110      try:
 111          row = insert_credit_card(
 112              body.name.strip(),
 113              body.credit_limit,
 114              body.last_statement_balance,
 115              body.minimum_due,
 116              body.interest_rate,
 117              body.statement_date,
 118              body.due_date,
 119              body.bill_category_id,
 120          )
 121      except IntegrityError:
 122          raise HTTPException(status_code=404, detail=_NO_BILL_CATEGORY)
 123      return {"card": _serialize_card(row)}
 124  
 125  
 126  @router.put("/api/credit-card/{card_id}")
 127  def credit_card_replace(card_id: UUID, body: CreditCardCreate) -> dict[str, Any]:
 128      try:
 129          row = update_credit_card(
 130              card_id,
 131              body.name.strip(),
 132              body.credit_limit,
 133              body.last_statement_balance,
 134              body.minimum_due,
 135              body.interest_rate,
 136              body.statement_date,
 137              body.due_date,
 138              body.bill_category_id,
 139          )
 140      except IntegrityError:
 141          raise HTTPException(status_code=404, detail=_NO_BILL_CATEGORY)
 142      if row is None:
 143          raise HTTPException(status_code=404, detail="Credit card not found.")
 144      return {"card": _serialize_card(row)}
 145  
 146  
 147  @router.patch("/api/credit-card/{card_id}/balance")
 148  def credit_card_adjust_balance(
 149      card_id: UUID, body: CreditCardBalanceAdjust
 150  ) -> dict[str, Any]:
```

## Outgoing connections
- call -> cache.py (be:core:cache)
- call -> db.py (be:core:db)
- call -> deps.py (be:core:deps)
- call -> schemas/ (Pydantic) (be:schemas)
- call -> services/installment_service.py (be:service:installment_service)
- read -> bill (ds:bill)
- read -> credit_card (ds:credit_card)
- write -> credit_card (ds:credit_card)
- read -> credit_card_payment (ds:credit_card_payment)
- write -> credit_card_payment (ds:credit_card_payment)
- write -> fixed_expense (ds:fixed_expense)
- read -> installment (ds:installment)
- read -> installment_line (ds:installment_line)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- test_core.py (be:core:test_core) -> call
- /calendar (web:calendar) -> dispatch
- components/HomeOverview.tsx (web:components:HomeOverview) -> dispatch
- /credit-card (web:credit-card) -> dispatch
- /installments (web:installments) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
- /monthly-expenses (web:monthly-expenses) -> dispatch
