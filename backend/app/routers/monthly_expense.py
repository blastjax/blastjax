from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError

import cache
from app.deps import found, require_db
from app.schemas.monthly_expense import MonthlyExpenseCreate
from app.schemas.responses import MonthlyExpenseList, MonthlyExpenseOne, Ok
from db import (
    delete_monthly_expense,
    insert_monthly_expense,
    list_monthly_expenses,
    update_monthly_expense,
)

router = APIRouter(tags=["monthly_expense"], dependencies=[Depends(require_db)])

_NOT_FOUND = "Expense not found."
_NO_LINK = "That bill category or house payment doesn't exist."


def _values(body: MonthlyExpenseCreate) -> dict[str, Any]:
    return body.model_dump() | {
        "skipped_months": sorted(set(body.skipped_months)),
        # Stored as JSON, which holds a card's id as text.
        "charged_months": {month: str(card_id) if card_id else None for month, card_id in body.charged_months.items()},
    }


@router.get("/api/monthly-expense", response_model=MonthlyExpenseList)
def monthly_expense_list(
    period_half: int | None = Query(default=None, ge=1, le=2),
    period_year: int | None = Query(default=None),
    period_month: int | None = Query(default=None, ge=1, le=12),
) -> dict[str, Any]:
    return cache.cached(
        f"monthly_expense:list:{period_half}:{period_year}:{period_month}",
        lambda: {
            "expenses": list_monthly_expenses(
                period_half=period_half, period_year=period_year, period_month=period_month
            )
        },
    )


@router.post("/api/monthly-expense", response_model=MonthlyExpenseOne)
def monthly_expense_create(body: MonthlyExpenseCreate) -> dict[str, Any]:
    try:
        return {"expense": insert_monthly_expense(**_values(body))}
    except IntegrityError:
        raise HTTPException(status_code=404, detail=_NO_LINK)


@router.put("/api/monthly-expense/{expense_id}", response_model=MonthlyExpenseOne)
def monthly_expense_replace(expense_id: UUID, body: MonthlyExpenseCreate) -> dict[str, Any]:
    try:
        row = update_monthly_expense(expense_id, **_values(body))
    except IntegrityError:
        raise HTTPException(status_code=404, detail=_NO_LINK)
    return {"expense": found(row, _NOT_FOUND)}


@router.delete("/api/monthly-expense/{expense_id}", response_model=Ok)
def monthly_expense_remove(expense_id: UUID) -> dict[str, Any]:
    if not delete_monthly_expense(expense_id):
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True}
