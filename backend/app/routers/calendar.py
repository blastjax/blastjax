"""Calendar and account balance routes."""
from __future__ import annotations

import calendar
import datetime as dt
import json
from typing import Any, Literal

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from app.services.calendar_service import (
    amount_and_ie_columns,
    apply_category_filter_to_display,
    apply_subcategory_filter_to_display,
    calendar_raw_df,
    flow_classification_series,
    parse_extra_filters_json,
    per_account_balances,
    prepare_calendar_frame,
)
from app.reserved_names import is_reserved_category_label
from app.services.dataframe import apply_search_all, df_records, period_series_to_sortable_utc
from app.workbook_cache import load_workbook, resolve_sheet_name

router = APIRouter(tags=["calendar"])


def _order_calendar_date_after_period(display: pd.DataFrame, period_col: str) -> pd.DataFrame:
    """Keep `calendar_date` next to Period so API rows stay readable."""
    if "calendar_date" not in display.columns or period_col not in display.columns:
        return display
    cols = list(display.columns)
    cols.remove("calendar_date")
    insert_at = cols.index(period_col) + 1
    cols.insert(insert_at, "calendar_date")
    return display[cols]


def _sort_by_period_then_id(
    df: pd.DataFrame,
    period_col: str,
    *,
    ascending: bool,
) -> pd.DataFrame:
    """Sort by Period (UTC-comparable); tie-break on id so order stays stable after edits."""
    if period_col not in df.columns:
        return df
    _k = "__period_sort_utc__"
    out = df.assign(**{_k: period_series_to_sortable_utc(df[period_col])})
    by_keys = [_k]
    asc = [ascending]
    if "id" in out.columns:
        by_keys.append("id")
        asc.append(ascending)
    return out.sort_values(by=by_keys, ascending=asc, na_position="last").drop(
        columns=[_k], errors="ignore"
    )


def _parse_currency_conversion(
    currency_main: str | None,
    currency_rates: str | None,
) -> dict[str, Any] | None:
    """Optional query: main ISO-like code + JSON object of sub code → rate to main."""
    main = (currency_main or "").strip()
    if not main:
        return None
    rates: dict[str, float] = {}
    raw = (currency_rates or "").strip()
    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                for k, v in data.items():
                    try:
                        rates[str(k).strip()] = float(v)
                    except (TypeError, ValueError):
                        continue
        except json.JSONDecodeError:
            pass
    return {"main_code": main, "sub_rates": rates}


def _category_amount_slices(
    sub: pd.DataFrame,
    cat_col: str,
    value_col: str,
) -> tuple[list[dict[str, Any]], float]:
    """Pie slices: positive value_col per Category (reserved-label rules match expense pie)."""
    rows = sub[sub[value_col] > 0].copy()
    if len(rows) == 0:
        return [], 0.0
    rows["_cat"] = rows[cat_col].fillna("").astype(str)
    rows.loc[rows["_cat"].str.strip() == "", "_cat"] = "(Uncategorized)"
    rows = rows[
        rows["_cat"].map(
            lambda c: c == "(Uncategorized)" or not is_reserved_category_label(c),
        )
    ].copy()
    if len(rows) == 0:
        return [], 0.0
    agg = (
        rows.groupby("_cat", as_index=False)[value_col]
        .sum()
        .sort_values(value_col, ascending=False)
    )
    slices: list[dict[str, Any]] = [
        {
            "name": str(row["_cat"]),
            "value": round(float(row[value_col]), 2),
        }
        for _, row in agg.iterrows()
    ]
    total = round(float(rows[value_col].sum()), 2)
    return slices, total

# Browser `Date.getTimezoneOffset()` (minutes); aligns Period → local calendar day.
_TZ_OFFSET_Q = Query(
    default=None,
    description="JavaScript Date.getTimezoneOffset(); when set, bucket dates use the user's local day.",
)

@router.get("/api/accounts/balances")
def accounts_balances(
    sheet_name: str | None = Query(
        default=None,
        description="Omit to use the default sheet from the database",
    ),
    currency_main: str | None = Query(
        default=None,
        description="Main currency code; with currency_rates, balances are converted to main",
    ),
    currency_rates: str | None = Query(
        default=None,
        description='JSON object, e.g. {"USD":56} meaning 1 USD = 56 units of main',
    ),
) -> dict[str, Any]:
    """Per-account net balance over the full sheet (signed amounts by flow type)."""
    frames = load_workbook()
    sheet_resolved = resolve_sheet_name(frames, sheet_name)
    raw = frames[sheet_resolved].copy()
    conv = _parse_currency_conversion(currency_main, currency_rates)
    accounts = per_account_balances(raw, conv)
    amt_col, ie_col = amount_and_ie_columns(raw)
    return {
        "sheet": sheet_resolved,
        "accounts": accounts,
        "accounts_column": "Accounts" if "Accounts" in raw.columns else None,
        "amount_column": amt_col,
        "income_expense_column": ie_col,
    }


@router.get("/api/calendar/bounds")
def calendar_transaction_date_bounds(
    sheet_name: str | None = Query(default=None, description="Omit to use the default sheet from the database"),
    extra_filters: str | None = Query(
        default=None,
        description="Optional JSON array of filters applied before calendar logic",
    ),
    tz_offset_minutes: int | None = _TZ_OFFSET_Q,
    currency_main: str | None = Query(default=None),
    currency_rates: str | None = Query(default=None),
) -> dict[str, Any]:
    """Earliest and latest calendar day among rows with a valid Period (after filters / tz bucket)."""
    frames = load_workbook()
    ef = parse_extra_filters_json(extra_filters)
    raw, sheet_resolved = calendar_raw_df(frames, sheet_name, ef)
    conv = _parse_currency_conversion(currency_main, currency_rates)
    df, period_col, _, _ = prepare_calendar_frame(
        raw, tz_offset_minutes=tz_offset_minutes, currency_conversion=conv
    )
    valid = df["_d"].dropna()
    if len(valid) == 0:
        return {
            "sheet": sheet_resolved,
            "period_column": period_col,
            "first_date": None,
            "last_date": None,
        }
    lo = valid.min()
    hi = valid.max()
    return {
        "sheet": sheet_resolved,
        "period_column": period_col,
        "first_date": lo.isoformat(),
        "last_date": hi.isoformat(),
    }


@router.get("/api/calendar/month")
def calendar_month(
    year: int,
    month: int,
    sheet_name: str | None = Query(default=None, description="Omit to use the default sheet from the database"),
    extra_filters: str | None = Query(
        default=None,
        description="Optional JSON array of filters (e.g. value visibility) applied before calendar logic",
    ),
    tz_offset_minutes: int | None = _TZ_OFFSET_Q,
    currency_main: str | None = Query(default=None),
    currency_rates: str | None = Query(default=None),
) -> dict[str, Any]:
    """Daily income and expense totals for a calendar month."""
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="month must be 1–12")
    frames = load_workbook()
    ef = parse_extra_filters_json(extra_filters)
    raw, sheet_resolved = calendar_raw_df(frames, sheet_name, ef)
    conv = _parse_currency_conversion(currency_main, currency_rates)
    df, period_col, amt_col, ie_col = prepare_calendar_frame(
        raw, tz_offset_minutes=tz_offset_minutes, currency_conversion=conv
    )

    _, last_day = calendar.monthrange(year, month)
    start_d = dt.date(year, month, 1)
    end_d = dt.date(year, month, last_day)

    sub = df[(df["_d"] >= start_d) & (df["_d"] <= end_d) & df["_d"].notna()]
    if len(sub) == 0:
        mt_inc = mt_exp = mt_tin = mt_tout = 0.0
        agg = pd.DataFrame(
            columns=["_d", "income", "expense", "transfer_in", "transfer_out"]
        )
    else:
        mt_inc = float(sub["_income"].sum())
        mt_exp = float(sub["_expense"].sum())
        mt_tin = float(sub["_transfer_in"].sum())
        mt_tout = float(sub["_transfer_out"].sum())
        agg = (
            sub.groupby("_d", as_index=False)
            .agg(
                income=("_income", "sum"),
                expense=("_expense", "sum"),
                transfer_in=("_transfer_in", "sum"),
                transfer_out=("_transfer_out", "sum"),
            )
        )

    by_day = {
        row["_d"]: (
            float(row["income"]),
            float(row["expense"]),
            float(row["transfer_in"]),
            float(row["transfer_out"]),
        )
        for _, row in agg.iterrows()
    }

    days: list[dict[str, Any]] = []
    for day in range(1, last_day + 1):
        d = dt.date(year, month, day)
        inc_v, exp_v, tin_v, tout_v = by_day.get(d, (0.0, 0.0, 0.0, 0.0))
        days.append(
            {
                "date": d.isoformat(),
                "income": round(inc_v, 2),
                "expense": round(exp_v, 2),
                "transfer_in": round(tin_v, 2),
                "transfer_out": round(tout_v, 2),
                "net": round(inc_v - exp_v, 2),
            }
        )

    month_totals = {
        "total_income": round(mt_inc, 2),
        "total_expense": round(mt_exp, 2),
        "total_transfer_in": round(mt_tin, 2),
        "total_transfer_out": round(mt_tout, 2),
        "net_income_minus_expense": round(mt_inc - mt_exp, 2),
    }

    return {
        "sheet": sheet_resolved,
        "year": year,
        "month": month,
        "period_column": period_col,
        "amount_column": amt_col,
        "income_expense_column": ie_col,
        "month_totals": month_totals,
        "days": days,
    }


@router.get("/api/calendar/year")
def calendar_year(
    year: int,
    sheet_name: str | None = Query(default=None, description="Omit to use the default sheet from the database"),
    extra_filters: str | None = Query(
        default=None,
        description="Optional JSON array of filters applied before calendar logic",
    ),
    tz_offset_minutes: int | None = _TZ_OFFSET_Q,
    currency_main: str | None = Query(default=None),
    currency_rates: str | None = Query(default=None),
) -> dict[str, Any]:
    """Income / expense / transfer totals for the full calendar year."""
    if year < 1900 or year > 2100:
        raise HTTPException(status_code=400, detail="year must be between 1900 and 2100")
    frames = load_workbook()
    ef = parse_extra_filters_json(extra_filters)
    raw, sheet_resolved = calendar_raw_df(frames, sheet_name, ef)
    conv = _parse_currency_conversion(currency_main, currency_rates)
    df, period_col, amt_col, ie_col = prepare_calendar_frame(
        raw, tz_offset_minutes=tz_offset_minutes, currency_conversion=conv
    )

    start_d = dt.date(year, 1, 1)
    end_d = dt.date(year, 12, 31)

    sub = df[(df["_d"] >= start_d) & (df["_d"] <= end_d) & df["_d"].notna()]
    if len(sub) == 0:
        yt_inc = yt_exp = yt_tin = yt_tout = 0.0
    else:
        yt_inc = float(sub["_income"].sum())
        yt_exp = float(sub["_expense"].sum())
        yt_tin = float(sub["_transfer_in"].sum())
        yt_tout = float(sub["_transfer_out"].sum())

    year_totals = {
        "total_income": round(yt_inc, 2),
        "total_expense": round(yt_exp, 2),
        "total_transfer_in": round(yt_tin, 2),
        "total_transfer_out": round(yt_tout, 2),
        "net_income_minus_expense": round(yt_inc - yt_exp, 2),
    }

    return {
        "sheet": sheet_resolved,
        "year": year,
        "period_column": period_col,
        "amount_column": amt_col,
        "income_expense_column": ie_col,
        "year_totals": year_totals,
    }


@router.get("/api/calendar/category-breakdown")
def calendar_category_breakdown(
    year: int,
    month: int | None = Query(
        default=None,
        description="Calendar month 1–12; omit to aggregate the full calendar year",
    ),
    sheet_name: str | None = Query(default=None, description="Omit to use the default sheet from the database"),
    extra_filters: str | None = Query(
        default=None,
        description="Optional JSON array of filters applied before calendar logic",
    ),
    tz_offset_minutes: int | None = _TZ_OFFSET_Q,
    currency_main: str | None = Query(default=None),
    currency_rates: str | None = Query(default=None),
) -> dict[str, Any]:
    """
    Sum of expense and income amounts grouped by Category for the month or full year.
    Uses the same income/expense/transfer split as other calendar endpoints.
    """
    if year < 1900 or year > 2100:
        raise HTTPException(status_code=400, detail="year must be between 1900 and 2100")
    if month is not None and (month < 1 or month > 12):
        raise HTTPException(status_code=400, detail="month must be 1–12")

    frames = load_workbook()
    ef = parse_extra_filters_json(extra_filters)
    raw, sheet_resolved = calendar_raw_df(frames, sheet_name, ef)
    conv = _parse_currency_conversion(currency_main, currency_rates)
    df, period_col, amt_col, ie_col = prepare_calendar_frame(
        raw, tz_offset_minutes=tz_offset_minutes, currency_conversion=conv
    )

    if month is not None:
        _, last_day = calendar.monthrange(year, month)
        start_d = dt.date(year, month, 1)
        end_d = dt.date(year, month, last_day)
        scope = "month"
    else:
        start_d = dt.date(year, 1, 1)
        end_d = dt.date(year, 12, 31)
        scope = "year"

    sub = df[(df["_d"] >= start_d) & (df["_d"] <= end_d) & df["_d"].notna()].copy()
    cat_col = "Category" if "Category" in sub.columns else None
    raw_total_expense = float(sub["_expense"].sum()) if len(sub) else 0.0
    raw_total_income = float(sub["_income"].sum()) if len(sub) else 0.0

    if cat_col is None or len(sub) == 0:
        return {
            "sheet": sheet_resolved,
            "scope": scope,
            "year": year,
            "month": month,
            "period_column": period_col,
            "amount_column": amt_col,
            "category_column": cat_col,
            "slices": [],
            "total_expense": round(raw_total_expense, 2),
            "income_slices": [],
            "total_income": round(raw_total_income, 2),
        }

    expense_slices, expense_total = _category_amount_slices(sub, cat_col, "_expense")
    income_slices, income_total = _category_amount_slices(sub, cat_col, "_income")

    return {
        "sheet": sheet_resolved,
        "scope": scope,
        "year": year,
        "month": month,
        "period_column": period_col,
        "amount_column": amt_col,
        "category_column": cat_col,
        "slices": expense_slices,
        "total_expense": expense_total,
        "income_slices": income_slices,
        "total_income": income_total,
    }


@router.get("/api/calendar/month/transactions")
def calendar_month_transactions(
    year: int,
    month: int,
    sort_column: str | None = Query(default=None, description="Column to sort by (default: period column descending)"),
    sort_direction: Literal["asc", "desc"] = Query(default="desc"),
    category: str | None = Query(
        default=None,
        description="If set, only rows with this Category (use (Uncategorized) for blank)",
    ),
    subcategory: str | None = Query(
        default=None,
        description="If set (after category), only rows with this Subcategory (use (Uncategorized) for blank)",
    ),
    flow_filter: Literal["all", "income", "expense"] = Query(
        default="all",
        description="Restrict to income-only or expense-only rows (excludes transfers).",
    ),
    sheet_name: str | None = Query(default=None, description="Omit to use the default sheet from the database"),
    extra_filters: str | None = Query(
        default=None,
        description="Optional JSON array of filters applied before calendar logic",
    ),
    search_all: str | None = Query(
        default=None,
        description="Case-insensitive substring search across all columns (same as /api/analyze search_all)",
    ),
    tz_offset_minutes: int | None = _TZ_OFFSET_Q,
    currency_main: str | None = Query(default=None),
    currency_rates: str | None = Query(default=None),
) -> dict[str, Any]:
    """All rows in the month with a Flow column; sortable (includes Note, Amount, etc.)."""
    if subcategory and not (category and str(category).strip()):
        raise HTTPException(
            status_code=400,
            detail="subcategory filter requires category to be set",
        )
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="month must be 1–12")
    frames = load_workbook()
    ef = parse_extra_filters_json(extra_filters)
    raw, sheet_resolved = calendar_raw_df(frames, sheet_name, ef)
    conv = _parse_currency_conversion(currency_main, currency_rates)
    df, period_col, amt_col, ie_col = prepare_calendar_frame(
        raw, tz_offset_minutes=tz_offset_minutes, currency_conversion=conv
    )

    _, last_day = calendar.monthrange(year, month)
    start_d = dt.date(year, month, 1)
    end_d = dt.date(year, month, last_day)

    sub = df[(df["_d"] >= start_d) & (df["_d"] <= end_d) & df["_d"].notna()].copy()
    if flow_filter == "income":
        sub = sub[sub["_income"] > 0].copy()
    elif flow_filter == "expense":
        sub = sub[sub["_expense"] > 0].copy()
    if len(sub) == 0:
        return {
            "sheet": sheet_resolved,
            "year": year,
            "month": month,
            "period_column": period_col,
            "count": 0,
            "columns": [],
            "rows": [],
            "sort_column": sort_column,
            "sort_direction": sort_direction,
        }

    sub["calendar_date"] = pd.to_datetime(sub["_d"]).dt.strftime("%Y-%m-%d")
    sub["Flow"] = flow_classification_series(sub, ie_col, amt_col)
    drop_cols = ["_d", "_income", "_expense", "_transfer_in", "_transfer_out"]
    display = sub.drop(columns=[c for c in drop_cols if c in sub.columns])
    display = _order_calendar_date_after_period(display, period_col)

    cols_no_flow = [c for c in display.columns if c != "Flow"]
    # Match dashboard data preview: Flow sits between Accounts and Category (insert after Accounts).
    if "Accounts" in cols_no_flow:
        acc_idx = cols_no_flow.index("Accounts")
        ordered = cols_no_flow[: acc_idx + 1] + ["Flow"] + cols_no_flow[acc_idx + 1 :]
    elif period_col in cols_no_flow:
        idx = cols_no_flow.index(period_col) + 1
        if idx < len(cols_no_flow) and cols_no_flow[idx] == "calendar_date":
            idx += 1
        ordered = cols_no_flow[:idx] + ["Flow"] + cols_no_flow[idx:]
    else:
        ordered = ["Flow"] + cols_no_flow
    display = display[ordered]

    display = apply_category_filter_to_display(display, category)
    display = apply_subcategory_filter_to_display(display, subcategory)

    q = (search_all or "").strip()
    if q:
        display = apply_search_all(display, q)

    sc = sort_column
    sd = sort_direction
    if sc and sc not in display.columns:
        raise HTTPException(status_code=400, detail=f"Unknown sort column: {sc}")
    if not sc or not str(sc).strip():
        sc = period_col if period_col in display.columns else str(display.columns[0])
    ascending = sd == "asc"
    if sc == period_col and period_col in display.columns:
        display = _sort_by_period_then_id(display, period_col, ascending=ascending)
    else:
        display = display.sort_values(by=sc, ascending=ascending, na_position="last")

    return {
        "sheet": sheet_resolved,
        "year": year,
        "month": month,
        "period_column": period_col,
        "count": int(len(display)),
        "columns": [str(c) for c in display.columns],
        "rows": df_records(display),
        "sort_column": sc,
        "sort_direction": sd,
    }


@router.get("/api/calendar/year/transactions")
def calendar_year_transactions(
    year: int,
    sort_column: str | None = Query(default=None, description="Column to sort by (default: period column descending)"),
    sort_direction: Literal["asc", "desc"] = Query(default="desc"),
    category: str | None = Query(
        default=None,
        description="If set, only rows with this Category (use (Uncategorized) for blank)",
    ),
    subcategory: str | None = Query(
        default=None,
        description="If set (after category), only rows with this Subcategory (use (Uncategorized) for blank)",
    ),
    flow_filter: Literal["all", "income", "expense"] = Query(
        default="all",
        description="Restrict to income-only or expense-only rows (excludes transfers).",
    ),
    sheet_name: str | None = Query(default=None, description="Omit to use the default sheet from the database"),
    extra_filters: str | None = Query(
        default=None,
        description="Optional JSON array of filters applied before calendar logic",
    ),
    search_all: str | None = Query(
        default=None,
        description="Case-insensitive substring search across all columns (same as /api/calendar/month/transactions)",
    ),
    tz_offset_minutes: int | None = _TZ_OFFSET_Q,
    currency_main: str | None = Query(default=None),
    currency_rates: str | None = Query(default=None),
) -> dict[str, Any]:
    """All rows in the calendar year (Jan 1–Dec 31) with a Flow column; sortable."""
    if subcategory and not (category and str(category).strip()):
        raise HTTPException(
            status_code=400,
            detail="subcategory filter requires category to be set",
        )
    if year < 1900 or year > 2100:
        raise HTTPException(status_code=400, detail="year must be between 1900 and 2100")
    frames = load_workbook()
    ef = parse_extra_filters_json(extra_filters)
    raw, sheet_resolved = calendar_raw_df(frames, sheet_name, ef)
    conv = _parse_currency_conversion(currency_main, currency_rates)
    df, period_col, amt_col, ie_col = prepare_calendar_frame(
        raw, tz_offset_minutes=tz_offset_minutes, currency_conversion=conv
    )

    start_d = dt.date(year, 1, 1)
    end_d = dt.date(year, 12, 31)

    sub = df[(df["_d"] >= start_d) & (df["_d"] <= end_d) & df["_d"].notna()].copy()
    if flow_filter == "income":
        sub = sub[sub["_income"] > 0].copy()
    elif flow_filter == "expense":
        sub = sub[sub["_expense"] > 0].copy()
    if len(sub) == 0:
        return {
            "sheet": sheet_resolved,
            "year": year,
            "period_column": period_col,
            "count": 0,
            "columns": [],
            "rows": [],
            "sort_column": sort_column,
            "sort_direction": sort_direction,
        }

    sub["calendar_date"] = pd.to_datetime(sub["_d"]).dt.strftime("%Y-%m-%d")
    sub["Flow"] = flow_classification_series(sub, ie_col, amt_col)
    drop_cols = ["_d", "_income", "_expense", "_transfer_in", "_transfer_out"]
    display = sub.drop(columns=[c for c in drop_cols if c in sub.columns])
    display = _order_calendar_date_after_period(display, period_col)

    cols_no_flow = [c for c in display.columns if c != "Flow"]
    if "Accounts" in cols_no_flow:
        acc_idx = cols_no_flow.index("Accounts")
        ordered = cols_no_flow[: acc_idx + 1] + ["Flow"] + cols_no_flow[acc_idx + 1 :]
    elif period_col in cols_no_flow:
        idx = cols_no_flow.index(period_col) + 1
        if idx < len(cols_no_flow) and cols_no_flow[idx] == "calendar_date":
            idx += 1
        ordered = cols_no_flow[:idx] + ["Flow"] + cols_no_flow[idx:]
    else:
        ordered = ["Flow"] + cols_no_flow
    display = display[ordered]

    display = apply_category_filter_to_display(display, category)
    display = apply_subcategory_filter_to_display(display, subcategory)

    q = (search_all or "").strip()
    if q:
        display = apply_search_all(display, q)

    sc = sort_column
    sd = sort_direction
    if sc and sc not in display.columns:
        raise HTTPException(status_code=400, detail=f"Unknown sort column: {sc}")
    if not sc or not str(sc).strip():
        sc = period_col if period_col in display.columns else str(display.columns[0])
    ascending = sd == "asc"
    if sc == period_col and period_col in display.columns:
        display = _sort_by_period_then_id(display, period_col, ascending=ascending)
    else:
        display = display.sort_values(by=sc, ascending=ascending, na_position="last")

    return {
        "sheet": sheet_resolved,
        "year": year,
        "period_column": period_col,
        "count": int(len(display)),
        "columns": [str(c) for c in display.columns],
        "rows": df_records(display),
        "sort_column": sc,
        "sort_direction": sd,
    }


@router.get("/api/calendar/day")
def calendar_day(
    date: str,
    sheet_name: str | None = Query(default=None, description="Omit to use the default sheet from the database"),
    extra_filters: str | None = Query(
        default=None,
        description="Optional JSON array of filters applied before calendar logic",
    ),
    tz_offset_minutes: int | None = _TZ_OFFSET_Q,
    currency_main: str | None = Query(default=None),
    currency_rates: str | None = Query(default=None),
) -> dict[str, Any]:
    """Transactions for one calendar day, ordered by period column (newest first)."""
    try:
        target = dt.date.fromisoformat(date)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date: {date}") from e

    frames = load_workbook()
    ef = parse_extra_filters_json(extra_filters)
    raw, sheet_resolved = calendar_raw_df(frames, sheet_name, ef)
    conv = _parse_currency_conversion(currency_main, currency_rates)
    df, period_col, amt_col, ie_col = prepare_calendar_frame(
        raw, tz_offset_minutes=tz_offset_minutes, currency_conversion=conv
    )

    day_df = df[df["_d"] == target].copy()
    if len(day_df) > 0:
        day_df["calendar_date"] = pd.to_datetime(day_df["_d"]).dt.strftime("%Y-%m-%d")
        day_df["Flow"] = flow_classification_series(day_df, ie_col, amt_col)
    drop_cols = ["_d", "_income", "_expense", "_transfer_in", "_transfer_out"]
    display_df = day_df.drop(columns=[c for c in drop_cols if c in day_df.columns])
    if len(day_df) > 0 and period_col in display_df.columns:
        display_df = _order_calendar_date_after_period(display_df, period_col)
        cols_no_flow = [c for c in display_df.columns if c != "Flow"]
        if "Accounts" in cols_no_flow:
            acc_idx = cols_no_flow.index("Accounts")
            ordered = cols_no_flow[: acc_idx + 1] + ["Flow"] + cols_no_flow[acc_idx + 1 :]
        elif period_col in cols_no_flow:
            idx = cols_no_flow.index(period_col) + 1
            if idx < len(cols_no_flow) and cols_no_flow[idx] == "calendar_date":
                idx += 1
            ordered = cols_no_flow[:idx] + ["Flow"] + cols_no_flow[idx:]
        else:
            ordered = ["Flow"] + cols_no_flow
        display_df = display_df[ordered]

    if period_col in display_df.columns:
        display_df = _sort_by_period_then_id(
            display_df, period_col, ascending=False
        )

    rows_records = df_records(display_df)

    total_income = float(day_df["_income"].sum())
    total_expense = float(day_df["_expense"].sum())
    total_transfer_in = float(day_df["_transfer_in"].sum())
    total_transfer_out = float(day_df["_transfer_out"].sum())

    return {
        "sheet": sheet_resolved,
        "date": target.isoformat(),
        "period_column": period_col,
        "columns": [str(c) for c in display_df.columns],
        "rows": rows_records,
        "total_income": round(total_income, 2),
        "total_expense": round(total_expense, 2),
        "total_transfer_in": round(total_transfer_in, 2),
        "total_transfer_out": round(total_transfer_out, 2),
        "net": round(total_income - total_expense, 2),
    }
