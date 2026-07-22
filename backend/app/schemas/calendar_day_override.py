"""Calendar day-override API models (drag-to-transfer budget amounts between days)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CalendarDayOverrideItem(BaseModel):
    day: str = Field(..., description="YYYY-MM-DD")
    amount: float = Field(..., ge=0)


class CalendarDayOverrideBulkUpsert(BaseModel):
    overrides: list[CalendarDayOverrideItem] = Field(..., min_length=2, max_length=2)
