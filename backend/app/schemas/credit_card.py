from __future__ import annotations

import datetime as dt
from uuid import UUID

from pydantic import BaseModel, Field


class CreditCardCreate(BaseModel):
    name: str = Field(min_length=1)
    credit_limit: float = Field(gt=0)
    last_statement_balance: float  # negative is a credit balance
    minimum_due: float = Field(ge=0)
    interest_rate: float = Field(
        ge=0, description="Monthly interest rate as a percent, e.g. 3.5 = 3.5%/month"
    )
    statement_date: dt.date | None = None
    due_date: dt.date | None = None
    bill_category_id: UUID | None = None  # take the statement from this bill category's latest bill


class CreditCardPaymentCreate(BaseModel):
    amount: float = Field(gt=0)
    payment_date: dt.date
    note: str | None = None


class CreditCardBalanceAdjust(BaseModel):
    available_limit: float
