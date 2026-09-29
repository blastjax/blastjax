from __future__ import annotations

from pydantic import BaseModel, Field


class CalendarDayOverrideItem(BaseModel):
    day: str = Field(..., description="YYYY-MM-DD")
    amount: float = Field(..., ge=0)
    saved: float | None = None


class CalendarDayOverrideBulkUpsert(BaseModel):
    overrides: list[CalendarDayOverrideItem] = Field(..., min_length=1, max_length=100)
