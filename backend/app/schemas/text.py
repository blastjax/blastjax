"""Text as every request model takes it, so a router can hand `body.model_dump()` straight to `db`."""

from __future__ import annotations

from typing import Annotated

from pydantic import AfterValidator


def _blank_to_none(v: str | None) -> str | None:
    return (v.strip() or None) if v is not None else None


# Trimmed once the field's own length checks have run on what was sent.
Trimmed = Annotated[str, AfterValidator(str.strip)]
# Trimmed, and stored as NULL when nothing is left.
OptionalText = Annotated[str | None, AfterValidator(_blank_to_none)]
