"""Budget transaction API models."""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field


class TransactionCreate(BaseModel):
    """Create row(s) in SQLite. Use `kind` to set Income/Expense or a transfer pair."""

    kind: Literal["expense", "income", "transfer"] = "expense"
    period: dt.datetime | None = None
    accounts: str | None = None
    transfer_to_account: str | None = Field(
        default=None,
        description="When kind is transfer: destination account (from is `accounts`).",
    )
    category: str | None = None
    subcategory: str | None = None
    note: str | None = None
    php: float | None = None
    description: str | None = None
    amount: float | None = None
    currency: str | None = None
    transfer_fee: float | None = Field(
        default=None,
        ge=0,
        description="When kind is transfer: optional fee as an extra Expense on the from account.",
    )


class TransactionUpdate(BaseModel):
    """Partial update; only fields you send are changed."""

    period: dt.datetime | None = None
    accounts: str | None = None
    category: str | None = None
    subcategory: str | None = None
    note: str | None = None
    php: float | None = None
    income_expense: str | None = None
    description: str | None = None
    amount: float | None = None
    currency: str | None = None
