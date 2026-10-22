from __future__ import annotations

import logging
import os
import secrets
import time
from typing import Any

import jwt

import cache
from db import any_app_users

_log = logging.getLogger(__name__)

_JWT_ALGORITHM = "HS256"
_REVOKED_PREFIX = "auth_revoked"
_FAIL_PREFIX = "auth_fail"
_USERS_EXIST_KEY = "auth_state:users_exist"

_MAX_FAILED_ATTEMPTS = 8
_FAIL_WINDOW_SECONDS = 15 * 60

_USERS_EXIST_LOCAL_TTL = 5.0
_USERS_EXIST_REDIS_TTL = 3600


class _ExpiringStore:
    def __init__(self) -> None:
        self._items: dict[str, tuple[float, Any]] = {}

    def set(self, key: str, value: Any, ttl: int) -> None:
        self._prune()
        self._items[key] = (time.monotonic() + ttl, value)

    def get(self, key: str) -> Any | None:
        item = self._items.get(key)
        if item is None:
            return None
        expiry, value = item
        if expiry <= time.monotonic():
            del self._items[key]
            return None
        return value

    def delete(self, key: str) -> None:
        self._items.pop(key, None)

    def _prune(self) -> None:
        now = time.monotonic()
        for key in [k for k, (expiry, _) in self._items.items() if expiry <= now]:
            del self._items[key]


_fallback = _ExpiringStore()


def _store_set(key: str, value: Any, ttl: int) -> None:
    cache.set(key, value, ttl=ttl)
    if cache.get(key) is None:
        _fallback.set(key, value, ttl)


def _store_get(key: str) -> Any | None:
    hit = cache.get(key)
    return hit if hit is not None else _fallback.get(key)


def _store_delete(key: str) -> None:
    cache.delete(key)
    _fallback.delete(key)


_users_exist_local: tuple[float, bool] | None = None


def _auth_disabled() -> bool:
    return (os.environ.get("BUDGET_DISABLE_AUTH") or "").strip().lower() in ("1", "true", "yes")


def _load_jwt_secret() -> str:
    secret = (os.environ.get("BUDGET_JWT_SECRET") or "").strip()
    if secret:
        if len(secret) < 32:
            raise RuntimeError("BUDGET_JWT_SECRET must be at least 32 characters.")
        return secret
    if not _auth_disabled():
        _log.warning("BUDGET_JWT_SECRET is not set; using a random key, so logins end whenever the API restarts.")
    return secrets.token_urlsafe(48)


_JWT_SECRET = _load_jwt_secret()


def login_required() -> bool:
    if _auth_disabled():
        return False
    global _users_exist_local
    now = time.monotonic()
    if _users_exist_local is not None and _users_exist_local[0] > now:
        return _users_exist_local[1]

    hit = cache.get(_USERS_EXIST_KEY)
    if hit is None:
        hit = any_app_users()
        cache.set(_USERS_EXIST_KEY, hit, ttl=_USERS_EXIST_REDIS_TTL)
    value = bool(hit)
    _users_exist_local = (now + _USERS_EXIST_LOCAL_TTL, value)
    return value


def forget_login_required() -> None:
    global _users_exist_local
    _users_exist_local = None
    cache.delete(_USERS_EXIST_KEY)


def _session_ttl_seconds() -> int:
    return int(os.environ.get("BUDGET_SESSION_TTL_SECONDS", str(12 * 3600)))


def create_session(user_id: int) -> str:
    now = int(time.time())
    claims = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + _session_ttl_seconds(),
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(claims, _JWT_SECRET, algorithm=_JWT_ALGORITHM)


def _session_claims(token: str) -> dict[str, Any] | None:
    if not token:
        return None
    try:
        claims = jwt.decode(
            token,
            _JWT_SECRET,
            algorithms=[_JWT_ALGORITHM],
            options={"require": ["sub", "iat", "exp", "jti"]},
        )
    except jwt.InvalidTokenError:
        return None
    return None if _store_get(f"{_REVOKED_PREFIX}:{claims['jti']}") else claims


def session_is_valid(token: str) -> bool:
    return _session_claims(token) is not None


def session_user_id(token: str) -> int | None:
    claims = _session_claims(token)
    return int(claims["sub"]) if claims else None


def revoke_session(token: str) -> None:
    # A JWT stays valid until it expires, so logout records its id until then.
    claims = _session_claims(token)
    if claims:
        _store_set(f"{_REVOKED_PREFIX}:{claims['jti']}", True, max(1, claims["exp"] - int(time.time())))


def too_many_failed_attempts(client_ip: str) -> bool:
    count = _store_get(f"{_FAIL_PREFIX}:{client_ip}") or 0
    return int(count) >= _MAX_FAILED_ATTEMPTS


def record_failed_attempt(client_ip: str) -> None:
    key = f"{_FAIL_PREFIX}:{client_ip}"
    count = int(_store_get(key) or 0) + 1
    _store_set(key, count, _FAIL_WINDOW_SECONDS)


def clear_failed_attempts(client_ip: str) -> None:
    _store_delete(f"{_FAIL_PREFIX}:{client_ip}")
