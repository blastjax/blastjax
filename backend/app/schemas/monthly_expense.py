from __future__ import annotations

import datetime as dt
from typing import Annotated

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
    expense_date: dt.date | None = Field(
        default=None, description="Day it shows on the calendar (that day of every month if recurring)"
    )
    skipped_months: list[Annotated[str, Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]] = Field(
        default_factory=list, description='"YYYY-MM" pay-period months it isn\'t deducted in'
    )
