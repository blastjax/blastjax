"""Repeat / recurring rule models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class RecurringRuleCreate(BaseModel):
    label: str = Field(..., min_length=1)
    kind: Literal["expense", "income"]
    frequency: Literal["monthly", "weekly", "quarterly", "yearly"]
    day_of_month: int | None = Field(None, ge=1, le=31)
    weekday: int | None = Field(None, ge=0, le=6)
    month_of_year: int | None = Field(None, ge=1, le=12)
    accounts: str | None = None
    category: str | None = None
    subcategory: str | None = None
    note: str | None = None
    description: str | None = None
    amount: float
    currency: str | None = None
    is_active: bool = True


class RecurringRuleUpdate(BaseModel):
    label: str | None = Field(None, min_length=1)
    kind: Literal["expense", "income"] | None = None
    frequency: Literal["monthly", "weekly", "quarterly", "yearly"] | None = None
    day_of_month: int | None = Field(None, ge=1, le=31)
    weekday: int | None = Field(None, ge=0, le=6)
    month_of_year: int | None = Field(None, ge=1, le=12)
    accounts: str | None = None
    category: str | None = None
    subcategory: str | None = None
    note: str | None = None
    description: str | None = None
    amount: float | None = None
    currency: str | None = None
    is_active: bool | None = None
    last_posted_period: str | None = None
