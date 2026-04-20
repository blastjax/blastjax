"""Distinct account/currency labels and clearing them without deleting transactions."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.workbook_cache import invalidate_cache
from db import (
    clear_budget_accounts_label,
    clear_budget_currency_label,
    database_url,
    list_distinct_budget_accounts,
    list_distinct_budget_currencies,
    rename_budget_accounts_label,
)

router = APIRouter(tags=["budget-labels"])


class RemoveLabelBody(BaseModel):
    label: str = Field(min_length=1, max_length=2000)


class RenameAccountBody(BaseModel):
    """old_label may be empty to rename rows whose Accounts field is blank."""
    old_label: str = Field(max_length=2000)
    new_label: str = Field(min_length=1, max_length=2000)


@router.get("/api/budget-labels")
def get_budget_labels() -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    return {
        "accounts": list_distinct_budget_accounts(),
        "currencies": list_distinct_budget_currencies(),
    }


@router.post("/api/budget-labels/rename-account")
def post_rename_account_label(body: RenameAccountBody) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    old_l = body.old_label.strip()
    new_l = body.new_label.strip()
    if not new_l:
        raise HTTPException(status_code=400, detail="new_label is required")
    try:
        n_budget, n_rec = rename_budget_accounts_label(old_l, new_l)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    invalidate_cache()
    return {
        "ok": True,
        "transactions_updated": n_budget,
        "recurring_rules_updated": n_rec,
    }


@router.post("/api/budget-labels/remove-account")
def post_remove_account_label(body: RemoveLabelBody) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    label = body.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="label is required")
    try:
        n_budget, n_rec = clear_budget_accounts_label(label)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    invalidate_cache()
    return {
        "ok": True,
        "transactions_updated": n_budget,
        "recurring_rules_updated": n_rec,
    }


@router.post("/api/budget-labels/remove-currency")
def post_remove_currency_label(body: RemoveLabelBody) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    label = body.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="label is required")
    try:
        n_budget, n_rec = clear_budget_currency_label(label)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    invalidate_cache()
    return {
        "ok": True,
        "transactions_updated": n_budget,
        "recurring_rules_updated": n_rec,
    }
