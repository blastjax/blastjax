"""Analyze endpoint models."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Op = Literal[
    "eq",
    "ne",
    "gt",
    "gte",
    "lt",
    "lte",
    "contains",
    "startswith",
    "in",
    "nin",
    "isnull",
    "notnull",
    "ie_segment",
]


class Filter(BaseModel):
    column: str
    op: Op
    value: Any | None = None


class Sort(BaseModel):
    column: str
    direction: Literal["asc", "desc"] = "asc"


class Measure(BaseModel):
    column: str
    agg: Literal["sum", "mean", "min", "max", "count"]


class CurrencyConversion(BaseModel):
    """Scale row amounts to main: amount_main = amount × rate for listed subcurrencies."""

    main_code: str = ""
    sub_rates: dict[str, float] = Field(default_factory=dict)


class AnalyzeBody(BaseModel):
    """If sheet is empty, the first sheet from the database is used."""

    sheet: str = ""
    filters: list[Filter] = Field(default_factory=list)
    sort: Sort | None = None
    page: int = 0
    page_size: int = 50
    group_by: list[str] | None = None
    measures: list[Measure] | None = None
    search_all: str | None = None
    currency_conversion: CurrencyConversion | None = None
