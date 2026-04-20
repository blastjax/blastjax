"""Calendar, account balances, and flow classification helpers."""
from __future__ import annotations

import calendar
import json
from typing import Any

import numpy as np
import pandas as pd
from fastapi import HTTPException

from app.schemas.analyze import Filter
from app.services.dataframe import apply_filters, column_kind
from app.workbook_cache import resolve_sheet_name


def _currency_multiplier_numpy(
    df: pd.DataFrame,
    main_code: str,
    sub_rates: dict[str, float],
) -> np.ndarray:
    """1.0 for main/blank/unknown; sub_rates values multiply amount into main currency."""
    n = len(df)
    main_u = (main_code or "").strip().upper()
    if not main_u or "Currency" not in df.columns:
        return np.ones(n, dtype=float)
    rates_upper: dict[str, float] = {}
    for k, v in (sub_rates or {}).items():
        try:
            kk = str(k).strip().upper()
            vv = float(v)
            if kk and vv > 0:
                rates_upper[kk] = vv
        except (TypeError, ValueError):
            continue
    cur_arr = df["Currency"].fillna("").astype(str).str.strip().str.upper().to_numpy()
    m = np.ones(n, dtype=float)
    for code, rate in rates_upper.items():
        m = np.where(cur_arr == code, float(rate), m)
    m = np.where((cur_arr == "") | (cur_arr == main_u), 1.0, m)
    return m


def _calendar_columns(df: pd.DataFrame) -> tuple[str, str, str | None]:
    """Find Period (datetime), Amount, and Income/Expense columns."""
    period_col = None
    for c in df.columns:
        if column_kind(df[c]) == "datetime":
            period_col = c
            break
    # SQLite / some imports keep Period as object strings; still valid for calendar.
    if period_col is None and "Period" in df.columns:
        parsed = pd.to_datetime(df["Period"], errors="coerce")
        if parsed.notna().any():
            period_col = "Period"
    if period_col is None:
        raise HTTPException(
            status_code=400,
            detail="No date/time column found for calendar",
        )
    amt_col = None
    if "Amount" in df.columns:
        amt_col = "Amount"
    else:
        for c in df.columns:
            if c != period_col and column_kind(df[c]) == "number":
                amt_col = c
                break
    if amt_col is None:
        raise HTTPException(status_code=400, detail="No amount column found")

    ie_col = None
    for c in df.columns:
        cl = str(c).lower()
        if "income" in cl and "expense" in cl.replace("/", " "):
            ie_col = c
            break
    return period_col, amt_col, ie_col


def _income_expense_transfer_parts(
    df: pd.DataFrame,
    ie_col: str | None,
    amt_col: str,
    currency_conversion: dict[str, Any] | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Split rows into income, expense, transfer-in, and transfer-out.
    Transfers are not counted as income or expense (separate category).
    """
    amt = pd.to_numeric(df[amt_col], errors="coerce").fillna(0).to_numpy(dtype=float)
    if currency_conversion:
        main = str(currency_conversion.get("main_code") or "").strip()
        if main:
            sub = currency_conversion.get("sub_rates") or {}
            rates = sub if isinstance(sub, dict) else {}
            mult = _currency_multiplier_numpy(df, main, rates)
            amt = amt * mult
    amt = np.abs(amt)
    z = np.zeros(len(df))
    if ie_col is None or ie_col not in df.columns:
        return z, amt, z, z

    ie = df[ie_col].fillna("").astype(str).str.lower()
    is_tin = ie.str.contains("transfer-in", na=False)
    is_tout = ie.str.contains("transfer-out", na=False)
    # "transfer-out" contains "exp" — exclude transfers before classifying expense
    is_in = (ie.str.strip() == "income") & ~is_tin
    is_exp = (
        ie.str.contains("exp", na=False)
        & ~ie.str.contains("income", na=False)
        & ~is_tin
        & ~is_tout
    )
    neither = ~is_in & ~is_exp & ~is_tin & ~is_tout
    income = np.where(is_in, amt, 0.0)
    expense = np.where(is_exp, amt, 0.0)
    transfer_in = np.where(is_tin, amt, 0.0)
    transfer_out = np.where(is_tout, amt, 0.0)
    expense = np.where(neither, amt, expense)
    return income, expense, transfer_in, transfer_out


def flow_classification_series(df: pd.DataFrame, ie_col: str | None, amt_col: str) -> pd.Series:
    """Per-row label: Income, Expense, Transfer-In, Transfer-Out (same rules as _income_expense_transfer_parts)."""
    n = len(df)
    if ie_col is None or ie_col not in df.columns:
        return pd.Series(["Expense"] * n, index=df.index, dtype=object)
    ie = df[ie_col].fillna("").astype(str).str.lower()
    is_tin = ie.str.contains("transfer-in", na=False)
    is_tout = ie.str.contains("transfer-out", na=False)
    is_in = (ie.str.strip() == "income") & ~is_tin
    is_exp = (
        ie.str.contains("exp", na=False)
        & ~ie.str.contains("income", na=False)
        & ~is_tin
        & ~is_tout
    )
    labels = np.select(
        [is_tin.to_numpy(), is_tout.to_numpy(), is_in.to_numpy(), is_exp.to_numpy()],
        ["Transfer-In", "Transfer-Out", "Income", "Expense"],
        default="Expense",
    )
    return pd.Series(labels, index=df.index, dtype=object)


def apply_category_filter_to_display(
    display: pd.DataFrame, category: str | None
) -> pd.DataFrame:
    """Keep rows whose Category matches; use (Uncategorized) for blank cells (same as pie breakdown)."""
    if category is None or not str(category).strip():
        return display
    if "Category" not in display.columns:
        return display.iloc[0:0].copy()
    cf = str(category)
    s = display["Category"].fillna("").astype(str)
    if cf == "(Uncategorized)":
        return display.loc[s.str.strip() == ""].copy()
    return display.loc[s.astype(str) == cf].copy()


def apply_subcategory_filter_to_display(
    display: pd.DataFrame, subcategory: str | None
) -> pd.DataFrame:
    """After category filter: keep rows whose Subcategory matches; (Uncategorized) for blank."""
    if subcategory is None or not str(subcategory).strip():
        return display
    if "Subcategory" not in display.columns:
        return display.iloc[0:0].copy()
    sf = str(subcategory)
    s = display["Subcategory"].fillna("").astype(str)
    if sf == "(Uncategorized)":
        return display.loc[s.str.strip() == ""].copy()
    return display.loc[s.astype(str) == sf].copy()


def amount_and_ie_columns(df: pd.DataFrame) -> tuple[str | None, str | None]:
    """Amount column and Income/Expense column (same rules as calendar, without requiring Period)."""
    amt_col = None
    if "Amount" in df.columns:
        amt_col = "Amount"
    else:
        for c in df.columns:
            if column_kind(df[c]) == "number":
                amt_col = c
                break
    ie_col = None
    for c in df.columns:
        cl = str(c).lower()
        if "income" in cl and "expense" in cl.replace("/", " "):
            ie_col = c
            break
    return amt_col, ie_col


def budget_flow_totals(
    df: pd.DataFrame,
    currency_conversion: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Sum income, expense, transfer-in, and transfer-out for filtered rows
    (aligned with calendar classification).
    """
    amt_col, ie_col = amount_and_ie_columns(df)
    if not amt_col or amt_col not in df.columns:
        return {
            "available": False,
            "amount_column": None,
            "income_expense_column": ie_col,
            "total_income": None,
            "total_expense": None,
            "total_transfer_in": None,
            "total_transfer_out": None,
            "net_income_minus_expense": None,
        }
    inc, exp, tin, tout = _income_expense_transfer_parts(
        df, ie_col, amt_col, currency_conversion
    )
    ti = float(np.sum(inc))
    te = float(np.sum(exp))
    ttin = float(np.sum(tin))
    ttout = float(np.sum(tout))
    return {
        "available": True,
        "amount_column": amt_col,
        "income_expense_column": ie_col,
        "total_income": round(ti, 2),
        "total_expense": round(te, 2),
        "total_transfer_in": round(ttin, 2),
        "total_transfer_out": round(ttout, 2),
        "net_income_minus_expense": round(ti - te, 2),
    }


def prepare_calendar_frame(
    df: pd.DataFrame,
    tz_offset_minutes: int | None = None,
    currency_conversion: dict[str, Any] | None = None,
) -> tuple[pd.DataFrame, str, str, str | None]:
    """
    Build per-row calendar bucket date `_d` from Period.

    When `tz_offset_minutes` is set, it must be the browser's
    `Date.getTimezoneOffset()` so `_d` matches the user's local calendar day
    (fixes midnight local appearing on the wrong day when stored as UTC).
    When omitted, uses pandas' default date extraction (legacy behavior).
    """
    period_col, amt_col, ie_col = _calendar_columns(df)
    out = df.copy()
    if tz_offset_minutes is not None:
        ts = pd.to_datetime(out[period_col], errors="coerce", utc=True)
        # Same relation as JS: localMs = utcMs - getTimezoneOffset() * 60000
        out["_d"] = (ts - pd.to_timedelta(tz_offset_minutes, unit="m")).dt.date
    else:
        out["_d"] = pd.to_datetime(out[period_col], errors="coerce").dt.date
    inc, exp, tin, tout = _income_expense_transfer_parts(
        out, ie_col, amt_col, currency_conversion
    )
    out["_income"] = inc
    out["_expense"] = exp
    out["_transfer_in"] = tin
    out["_transfer_out"] = tout
    return out, period_col, amt_col, ie_col


def parse_extra_filters_json(raw: str | None) -> list[Filter]:
    """JSON array of filter objects (same shape as /api/analyze `filters`)."""
    if not raw or not str(raw).strip():
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=400, detail=f"Invalid extra_filters JSON: {e}"
        ) from e
    if not isinstance(data, list):
        raise HTTPException(status_code=400, detail="extra_filters must be a JSON array")
    out: list[Filter] = []
    for i, item in enumerate(data):
        if not isinstance(item, dict):
            raise HTTPException(
                status_code=400, detail=f"extra_filters[{i}] must be an object"
            )
        out.append(Filter.model_validate(item))
    return out


def calendar_raw_df(
    frames: dict[str, pd.DataFrame],
    sheet_name: str | None,
    extra_filters: list[Filter],
) -> tuple[pd.DataFrame, str]:
    sheet_resolved = resolve_sheet_name(frames, sheet_name)
    raw = frames[sheet_resolved].copy()
    if extra_filters:
        raw = apply_filters(raw, extra_filters)
    return raw, sheet_resolved


def per_account_balances(
    df: pd.DataFrame,
    currency_conversion: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """
    Remaining net balance per Accounts value: income + transfer_in - expense - transfer_out
    (same sign rules as calendar / budget totals), summed over all rows per account.
    """
    if "Accounts" not in df.columns:
        return []
    amt_col, ie_col = amount_and_ie_columns(df)
    if not amt_col or amt_col not in df.columns:
        return []
    inc, exp, tin, tout = _income_expense_transfer_parts(
        df, ie_col, amt_col, currency_conversion
    )
    net = inc + tin - exp - tout
    acc = df["Accounts"].fillna("").astype(str).str.strip()
    g = (
        pd.DataFrame({"account": acc, "net": net})
        .groupby("account", dropna=False)["net"]
        .sum()
    )
    rows: list[dict[str, Any]] = []
    for k, v in g.items():
        if k is None or (isinstance(k, float) and pd.isna(k)):
            name = ""
        else:
            name = str(k)
        rows.append({"name": name, "balance": round(float(v), 2)})
    rows.sort(key=lambda x: (x["name"] == "", str(x["name"]).lower()))
    return rows
