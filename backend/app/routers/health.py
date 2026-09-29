from __future__ import annotations
from typing import Any
from fastapi import APIRouter
from db import database_url, storage_kind

router = APIRouter(tags=["health"])


@router.get("/api/health")
def health() -> dict[str, Any]:
    has_db = bool(database_url())
    out: dict[str, Any] = {
        "status": "ok" if has_db else "degraded",
        "storage": storage_kind(),
        "database": "configured" if has_db else "unset",
    }
    if not has_db:
        out["detail"] = "DATABASE_URL (or DB_*) missing in .env"
    return out

