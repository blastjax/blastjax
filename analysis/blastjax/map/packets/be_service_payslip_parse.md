# Node be:service:payslip_parse: services/payslip_parse.py
Kind: module
Language: python, 252 lines of code, location: backend/app/services/payslip_parse.py

Source excerpt: backend/app/services/payslip_parse.py (first 150 lines)
```
   1  from __future__ import annotations
   2  
   3  import math
   4  import re
   5  from typing import Any
   6  
   7  
   8  def _norm_payslip_header(s: str) -> str:
   9      return re.sub(r"[^a-z0-9]+", "", str(s).strip().lower())
  10  
  11  
  12  _PAYSPLIP_HEADER_MAP: dict[str, str] = {
  13      "total": "total",
  14      "commission": "commission",
  15      "reimbursement": "reimbursement",
  16      "medicalreimbursement": "medical_reimbursement",
  17      "others": "others",
  18      "other": "others",
  19      "mp2": "mp2",
  20      "allowances": "allowances",
  21      "allowance": "allowances",
  22      "13thmonth": "thirteenth_month",
  23      "thirteenthmonth": "thirteenth_month",
  24      "basicsalary": "basic_salary",
  25      "notes": "notes",
  26      "note": "notes",
  27      "periodyear": "period_year",
  28      "payyear": "period_year",
  29      "periodmonth": "period_month",
  30      "paymonth": "period_month",
  31      "periodhalf": "period_half",
  32      "payhalf": "period_half",
  33  }
  34  
  35  
  36  def _payslip_empty_rec() -> dict[str, Any]:
  37      return {
  38          "total": None,
  39          "commission": None,
  40          "reimbursement": None,
  41          "medical_reimbursement": None,
  42          "others": None,
  43          "mp2": None,
  44          "allowances": None,
  45          "thirteenth_month": None,
  46          "basic_salary": None,
  47          "period_year": None,
  48          "period_month": None,
  49          "period_half": None,
  50          "notes": None,
  51      }
  52  
  53  
  54  def _payslip_row_is_empty(rec: dict[str, Any]) -> bool:
  55      for k in (
  56          "total",
  57          "commission",
  58          "reimbursement",
  59          "medical_reimbursement",
  60          "others",
  61          "mp2",
  62          "allowances",
  63          "thirteenth_month",
  64          "basic_salary",
  65      ):
  66          v = rec.get(k)
  67          if v is not None and not (isinstance(v, float) and math.isnan(v)):
  68              return False
  69      n = rec.get("notes")
  70      return not (n and str(n).strip())
  71  
  72  
  73  def _payslip_parse_number_cell(x: Any) -> float | None:
  74      if x is None or isinstance(x, bool):
  75          return None
  76      if isinstance(x, (int, float)):
  77          v = float(x)
  78          return None if math.isnan(v) else v
  79      s = str(x).strip().replace(",", "")
  80      if not s:
  81          return None
  82      try:
  83          return float(s)
  84      except ValueError:
  85          return None
  86  
  87  
  88  _MONTH_KEYS: list[tuple[str, str]] = [
  89      ("january", "January"),
  90      ("february", "February"),
  91      ("march", "March"),
  92      ("april", "April"),
  93      ("may", "May"),
  94      ("june", "June"),
  95      ("july", "July"),
  96      ("august", "August"),
  97      ("september", "September"),
  98      ("october", "October"),
  99      ("november", "November"),
 100      ("december", "December"),
 101  ]
 102  
 103  
 104  def _payslip_month_number(month_label: str) -> int | None:
 105      for i, (_, lab) in enumerate(_MONTH_KEYS, start=1):
 106          if lab == month_label:
 107              return i
 108      return None
 109  
 110  
 111  def _payslip_json_section_field(section_name: str) -> str | None:
 112      k = _norm_payslip_header(str(section_name))
 113      return _PAYSPLIP_HEADER_MAP.get(k)
 114  
 115  
 116  def _payslip_json_cell_half(raw: Any, half_idx: int, *, two_rows: bool) -> float | None:
 117      if raw is None:
 118          return None
 119      if isinstance(raw, list):
 120          if len(raw) >= 2:
 121              return _payslip_parse_number_cell(raw[half_idx])
 122          if len(raw) == 1:
 123              v = _payslip_parse_number_cell(raw[0])
 124              if two_rows and v is not None:
 125                  return round(v / 2.0, 2)
 126              return v
 127          return None
 128      v = _payslip_parse_number_cell(raw)
 129      if v is None:
 130          return None
 131      if two_rows:
 132          return round(v / 2.0, 2)
 133      return v
 134  
 135  
 136  def _payslip_json_cell_whole(raw: Any) -> float | None:
 137      if raw is None:
 138          return None
 139      if isinstance(raw, list):
 140          if len(raw) >= 2:
 141              a = _payslip_parse_number_cell(raw[0])
 142              b = _payslip_parse_number_cell(raw[1])
 143              if a is None and b is None:
 144                  return None
 145              if a is None:
 146                  return b
 147              if b is None:
 148                  return a
 149              return round(float(a) + float(b), 2)
 150          if len(raw) == 1:
```

## Outgoing connections
- none

## Incoming connections
- test_core.py (be:core:test_core) -> call
- routers/payslip.py (be:router:payslip) -> call
- scripts/ (migrations) (be:scripts) -> call
