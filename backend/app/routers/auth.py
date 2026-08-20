"""OTP login/logout endpoints (single shared TOTP secret, no user table)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.schemas.auth import OtpVerifyBody
from app.security import (
    clear_failed_attempts,
    create_session,
    otp_secret,
    record_failed_attempt,
    revoke_session,
    session_is_valid,
    too_many_failed_attempts,
    verify_totp_code,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _bearer_token(request: Request) -> str:
    header = request.headers.get("authorization") or ""
    return header[7:] if header.lower().startswith("bearer ") else ""


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.get("/config")
def auth_config() -> dict[str, Any]:
    return {"otp_required": otp_secret() is not None}


@router.post("/verify")
def auth_verify(body: OtpVerifyBody, request: Request) -> dict[str, Any]:
    if otp_secret() is None:
        raise HTTPException(status_code=503, detail="BUDGET_OTP_SECRET is not set.")

    ip = _client_ip(request)
    if too_many_failed_attempts(ip):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")

    if not verify_totp_code(body.code):
        record_failed_attempt(ip)
        raise HTTPException(status_code=401, detail="Invalid or expired code.")

    clear_failed_attempts(ip)
    return {"token": create_session()}


@router.get("/status")
def auth_status(request: Request) -> dict[str, Any]:
    if otp_secret() is None:
        return {"authenticated": True, "otp_required": False}
    return {"authenticated": session_is_valid(_bearer_token(request)), "otp_required": True}


@router.post("/logout")
def auth_logout(request: Request) -> dict[str, Any]:
    revoke_session(_bearer_token(request))
    return {"ok": True}
