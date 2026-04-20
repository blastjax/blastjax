"""Persist dashboard / settings UI preferences (hidden columns, value filters, etc.)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException

from db import database_url, get_user_ui_preferences, replace_user_ui_preferences

router = APIRouter(tags=["user-preferences"])


@router.get("/api/user-preferences")
def get_preferences() -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    return {"data": get_user_ui_preferences()}


@router.put("/api/user-preferences")
def put_preferences(body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Body must be a JSON object")
    replace_user_ui_preferences(body)
    return {"ok": True}
