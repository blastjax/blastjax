"""Fixed (recurring) expense API models."""

from __future__ import annotations

from pydantic import BaseModel, Field


class FixedExpenseCreate(BaseModel):
    period_half: int = Field(..., ge=1, le=2, description="1 = 1st-15th, 2 = 16th-end of month")
    amount: float = Field(..., gt=0)
    description: str | None = None
