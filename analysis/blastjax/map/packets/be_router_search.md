# Node be:router:search: routers/search.py
Kind: module
Language: python, 9 lines of code, location: backend/app/routers/search.py

Source excerpt: backend/app/routers/search.py (first 15 lines)
```
   1  from __future__ import annotations
   2  
   3  from typing import Any
   4  
   5  from fastapi import APIRouter, Depends, Query
   6  
   7  from app.deps import require_db
   8  from db import search_records
   9  
  10  router = APIRouter(tags=["search"], dependencies=[Depends(require_db)])
  11  
  12  
  13  @router.get("/api/search")
  14  def search(q: str = Query(min_length=2, max_length=100)) -> dict[str, Any]:
  15      return {"results": search_records(q.strip())}
```

## Outgoing connections
- call -> db.py (be:core:db)
- call -> deps.py (be:core:deps)
- read -> bill_category (ds:bill_category)
- read -> credit_card (ds:credit_card)
- read -> fixed_expense (ds:fixed_expense)
- read -> house_payment (ds:house_payment)
- read -> installment (ds:installment)
- read -> monthly_expense (ds:monthly_expense)
- read -> travel_trip (ds:travel_trip)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- components/Header.tsx (web:components:Header) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
