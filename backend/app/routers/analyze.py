"""Analyze / filter / aggregate budget rows."""
from __future__ import annotations
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException

from app.schemas.analyze import AnalyzeBody
from app.services.calendar_service import budget_flow_totals
from app.services.dataframe import (
    apply_filters,
    apply_search_all,
    df_records,
    numeric_summary,
    run_aggregate,
)
from app.workbook_cache import load_workbook, resolve_sheet_name

router = APIRouter(tags=["analyze"])

@router.post("/api/analyze")
def analyze(body: AnalyzeBody) -> dict[str, Any]:
    frames = load_workbook()
    sheet_name = resolve_sheet_name(frames, body.sheet or None)
    df = frames[sheet_name].copy()
    filtered = apply_filters(df, body.filters)
    filtered = apply_search_all(filtered, body.search_all)
    total = int(len(filtered))
    summary = numeric_summary(filtered)

    # Default: newest transactions first (data preview UX when client omits sort).
    if body.sort is not None and str(body.sort.column).strip():
        sort_col = body.sort.column
        sort_dir = body.sort.direction
    else:
        sort_col = None
        sort_dir = "desc"
        if "Period" in filtered.columns:
            sort_col = "Period"
        elif "id" in filtered.columns:
            sort_col = "id"

    page_df = filtered
    if sort_col:
        if sort_col not in page_df.columns:
            raise HTTPException(status_code=400, detail=f"Unknown sort column: {sort_col}")
        ascending = sort_dir == "asc"
        if sort_col == "Period" and not pd.api.types.is_datetime64_any_dtype(
            page_df[sort_col]
        ):
            tmp = pd.to_datetime(page_df[sort_col], errors="coerce")
            page_df = page_df.assign(_period_sort=tmp)
            by_keys = ["_period_sort"]
            asc = [ascending]
            if "id" in page_df.columns:
                by_keys.append("id")
                asc.append(ascending)
            page_df = (
                page_df.sort_values(by=by_keys, ascending=asc, na_position="last")
                .drop(columns=["_period_sort"])
            )
        else:
            by_keys = [sort_col]
            asc = [ascending]
            if sort_col == "Period" and "id" in page_df.columns:
                by_keys.append("id")
                asc.append(ascending)
            page_df = page_df.sort_values(
                by=by_keys, ascending=asc, na_position="last"
            )

    # page_size <= 0 returns all matching rows (no pagination cap)
    if body.page_size <= 0:
        slice_df = page_df
        page_size = int(len(slice_df))
        page = 0
    else:
        page_size = max(1, min(body.page_size, 1_000_000))
        page = max(0, body.page)
        start = page * page_size
        slice_df = page_df.iloc[start : start + page_size]

    groups_records: list[dict[str, Any]] | None = None
    if body.group_by and body.measures:
        agg_df = run_aggregate(filtered, body.group_by, body.measures)
        groups_records = df_records(agg_df)

    conv = None
    if body.currency_conversion is not None:
        mc = (body.currency_conversion.main_code or "").strip()
        if mc:
            conv = {
                "main_code": mc,
                "sub_rates": dict(body.currency_conversion.sub_rates or {}),
            }
    budget_totals = budget_flow_totals(filtered, conv)

    return {
        "file": "sqlite",
        "sheet": sheet_name,
        "total_filtered_rows": total,
        "numeric_summary": summary,
        "budget_totals": budget_totals,
        "columns": [str(c) for c in filtered.columns],
        "rows": df_records(slice_df),
        "page": page,
        "page_size": page_size,
        "groups": groups_records,
    }
