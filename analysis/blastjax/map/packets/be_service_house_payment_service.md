# Node be:service:house_payment_service: services/house_payment_service.py
Kind: module
Language: python, 27 lines of code, location: backend/app/services/house_payment_service.py

Source excerpt: backend/app/services/house_payment_service.py (first 34 lines)
```
   1  from __future__ import annotations
   2  
   3  from typing import Any
   4  
   5  
   6  def serialize_house_payment_row(r: dict[str, Any]) -> dict[str, Any]:
   7      out = dict(r)
   8      for key in ("created_at", "last_paid_on"):
   9          v = out.get(key)
  10          if hasattr(v, "isoformat"):
  11              out[key] = v.isoformat()
  12      return out
  13  
  14  
  15  def serialize_house_payment_entry(r: dict[str, Any]) -> dict[str, Any]:
  16      out = dict(r)
  17      for key in ("paid_on", "created_at"):
  18          v = out.get(key)
  19          if hasattr(v, "isoformat"):
  20              out[key] = v.isoformat()
  21      return out
  22  
  23  
  24  def house_payment_summary(rows: list[dict[str, Any]]) -> dict[str, float]:
  25      sum_paid = 0.0
  26      total_entries = 0
  27      for r in rows:
  28          sum_paid += float(r.get("total_paid") or 0)
  29          total_entries += int(r.get("entry_count") or 0)
  30      return {
  31          "sum_total_paid": sum_paid,
  32          "total_entries": float(total_entries),
  33          "plan_count": float(len(rows)),
  34      }
```

## Outgoing connections
- none

## Incoming connections
- routers/house_payment.py (be:router:house_payment) -> call
