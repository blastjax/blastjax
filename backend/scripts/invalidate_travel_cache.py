#!/usr/bin/env python3
"""One-off: bust the stale `travel` Redis cache namespace.

Needed after the travel schema rehaul (rehaul_travel_schema.py) added the
`cities` field to the trip response — the migration only touched Postgres,
so the pre-existing `travel:list:*` cache entries (TTL 24h) kept serving the
old shape and crashed the frontend (`cities` undefined). Run this once,
wherever REDIS_URL/the backend env is reachable (e.g. inside the API
container).

Usage: python backend/scripts/invalidate_travel_cache.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cache

cache.init_cache()
cache.invalidate("travel")
cache.close_cache()
print("travel cache invalidated")
