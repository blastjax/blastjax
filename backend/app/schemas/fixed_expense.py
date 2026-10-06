from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class FixedExpenseCreate(BaseModel):
    period_half: int = Field(..., ge=1, le=2, description="1 = 1st-15th, 2 = 16th-end of month")
    amount: float = Field(..., description="Positive = expense, negative = extra income for the period")
    description: str | None = None
    period_year: int
    period_month: int = Field(..., ge=1, le=12)

    @field_validator("amount")
    @classmethod
    def _nonzero(cls, v: float) -> float:
        if v == 0:
            raise ValueError("amount must not be zero")
        return v
