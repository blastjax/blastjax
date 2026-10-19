from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field, model_validator


class BillCategoryCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=100)


class BillCreate(BaseModel):
    category_id: int
    bill_date: dt.date
    due_date: dt.date
    period_start: dt.date
    period_end: dt.date
    amount: float | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _check_period(self) -> BillCreate:
        if self.period_end < self.period_start:
            raise ValueError("The billing period can't end before it starts.")
        return self
