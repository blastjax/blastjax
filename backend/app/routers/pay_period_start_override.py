from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

import cache
from app.deps import require_db
from app.schemas.pay_period_start_override import PayPeriodStartOverrideUpsert
from app.schemas.responses import Ok, PayPeriodStartOverrideOne, PayPeriodStartOverrides
from db import (
    delete_pay_period_start_override,
    get_pay_period_start_override,
    list_pay_period_start_overrides,
    upsert_pay_period_start_override,
)

router = APIRouter(tags=["pay_period_start_override"], dependencies=[Depends(require_db)])


def _prev_month(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


@router.get("/api/pay-period-start-override", response_model=PayPeriodStartOverrides)
def pay_period_start_override_list() -> dict[str, Any]:
    return cache.cached(
        "pay_period_start_override:list", lambda: {"overrides": list_pay_period_start_overrides()}
    )


@router.put("/api/pay-period-start-override", response_model=PayPeriodStartOverrideOne)
def pay_period_start_override_upsert(body: PayPeriodStartOverrideUpsert) -> dict[str, Any]:
    try:
        start_date = date.fromisoformat(body.start_date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="start_date must be YYYY-MM-DD.") from exc

    if body.period_half == 1:
        default_boundary = date(body.period_year, body.period_month, 1)
        if start_date > default_boundary:
            raise HTTPException(
                status_code=400,
                detail=f"Start date can't be later than {default_boundary.isoformat()}.",
            )
        prev_year, prev_month = _prev_month(body.period_year, body.period_month)
        prev_half2 = get_pay_period_start_override(prev_year, prev_month, 2)
        prev_half2_start = (
            date.fromisoformat(str(prev_half2["start_date"]))
            if prev_half2 is not None
            else date(prev_year, prev_month, 16)
        )
        if start_date <= prev_half2_start:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Start date must be after {prev_half2_start.isoformat()} "
                    "(the previous 16th-end period's start) so that period keeps at least one day."
                ),
            )
    else:
        low = date(body.period_year, body.period_month, 2)
        high = date(body.period_year, body.period_month, 16)
        if not (low <= start_date <= high):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Start date must be between {low.isoformat()} and {high.isoformat()}."
                ),
            )

    return {"override": upsert_pay_period_start_override(**body.model_dump())}


@router.delete("/api/pay-period-start-override", response_model=Ok)
def pay_period_start_override_remove(
    period_year: int = Query(...),
    period_month: int = Query(..., ge=1, le=12),
    period_half: int = Query(..., ge=1, le=2),
) -> dict[str, Any]:
    ok = delete_pay_period_start_override(period_year, period_month, period_half)
    return {"ok": ok}
