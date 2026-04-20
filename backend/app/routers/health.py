"""Health check."""
from __future__ import annotations
from typing import Any
from fastapi import APIRouter
from db import check_connection, database_url

router = APIRouter(tags=["health"])

@router.get("/api/health")
def health() -> dict[str, Any]:
    out: dict[str, Any] = {
        "status": "ok",
        "storage": "sqlite",
        "database": "up" if database_url() and check_connection() else "down",
    }
    if not database_url():
        out["status"] = "degraded"
        out["detail"] = "DATABASE_URL missing in .env"
    return out

