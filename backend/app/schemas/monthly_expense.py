"""Monthly expense API models."""

from __future__ import annotations

from pydantic import BaseModel, Field


class MonthlyExpenseCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    amount: float = Field(..., gt=0)
    period_half: int = Field(..., ge=1, le=2, description="1 = 1st-15th, 2 = 16th-end of month")
    period_year: int = Field(..., description="Calendar year this expense applies to")
    period_month: int = Field(..., ge=1, le=12, description="Calendar month this expense applies to")
    is_recurring: bool = Field(
        default=False, description="If true, show in every month's calendar deductions"
    )
