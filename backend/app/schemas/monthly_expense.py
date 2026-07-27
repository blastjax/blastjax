"""Monthly expense API models."""

from __future__ import annotations

from pydantic import BaseModel, Field


class MonthlyExpenseCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    amount: float = Field(..., gt=0)
    period_half: int = Field(..., ge=1, le=2, description="1 = 1st-15th, 2 = 16th-end of month")
