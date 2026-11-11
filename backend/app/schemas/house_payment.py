from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field

from app.schemas.text import OptionalText, Trimmed


class HousePaymentCreate(BaseModel):
    name: Trimmed = Field(min_length=1)
    notes: OptionalText = None


class HousePaymentEntryCreate(BaseModel):
    paid_on: dt.date
    amount: float = Field(ge=0)
