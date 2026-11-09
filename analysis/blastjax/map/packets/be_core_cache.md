# Node be:core:cache: cache.py
Kind: module
Language: python, 94 lines of code, location: backend/cache.py

Source excerpt: backend/cache.py (first 114 lines)
```
   1  from __future__ import annotations
   2  
   3  import json
   4  import logging
   5  import os
   6  from typing import Any
   7  from urllib.parse import urlparse, urlunparse
   8  from pathlib import Path
   9  
  10  _log = logging.getLogger(__name__)
  11  _client: Any = None
  12  
  13  
  14  def _default_ttl() -> int:
  15      return int(os.environ.get("REDIS_CACHE_TTL", "86400"))
  16  
  17  
  18  def _resolved_url() -> str:
  19      url = (os.environ.get("REDIS_URL") or "redis://localhost:6379").strip()
  20      if Path("/.dockerenv").exists():
  21          parsed = urlparse(url)
  22          if (parsed.hostname or "").lower() in ("127.0.0.1", "localhost"):
  23              url = urlunparse((
  24                  parsed.scheme,
  25                  "redis:6379",
  26                  parsed.path,
  27                  parsed.params,
  28                  parsed.query,
  29                  parsed.fragment,
  30              ))
  31              os.environ["REDIS_URL"] = url
  32      return url
  33  
  34  
  35  def init_cache() -> None:
  36      global _client
  37      url = _resolved_url()
  38      try:
  39          import redis as _redis
  40          c = _redis.Redis.from_url(
  41              url,
  42              decode_responses=True,
  43              socket_connect_timeout=2,
  44              socket_timeout=2,
  45          )
  46          c.ping()
  47          _client = c
  48          _log.info("Redis cache connected: %s", url)
  49      except Exception as exc:
  50          _log.warning("Redis unavailable — caching disabled (%s: %s)", type(exc).__name__, exc)
  51          _client = None
  52  
  53  
  54  def close_cache() -> None:
  55      global _client
  56      if _client is not None:
  57          try:
  58              _client.close()
  59          except Exception:
  60              pass
  61          _client = None
  62  
  63  
  64  def get(key: str) -> Any | None:
  65      if _client is None:
  66          return None
  67      try:
  68          raw = _client.get(key)
  69          return json.loads(raw) if raw is not None else None
  70      except Exception as exc:
  71          _log.debug("cache.get(%s): %s", key, exc)
  72          return None
  73  
  74  
  75  def set(key: str, value: Any, ttl: int | None = None) -> None:  # noqa: A001
  76      if _client is None:
  77          return
  78      try:
  79          _client.set(key, json.dumps(value, default=str), ex=ttl or _default_ttl())
  80      except Exception as exc:
  81          _log.debug("cache.set(%s): %s", key, exc)
  82  
  83  
  84  def delete(key: str) -> None:
  85      if _client is None:
  86          return
  87      try:
  88          _client.delete(key)
  89      except Exception as exc:
  90          _log.debug("cache.delete(%s): %s", key, exc)
  91  
  92  
  93  def flush() -> None:
  94      if _client is None:
  95          return
  96      try:
  97          _client.flushdb()
  98      except Exception as exc:
  99          _log.debug("cache.flush: %s", exc)
 100  
 101  
 102  def invalidate(prefix: str) -> None:
 103      if _client is None:
 104          return
 105      try:
 106          cursor = 0
 107          while True:
 108              cursor, keys = _client.scan(cursor, match=f"{prefix}:*", count=100)
 109              if keys:
 110                  _client.delete(*keys)
 111              if cursor == 0:
 112                  break
 113      except Exception as exc:
 114          _log.debug("cache.invalidate(%s): %s", prefix, exc)
```

## Outgoing connections
- read -> Redis cache (ds:redis)
- write -> Redis cache (ds:redis)

## Incoming connections
- factory.py (be:core:factory) -> call
- security.py (be:core:security) -> call
- routers/bill.py (be:router:bill) -> call
- routers/blood_pressure.py (be:router:blood_pressure) -> call
- routers/calendar_day_override.py (be:router:calendar_day_override) -> call
- routers/credit_card.py (be:router:credit_card) -> call
- routers/fixed_expense.py (be:router:fixed_expense) -> call
- routers/house_payment.py (be:router:house_payment) -> call
- routers/installment.py (be:router:installment) -> call
- routers/lotto.py (be:router:lotto) -> call
- routers/monthly_expense.py (be:router:monthly_expense) -> call
- routers/pay_period_start_override.py (be:router:pay_period_start_override) -> call
- routers/payslip.py (be:router:payslip) -> call
- routers/payslip_default.py (be:router:payslip_default) -> call
- routers/travel.py (be:router:travel) -> call
