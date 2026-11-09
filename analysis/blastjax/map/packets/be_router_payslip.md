# Node be:router:payslip: routers/payslip.py
Kind: module
Language: python, 178 lines of code, location: backend/app/routers/payslip.py

Source excerpt: backend/app/routers/payslip.py (first 150 lines)
```
   1  from __future__ import annotations
   2  
   3  import base64
   4  from typing import Any
   5  from uuid import UUID
   6  
   7  from fastapi import (
   8      APIRouter,
   9      Body,
  10      Depends,
  11      File,
  12      HTTPException,
  13      Query,
  14      Response,
  15      UploadFile,
  16  )
  17  
  18  from starlette.concurrency import run_in_threadpool
  19  
  20  import cache
  21  from app.deps import read_upload, require_db
  22  from app.schemas.payslip import PayslipCreate
  23  from app.services.bill_extract import UnreadablePdf, pdf_text
  24  from app.services.payslip_parse import _payslip_records_from_nested_json, payslip_from_text
  25  from db import (
  26      delete_payslip,
  27      delete_payslip_pdf,
  28      get_payslip,
  29      get_payslip_pdf,
  30      insert_payslip,
  31      insert_payslips_bulk,
  32      list_payslips,
  33      set_payslip_pdf,
  34      update_payslip,
  35  )
  36  
  37  router = APIRouter(tags=["payslip"], dependencies=[Depends(require_db)])
  38  
  39  
  40  def _serialize_payslip(row: dict[str, Any]) -> dict[str, Any]:
  41      ca = row.get("created_at")
  42      if hasattr(ca, "isoformat"):
  43          row["created_at"] = ca.isoformat()
  44      return row
  45  
  46  
  47  @router.get("/api/payslip")
  48  def payslip_list(
  49      limit: int = Query(default=1000, ge=1, le=2000),
  50      company: str | None = Query(default=None),
  51  ) -> dict[str, Any]:
  52      key = f"payslip:list:{limit}:{company or ''}"
  53      hit = cache.get(key)
  54      if hit is not None:
  55          return hit
  56      result = {
  57          "payslips": [_serialize_payslip(r) for r in list_payslips(limit=limit, company=company)]
  58      }
  59      cache.set(key, result)
  60      return result
  61  
  62  
  63  @router.post("/api/payslip")
  64  def payslip_create(body: PayslipCreate) -> dict[str, Any]:
  65      row = insert_payslip(
  66          body.total,
  67          body.commission,
  68          body.reimbursement,
  69          body.medical_reimbursement,
  70          body.others,
  71          body.mp2,
  72          body.allowances,
  73          body.thirteenth_month,
  74          body.basic_salary,
  75          body.period_year,
  76          body.period_month,
  77          body.period_half,
  78          body.notes,
  79          body.withholding_tax,
  80          body.sss_contribution,
  81          body.philhealth,
  82          body.pag_ibig,
  83          body.bereavement_asst,
  84          company=body.company.strip(),
  85      )
  86      return _serialize_payslip(row)
  87  
  88  
  89  @router.post("/api/payslip/import-json")
  90  def payslip_import_json(body: dict[str, Any] = Body(...)) -> dict[str, Any]:
  91      if not isinstance(body, dict):
  92          raise HTTPException(status_code=400, detail="JSON root must be an object.")
  93      recs = _payslip_records_from_nested_json(body)
  94      if not recs:
  95          raise HTTPException(
  96              status_code=400,
  97              detail="No payslip rows were produced. Expected shape: { "
  98              '"2024": { "Total": { "January": [a, b], ... }, "Commission": { ... }, ... } }',
  99          )
 100      ids = insert_payslips_bulk(recs)
 101      return {"filename": "payslip-import.json", "inserted": len(ids), "ids": ids}
 102  
 103  
 104  @router.post("/api/payslip/extract")
 105  async def payslip_extract(file: UploadFile = File(...)) -> dict[str, Any]:
 106      data = await read_upload(file)
 107      try:
 108          found = payslip_from_text(await run_in_threadpool(pdf_text, data))
 109      except UnreadablePdf as exc:
 110          raise HTTPException(status_code=422, detail=str(exc)) from exc
 111      if found is None:
 112          raise HTTPException(
 113              status_code=422,
 114              detail="This doesn't look like a Sophos payslip from August 2025 on, so nothing could be read from it.",
 115          )
 116      return found
 117  
 118  
 119  @router.get("/api/payslip/{payslip_id}")
 120  def payslip_one(payslip_id: UUID) -> dict[str, Any]:
 121      key = f"payslip:{payslip_id}"
 122      hit = cache.get(key)
 123      if hit is not None:
 124          return hit
 125      row = get_payslip(payslip_id)
 126      if not row:
 127          raise HTTPException(status_code=404, detail="Payslip not found.")
 128      result = _serialize_payslip(row)
 129      cache.set(key, result)
 130      return result
 131  
 132  
 133  @router.put("/api/payslip/{payslip_id}")
 134  def payslip_replace(payslip_id: UUID, body: PayslipCreate) -> dict[str, Any]:
 135      row = update_payslip(
 136          payslip_id,
 137          body.total,
 138          body.commission,
 139          body.reimbursement,
 140          body.medical_reimbursement,
 141          body.others,
 142          body.mp2,
 143          body.allowances,
 144          body.thirteenth_month,
 145          body.basic_salary,
 146          body.period_year,
 147          body.period_month,
 148          body.period_half,
 149          body.notes,
 150          body.withholding_tax,
```

## Outgoing connections
- call -> cache.py (be:core:cache)
- call -> db.py (be:core:db)
- call -> deps.py (be:core:deps)
- call -> schemas/ (Pydantic) (be:schemas)
- call -> services/bill_extract.py (be:service:bill_extract)
- call -> services/payslip_parse.py (be:service:payslip_parse)
- read -> payslip (ds:payslip)
- write -> payslip (ds:payslip)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- /calendar (web:calendar) -> dispatch
- /commission (web:commission) -> dispatch
- components/HomeOverview.tsx (web:components:HomeOverview) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
- /payslip (web:payslip) -> dispatch
- /salary-stats (web:salary-stats) -> dispatch
