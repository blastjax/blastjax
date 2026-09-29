from __future__ import annotations

from fastapi import HTTPException, Request

from app.security import login_required, session_is_valid
from db import database_url


def require_db() -> None:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")


def require_session(request: Request) -> None:
    if not login_required():
        return
    header = request.headers.get("authorization") or ""
    token = header[7:] if header.lower().startswith("bearer ") else ""
    if not session_is_valid(token):
        raise HTTPException(status_code=401, detail="Login required.")
