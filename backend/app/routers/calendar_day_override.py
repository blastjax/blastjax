"""Per-day calendar budget override endpoints (move or spread amounts across days)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

import cache
from app.deps import require_db
from app.schemas.calendar_day_override import CalendarDayOverrideBulkUpsert
from db import list_calendar_day_overrides, upsert_calendar_day_overrides

router = APIRouter(tags=["calendar_day_override"], dependencies=[Depends(require_db)])


def _serialize(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    for key in ("day", "created_at"):
        v = out.get(key)
        if hasattr(v, "isoformat"):
            out[key] = v.isoformat()
    return out


@router.get("/api/calendar-day-override")
def calendar_day_override_list() -> dict[str, Any]:
    key = "calendar_day_override:list"
    hit = cache.get(key)
    if hit is not None:
        return hit
    rows = list_calendar_day_overrides()
    result = {"overrides": [_serialize(r) for r in rows]}
    cache.set(key, result)
    return result


@router.put("/api/calendar-day-override/bulk")
def calendar_day_override_bulk(body: CalendarDayOverrideBulkUpsert) -> dict[str, Any]:
    rows = upsert_calendar_day_overrides([(o.day, o.amount) for o in body.overrides])
    cache.invalidate("calendar_day_override")
    return {"overrides": [_serialize(r) for r in rows]}
