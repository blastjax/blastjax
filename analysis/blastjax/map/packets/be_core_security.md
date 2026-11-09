# Node be:core:security: security.py
Kind: module
Language: python, 117 lines of code, location: backend/app/security.py

Source excerpt: backend/app/security.py (first 150 lines)
```
   1  from __future__ import annotations
   2  
   3  import hashlib
   4  import os
   5  import secrets
   6  import time
   7  from typing import Any
   8  from uuid import UUID
   9  
  10  import cache
  11  from db import any_app_users, delete_app_user_session, get_app_user_session_user_id, insert_app_user_session
  12  
  13  _SESSION_PREFIX = "auth_session"
  14  _FAIL_PREFIX = "auth_fail"
  15  _PASSKEY_PREFIX = "auth_passkey"
  16  _USERS_EXIST_KEY = "auth_state:users_exist"
  17  
  18  _SESSION_CACHE_SECONDS = 5 * 60
  19  _MAX_FAILED_ATTEMPTS = 8
  20  _FAIL_WINDOW_SECONDS = 15 * 60
  21  _PASSKEY_CHALLENGE_SECONDS = 5 * 60
  22  
  23  _USERS_EXIST_LOCAL_TTL = 5.0
  24  _USERS_EXIST_REDIS_TTL = 3600
  25  
  26  
  27  class _ExpiringStore:
  28      def __init__(self) -> None:
  29          self._items: dict[str, tuple[float, Any]] = {}
  30  
  31      def set(self, key: str, value: Any, ttl: int) -> None:
  32          self._prune()
  33          self._items[key] = (time.monotonic() + ttl, value)
  34  
  35      def get(self, key: str) -> Any | None:
  36          item = self._items.get(key)
  37          if item is None:
  38              return None
  39          expiry, value = item
  40          if expiry <= time.monotonic():
  41              del self._items[key]
  42              return None
  43          return value
  44  
  45      def delete(self, key: str) -> None:
  46          self._items.pop(key, None)
  47  
  48      def _prune(self) -> None:
  49          now = time.monotonic()
  50          for key in [k for k, (expiry, _) in self._items.items() if expiry <= now]:
  51              del self._items[key]
  52  
  53  
  54  _fallback = _ExpiringStore()
  55  
  56  
  57  def _store_set(key: str, value: Any, ttl: int) -> None:
  58      cache.set(key, value, ttl=ttl)
  59      if cache.get(key) is None:
  60          _fallback.set(key, value, ttl)
  61  
  62  
  63  def _store_get(key: str) -> Any | None:
  64      hit = cache.get(key)
  65      return hit if hit is not None else _fallback.get(key)
  66  
  67  
  68  def _store_delete(key: str) -> None:
  69      cache.delete(key)
  70      _fallback.delete(key)
  71  
  72  
  73  _users_exist_local: tuple[float, bool] | None = None
  74  
  75  
  76  def _auth_disabled() -> bool:
  77      return (os.environ.get("BUDGET_DISABLE_AUTH") or "").strip().lower() in ("1", "true", "yes")
  78  
  79  
  80  def login_required() -> bool:
  81      if _auth_disabled():
  82          return False
  83      global _users_exist_local
  84      now = time.monotonic()
  85      if _users_exist_local is not None and _users_exist_local[0] > now:
  86          return _users_exist_local[1]
  87  
  88      hit = cache.get(_USERS_EXIST_KEY)
  89      if hit is None:
  90          hit = any_app_users()
  91          cache.set(_USERS_EXIST_KEY, hit, ttl=_USERS_EXIST_REDIS_TTL)
  92      value = bool(hit)
  93      _users_exist_local = (now + _USERS_EXIST_LOCAL_TTL, value)
  94      return value
  95  
  96  
  97  def forget_login_required() -> None:
  98      global _users_exist_local
  99      _users_exist_local = None
 100      cache.delete(_USERS_EXIST_KEY)
 101  
 102  
 103  def _token_hash(token: str) -> bytes:
 104      return hashlib.sha256(token.encode()).digest()
 105  
 106  
 107  def create_session(user_id: UUID) -> str:
 108      """A login that lasts until logout. Only its hash is stored, so the table alone can't log anyone in."""
 109      token = secrets.token_urlsafe(32)
 110      insert_app_user_session(user_id, _token_hash(token))
 111      return token
 112  
 113  
 114  def session_user_id(token: str) -> UUID | None:
 115      if not token:
 116          return None
 117      token_hash = _token_hash(token)
 118      # Redis only, not _store_*: a logout must clear this for every worker, not just its own.
 119      key = f"{_SESSION_PREFIX}:{token_hash.hex()}"
 120      cached = cache.get(key)
 121      if cached is not None:
 122          return UUID(cached)
 123      user_id = get_app_user_session_user_id(token_hash)
 124      if user_id is not None:
 125          cache.set(key, str(user_id), ttl=_SESSION_CACHE_SECONDS)
 126      return user_id
 127  
 128  
 129  def session_is_valid(token: str) -> bool:
 130      return session_user_id(token) is not None
 131  
 132  
 133  def revoke_session(token: str) -> None:
 134      if token:
 135          token_hash = _token_hash(token)
 136          delete_app_user_session(token_hash)
 137          cache.delete(f"{_SESSION_PREFIX}:{token_hash.hex()}")
 138  
 139  
 140  def too_many_failed_attempts(client_ip: str) -> bool:
 141      count = _store_get(f"{_FAIL_PREFIX}:{client_ip}") or 0
 142      return int(count) >= _MAX_FAILED_ATTEMPTS
 143  
 144  
 145  def record_failed_attempt(client_ip: str) -> None:
 146      key = f"{_FAIL_PREFIX}:{client_ip}"
 147      count = int(_store_get(key) or 0) + 1
 148      _store_set(key, count, _FAIL_WINDOW_SECONDS)
 149  
 150  
```

## Outgoing connections
- call -> cache.py (be:core:cache)
- call -> db.py (be:core:db)
- read -> app_user (ds:app_user)
- read -> app_user_session (ds:app_user_session)
- write -> app_user_session (ds:app_user_session)

## Incoming connections
- deps.py (be:core:deps) -> call
- factory.py (be:core:factory) -> call
- test_core.py (be:core:test_core) -> call
- routers/auth.py (be:router:auth) -> call
