"""Pay-period start override API models (record that a payslip landed early)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class PayPeriodStartOverrideUpsert(BaseModel):
    period_year: int
    period_month: int = Field(..., ge=1, le=12)
    period_half: int = Field(..., ge=1, le=2, description="1 = 1st-15th, 2 = 16th-end of month")
    start_date: str = Field(..., description="YYYY-MM-DD")
