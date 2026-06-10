"""Health check."""
from __future__ import annotations
from typing import Any
from fastapi import APIRouter
from db import check_connection, database_url, storage_kind

router = APIRouter(tags=["health"])


@router.get("/api/health")
def health() -> dict[str, Any]:
    sk = storage_kind()
    has_db = bool(database_url())
    out: dict[str, Any] = {
        "status": "ok" if has_db else "degraded",
        "storage": sk if sk != "none" else "none",
        "database": "up" if has_db and check_connection() else "down",
    }
    if not has_db:
        out["detail"] = "DATABASE_URL (or DB_*) missing in .env"
    return out

