# Node be:core:db: db.py
Kind: module
Language: python, 1681 lines of code, location: backend/db.py

Source excerpt: backend/db.py (first 150 lines)
```
   1  from __future__ import annotations
   2  
   3  import json
   4  import logging
   5  import os
   6  import threading
   7  import time as _time
   8  from collections.abc import Iterator
   9  from contextlib import contextmanager
  10  from datetime import date, datetime, time
  11  from decimal import Decimal
  12  from pathlib import Path
  13  from typing import Any
  14  from uuid import UUID
  15  
  16  import psycopg2
  17  from dotenv import load_dotenv
  18  from sqlalchemy import Engine, Integer, and_, create_engine, delete, event, func, or_, select, update
  19  from sqlalchemy.dialects.postgresql import distinct_on, insert
  20  from sqlalchemy.engine import Row
  21  from sqlalchemy.exc import DisconnectionError
  22  from sqlalchemy.orm import Session, aliased, selectinload, undefer
  23  
  24  import schema
  25  from schema import (
  26      AppUser,
  27      AppUserPasskey,
  28      AppUserSession,
  29      Bill,
  30      BillCategory,
  31      BloodPressure,
  32      CalendarDayOverride,
  33      Company,
  34      CreditCard,
  35      CreditCardPayment,
  36      FixedExpense,
  37      HousePayment,
  38      HousePaymentEntry,
  39      Installment,
  40      InstallmentLine,
  41      LottoAttempt,
  42      LottoDraw,
  43      LottoGame,
  44      MonthlyExpense,
  45      PayPeriodStartOverride,
  46      Payslip,
  47      PayslipDefault,
  48      PayslipDefaultSettings,
  49      TravelAccommodation,
  50      TravelCity,
  51      TravelFlight,
  52      TravelItinerary,
  53      TravelTransport,
  54      TravelTrip,
  55  )
  56  
  57  _BACKEND_DIR = Path(__file__).resolve().parent
  58  _REPO_ROOT = _BACKEND_DIR.parent
  59  
  60  
  61  def _load_env_files() -> None:
  62      for path in (_REPO_ROOT / ".env", _BACKEND_DIR / ".env"):
  63          if path.is_file():
  64              load_dotenv(path, override=True)
  65      local = _REPO_ROOT / ".env.local"
  66      if local.is_file():
  67          load_dotenv(local, override=False)
  68  
  69  
  70  _load_env_files()
  71  
  72  _log = logging.getLogger(__name__)
  73  
  74  
  75  def database_url() -> str:
  76      for name in ("DATABASE_URL", "DATABASE_URL_UNPOOLED"):
  77          raw = (os.environ.get(name) or "").strip()
  78          if raw.startswith(("postgres://", "postgresql://")):
  79              return raw
  80      return ""
  81  
  82  
  83  def storage_kind() -> str:
  84      return "postgres" if database_url() else "none"
  85  
  86  
  87  _ENGINE: Any = None
  88  _POOL_LOCK = threading.RLock()
  89  _INFLIGHT = 0
  90  _LAST_ACTIVITY = _time.monotonic()
  91  _REAPER: Any = None
  92  _REAP_TICK_SECONDS = 15.0
  93  
  94  
  95  def _probe_after_seconds() -> float:
  96      return float(os.environ.get("BUDGET_DB_PROBE_AFTER_SECONDS", "20"))
  97  
  98  
  99  def _stamp(_dbapi_conn: Any, record: Any, *_: Any) -> None:
 100      record.info["last_used"] = _time.monotonic()
 101  
 102  
 103  def _probe_if_stale(dbapi_conn: Any, record: Any, _proxy: Any) -> None:
 104      if _time.monotonic() - record.info.get("last_used", 0.0) < _probe_after_seconds():
 105          return
 106      try:
 107          dbapi_conn.autocommit = True
 108          with dbapi_conn.cursor() as cur:
 109              cur.execute("SELECT 1")
 110          dbapi_conn.autocommit = False
 111      except psycopg2.Error as exc:
 112          raise DisconnectionError() from exc
 113  
 114  
 115  def _engine() -> Engine:
 116      global _ENGINE
 117      if _ENGINE is None:
 118          with _POOL_LOCK:
 119              if _ENGINE is None:
 120                  url = database_url()
 121                  if not url:
 122                      raise RuntimeError("DATABASE_URL is not set to a Postgres URL")
 123                  maxconn = int(os.environ.get("BUDGET_DB_POOL_MAX", "10"))
 124                  keep = max(1, min(int(os.environ.get("BUDGET_DB_POOL_KEEP", "6")), maxconn))
 125                  engine = create_engine(
 126                      "postgresql+psycopg2://" + url.split("://", 1)[1],
 127                      pool_size=keep,
 128                      max_overflow=maxconn - keep,
 129                      connect_args={
 130                          "connect_timeout": 10,
 131                          "application_name": "blastjax-api",
 132                          "options": "-c timezone=UTC",
 133                          "keepalives": 1,
 134                          "keepalives_idle": 30,
 135                          "keepalives_interval": 10,
 136                          "keepalives_count": 5,
 137                      },
 138                  )
 139                  event.listen(engine, "connect", _stamp)
 140                  event.listen(engine, "checkin", _stamp)
 141                  event.listen(engine, "checkout", _probe_if_stale)
 142                  _ENGINE = engine
 143                  _start_reaper()
 144      return _ENGINE
 145  
 146  
 147  def _idle_close_after() -> float:
 148      return float(os.environ.get("BUDGET_DB_IDLE_CLOSE_SECONDS", "120"))
 149  
 150  
```

## Outgoing connections
- call -> schema.py (be:core:schema)

## Incoming connections
- deps.py (be:core:deps) -> call
- factory.py (be:core:factory) -> call
- security.py (be:core:security) -> call
- test_core.py (be:core:test_core) -> call
- routers/auth.py (be:router:auth) -> call
- routers/bill.py (be:router:bill) -> call
- routers/blood_pressure.py (be:router:blood_pressure) -> call
- routers/calendar_day_override.py (be:router:calendar_day_override) -> call
- routers/company.py (be:router:company) -> call
- routers/credit_card.py (be:router:credit_card) -> call
- routers/fixed_expense.py (be:router:fixed_expense) -> call
- routers/health.py (be:router:health) -> call
- routers/house_payment.py (be:router:house_payment) -> call
- routers/installment.py (be:router:installment) -> call
- routers/lotto.py (be:router:lotto) -> call
- routers/monthly_expense.py (be:router:monthly_expense) -> call
- routers/pay_period_start_override.py (be:router:pay_period_start_override) -> call
- routers/payslip.py (be:router:payslip) -> call
- routers/payslip_default.py (be:router:payslip_default) -> call
- routers/search.py (be:router:search) -> call
- routers/travel.py (be:router:travel) -> call
- routers/user.py (be:router:user) -> call
- scripts/ (migrations) (be:scripts) -> call
