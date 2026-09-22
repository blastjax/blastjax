"""Username/password session authentication.

Credentials live in the ``app_user`` table (see ``db.py`` / Settings →
Users), hashed with Argon2id (``app.passwords``). A successful login (see
``app/routers/auth.py``) mints an opaque session token. The frontend stores
that token in ``sessionStorage`` rather than ``localStorage``, so it
disappears — and a fresh login is required — whenever the browser restarts,
while surviving reloads/tab switches within the same browser session. The
TTL below is just a server-side safety net for that same lifetime, not the
primary boundary.

Until at least one user exists, auth is treated as not configured and
``require_session`` (see ``app.deps``) lets every request through — so a
fresh checkout stays usable until a user is deliberately added.
"""

from __future__ import annotations

import os
import secrets
import time
from typing import Any

import cache
from db import any_app_users

_SESSION_PREFIX = "auth_session"
_FAIL_PREFIX = "auth_fail"
_USERS_EXIST_KEY = "auth_state:users_exist"

_MAX_FAILED_ATTEMPTS = 8
_FAIL_WINDOW_SECONDS = 15 * 60

# How long the process-local answer to "is login configured?" is trusted.
# Short on purpose: it exists to collapse one page load's burst of requests
# into a single lookup, not to be the cache. Redis is the cache.
_USERS_EXIST_LOCAL_TTL = 5.0
_USERS_EXIST_REDIS_TTL = 3600


class _ExpiringStore:
    """Tiny in-process TTL map, used only while Redis is unavailable.

    Redis stays the primary store so sessions survive an API restart. This
    fallback exists because ``cache.*`` degrades to silent no-ops when Redis
    is down, which previously made ``/api/auth/login`` hand out tokens that
    could never validate — an unbreakable login loop with no error shown.

    Being per-process, it is only coherent while the API runs a single worker
    (see ``docker/Dockerfile.backend``). Adding ``--workers`` would stop
    sessions being shared between them, making Redis effectively required.
    """

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
    """Write to Redis, falling back to the in-process store when it's down.

    The read-back is how we detect an unavailable Redis (``cache.set`` can't
    report failure). Only login-shaped events write here — a handful per
    browser session — so the extra round trip doesn't matter.
    """
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
    """Local-only escape hatch: never ask for a username/password.

    Set by ``docker-compose.override.yml``, which is gitignored and so never
    reaches the deployed host (the EC2 box runs ``docker compose up`` off a
    plain ``git pull``). It exists because a local ``docker compose up`` talks
    to the same Neon database as production, which already has users -- so
    login would otherwise be demanded on every browser restart while
    developing. Do not set it anywhere reachable from off the machine.
    """
    return (os.environ.get("BUDGET_DISABLE_AUTH") or "").strip().lower() in ("1", "true", "yes")


def login_required() -> bool:
    """Whether any user has been added, i.e. whether login is switched on.

    ``require_session`` needs this on *every* protected request, and the
    underlying ``any_app_users()`` is a query to Neon — one round trip that
    every endpoint paid before it did any of its own work, and that a
    Redis-cached response paid for nothing at all. It is also about the most
    cacheable fact in the app: it changes only when the first user is added or
    the last one removed, both of which go through ``/api/users`` and call
    ``forget_login_required()`` via the write middleware.

    Two layers, because they answer different problems. Redis keeps Neon out
    of the picture across requests and restarts; the process-local memo keeps
    even the Redis hop out of a single page load's fan-out. The local memo's
    TTL is what bounds staleness if a second worker ever changes the flag, so
    it stays small.
    """
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
    """Drop both layers of the ``login_required()`` cache after a user write."""
    global _users_exist_local
    _users_exist_local = None
    cache.delete(_USERS_EXIST_KEY)


def _session_ttl_seconds() -> int:
    return int(os.environ.get("BUDGET_SESSION_TTL_SECONDS", str(12 * 3600)))


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    _store_set(f"{_SESSION_PREFIX}:{token}", user_id, _session_ttl_seconds())
    return token


def session_is_valid(token: str) -> bool:
    if not token:
        return False
    return _store_get(f"{_SESSION_PREFIX}:{token}") is not None


def session_user_id(token: str) -> int | None:
    """The ``app_user.id`` a valid session token belongs to, for
    ``/api/auth/status`` to report who's logged in (see ``app/routers/auth.py``)."""
    if not token:
        return None
    return _store_get(f"{_SESSION_PREFIX}:{token}")


def revoke_session(token: str) -> None:
    if token:
        _store_delete(f"{_SESSION_PREFIX}:{token}")


def too_many_failed_attempts(client_ip: str) -> bool:
    count = _store_get(f"{_FAIL_PREFIX}:{client_ip}") or 0
    return int(count) >= _MAX_FAILED_ATTEMPTS


def record_failed_attempt(client_ip: str) -> None:
    key = f"{_FAIL_PREFIX}:{client_ip}"
    count = int(_store_get(key) or 0) + 1
    _store_set(key, count, _FAIL_WINDOW_SECONDS)


def clear_failed_attempts(client_ip: str) -> None:
    _store_delete(f"{_FAIL_PREFIX}:{client_ip}")
