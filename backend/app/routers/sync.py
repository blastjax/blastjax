"""Manual local -> cloud mirror trigger (the settings "Sync" button)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.deps import require_db
import db_sync

router = APIRouter(tags=["sync"], dependencies=[Depends(require_db)])


@router.post("/api/sync")
def sync_to_cloud() -> dict[str, Any]:
    """Push the local mirror up to the cloud now. 503 if the cloud is unreachable."""
    result = db_sync.force_push_to_cloud()
    if not result.get("ok"):
        raise HTTPException(
            status_code=503,
            detail=result.get("detail") or "Sync failed.",
        )
    return result
