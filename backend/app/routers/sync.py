"""Bidirectional sync trigger (the settings "Sync" buttons)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.deps import require_db
import db_sync

router = APIRouter(tags=["sync"], dependencies=[Depends(require_db)])


@router.post("/api/sync")
def sync_databases() -> dict[str, Any]:
    """Sync local and cloud: whichever has the most recent entry wins. 503 if unreachable."""
    result = db_sync.smart_sync()
    if not result.get("ok"):
        raise HTTPException(
            status_code=503,
            detail=result.get("detail") or "Sync failed.",
        )
    return result


@router.post("/api/sync/push")
def sync_push() -> dict[str, Any]:
    """Force push local -> cloud unconditionally. 503 if the cloud is unreachable."""
    result = db_sync.force_push_to_cloud()
    if not result.get("ok"):
        raise HTTPException(
            status_code=503,
            detail=result.get("detail") or "Push failed.",
        )
    return {**result, "direction": "push"}


@router.post("/api/sync/pull")
def sync_pull() -> dict[str, Any]:
    """Force pull cloud -> local unconditionally. 503 if the cloud is unreachable."""
    result = db_sync.force_pull_from_cloud()
    if not result.get("ok"):
        raise HTTPException(
            status_code=503,
            detail=result.get("detail") or "Pull failed.",
        )
    return result


@router.get("/api/sync/latest-transaction")
def latest_transaction() -> dict[str, Any]:
    """Return the latest transaction timestamps for local and cloud DBs."""
    return db_sync.get_latest_transaction_info()
