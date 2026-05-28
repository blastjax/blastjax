"""House payment plan API models.

A plan is just a name + free-form notes. Individual payments are stored as
``house_payment_entry`` rows (date + amount). Nothing else is tracked here.
"""

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
