from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

import cache
from app.deps import require_db
from app.schemas.calendar_day_override import CalendarDayOverrideBulkUpsert
from app.schemas.responses import CalendarDayOverrides
from db import list_calendar_day_overrides, upsert_calendar_day_overrides

router = APIRouter(tags=["calendar_day_override"], dependencies=[Depends(require_db)])


@router.get("/api/calendar-day-override", response_model=CalendarDayOverrides)
def calendar_day_override_list() -> dict[str, Any]:
    return cache.cached("calendar_day_override:list", lambda: {"overrides": list_calendar_day_overrides()})


@router.put("/api/calendar-day-override/bulk", response_model=CalendarDayOverrides)
def calendar_day_override_bulk(body: CalendarDayOverrideBulkUpsert) -> dict[str, Any]:
    return {"overrides": upsert_calendar_day_overrides([(o.day, o.amount, o.saved) for o in body.overrides])}
