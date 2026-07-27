"""Monthly expense endpoints, scoped per calendar-month half."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

import cache
from app.deps import require_db
from app.schemas.monthly_expense import MonthlyExpenseCreate
from db import (
    delete_monthly_expense,
    insert_monthly_expense,
    list_monthly_expenses,
    update_monthly_expense,
)

router = APIRouter(tags=["monthly_expense"], dependencies=[Depends(require_db)])


def _serialize(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    v = out.get("created_at")
    if hasattr(v, "isoformat"):
        out["created_at"] = v.isoformat()
    return out


def _clean_description(description: str | None) -> str | None:
    if description is None:
        return None
    trimmed = description.strip()
    return trimmed or None


@router.get("/api/monthly-expense")
def monthly_expense_list(
    period_half: int | None = Query(default=None, ge=1, le=2),
) -> dict[str, Any]:
    key = f"monthly_expense:list:{period_half}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    rows = list_monthly_expenses(period_half=period_half)
    result = {"expenses": [_serialize(r) for r in rows]}
    cache.set(key, result)
    return result


@router.post("/api/monthly-expense")
def monthly_expense_create(body: MonthlyExpenseCreate) -> dict[str, Any]:
    row = insert_monthly_expense(
        body.name.strip(), _clean_description(body.description), body.amount, body.period_half
    )
    return {"expense": _serialize(row)}


@router.put("/api/monthly-expense/{expense_id}")
def monthly_expense_replace(expense_id: int, body: MonthlyExpenseCreate) -> dict[str, Any]:
    row = update_monthly_expense(
        expense_id,
        body.name.strip(),
        _clean_description(body.description),
        body.amount,
        body.period_half,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Expense not found.")
    return {"expense": _serialize(row)}


@router.delete("/api/monthly-expense/{expense_id}")
def monthly_expense_remove(expense_id: int) -> dict[str, Any]:
    if not delete_monthly_expense(expense_id):
        raise HTTPException(status_code=404, detail="Expense not found.")
    return {"ok": True}
