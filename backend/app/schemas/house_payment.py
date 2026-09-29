from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field


class HousePaymentCreate(BaseModel):
    name: str = Field(min_length=1)
    notes: str | None = None


class HousePaymentEntryCreate(BaseModel):
    paid_on: dt.date
    amount: float = Field(ge=0)


class HousePaymentEntryUpdate(BaseModel):
    paid_on: dt.date
    amount: float = Field(ge=0)
