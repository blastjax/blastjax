# Node be:router:company: routers/company.py
Kind: module
Language: python, 58 lines of code, location: backend/app/routers/company.py

Source excerpt: backend/app/routers/company.py (first 74 lines)
```
   1  from __future__ import annotations
   2  
   3  from typing import Any
   4  from uuid import UUID
   5  
   6  from fastapi import APIRouter, Depends, HTTPException
   7  from sqlalchemy.exc import IntegrityError
   8  
   9  from app.deps import require_db
  10  from app.schemas.company import CompanyCreate, CompanyReorder, CompanyUpdate
  11  from db import (
  12      delete_company,
  13      insert_company,
  14      list_companies,
  15      reorder_companies,
  16      update_company,
  17  )
  18  
  19  router = APIRouter(prefix="/api/companies", tags=["companies"], dependencies=[Depends(require_db)])
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
  30  @router.get("")
  31  def companies_list() -> dict[str, Any]:
  32      return {"companies": [_serialize(r) for r in list_companies()]}
  33  
  34  
  35  @router.post("")
  36  def companies_create(body: CompanyCreate) -> dict[str, Any]:
  37      try:
  38          row = insert_company(body.name.strip(), body.flags_dict())
  39      except IntegrityError:
  40          raise HTTPException(status_code=409, detail="That company already exists.")
  41      return {"company": _serialize(row)}
  42  
  43  
  44  @router.put("/reorder")
  45  def companies_reorder(body: CompanyReorder) -> dict[str, Any]:
  46      rows = reorder_companies(body.ids)
  47      if rows is None:
  48          raise HTTPException(
  49              status_code=400,
  50              detail="ids must list every company id exactly once.",
  51          )
  52      return {"companies": [_serialize(r) for r in rows]}
  53  
  54  
  55  @router.put("/{company_id}")
  56  def companies_update(company_id: UUID, body: CompanyUpdate) -> dict[str, Any]:
  57      try:
  58          row = update_company(company_id, body.name.strip(), body.flags_dict())
  59      except IntegrityError:
  60          raise HTTPException(status_code=409, detail="That company already exists.")
  61      if row is None:
  62          raise HTTPException(status_code=404, detail="Company not found.")
  63      return {"company": _serialize(row)}
  64  
  65  
  66  @router.delete("/{company_id}")
  67  def companies_remove(company_id: UUID) -> dict[str, Any]:
  68      try:
  69          deleted = delete_company(company_id)
  70      except ValueError as exc:
  71          raise HTTPException(status_code=409, detail=str(exc)) from exc
  72      if not deleted:
  73          raise HTTPException(status_code=404, detail="Company not found.")
  74      return {"ok": True}
```

## Outgoing connections
- call -> db.py (be:core:db)
- call -> deps.py (be:core:deps)
- call -> schemas/ (Pydantic) (be:schemas)
- read -> company (ds:company)
- write -> company (ds:company)
- read -> payslip (ds:payslip)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- components/CompanyRedirect.tsx (web:components:CompanyRedirect) -> dispatch
- components/SidebarNav.tsx (web:components:SidebarNav) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
- /payslip (web:payslip) -> dispatch
- /settings (web:settings) -> dispatch
