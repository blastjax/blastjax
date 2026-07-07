"""Bidirectional sync trigger (the settings "Sync" button)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.deps import require_db
import db_sync

router = APIRouter(tags=["sync"], dependencies=[Depends(require_db)])


@router.post("/api/sync")
def sync_databases() -> dict[str, Any]:
    """
    Sync local and cloud: whichever has the most recent entry wins.
    503 if the cloud is unreachable.
    """
    result = db_sync.smart_sync()
    if not result.get("ok"):
        raise HTTPException(
            status_code=503,
            detail=result.get("detail") or "Sync failed.",
        )
    return result
