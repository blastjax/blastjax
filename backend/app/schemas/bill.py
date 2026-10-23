from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RelativeDay(BaseModel):
    """A day counted from the month the bill is added: next month's 8th is months=1, day=8."""

    months: int = Field(ge=-2, le=2)
    day: int = Field(ge=1, le=31)  # past the month's end means its last day


class BillDefaults(BaseModel):
    bill_date: RelativeDay | None = None
    due_date: RelativeDay | None = None
    period_start: RelativeDay | None = None
    period_end: RelativeDay | None = None
    amount: float | None = None

    @model_validator(mode="after")
    def _check_period(self) -> BillDefaults:
        start, end = self.period_start, self.period_end
        if (start is None) != (end is None):
            raise ValueError("Set both ends of the default billing period, or neither.")
        if start and end and (end.months, end.day) < (start.months, start.day):
            raise ValueError("The default billing period can't end before it starts.")
        return self


class BillCategoryCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=100)
    is_credit_card: bool = False
    defaults: BillDefaults = Field(default_factory=BillDefaults)


class BillCreate(BaseModel):
    category_id: int
    bill_date: dt.date
    due_date: dt.date
    period_start: dt.date
    period_end: dt.date
    amount: float | None = None  # negative is a credit balance
    minimum_due: float | None = Field(default=None, ge=0)  # credit card bills

    @model_validator(mode="after")
    def _check_period(self) -> BillCreate:
        if self.period_end < self.period_start:
            raise ValueError("The billing period can't end before it starts.")
        if self.minimum_due is not None and self.amount is not None and self.minimum_due > max(self.amount, 0):
            raise ValueError("The minimum amount due can't be more than the amount.")
        return self
