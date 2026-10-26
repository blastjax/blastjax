from __future__ import annotations

from typing import Any
from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import (
    options_to_json_dict,
    parse_authentication_credential_json,
    parse_client_data_json,
    parse_registration_credential_json,
)
from webauthn.helpers.exceptions import WebAuthnException
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.factory import cors_allow_origins
from app.passwords import verify_password
from app.schemas.auth import LoginBody, PasskeyLoginBody, PasskeyRegisterBody
from app.security import (
    clear_failed_attempts,
    create_session,
    login_required,
    record_failed_attempt,
    remember_passkey_challenge,
    revoke_session,
    session_user_id,
    take_passkey_challenge,
    too_many_failed_attempts,
)
from db import (
    delete_app_user_passkey,
    get_app_user_by_id,
    get_app_user_by_username,
    get_app_user_passkey,
    insert_app_user_passkey,
    list_app_user_passkeys,
    mark_app_user_passkey_used,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_PASSKEY_RP_NAME = "Blastjax"


def _bearer_token(request: Request) -> str:
    header = request.headers.get("authorization") or ""
    return header[7:] if header.lower().startswith("bearer ") else ""


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _session_user(request: Request) -> dict[str, Any]:
    user_id = session_user_id(_bearer_token(request))
    user = get_app_user_by_id(user_id) if user_id is not None else None
    if user is None:
        raise HTTPException(status_code=401, detail="Log in to manage passkeys.")
    return user


def _passkey_origin(request: Request) -> tuple[str, str]:
    """The web page's origin, and its host: the RP ID every passkey here is bound to."""
    origin = request.headers.get("origin") or ""
    host = urlparse(origin).hostname or ""
    if not host or (host != request.url.hostname and origin not in cors_allow_origins()):
        raise HTTPException(status_code=400, detail="Passkeys only work from the app's own web address.")
    return origin, host


def _public_passkey(row: dict[str, Any]) -> dict[str, Any]:
    return {k: row[k] for k in ("id", "name", "created_at", "last_used_at")}


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


@router.post("/passkey/login/options")
def auth_passkey_login_options(request: Request) -> dict[str, Any]:
    _, rp_id = _passkey_origin(request)
    options = generate_authentication_options(rp_id=rp_id, user_verification=UserVerificationRequirement.REQUIRED)
    remember_passkey_challenge(options.challenge)
    return options_to_json_dict(options)


@router.post("/passkey/login")
def auth_passkey_login(body: PasskeyLoginBody, request: Request) -> dict[str, Any]:
    ip = _client_ip(request)
    if too_many_failed_attempts(ip):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")

    origin, rp_id = _passkey_origin(request)
    try:
        credential = parse_authentication_credential_json(body.credential)
        challenge = parse_client_data_json(credential.response.client_data_json).challenge
        if not take_passkey_challenge(challenge):
            raise WebAuthnException("unknown or expired challenge")
        passkey = get_app_user_passkey(credential.raw_id)
        if passkey is None:
            raise WebAuthnException("unknown passkey")
        verified = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=passkey["public_key"],
            credential_current_sign_count=passkey["sign_count"],
            require_user_verification=True,
        )
    except WebAuthnException:
        record_failed_attempt(ip)
        raise HTTPException(status_code=401, detail="That passkey isn't registered here, or the request expired.")

    mark_app_user_passkey_used(passkey["id"], verified.new_sign_count)
    clear_failed_attempts(ip)
    return {"token": create_session(passkey["user_id"])}


@router.post("/passkey/register/options")
def auth_passkey_register_options(request: Request) -> dict[str, Any]:
    user = _session_user(request)
    _, rp_id = _passkey_origin(request)
    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=_PASSKEY_RP_NAME,
        user_name=user["username"],
        user_id=str(user["id"]).encode(),
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=p["credential_id"]) for p in list_app_user_passkeys(user["id"])
        ],
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )
    remember_passkey_challenge(options.challenge, user["id"])
    return options_to_json_dict(options)


@router.post("/passkey/register")
def auth_passkey_register(body: PasskeyRegisterBody, request: Request) -> dict[str, Any]:
    user = _session_user(request)
    origin, rp_id = _passkey_origin(request)
    try:
        credential = parse_registration_credential_json(body.credential)
        challenge = parse_client_data_json(credential.response.client_data_json).challenge
        if not take_passkey_challenge(challenge, user["id"]):
            raise WebAuthnException("unknown or expired challenge")
        verified = verify_registration_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=rp_id,
            expected_origin=origin,
            require_user_verification=True,
        )
    except WebAuthnException:
        raise HTTPException(status_code=400, detail="Couldn't verify that passkey. Try adding it again.")

    try:
        row = insert_app_user_passkey(
            user["id"],
            verified.credential_id,
            verified.credential_public_key,
            verified.sign_count,
            body.name.strip() or "Passkey",
        )
    except IntegrityError:
        raise HTTPException(status_code=409, detail="That passkey is already registered.")
    return {"passkey": _public_passkey(row)}


@router.get("/passkeys")
def auth_passkeys(request: Request) -> dict[str, Any]:
    user = _session_user(request)
    return {"passkeys": [_public_passkey(p) for p in list_app_user_passkeys(user["id"])]}


@router.delete("/passkeys/{passkey_id}")
def auth_passkey_remove(passkey_id: UUID, request: Request) -> dict[str, Any]:
    user = _session_user(request)
    if not delete_app_user_passkey(user["id"], passkey_id):
        raise HTTPException(status_code=404, detail="Passkey not found.")
    return {"ok": True}


@router.get("/status")
def auth_status(request: Request) -> dict[str, Any]:
    if not login_required():
        return {"authenticated": True, "login_required": False, "user": None}

    user_id = session_user_id(_bearer_token(request))
    if user_id is None:
        return {"authenticated": False, "login_required": True, "user": None}

    user = get_app_user_by_id(user_id)
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
