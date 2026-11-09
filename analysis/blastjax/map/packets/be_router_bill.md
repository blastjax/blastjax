# Node be:router:bill: routers/bill.py
Kind: module
Language: python, 124 lines of code, location: backend/app/routers/bill.py

Source excerpt: backend/app/routers/bill.py (first 150 lines)
```
   1  from __future__ import annotations
   2  
   3  from contextlib import suppress
   4  from typing import Any
   5  from uuid import UUID
   6  
   7  from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
   8  from sqlalchemy.exc import IntegrityError
   9  from starlette.concurrency import run_in_threadpool
  10  
  11  import cache
  12  from app.deps import image_type, read_upload, require_db
  13  from app.schemas.bill import BillCategoryCreate, BillCreate
  14  from app.services.bill_extract import (
  15      UnreadablePdf,
  16      biller_fields,
  17      fields_from_text,
  18      image_text,
  19      learn,
  20      pdf_text,
  21      start_after,
  22  )
  23  from db import (
  24      bill_examples,
  25      delete_bill,
  26      delete_bill_category,
  27      get_bill_pdf,
  28      insert_bill,
  29      insert_bill_category,
  30      last_bill_date_before,
  31      list_bills,
  32      set_bill_pdf,
  33      update_bill,
  34      update_bill_category,
  35  )
  36  
  37  router = APIRouter(tags=["bill"], dependencies=[Depends(require_db)])
  38  
  39  _DUPLICATE_CATEGORY = "That category already exists."
  40  
  41  
  42  @router.get("/api/bill")
  43  def bill_list() -> dict[str, Any]:
  44      hit = cache.get("bill:list")
  45      if hit is not None:
  46          return hit
  47      result = list_bills()
  48      cache.set("bill:list", result)
  49      return result
  50  
  51  
  52  @router.post("/api/bill-category")
  53  def bill_category_create(body: BillCategoryCreate) -> dict[str, Any]:
  54      try:
  55          return {"category": insert_bill_category(body.model_dump())}
  56      except IntegrityError:
  57          raise HTTPException(status_code=409, detail=_DUPLICATE_CATEGORY)
  58  
  59  
  60  @router.put("/api/bill-category/{category_id}")
  61  def bill_category_update(category_id: UUID, body: BillCategoryCreate) -> dict[str, Any]:
  62      try:
  63          row = update_bill_category(category_id, body.model_dump())
  64      except IntegrityError:
  65          raise HTTPException(status_code=409, detail=_DUPLICATE_CATEGORY)
  66      if row is None:
  67          raise HTTPException(status_code=404, detail="Category not found.")
  68      return {"category": row}
  69  
  70  
  71  @router.delete("/api/bill-category/{category_id}")
  72  def bill_category_remove(category_id: UUID) -> dict[str, Any]:
  73      if not delete_bill_category(category_id):
  74          raise HTTPException(status_code=404, detail="Category not found.")
  75      return {"ok": True}
  76  
  77  
  78  @router.post("/api/bill")
  79  def bill_create(body: BillCreate) -> dict[str, Any]:
  80      try:
  81          return {"bill": insert_bill(body.model_dump())}
  82      except IntegrityError:
  83          raise HTTPException(status_code=404, detail="Category not found.")
  84  
  85  
  86  @router.put("/api/bill/{bill_id}")
  87  def bill_replace(bill_id: UUID, body: BillCreate) -> dict[str, Any]:
  88      try:
  89          row = update_bill(bill_id, body.model_dump())
  90      except IntegrityError:
  91          raise HTTPException(status_code=404, detail="Category not found.")
  92      if row is None:
  93          raise HTTPException(status_code=404, detail="Bill not found.")
  94      return {"bill": row}
  95  
  96  
  97  @router.delete("/api/bill/{bill_id}")
  98  def bill_remove(bill_id: UUID) -> dict[str, Any]:
  99      if not delete_bill(bill_id):
 100          raise HTTPException(status_code=404, detail="Bill not found.")
 101      return {"ok": True}
 102  
 103  
 104  @router.post("/api/bill/extract")
 105  async def bill_extract(
 106      file: UploadFile = File(...), category_id: UUID | None = Query(default=None)
 107  ) -> dict[str, Any]:
 108      data = await read_upload(file, images=True)
 109      try:
 110          return await run_in_threadpool(_read_bill, data, category_id)
 111      except UnreadablePdf as exc:
 112          raise HTTPException(status_code=422, detail=str(exc)) from exc
 113  
 114  
 115  def _read_bill(data: bytes, category_id: UUID | None) -> dict[str, Any]:
 116      """Reads a bill's PDF or photo: by the biller's own layout when it's one this knows, else by what the
 117      biller's saved bills teach about theirs."""
 118      text = image_text(data) if image_type(data) else pdf_text(data)
 119      found = biller_fields(text)
 120      if found is None:
 121          examples = []
 122          for saved, pdf in bill_examples(category_id) if category_id is not None else []:
 123              if pdf.startswith(b"%PDF"):  # a photo of a bill teaches nothing
 124                  with suppress(UnreadablePdf):
 125                      examples.append((pdf_text(pdf), saved))
 126          found = fields_from_text(text, learn(examples))
 127      if found["period_start"] is None and found["period_end"] is not None and category_id is not None:
 128          previous = last_bill_date_before(category_id, found["period_end"])
 129          found["period_start"] = start_after(previous, found["period_end"])
 130      return {"minimum_due": None, **found}
 131  
 132  
 133  @router.post("/api/bill/{bill_id}/pdf")
 134  async def bill_upload_pdf(bill_id: UUID, file: UploadFile = File(...)) -> dict[str, Any]:
 135      if not set_bill_pdf(bill_id, await read_upload(file, images=True)):
 136          raise HTTPException(status_code=404, detail="Bill not found.")
 137      return {"ok": True, "has_pdf": True}
 138  
 139  
 140  @router.get("/api/bill/{bill_id}/pdf")
 141  def bill_get_pdf(bill_id: UUID) -> Response:
 142      data = get_bill_pdf(bill_id)
 143      if data is None:
 144          raise HTTPException(status_code=404, detail="No file attached to this bill.")
 145      media_type = image_type(data) or "application/pdf"
 146      extension = media_type.split("/")[1].replace("jpeg", "jpg")
 147      return Response(
 148          content=data,
 149          media_type=media_type,
 150          headers={"Content-Disposition": f'inline; filename="bill-{bill_id}.{extension}"'},
```

## Outgoing connections
- call -> cache.py (be:core:cache)
- call -> db.py (be:core:db)
- call -> deps.py (be:core:deps)
- call -> schemas/ (Pydantic) (be:schemas)
- call -> services/bill_extract.py (be:service:bill_extract)
- read -> bill (ds:bill)
- write -> bill (ds:bill)
- read -> bill_category (ds:bill_category)
- write -> bill_category (ds:bill_category)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- /bills (web:bills) -> dispatch
- /calendar (web:calendar) -> dispatch
- components/HomeOverview.tsx (web:components:HomeOverview) -> dispatch
- /credit-card (web:credit-card) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
- /monthly-expenses (web:monthly-expenses) -> dispatch
