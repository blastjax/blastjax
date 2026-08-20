"""Shared FastAPI dependencies."""

from __future__ import annotations

from fastapi import HTTPException, Request

from app.security import otp_secret, session_is_valid
from db import cloud_database_url


def require_db() -> None:
    """Reject requests when no database is configured.

    Used as a route dependency so each router doesn't have to repeat the
    same precondition check::

        @router.get("/api/foo", dependencies=[Depends(require_db)])
        def foo(): ...
    """
    if not cloud_database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")


def require_session(request: Request) -> None:
    """Reject requests without a valid OTP session token.

    Applied once, to every protected router, via ``include_router(...,
    dependencies=[Depends(require_session)])`` in the app factory — no-op
    when ``BUDGET_OTP_SECRET`` isn't set, so OTP is opt-in.
    """
    if otp_secret() is None:
        return
    header = request.headers.get("authorization") or ""
    token = header[7:] if header.lower().startswith("bearer ") else ""
    if not session_is_valid(token):
        raise HTTPException(status_code=401, detail="OTP session required.")
