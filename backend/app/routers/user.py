"""App user management (Settings → Users). Multiple named users can be added,
each with an Argon2id-hashed password (see app/passwords.py) — these are the
same credentials app/routers/auth.py checks at login. This router (like every
other protected router) still gates on a valid session via require_session,
so managing users itself still requires being logged in."""

from __future__ import annotations

import psycopg2
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.deps import require_db
from app.passwords import hash_password, verify_password
from app.schemas.user import AppUserAccessUpdate, AppUserCreate, AppUserUpdate, AppUserVerify
from db import (
    delete_app_user,
    get_app_user_by_username,
    insert_app_user,
    list_app_users,
    update_app_user,
    update_app_user_access,
)

router = APIRouter(prefix="/api/users", tags=["users"], dependencies=[Depends(require_db)])


def _serialize(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    v = out.get("created_at")
    if hasattr(v, "isoformat"):
        out["created_at"] = v.isoformat()
    return out


@router.get("")
def users_list() -> dict[str, Any]:
    return {"users": [_serialize(r) for r in list_app_users()]}


@router.post("")
def users_create(body: AppUserCreate) -> dict[str, Any]:
    try:
        row = insert_app_user(body.username.strip(), hash_password(body.password))
    except psycopg2.IntegrityError:
        raise HTTPException(status_code=409, detail="That username is already taken.")
    return {"user": _serialize(row)}


@router.post("/verify")
def users_verify(body: AppUserVerify) -> dict[str, Any]:
    """Check a username/password pair against the stored hash.

    A Settings convenience — confirms a password was typed and saved
    correctly — not a login itself: it doesn't mint a session, and this
    whole router already sits behind a valid session via ``require_session``.
    """
    row = get_app_user_by_username(body.username.strip())
    valid = row is not None and verify_password(body.password, row["password_hash"])
    return {"valid": valid}


@router.put("/{user_id}")
def users_update(user_id: int, body: AppUserUpdate) -> dict[str, Any]:
    username = body.username.strip() if body.username is not None else None
    password_hash = hash_password(body.password) if body.password is not None else None
    try:
        row = update_app_user(user_id, username, password_hash)
    except psycopg2.IntegrityError:
        raise HTTPException(status_code=409, detail="That username is already taken.")
    if row is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"user": _serialize(row)}


@router.put("/{user_id}/access")
def users_update_access(user_id: int, body: AppUserAccessUpdate) -> dict[str, Any]:
    row = update_app_user_access(user_id, body.is_superuser, body.allowed_pages)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"user": _serialize(row)}


@router.delete("/{user_id}")
def users_remove(user_id: int) -> dict[str, Any]:
    if not delete_app_user(user_id):
        raise HTTPException(status_code=404, detail="User not found.")
    return {"ok": True}
