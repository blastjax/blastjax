"""Health check."""
from __future__ import annotations
from typing import Any
from fastapi import APIRouter
from db import database_url, storage_kind

router = APIRouter(tags=["health"])


@router.get("/api/health")
def health() -> dict[str, Any]:
    """Liveness only -- deliberately never touches Postgres.

    The compose healthcheck polls this every 15s. While it ran a ``SELECT 1``,
    that poll alone was enough activity to stop Neon's compute ever scaling to
    zero, which burned the monthly compute quota and took the API down. The
    probe is still meaningful without one: the lifespan runs ``init_schema()``
    before uvicorn serves anything, so a process answering this route has
    already proven it reached the database at start-up.
    """
    has_db = bool(database_url())
    out: dict[str, Any] = {
        "status": "ok" if has_db else "degraded",
        "storage": storage_kind(),
        "database": "configured" if has_db else "unset",
    }
    if not has_db:
        out["detail"] = "DATABASE_URL (or DB_*) missing in .env"
    return out

