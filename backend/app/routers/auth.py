"""Username/password login/logout endpoints, backed by the app_user table."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.passwords import verify_password
from app.schemas.auth import LoginBody
from app.security import (
    clear_failed_attempts,
    create_session,
    login_required,
    record_failed_attempt,
    revoke_session,
    session_is_valid,
    session_user_id,
    too_many_failed_attempts,
)
from db import get_app_user_by_id, get_app_user_by_username

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _bearer_token(request: Request) -> str:
    header = request.headers.get("authorization") or ""
    return header[7:] if header.lower().startswith("bearer ") else ""


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.get("/config")
def auth_config() -> dict[str, Any]:
    return {"login_required": login_required()}


@router.post("/login")
def auth_login(body: LoginBody, request: Request) -> dict[str, Any]:
    ip = _client_ip(request)
    if too_many_failed_attempts(ip):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")

    row = get_app_user_by_username(body.username.strip())
    if row is None or not verify_password(body.password, row["password_hash"]):
        record_failed_attempt(ip)
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    clear_failed_attempts(ip)
    return {"token": create_session(row["id"])}


@router.get("/status")
def auth_status(request: Request) -> dict[str, Any]:
    if not login_required():
        return {"authenticated": True, "login_required": False, "user": None}

    token = _bearer_token(request)
    if not session_is_valid(token):
        return {"authenticated": False, "login_required": True, "user": None}

    user_id = session_user_id(token)
    user = get_app_user_by_id(user_id) if user_id is not None else None
    public_user = (
        {
            "username": user["username"],
            "is_superuser": user["is_superuser"],
            "allowed_pages": user["allowed_pages"],
        }
        if user
        else None
    )
    return {"authenticated": True, "login_required": True, "user": public_user}


@router.post("/logout")
def auth_logout(request: Request) -> dict[str, Any]:
    revoke_session(_bearer_token(request))
    return {"ok": True}
