"""Credit card summary, statement, and payment API models."""

from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field


class CreditCardCreate(BaseModel):
    name: str = Field(min_length=1)
    credit_limit: float = Field(gt=0)
    last_statement_balance: float = Field(ge=0)
    minimum_due: float = Field(ge=0)
    interest_rate: float = Field(
        ge=0, description="Monthly interest rate as a percent, e.g. 3.5 = 3.5%/month"
    )
    statement_date: dt.date | None = None
    due_date: dt.date | None = None


class CreditCardPaymentCreate(BaseModel):
    amount: float = Field(gt=0)
    payment_date: dt.date
    note: str | None = None


class CreditCardBalanceAdjust(BaseModel):
    """Directly correct the available credit shown, e.g. to account for
    purchases or other transactions this app never recorded."""

    available_limit: float
