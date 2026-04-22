"""In-memory workbook DataFrame cache (backed by the configured SQL database)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import HTTPException

from app.config import DEFAULT_XLSX
from db import load_workbook_from_db, use_database

_active_path: Path = Path(
    os.environ.get("BUDGET_EXCEL_PATH", str(DEFAULT_XLSX))
).resolve()

_workbook_cache: dict[str, pd.DataFrame] | None = None
_cache_key: tuple[Any, ...] | None = None
_db_cache_revision = 0


def resolve_path() -> Path:
    return _active_path


def set_active_excel_path(path: Path) -> None:
    """Used after upload/import to point at the saved file on disk."""
    global _active_path
    _active_path = path.resolve()


def load_workbook() -> dict[str, pd.DataFrame]:
    global _workbook_cache, _cache_key
    if not use_database():
        raise HTTPException(
            status_code=503,
            detail="DATABASE_URL is not configured. Set sqlite:///... or postgresql://... in .env.",
        )
    key = ("db", _db_cache_revision)
    if _workbook_cache is not None and _cache_key == key:
        return _workbook_cache
    frames = load_workbook_from_db()
    _workbook_cache = frames
    _cache_key = key
    return frames


def default_sheet_name(frames: dict[str, pd.DataFrame]) -> str | None:
    if not frames:
        return None
    return next(iter(frames.keys()))


def resolve_sheet_name(frames: dict[str, pd.DataFrame], sheet: str | None) -> str:
    if sheet and str(sheet).strip():
        name = str(sheet).strip()
        if name not in frames:
            raise HTTPException(status_code=404, detail="Sheet not found")
        return name
    default = default_sheet_name(frames)
    if default is None:
        raise HTTPException(status_code=404, detail="No data in database")
    return default


def invalidate_cache() -> None:
    global _workbook_cache, _cache_key, _db_cache_revision
    _workbook_cache = None
    _cache_key = None
    _db_cache_revision += 1
