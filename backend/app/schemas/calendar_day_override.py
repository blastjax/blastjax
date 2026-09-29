"""Calendar day-override API models (move budget between days, or spread it across a pay period)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CalendarDayOverrideItem(BaseModel):
    day: str = Field(..., description="YYYY-MM-DD")
    amount: float = Field(..., ge=0)
    # Banked to Savings by logging a pay period's last day; negative when that
    # day was overspent. Omitted keeps whatever the day already banked.
    saved: float | None = None


class CalendarDayOverrideBulkUpsert(BaseModel):
    # One day is valid: "Even out" on a period's last open day resets just that
    # day. Up to 100 covers the three pay periods a month's grid can touch, each
    # possibly stretched across a month boundary by a moved pay date.
    overrides: list[CalendarDayOverrideItem] = Field(..., min_length=1, max_length=100)
