# Node be:service:installment_service: services/installment_service.py
Kind: module
Language: python, 81 lines of code, location: backend/app/services/installment_service.py

Source excerpt: backend/app/services/installment_service.py (first 96 lines)
```
   1  from __future__ import annotations
   2  
   3  import datetime as dt
   4  from typing import Any
   5  
   6  
   7  def _coerce_date(v: Any) -> dt.date | None:
   8      if v is None:
   9          return None
  10      if isinstance(v, dt.datetime):
  11          return v.date()
  12      if isinstance(v, dt.date):
  13          return v
  14      if isinstance(v, str):
  15          s = v.strip()
  16          if len(s) >= 10:
  17              try:
  18                  return dt.date.fromisoformat(s[:10])
  19              except ValueError:
  20                  return None
  21      return None
  22  
  23  
  24  def _installment_month_start(d: dt.date) -> dt.date:
  25      return dt.date(d.year, d.month, 1)
  26  
  27  
  28  def _installment_add_months(d: dt.date, months: int) -> dt.date:
  29      d = _installment_month_start(d)
  30      m = d.month - 1 + months
  31      y = d.year + m // 12
  32      m = m % 12 + 1
  33      return dt.date(y, m, 1)
  34  
  35  
  36  def _installment_due_this_month(
  37      start: dt.date,
  38      current: int,
  39      total: int,
  40      today: dt.date | None = None,
  41  ) -> bool:
  42      if current < 1 or current > total:
  43          return False
  44      today = today or dt.date.today()
  45      start = _installment_month_start(start)
  46      due = _installment_add_months(start, current)
  47      return due.year == today.year and due.month == today.month
  48  
  49  
  50  def is_installment_due_this_month(r: dict[str, Any]) -> bool:
  51      start = _coerce_date(r.get("start_date"))
  52      cur = int(r.get("installment_current") or 0)
  53      total = int(r.get("installment_total") or 0)
  54      rem = float(r.get("remaining") or 0)
  55      return (
  56          start is not None
  57          and 1 <= cur <= total
  58          and rem > 0
  59          and _installment_due_this_month(start, cur, total)
  60      )
  61  
  62  
  63  def serialize_installment_row(r: dict[str, Any]) -> dict[str, Any]:
  64      out = dict(r)
  65      for key in ("start_date", "finish_date", "created_at"):
  66          v = out.get(key)
  67          if hasattr(v, "isoformat"):
  68              out[key] = v.isoformat()
  69      return out
  70  
  71  
  72  def installment_summary(rows: list[dict[str, Any]]) -> dict[str, float]:
  73      sum_original = 0.0
  74      sum_remaining = 0.0
  75      due_month = 0.0
  76      for r in rows:
  77          sum_original += float(r.get("original_total") or 0)
  78          sum_remaining += float(r.get("remaining") or 0)
  79          start = _coerce_date(r.get("start_date"))
  80          cur = int(r.get("installment_current") or 0)
  81          total = int(r.get("installment_total") or 0)
  82          pay = float(r.get("due_payment") or r.get("payment_total") or 0)
  83          rem = float(r.get("remaining") or 0)
  84          if (
  85              start is not None
  86              and cur <= total
  87              and cur >= 1
  88              and rem > 0
  89              and _installment_due_this_month(start, cur, total)
  90          ):
  91              due_month += pay
  92      return {
  93          "sum_original_total": sum_original,
  94          "sum_remaining": sum_remaining,
  95          "due_this_month": due_month,
  96      }
```

## Outgoing connections
- none

## Incoming connections
- routers/credit_card.py (be:router:credit_card) -> call
- routers/installment.py (be:router:installment) -> call
