"""Installment / loan schedule API models."""

from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field


class InstallmentCreate(BaseModel):
    name: str = Field(min_length=1)
    installment_current: int = Field(ge=1)
    installment_total: int = Field(ge=1)
    principal: float = Field(ge=0)
    interest: float | None = Field(default=None, ge=0)
    payment_total: float = Field(gt=0)
    start_date: dt.date
    finish_date: dt.date
    remaining: float | None = None
    original_total: float | None = Field(default=None, gt=0)


class InstallmentLineUpdate(BaseModel):
    principal: float = Field(ge=0)
    interest: float | None = Field(default=None, ge=0)
