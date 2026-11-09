# Node be:router:payslip_default: routers/payslip_default.py
Kind: module
Language: python, 55 lines of code, location: backend/app/routers/payslip_default.py

Source excerpt: backend/app/routers/payslip_default.py (first 66 lines)
```
   1  from __future__ import annotations
   2  
   3  from typing import Any
   4  
   5  from fastapi import APIRouter, Depends, Query
   6  
   7  import cache
   8  from app.deps import require_db
   9  from app.schemas.payslip_default import PayslipDefaultsUpsert
  10  from db import get_payslip_defaults, save_payslip_defaults
  11  
  12  router = APIRouter(tags=["payslip_default"], dependencies=[Depends(require_db)])
  13  
  14  _BUILTIN = {"mp2": "5,000.00", "allowances": "1,108.30"}
  15  
  16  
  17  def _fallback_form(half: int) -> dict[str, Any]:
  18      return {
  19          "period_year": "",
  20          "period_month": "",
  21          "period_half": str(half),
  22          "total": "",
  23          "basic_salary": "",
  24          "commission": "",
  25          "reimbursement": "",
  26          "medical_reimbursement": "",
  27          "others": "",
  28          "mp2": _BUILTIN["mp2"],
  29          "allowances": _BUILTIN["allowances"],
  30          "thirteenth_month": "",
  31          "notes": "",
  32          "withholding_tax": "",
  33          "sss_contribution": "",
  34          "philhealth": "",
  35          "pag_ibig": "",
  36          "bereavement_asst": "",
  37      }
  38  
  39  
  40  @router.get("/api/payslip-defaults")
  41  def payslip_defaults_get(company: str = Query(..., min_length=1)) -> dict[str, Any]:
  42      key = f"payslip_default:bundle:{company}"
  43      hit = cache.get(key)
  44      if hit is not None:
  45          return hit
  46      saved = get_payslip_defaults(company)
  47      result = {
  48          "formFirst": saved["form_first"] or _fallback_form(1),
  49          "formSecond": saved["form_second"] or _fallback_form(2),
  50          "settingsHalf": saved["settings_half"] or "first",
  51      }
  52      cache.set(key, result)
  53      return result
  54  
  55  
  56  @router.put("/api/payslip-defaults")
  57  def payslip_defaults_put(body: PayslipDefaultsUpsert) -> dict[str, Any]:
  58      company = body.company.strip()
  59      save_payslip_defaults(
  60          company, body.form_first.model_dump(), body.form_second.model_dump(), body.settings_half
  61      )
  62      return {
  63          "formFirst": {**body.form_first.model_dump(), "period_half": "1"},
  64          "formSecond": {**body.form_second.model_dump(), "period_half": "2"},
  65          "settingsHalf": body.settings_half,
  66      }
```

## Outgoing connections
- call -> cache.py (be:core:cache)
- call -> db.py (be:core:db)
- call -> deps.py (be:core:deps)
- call -> schemas/ (Pydantic) (be:schemas)
- read -> payslip_default (ds:payslip_default)
- write -> payslip_default (ds:payslip_default)
- read -> payslip_default_settings (ds:payslip_default_settings)
- write -> payslip_default_settings (ds:payslip_default_settings)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
- /payslip (web:payslip) -> dispatch
