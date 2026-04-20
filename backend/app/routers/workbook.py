"""Sheet and workbook metadata routes."""

from __future__ import annotations

from typing import Any, Literal

import pandas as pd
from fastapi import APIRouter, HTTPException

from app.services.dataframe import column_kind
from app.services.facets import (
    _facet_items_from_vc,
    _merge_catalog_into_facet_items,
    _merged_column_series,
    filter_reserved_category_facet_items,
)
from app.workbook_cache import load_workbook

router = APIRouter(tags=["workbook"])


@router.get("/api/workbook")
def workbook_info() -> dict[str, Any]:
    frames = load_workbook()
    return {
        "path": "sqlite",
        "source": "sqlite",
        "sheets": [
            {"name": name, "rows": int(len(df))} for name, df in frames.items()
        ],
    }


@router.get("/api/sheet/{sheet_name}/columns")
def sheet_columns(sheet_name: str) -> dict[str, Any]:
    frames = load_workbook()
    if sheet_name not in frames:
        raise HTTPException(status_code=404, detail="Sheet not found")
    df = frames[sheet_name]
    cols = []
    for c in df.columns:
        kind = column_kind(df[c])
        nunique = int(df[c].nunique(dropna=True))
        cols.append({"name": c, "kind": kind, "unique_values": nunique})
    return {"columns": cols}


@router.get("/api/sheet/{sheet_name}/distinct/{column_name}")
def distinct_values(
    sheet_name: str, column_name: str, limit: int = 80, q: str | None = None
) -> dict[str, Any]:
    frames = load_workbook()
    if sheet_name not in frames:
        raise HTTPException(status_code=404, detail="Sheet not found")
    df = frames[sheet_name]
    if column_name not in df.columns:
        raise HTTPException(status_code=400, detail="Unknown column")
    s = df[column_name].dropna().astype(str)
    if q:
        s = s[s.str.contains(q, case=False, na=False)]
    vals = s.unique().tolist()[: max(1, min(limit, 500))]
    return {"values": vals}


@router.get("/api/sheet/{sheet_name}/facet/{column_name}")
def facet_column(
    sheet_name: str,
    column_name: str,
    limit: int = 120,
    q: str | None = None,
    sort: Literal["frequency", "alpha"] = "frequency",
) -> dict[str, Any]:
    """Date bounds or categorical value counts (most common first by default)."""
    frames = load_workbook()
    if sheet_name not in frames:
        raise HTTPException(status_code=404, detail="Sheet not found")
    df = frames[sheet_name]
    if column_name not in df.columns:
        raise HTTPException(status_code=400, detail="Unknown column")
    s = df[column_name]
    kind = column_kind(s)

    if kind == "datetime":
        ts = pd.to_datetime(s, errors="coerce").dropna()
        if ts.empty:
            return {
                "kind": "datetime",
                "min": None,
                "max": None,
            }
        tmin = ts.min()
        tmax = ts.max()
        return {
            "kind": "datetime",
            "min": tmin.isoformat() if hasattr(tmin, "isoformat") else str(tmin),
            "max": tmax.isoformat() if hasattr(tmax, "isoformat") else str(tmax),
        }

    if kind == "bool":
        s2 = s.dropna().astype(str)
        if q:
            s2 = s2[s2.str.contains(q, case=False, na=False)]
        vc = s2.value_counts()
        items = _facet_items_from_vc(vc, limit, sort)
        return {"kind": "bool", "items": items}

    s2 = s.dropna().astype(str)
    if q:
        s2 = s2[s2.str.contains(q, case=False, na=False)]
    vc = s2.value_counts()
    items = _facet_items_from_vc(vc, limit, sort)
    if column_name in ("Category", "Subcategory"):
        items = filter_reserved_category_facet_items(column_name, items)
    return {"kind": "categorical", "items": items}


@router.get("/api/workbook/facet/{column_name}")
def facet_column_workbook(
    column_name: str,
    limit: int = 120,
    q: str | None = None,
    sort: Literal["frequency", "alpha"] = "frequency",
) -> dict[str, Any]:
    """Distinct values merged across all sheets (Category / Subcategory autocomplete)."""
    frames = load_workbook()
    s = _merged_column_series(frames, column_name)
    if s is None:
        raise HTTPException(status_code=400, detail="Unknown column")
    kind = column_kind(s)

    if kind == "datetime":
        ts = pd.to_datetime(s, errors="coerce").dropna()
        if ts.empty:
            return {
                "kind": "datetime",
                "min": None,
                "max": None,
            }
        tmin = ts.min()
        tmax = ts.max()
        return {
            "kind": "datetime",
            "min": tmin.isoformat() if hasattr(tmin, "isoformat") else str(tmin),
            "max": tmax.isoformat() if hasattr(tmax, "isoformat") else str(tmax),
        }

    if kind == "bool":
        s2 = s.dropna().astype(str)
        if q:
            s2 = s2[s2.str.contains(q, case=False, na=False)]
        vc = s2.value_counts()
        items = _facet_items_from_vc(vc, limit, sort)
        return {"kind": "bool", "items": items}

    s2 = s.dropna().astype(str)
    if q:
        s2 = s2[s2.str.contains(q, case=False, na=False)]
    vc = s2.value_counts()
    items = _facet_items_from_vc(vc, limit, sort)
    if column_name in ("Category", "Subcategory"):
        items = _merge_catalog_into_facet_items(
            column_name, items, limit, sort, q
        )
    return {"kind": "categorical", "items": items}
