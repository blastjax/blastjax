"""Redis cache: read-through helpers with graceful fallback when Redis is unavailable."""

from __future__ import annotations

import json
import logging
import os
from typing import Any
from urllib.parse import urlparse, urlunparse
from pathlib import Path

_log = logging.getLogger(__name__)
_client: Any = None  # redis.Redis[str] | None


def _default_ttl() -> int:
    return int(os.environ.get("REDIS_CACHE_TTL", "300"))


def _resolved_url() -> str:
    url = (os.environ.get("REDIS_URL") or "redis://localhost:6379").strip()
    if Path("/.dockerenv").exists():
        parsed = urlparse(url)
        if (parsed.hostname or "").lower() in ("127.0.0.1", "localhost"):
            url = urlunparse((
                parsed.scheme,
                "redis:6379",
                parsed.path,
                parsed.params,
                parsed.query,
                parsed.fragment,
            ))
            os.environ["REDIS_URL"] = url
    return url


def init_cache() -> None:
    global _client
    url = _resolved_url()
    try:
        import redis as _redis
        c = _redis.Redis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        c.ping()
        _client = c
        _log.info("Redis cache connected: %s", url)
    except Exception as exc:
        _log.warning("Redis unavailable — caching disabled (%s: %s)", type(exc).__name__, exc)
        _client = None


def close_cache() -> None:
    global _client
    if _client is not None:
        try:
            _client.close()
        except Exception:
            pass
        _client = None


def get(key: str) -> Any | None:
    if _client is None:
        return None
    try:
        raw = _client.get(key)
        return json.loads(raw) if raw is not None else None
    except Exception as exc:
        _log.debug("cache.get(%s): %s", key, exc)
        return None


def set(key: str, value: Any, ttl: int | None = None) -> None:  # noqa: A001
    if _client is None:
        return
    try:
        _client.set(key, json.dumps(value, default=str), ex=ttl or _default_ttl())
    except Exception as exc:
        _log.debug("cache.set(%s): %s", key, exc)


def delete(key: str) -> None:
    if _client is None:
        return
    try:
        _client.delete(key)
    except Exception as exc:
        _log.debug("cache.delete(%s): %s", key, exc)


def invalidate(prefix: str) -> None:
    """Delete all keys matching ``prefix:*`` using SCAN (non-blocking)."""
    if _client is None:
        return
    try:
        cursor = 0
        while True:
            cursor, keys = _client.scan(cursor, match=f"{prefix}:*", count=100)
            if keys:
                _client.delete(*keys)
            if cursor == 0:
                break
    except Exception as exc:
        _log.debug("cache.invalidate(%s): %s", prefix, exc)
