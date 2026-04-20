"""Category catalog API models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class CategoryCatalogCreate(BaseModel):
    name: str = Field(..., min_length=1)
    kind: Literal["expense", "income"] = "expense"


class CategoryCatalogRename(BaseModel):
    name: str = Field(..., min_length=1)


class CategoryCatalogPatch(BaseModel):
    """Partial update: rename, visibility, and/or kind."""

    name: str | None = Field(default=None, min_length=1)
    is_hidden: bool | None = None
    kind: Literal["expense", "income", "mixed"] | None = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> CategoryCatalogPatch:
        if self.name is None and self.is_hidden is None and self.kind is None:
            raise ValueError("Provide name, is_hidden, and/or kind")
        return self


class SubcategoryCatalogCreate(BaseModel):
    name: str = Field(..., min_length=1)


class SubcategoryCatalogRename(BaseModel):
    name: str = Field(..., min_length=1)
