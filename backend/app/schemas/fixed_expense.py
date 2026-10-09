from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class FixedExpenseUpdate(BaseModel):
    amount: float = Field(..., description="Positive = expense, negative = extra income for the period")
    description: str | None = None

    @field_validator("amount")
    @classmethod
    def _nonzero(cls, v: float) -> float:
        if v == 0:
            raise ValueError("amount must not be zero")
        return v


class FixedExpenseCreate(FixedExpenseUpdate):
    period_half: int = Field(..., ge=1, le=2, description="1 = 1st-15th, 2 = 16th-end of month")
    period_year: int
    period_month: int = Field(..., ge=1, le=12)
