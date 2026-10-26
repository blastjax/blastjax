from __future__ import annotations

import hashlib
import os
import secrets
import time
from typing import Any

import cache
from db import any_app_users, delete_app_user_session, get_app_user_session_user_id, insert_app_user_session

_SESSION_PREFIX = "auth_session"
_FAIL_PREFIX = "auth_fail"
_PASSKEY_PREFIX = "auth_passkey"
_USERS_EXIST_KEY = "auth_state:users_exist"

_SESSION_CACHE_SECONDS = 5 * 60
_MAX_FAILED_ATTEMPTS = 8
_FAIL_WINDOW_SECONDS = 15 * 60
_PASSKEY_CHALLENGE_SECONDS = 5 * 60

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


def _token_hash(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


def create_session(user_id: int) -> str:
    """A login that lasts until logout. Only its hash is stored, so the table alone can't log anyone in."""
    token = secrets.token_urlsafe(32)
    insert_app_user_session(user_id, _token_hash(token))
    return token


def session_user_id(token: str) -> int | None:
    if not token:
        return None
    token_hash = _token_hash(token)
    # Redis only, not _store_*: a logout must clear this for every worker, not just its own.
    key = f"{_SESSION_PREFIX}:{token_hash.hex()}"
    user_id = cache.get(key)
    if user_id is None:
        user_id = get_app_user_session_user_id(token_hash)
        if user_id is not None:
            cache.set(key, user_id, ttl=_SESSION_CACHE_SECONDS)
    return user_id


def session_is_valid(token: str) -> bool:
    return session_user_id(token) is not None


def revoke_session(token: str) -> None:
    if token:
        token_hash = _token_hash(token)
        delete_app_user_session(token_hash)
        cache.delete(f"{_SESSION_PREFIX}:{token_hash.hex()}")


def too_many_failed_attempts(client_ip: str) -> bool:
    count = _store_get(f"{_FAIL_PREFIX}:{client_ip}") or 0
    return int(count) >= _MAX_FAILED_ATTEMPTS


def record_failed_attempt(client_ip: str) -> None:
    key = f"{_FAIL_PREFIX}:{client_ip}"
    count = int(_store_get(key) or 0) + 1
    _store_set(key, count, _FAIL_WINDOW_SECONDS)


def clear_failed_attempts(client_ip: str) -> None:
    _store_delete(f"{_FAIL_PREFIX}:{client_ip}")


def remember_passkey_challenge(challenge: bytes, user_id: int | None = None) -> None:
    """user_id is who may register a passkey with it; None marks a login challenge."""
    _store_set(f"{_PASSKEY_PREFIX}:{challenge.hex()}", {"user_id": user_id}, _PASSKEY_CHALLENGE_SECONDS)


def take_passkey_challenge(challenge: bytes, user_id: int | None = None) -> bool:
    """True once for a live challenge issued to user_id, so a signed response can't be replayed."""
    # ponytail: get-then-delete, not atomic; two racing requests could both spend one challenge.
    key = f"{_PASSKEY_PREFIX}:{challenge.hex()}"
    hit = _store_get(key)
    _store_delete(key)
    return hit is not None and hit.get("user_id") == user_id
