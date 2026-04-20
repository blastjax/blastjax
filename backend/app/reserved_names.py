"""Labels that must not appear as Category names (conflict with workbook column names)."""

from __future__ import annotations

# Matches the standard `Accounts` column; case-insensitive.
RESERVED_CATEGORY_LABELS_LOWER = frozenset({"accounts"})


def is_reserved_category_label(name: str | None) -> bool:
    if name is None:
        return False
    return str(name).strip().lower() in RESERVED_CATEGORY_LABELS_LOWER
