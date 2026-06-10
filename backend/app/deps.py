"""Shared FastAPI dependencies."""

from __future__ import annotations

from fastapi import HTTPException

from db import database_url


def require_db() -> None:
    """Reject requests when ``DATABASE_URL`` (or ``DB_*``) is not configured.

    Used as a route dependency so each router doesn't have to repeat the
    same precondition check::

        @router.get("/api/foo", dependencies=[Depends(require_db)])
        def foo(): ...
    """
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
