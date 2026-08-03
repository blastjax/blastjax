"""Fixed (recurring) expense endpoints, scoped per semi-monthly pay period half."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

import cache
from app.deps import require_db
from app.schemas.fixed_expense import FixedExpenseCreate
from db import delete_fixed_expense, insert_fixed_expense, list_fixed_expenses

router = APIRouter(tags=["fixed_expense"], dependencies=[Depends(require_db)])


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


@router.get("/api/fixed-expense")
def fixed_expense_list(
    period_half: int | None = Query(default=None, ge=1, le=2),
    period_year: int | None = Query(default=None),
    period_month: int | None = Query(default=None, ge=1, le=12),
) -> dict[str, Any]:
    key = f"fixed_expense:list:{period_half}:{period_year}:{period_month}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    rows = list_fixed_expenses(
        period_half=period_half, period_year=period_year, period_month=period_month
    )
    result = {"expenses": [_serialize(r) for r in rows]}
    cache.set(key, result)
    return result


@router.post("/api/fixed-expense")
def fixed_expense_create(body: FixedExpenseCreate) -> dict[str, Any]:
    row = insert_fixed_expense(
        body.period_half,
        body.amount,
        _clean_description(body.description),
        body.period_year,
        body.period_month,
    )
    cache.invalidate("fixed_expense")
    return {"expense": _serialize(row)}


@router.delete("/api/fixed-expense/{expense_id}")
def fixed_expense_remove(expense_id: int) -> dict[str, Any]:
    if not delete_fixed_expense(expense_id):
        raise HTTPException(status_code=404, detail="Expense not found.")
    cache.invalidate("fixed_expense")
    return {"ok": True}
