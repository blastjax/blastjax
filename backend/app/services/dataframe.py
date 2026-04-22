"""DataFrame filtering, aggregation, and serialization for analyze API."""
from __future__ import annotations

import datetime as dt
import json
from typing import Any

import numpy as np
import pandas as pd
from fastapi import HTTPException

from app.schemas.analyze import Filter, Measure


def parse_period_mixed(val: Any) -> pd.Timestamp:
    """
    Parse one Period cell without pandas' whole-column coercion (which turns mixed
    naive + offset-aware ISO strings into NaT when dtype is unified).
    """
    if val is None or val is pd.NaT:
        return pd.NaT
    if isinstance(val, pd.Timestamp):
        return val
    if isinstance(val, dt.datetime):
        return pd.Timestamp(val)
    if isinstance(val, str):
        t = val.strip()
        if not t or t.lower() in ("nat", "none", "null"):
            return pd.NaT
        out = pd.Timestamp(t)
        return pd.NaT if pd.isna(out) else out
    if isinstance(val, (bool, np.bool_)):
        return pd.NaT
    if isinstance(val, (int, np.integer)):
        return pd.to_datetime(val, errors="coerce")
    if isinstance(val, (float, np.floating)):
        if np.isnan(val):
            return pd.NaT
        fv = float(val)
        if 20_000 < fv < 100_000:
            return pd.Timestamp("1899-12-30") + pd.Timedelta(days=fv)
        return pd.to_datetime(val, errors="coerce")
    try:
        out = pd.Timestamp(val)
        return pd.NaT if pd.isna(out) else out
    except (TypeError, ValueError, OverflowError):
        return pd.NaT


def column_kind(s: pd.Series) -> str:
    if pd.api.types.is_datetime64_any_dtype(s):
        return "datetime"
    # SQLite / exports: Period is often object dtype ISO strings; still the calendar date column.
    if str(s.name) == "Period":
        parsed = s.map(parse_period_mixed)
        if parsed.notna().any():
            return "datetime"
    if pd.api.types.is_bool_dtype(s):
        return "bool"
    if pd.api.types.is_numeric_dtype(s):
        return "number"
    return "string"


def _coerce_series_timestamps(s: pd.Series) -> pd.Series:
    """Datetime64 column, or Period object/strings parsed per-cell (mixed tz-safe)."""
    if pd.api.types.is_datetime64_any_dtype(s):
        return pd.to_datetime(s, errors="coerce")
    if str(s.name) == "Period":
        return s.map(parse_period_mixed)
    return pd.to_datetime(s, errors="coerce")


def period_series_to_sortable_utc(s: pd.Series) -> pd.Series:
    """
    Single datetime64[ns, UTC] series for sort/min/max.

    Mixed naive + offset-aware Period values are not directly comparable; pandas may
    raise or (in some paths) fail factorize with:
    \"'values' is not ordered, please explicitly specify the categories order ...\".
    """
    ts = _coerce_series_timestamps(s)
    return pd.to_datetime(ts, utc=True, errors="coerce")


def _series_datetime_tz(series: pd.Series) -> Any | None:
    """Timezone of a datetime column (e.g. UTC from SQLite ISO strings), or None if naive."""
    ts = _coerce_series_timestamps(series)
    return getattr(ts.dtype, "tz", None)


def _align_datetime_boundary(series: pd.Series, v: Any) -> pd.Timestamp:
    """
    Align filter value with column timezone so comparisons work (naive API values vs
    tz-aware DB timestamps).
    """
    boundary = pd.Timestamp(v)
    if pd.isna(boundary):
        return boundary
    tz = _series_datetime_tz(series)
    if tz is not None:
        if boundary.tzinfo is None:
            return boundary.tz_localize(tz)
        return boundary.tz_convert(tz)
    if boundary.tzinfo is not None:
        return boundary.tz_localize(None)
    return boundary


def apply_filters(df: pd.DataFrame, filters: list[Filter]) -> pd.DataFrame:
    out = df
    colset = frozenset(out.columns)
    for f in filters:
        if f.column not in colset:
            raise HTTPException(status_code=400, detail=f"Unknown column: {f.column}")
        s = out[f.column]
        if f.op == "isnull":
            out = out[s.isna()]
            continue
        if f.op == "notnull":
            out = out[s.notna()]
            continue
        if f.value is None and f.op not in ("in", "nin"):
            raise HTTPException(status_code=400, detail=f"Filter {f.op} requires value")
        if f.op == "in":
            if f.value is None:
                vals: list[Any] = []
            elif isinstance(f.value, list):
                vals = f.value
            else:
                vals = [f.value]
            out = out[s.isin(vals)]
            continue
        if f.op == "nin":
            if f.value is None:
                vals_nin: list[Any] = []
            elif isinstance(f.value, list):
                vals_nin = f.value
            else:
                vals_nin = [f.value]
            out = out[~s.isin(vals_nin)]
            continue
        if f.op == "ie_segment":
            seg = str(f.value or "").lower().strip()
            if seg not in ("expense", "income", "transfer"):
                raise HTTPException(
                    status_code=400,
                    detail="ie_segment value must be 'expense', 'income', or 'transfer'",
                )
            ie_lower = s.fillna("").astype(str).str.lower()
            is_tin = ie_lower.str.contains("transfer-in", na=False)
            is_tout = ie_lower.str.contains("transfer-out", na=False)
            is_in = (ie_lower.str.strip() == "income") & ~is_tin
            is_exp = (
                ie_lower.str.contains("exp", na=False)
                & ~ie_lower.str.contains("income", na=False)
                & ~is_tin
                & ~is_tout
            )
            if seg == "expense":
                mask = is_exp
            elif seg == "income":
                mask = is_in
            else:
                mask = is_tin | is_tout
            out = out[mask]
            continue
        v = f.value
        if f.op == "eq":
            if pd.api.types.is_datetime64_any_dtype(s) or str(s.name) == "Period":
                ts = _coerce_series_timestamps(s)
                b = _align_datetime_boundary(s, v)
                out = out[ts == b]
            else:
                # Blank Excel / DB cells are often NaN; balance sidebar uses "" for that bucket.
                if v == "":
                    out = out[s.isna() | (s.astype(str).str.strip() == "")]
                else:
                    out = out[s == v]
        elif f.op == "ne":
            if pd.api.types.is_datetime64_any_dtype(s) or str(s.name) == "Period":
                ts = _coerce_series_timestamps(s)
                b = _align_datetime_boundary(s, v)
                out = out[ts != b]
            else:
                out = out[s != v]
        elif f.op == "contains":
            out = out[s.astype(str).str.contains(str(v), case=False, na=False)]
        elif f.op == "startswith":
            out = out[s.astype(str).str.startswith(str(v), na=False)]
        elif f.op in ("gt", "gte", "lt", "lte"):
            if pd.api.types.is_datetime64_any_dtype(s) or str(s.name) == "Period":
                ts = _coerce_series_timestamps(s)
                try:
                    raw = pd.Timestamp(v)
                except (ValueError, TypeError):
                    raw = pd.to_datetime(v, errors="coerce")
                if pd.isna(raw):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid datetime for filter on {f.column}",
                    )
                boundary = _align_datetime_boundary(s, raw)
                if pd.isna(boundary):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid datetime for filter on {f.column}",
                    )
                if f.op == "gt":
                    out = out[ts > boundary]
                elif f.op == "gte":
                    out = out[ts >= boundary]
                elif f.op == "lt":
                    out = out[ts < boundary]
                else:
                    out = out[ts <= boundary]
            else:
                cmp_s = pd.to_numeric(s, errors="coerce")
                vv = float(v) if not isinstance(v, (int, float)) else v
                if f.op == "gt":
                    out = out[cmp_s > vv]
                elif f.op == "gte":
                    out = out[cmp_s >= vv]
                elif f.op == "lt":
                    out = out[cmp_s < vv]
                else:
                    out = out[cmp_s <= vv]
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported op {f.op}")
    return out


def apply_search_all(df: pd.DataFrame, q: str | None) -> pd.DataFrame:
    """Keep rows where any column's text contains the query (case-insensitive)."""
    if not q:
        return df
    needle = str(q).strip()
    if not needle:
        return df
    needle_lower = needle.lower()
    mask = pd.Series(False, index=df.index)
    for c in df.columns:
        col_mask = (
            df[c]
            .astype(str)
            .str.lower()
            .str.contains(needle_lower, regex=False, na=False)
        )
        mask = mask | col_mask
    return df[mask]


def numeric_summary(df: pd.DataFrame) -> dict[str, dict[str, float | int]]:
    summary: dict[str, dict[str, float | int]] = {}
    for c in df.columns:
        # Avoid column_kind's full Period parse (datetime path) when summing numeric columns only.
        if str(c) == "Period":
            continue
        if column_kind(df[c]) != "number":
            continue
        ser = pd.to_numeric(df[c], errors="coerce").dropna()
        if ser.empty:
            summary[c] = {"count": 0, "sum": 0.0, "mean": 0.0, "min": 0.0, "max": 0.0}
            continue
        summary[c] = {
            "count": int(ser.count()),
            "sum": float(ser.sum()),
            "mean": float(ser.mean()),
            "min": float(ser.min()),
            "max": float(ser.max()),
        }
    return summary


def df_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    # ISO dates, NaN -> null
    payload = df.to_json(orient="records", date_format="iso", default_handler=str)
    return json.loads(payload)


def _measure_cell(sub: pd.DataFrame, m: Measure) -> float | int | None:
    col = m.column
    if m.agg == "count":
        return int(sub[col].count())
    num = pd.to_numeric(sub[col], errors="coerce")
    if num.dropna().empty:
        return None
    if m.agg == "sum":
        return float(num.sum())
    if m.agg == "mean":
        return float(num.mean())
    if m.agg == "min":
        return float(num.min())
    if m.agg == "max":
        return float(num.max())
    raise HTTPException(status_code=400, detail=f"Unknown agg: {m.agg}")


def run_aggregate(
    df: pd.DataFrame, group_by: list[str], measures: list[Measure]
) -> pd.DataFrame:
    colset = frozenset(df.columns)
    for g in group_by:
        if g not in colset:
            raise HTTPException(status_code=400, detail=f"group_by unknown column: {g}")
    for m in measures:
        if m.column not in colset:
            raise HTTPException(status_code=400, detail=f"measure unknown column: {m.column}")
    records: list[dict[str, Any]] = []
    for keys, sub in df.groupby(group_by, dropna=False):
        key_tuple = keys if isinstance(keys, tuple) else (keys,)
        row: dict[str, Any] = {gb: key_tuple[i] for i, gb in enumerate(group_by)}
        for m in measures:
            name = f"{m.column}_{m.agg}"
            row[name] = _measure_cell(sub, m)
        records.append(row)
    return pd.DataFrame(records)

