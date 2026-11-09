# Node be:core:factory: factory.py
Kind: module
Language: python, 139 lines of code, location: backend/app/factory.py

Source excerpt: backend/app/factory.py (first 150 lines)
```
   1  from __future__ import annotations
   2  
   3  import os
   4  from collections.abc import AsyncGenerator
   5  from contextlib import asynccontextmanager
   6  
   7  from fastapi import Depends, FastAPI, Request
   8  from fastapi.middleware.cors import CORSMiddleware
   9  from starlette.concurrency import run_in_threadpool
  10  
  11  import cache
  12  from app.deps import require_session
  13  from app.security import forget_login_required
  14  from db import close_connection_pool, init_schema
  15  
  16  _WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
  17  
  18  
  19  def cors_allow_origins() -> list[str]:
  20      defaults = [
  21          "http://localhost:3000",
  22          "http://127.0.0.1:3000",
  23      ]
  24      raw = os.environ.get("BUDGET_CORS_ORIGINS", "")
  25      extra = [o.strip() for o in raw.split(",") if o.strip()]
  26      merged = [*defaults, *extra]
  27      return list(dict.fromkeys(merged))
  28  
  29  
  30  _CACHE_PREFIXES: dict[str, str] = {
  31      "/api/payslip": "payslip",
  32      "/api/installment": "installment",
  33      "/api/house-payment": "house_payment",
  34      "/api/blood-pressure": "bp",
  35      "/api/lotto": "lotto",
  36      "/api/fixed-expense": "fixed_expense",
  37      "/api/monthly-expense": "monthly_expense",
  38      "/api/calendar-day-override": "calendar_day_override",
  39      "/api/credit-card": "credit_card",
  40      "/api/pay-period-start-override": "pay_period_start_override",
  41      "/api/payslip-defaults": "payslip_default",
  42      "/api/travel": "travel",
  43      "/api/bill": "bill",
  44      "/api/bill-category": "bill",
  45  }
  46  
  47  _CACHE_ALSO_INVALIDATES: dict[str, tuple[str, ...]] = {
  48      "installment": ("credit_card",),
  49      # A linked card reads its statement from the latest bill; removing a category unlinks its monthly expenses.
  50      "bill": ("credit_card", "monthly_expense"),
  51      "house_payment": ("monthly_expense",),  # removing one unlinks its monthly expenses
  52      # Removing a card unlinks its installments; a payment is also a fixed expense.
  53      "credit_card": ("installment", "fixed_expense"),
  54  }
  55  
  56  
  57  def _cache_prefixes_for(path: str) -> tuple[str, ...]:
  58      for route in sorted(_CACHE_PREFIXES, key=len, reverse=True):
  59          if path == route or path.startswith(route + "/"):
  60              prefix = _CACHE_PREFIXES[route]
  61              return (prefix, *_CACHE_ALSO_INVALIDATES.get(prefix, ()))
  62      return ()
  63  
  64  
  65  def _invalidate_namespaces(names: tuple[str, ...]) -> None:
  66      for name in names:
  67          cache.invalidate(name)
  68  
  69  _EXTRA_INVALIDATORS: tuple[tuple[str, Any], ...] = (
  70      ("/api/users", forget_login_required),
  71  )
  72  
  73  
  74  def _run_extra_invalidators(path: str) -> None:
  75      for route, fn in _EXTRA_INVALIDATORS:
  76          if path == route or path.startswith(route + "/"):
  77              fn()
  78  
  79  
  80  @asynccontextmanager
  81  async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
  82      init_schema()
  83      cache.init_cache()
  84      # A fresh start never serves what an older build (or a change made outside the API) left cached.
  85      cache.flush()
  86      try:
  87          yield
  88      finally:
  89          cache.close_cache()
  90          close_connection_pool()
  91  
  92  
  93  def create_app() -> FastAPI:
  94      app = FastAPI(
  95          title="Budget payslip & installments API",
  96          version="1.0.0",
  97          lifespan=lifespan,
  98      )
  99  
 100      app.add_middleware(
 101          CORSMiddleware,
 102          allow_origins=cors_allow_origins(),
 103          allow_credentials=True,
 104          allow_methods=["*"],
 105          allow_headers=["*"],
 106      )
 107  
 108      @app.middleware("http")
 109      async def invalidate_cache_on_write(request: Request, call_next):
 110          path = request.url.path
 111          is_write = request.method in _WRITE_METHODS
 112          response = await call_next(request)
 113          if is_write and response.status_code < 400:
 114              namespaces = _cache_prefixes_for(path)
 115              if namespaces:
 116                  await run_in_threadpool(_invalidate_namespaces, namespaces)
 117              _run_extra_invalidators(path)
 118          return response
 119  
 120      from app.routers import (
 121          auth,
 122          bill,
 123          blood_pressure,
 124          calendar_day_override,
 125          company,
 126          credit_card,
 127          fixed_expense,
 128          health,
 129          house_payment,
 130          installment,
 131          lotto,
 132          mambo,
 133          monthly_expense,
 134          mosaic,
 135          pay_period_start_override,
 136          payslip,
 137          payslip_default,
 138          search,
 139          travel,
 140          user,
 141      )
 142  
 143      app.include_router(health.router)
 144      app.include_router(auth.router)
 145  
 146      for router in (
 147          payslip.router,
 148          installment.router,
 149          house_payment.router,
 150          blood_pressure.router,
```

## Outgoing connections
- call -> cache.py (be:core:cache)
- call -> db.py (be:core:db)
- call -> deps.py (be:core:deps)
- call -> security.py (be:core:security)
- call -> routers/auth.py (be:router:auth)
- dispatch -> routers/auth.py (be:router:auth)
- call -> routers/bill.py (be:router:bill)
- dispatch -> routers/bill.py (be:router:bill)
- call -> routers/blood_pressure.py (be:router:blood_pressure)
- dispatch -> routers/blood_pressure.py (be:router:blood_pressure)
- call -> routers/calendar_day_override.py (be:router:calendar_day_override)
- dispatch -> routers/calendar_day_override.py (be:router:calendar_day_override)
- call -> routers/company.py (be:router:company)
- dispatch -> routers/company.py (be:router:company)
- call -> routers/credit_card.py (be:router:credit_card)
- dispatch -> routers/credit_card.py (be:router:credit_card)
- call -> routers/fixed_expense.py (be:router:fixed_expense)
- dispatch -> routers/fixed_expense.py (be:router:fixed_expense)
- call -> routers/health.py (be:router:health)
- dispatch -> routers/health.py (be:router:health)
- call -> routers/house_payment.py (be:router:house_payment)
- dispatch -> routers/house_payment.py (be:router:house_payment)
- call -> routers/installment.py (be:router:installment)
- dispatch -> routers/installment.py (be:router:installment)
- call -> routers/lotto.py (be:router:lotto)
- dispatch -> routers/lotto.py (be:router:lotto)
- call -> routers/mambo.py (be:router:mambo)
- dispatch -> routers/mambo.py (be:router:mambo)
- call -> routers/monthly_expense.py (be:router:monthly_expense)
- dispatch -> routers/monthly_expense.py (be:router:monthly_expense)
- call -> routers/mosaic.py (be:router:mosaic)
- dispatch -> routers/mosaic.py (be:router:mosaic)
- call -> routers/pay_period_start_override.py (be:router:pay_period_start_override)
- dispatch -> routers/pay_period_start_override.py (be:router:pay_period_start_override)
- call -> routers/payslip.py (be:router:payslip)
- dispatch -> routers/payslip.py (be:router:payslip)
- call -> routers/payslip_default.py (be:router:payslip_default)
- dispatch -> routers/payslip_default.py (be:router:payslip_default)
- call -> routers/search.py (be:router:search)
- dispatch -> routers/search.py (be:router:search)
- call -> routers/travel.py (be:router:travel)
- dispatch -> routers/travel.py (be:router:travel)
- call -> routers/user.py (be:router:user)
- dispatch -> routers/user.py (be:router:user)

## Incoming connections
- main.py (be:core:main) -> call
- routers/auth.py (be:router:auth) -> call
