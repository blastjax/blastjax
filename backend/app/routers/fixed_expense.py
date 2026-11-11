from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

import cache
from app.deps import found, require_db
from app.schemas.fixed_expense import FixedExpenseCreate, FixedExpenseUpdate
from app.schemas.responses import FixedExpenseList, FixedExpenseOne, Ok
from db import (
    delete_fixed_expense,
    insert_fixed_expense,
    list_fixed_expenses,
    update_fixed_expense,
)

router = APIRouter(tags=["fixed_expense"], dependencies=[Depends(require_db)])

_NOT_FOUND = "Expense not found."


@router.get("/api/fixed-expense", response_model=FixedExpenseList)
def fixed_expense_list(
    period_half: int | None = Query(default=None, ge=1, le=2),
    period_year: int | None = Query(default=None),
    period_month: int | None = Query(default=None, ge=1, le=12),
) -> dict[str, Any]:
    return cache.cached(
        f"fixed_expense:list:{period_half}:{period_year}:{period_month}",
        lambda: {
            "expenses": list_fixed_expenses(
                period_half=period_half, period_year=period_year, period_month=period_month
            )
        },
    )


@router.post("/api/fixed-expense", response_model=FixedExpenseOne)
def fixed_expense_create(body: FixedExpenseCreate) -> dict[str, Any]:
    return {"expense": insert_fixed_expense(**body.model_dump())}


@router.put("/api/fixed-expense/{expense_id}", response_model=FixedExpenseOne)
def fixed_expense_update(expense_id: UUID, body: FixedExpenseUpdate) -> dict[str, Any]:
    return {"expense": found(update_fixed_expense(expense_id, **body.model_dump()), _NOT_FOUND)}


@router.delete("/api/fixed-expense/{expense_id}", response_model=Ok)
def fixed_expense_remove(expense_id: UUID) -> dict[str, Any]:
    if not delete_fixed_expense(expense_id):
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True}
