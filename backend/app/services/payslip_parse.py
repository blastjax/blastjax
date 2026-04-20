"""Payslip Excel/JSON parsing helpers."""
from __future__ import annotations

import re
from typing import Any

import numpy as np
import pandas as pd

def _norm_payslip_header(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(s).strip().lower())


_PAYSPLIP_HEADER_MAP: dict[str, str] = {
    "total": "total",
    "commission": "commission",
    "reimbursement": "reimbursement",
    "medicalreimbursement": "medical_reimbursement",
    "others": "others",
    "other": "others",
    "mp2": "mp2",
    "allowances": "allowances",
    "allowance": "allowances",
    "notes": "notes",
    "note": "notes",
    "periodyear": "period_year",
    "payyear": "period_year",
    "periodmonth": "period_month",
    "paymonth": "period_month",
    "periodhalf": "period_half",
    "payhalf": "period_half",
}


def _map_payslip_columns(df: pd.DataFrame) -> dict[str, str]:
    """Original Excel column name -> field name."""
    out: dict[str, str] = {}
    for c in df.columns:
        key = _norm_payslip_header(str(c))
        field = _PAYSPLIP_HEADER_MAP.get(key)
        if field:
            out[str(c)] = field
    return out


def _payslip_parse_half_cell(v: Any) -> int | None:
    if pd.isna(v):
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        x = int(v)
        return x if x in (1, 2) else None
    s = str(v).strip().lower()
    if s in ("1", "first", "1st", "h1"):
        return 1
    if s in ("2", "second", "2nd", "last", "h2"):
        return 2
    return None


def _payslip_parse_period_int(field: str, v: Any) -> int | None:
    if pd.isna(v):
        return None
    try:
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            x = int(v)
        else:
            s = str(v).strip()
            if not s:
                return None
            x = int(float(s))
    except (TypeError, ValueError):
        return None
    if field == "period_year":
        return x if 1900 <= x <= 2200 else None
    if field == "period_month":
        return x if 1 <= x <= 12 else None
    return None


def _payslip_row_dict(row: pd.Series, colmap: dict[str, str]) -> dict[str, Any]:
    rec: dict[str, Any] = {
        "total": None,
        "commission": None,
        "reimbursement": None,
        "medical_reimbursement": None,
        "others": None,
        "mp2": None,
        "allowances": None,
        "period_year": None,
        "period_month": None,
        "period_half": None,
        "notes": None,
    }
    for excel_c, field in colmap.items():
        if excel_c not in row.index:
            continue
        v = row[excel_c]
        if field == "notes":
            if pd.isna(v):
                rec[field] = None
            else:
                s = str(v).strip()
                rec[field] = s if s else None
        elif field == "period_half":
            rec[field] = _payslip_parse_half_cell(v)
        elif field in ("period_year", "period_month"):
            rec[field] = _payslip_parse_period_int(field, v)
        else:
            if pd.isna(v):
                rec[field] = None
            else:
                try:
                    rec[field] = float(v)
                except (TypeError, ValueError):
                    rec[field] = None
    return rec


def _payslip_row_is_empty(rec: dict[str, Any]) -> bool:
    for k in (
        "total",
        "commission",
        "reimbursement",
        "medical_reimbursement",
        "others",
        "mp2",
        "allowances",
    ):
        v = rec.get(k)
        if v is not None and not (isinstance(v, float) and np.isnan(v)):
            return False
    n = rec.get("notes")
    return not (n and str(n).strip())


def _payslip_empty_rec() -> dict[str, Any]:
    return {
        "total": None,
        "commission": None,
        "reimbursement": None,
        "medical_reimbursement": None,
        "others": None,
        "mp2": None,
        "allowances": None,
        "period_year": None,
        "period_month": None,
        "period_half": None,
        "notes": None,
    }


def _payslip_month_number(month_label: str) -> int | None:
    for i, (_, lab) in enumerate(_MONTH_KEYS, start=1):
        if lab == month_label:
            return i
    return None


def _payslip_cell_str(x: Any) -> str:
    if pd.isna(x):
        return ""
    return str(x).strip()


def _payslip_parse_number_cell(x: Any) -> float | None:
    if pd.isna(x):
        return None
    if isinstance(x, (int, float)) and not isinstance(x, bool):
        v = float(x)
        return None if np.isnan(v) else v
    s = str(x).strip().replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


_MONTH_KEYS: list[tuple[str, str]] = [
    ("january", "January"),
    ("february", "February"),
    ("march", "March"),
    ("april", "April"),
    ("may", "May"),
    ("june", "June"),
    ("july", "July"),
    ("august", "August"),
    ("september", "September"),
    ("october", "October"),
    ("november", "November"),
    ("december", "December"),
]


def _payslip_month_label(first_col: str) -> str | None:
    t = first_col.lower().strip()
    if not t:
        return None
    for key, label in _MONTH_KEYS:
        if t == key:
            return label
    for key, label in _MONTH_KEYS:
        if t.startswith(key[:3]) and len(t) <= len(key) + 1:
            return label
    return None


def _payslip_section_from_label(first_col: str) -> str | None:
    """Identify stacked-section title row (first column)."""
    raw = first_col.strip()
    if not raw:
        return None
    tl = raw.lower()
    if re.match(r"^\d{4}$", tl):
        return "total"
    if "yearly" in tl and "total" in tl:
        return "total"
    if tl.startswith("yearly") and "total" in tl:
        return "total"
    if "medical" in tl and "reimburse" in tl:
        return "medical_reimbursement"
    if "reimbursement" in tl and "medical" not in tl:
        return "reimbursement"
    if "commission" in tl:
        return "commission"
    if "allowance" in tl:
        return "allowances"
    if tl == "mp2" or re.match(r"^mp2\b", tl):
        return "mp2"
    if tl == "others" or tl == "other":
        return "others"
    return None


_SECTION_TO_FIELD: dict[str, str] = {
    "total": "total",
    "commission": "commission",
    "reimbursement": "reimbursement",
    "medical_reimbursement": "medical_reimbursement",
    "others": "others",
    "mp2": "mp2",
    "allowances": "allowances",
}

_SECTION_TITLE: dict[str, str] = {
    "total": "Total",
    "commission": "Commission",
    "reimbursement": "Reimbursement",
    "medical_reimbursement": "Medical reimbursement",
    "others": "Others",
    "mp2": "MP2",
    "allowances": "Allowances",
}


def _year_per_column_from_header_row(row: pd.Series) -> list[int | None]:
    """
    Map each column index to a year (1900–2200) for 'years across the top' layouts.
    Repeats the last seen year across empty cells (Excel merged headers).
    """
    n = len(row)
    out: list[int | None] = [None] * n
    fill: int | None = None
    for j in range(1, n):
        s = _payslip_cell_str(row.iloc[j])
        m = re.match(r"^(\d{4})$", s)
        if m:
            y = int(m.group(1))
            if 1900 <= y <= 2200:
                fill = y
                out[j] = y
            else:
                fill = None
                out[j] = None
        elif not s and fill is not None:
            out[j] = fill
        else:
            if s:
                fill = None
            out[j] = None
    return out


def _year_column_blocks(ypc: list[int | None]) -> list[tuple[int, list[int]]]:
    """Group consecutive columns with the same year into (year, [col_ix, ...])."""
    blocks: list[tuple[int, list[int]]] = []
    j = 1
    n = len(ypc)
    while j < n:
        y = ypc[j]
        if y is None:
            j += 1
            continue
        cols = [j]
        j += 1
        while j < n and ypc[j] == y:
            cols.append(j)
            j += 1
        blocks.append((y, cols))
    return blocks


def _find_horizontal_year_header(
    df: pd.DataFrame,
) -> tuple[int, list[tuple[int, list[int]]]] | None:
    """
    First row (within the first few rows) where column 1+ looks like calendar years
    across the sheet — e.g. 2021,2021,2022,2022,… or merged year headers.
    """
    for h in range(min(15, len(df))):
        row = df.iloc[h]
        ypc = _year_per_column_from_header_row(row)
        blocks = _year_column_blocks(ypc)
        ncols = sum(len(c) for _, c in blocks)
        if len(blocks) >= 1 and ncols >= 2:
            return (h, blocks)
    return None


def _parse_payslip_horizontal_year_columns(df: pd.DataFrame) -> list[dict[str, Any]]:
    """
    Parse layout: years as columns (2021…2026), categories stacked vertically,
    each block has January–December rows and two amount columns per year (1st/2nd half).
    Column A holds section titles and month names; row above sections has years.
    """
    found = _find_horizontal_year_header(df)
    if not found:
        return []
    header_row_idx, year_blocks = found
    out: list[dict[str, Any]] = []
    current: str | None = None
    for i in range(header_row_idx + 1, len(df)):
        row = df.iloc[i]
        first = _payslip_cell_str(row.iloc[0])
        if not first:
            continue
        fl = first.lower()
        if fl in ("total", "totals"):
            continue
        sec = _payslip_section_from_label(first)
        if sec is not None:
            current = sec
            continue
        if current is None:
            continue
        month_label = _payslip_month_label(first)
        if month_label is None:
            continue
        month_num = _payslip_month_number(month_label)
        field = _SECTION_TO_FIELD.get(current)
        if not field:
            continue
        sec_name = _SECTION_TITLE.get(current, current)
        for year, col_indices in year_blocks:
            for idx, cj in enumerate(col_indices):
                if cj >= len(row):
                    continue
                val = _payslip_parse_number_cell(row.iloc[cj])
                if val is None:
                    continue
                rec = _payslip_empty_rec()
                rec[field] = val
                rec["period_year"] = year
                rec["period_month"] = month_num
                rec["period_half"] = idx + 1 if len(col_indices) > 1 else None
                period_note = f" · #{idx + 1}" if len(col_indices) > 1 else ""
                rec["notes"] = f"{sec_name} · {month_label}{period_note}"
                out.append(rec)
    return out


def _parse_payslip_vertical_blocks(df: pd.DataFrame) -> list[dict[str, Any]]:
    """
    Parse sample payslip layout: vertical blocks per category (year/total, commission, …),
    rows per month with one or two amount columns (e.g. bi-monthly). Skips section TOTAL rows.
    Year from a 4-digit section title (e.g. 2024); first amount column = 1st half, second = 2nd half.
    """
    out: list[dict[str, Any]] = []
    current: str | None = None
    current_year: int | None = None
    for i in range(len(df)):
        row = df.iloc[i]
        first = _payslip_cell_str(row.iloc[0])
        if not first:
            continue
        fl = first.lower()
        if fl in ("total", "totals"):
            continue
        sec = _payslip_section_from_label(first)
        if sec is not None:
            current = sec
            if re.match(r"^\d{4}$", first.strip()):
                try:
                    y = int(first.strip())
                    if 1900 <= y <= 2200:
                        current_year = y
                except ValueError:
                    pass
            continue
        if current is None:
            continue
        month_label = _payslip_month_label(first)
        if month_label is None:
            continue
        month_num = _payslip_month_number(month_label)
        nums: list[float] = []
        for j in range(1, len(row)):
            v = _payslip_parse_number_cell(row.iloc[j])
            if v is not None:
                nums.append(v)
        if not nums:
            continue
        field = _SECTION_TO_FIELD.get(current)
        if not field:
            continue
        sec_name = _SECTION_TITLE.get(current, current)
        for idx, val in enumerate(nums):
            rec = _payslip_empty_rec()
            rec[field] = val
            rec["period_year"] = current_year
            rec["period_month"] = month_num
            rec["period_half"] = idx + 1 if len(nums) > 1 else None
            period = f" · #{idx + 1}" if len(nums) > 1 else ""
            rec["notes"] = f"{sec_name} · {month_label}{period}"
            out.append(rec)
    return out


def _payslip_json_section_field(section_name: str) -> str | None:
    """Map JSON category key (e.g. Total, Medical_Reimbursement) to payslip column name."""
    k = _norm_payslip_header(str(section_name))
    return _PAYSPLIP_HEADER_MAP.get(k)


def _payslip_json_cell_half(raw: Any, half_idx: int, *, two_rows: bool) -> float | None:
    """
    Value for one half-row. Arrays [a,b] -> a or b by index.
    Single scalar or one-element list splits evenly across two half-rows when two_rows.
    """
    if raw is None:
        return None
    if isinstance(raw, list):
        if len(raw) >= 2:
            return _payslip_parse_number_cell(raw[half_idx])
        if len(raw) == 1:
            v = _payslip_parse_number_cell(raw[0])
            if two_rows and v is not None:
                return round(v / 2.0, 2)
            return v
        return None
    v = _payslip_parse_number_cell(raw)
    if v is None:
        return None
    if two_rows:
        return round(v / 2.0, 2)
    return v


def _payslip_json_cell_whole(raw: Any) -> float | None:
    """Single DB row for the month: pair arrays sum to one value; scalars as-is."""
    if raw is None:
        return None
    if isinstance(raw, list):
        if len(raw) >= 2:
            a = _payslip_parse_number_cell(raw[0])
            b = _payslip_parse_number_cell(raw[1])
            if a is None and b is None:
                return None
            if a is None:
                return b
            if b is None:
                return a
            return round(float(a) + float(b), 2)
        if len(raw) == 1:
            return _payslip_parse_number_cell(raw[0])
        return None
    return _payslip_parse_number_cell(raw)


def _payslip_json_month_has_pair_arrays(year_data: dict[str, Any], month: str) -> bool:
    """True if any section has a two-element array for this month (1st / 2nd half)."""
    for _sec, sec_obj in year_data.items():
        if not isinstance(sec_obj, dict):
            continue
        raw = sec_obj.get(month)
        if isinstance(raw, list) and len(raw) >= 2:
            return True
    return False


def _payslip_records_from_nested_json(data: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Nested shape: { "2024": { "Total": { "January": [a,b], ... }, "Commission": { ... }, ... }, ... }
    Two-element arrays are 1st half / 2nd half. Single numbers split evenly across two rows when
    the month has any pair-array; otherwise one row (pair values summed when stored whole-month).
    """
    out: list[dict[str, Any]] = []
    for year_str, year_obj in data.items():
        if not isinstance(year_obj, dict):
            continue
        try:
            year = int(str(year_str).strip())
        except (TypeError, ValueError):
            continue
        if year < 1900 or year > 2200:
            continue

        months: set[str] = set()
        for _sec, sec_obj in year_obj.items():
            if isinstance(sec_obj, dict):
                months |= set(sec_obj.keys())

        for month_label in sorted(months, key=lambda m: _payslip_month_number(m) or 0):
            mnum = _payslip_month_number(month_label)
            if mnum is None:
                continue
            two = _payslip_json_month_has_pair_arrays(year_obj, month_label)

            fields = (
                "total",
                "commission",
                "reimbursement",
                "medical_reimbursement",
                "others",
                "mp2",
                "allowances",
            )

            def fill_rec(half: int | None, hi: int) -> dict[str, Any]:
                rec = _payslip_empty_rec()
                rec["period_year"] = year
                rec["period_month"] = mnum
                rec["period_half"] = half
                for sec_name, sec_obj in year_obj.items():
                    fld = _payslip_json_section_field(sec_name)
                    if fld is None or fld not in fields:
                        continue
                    if not isinstance(sec_obj, dict):
                        continue
                    raw = sec_obj.get(month_label)
                    if half is not None:
                        v = _payslip_json_cell_half(raw, hi, two_rows=two)
                    else:
                        v = _payslip_json_cell_whole(raw)
                    rec[fld] = v
                return rec

            if two:
                for hi, half in enumerate((1, 2)):
                    rec = fill_rec(half, hi)
                    if not _payslip_row_is_empty(rec):
                        out.append(rec)
            else:
                rec = fill_rec(None, 0)
                if not _payslip_row_is_empty(rec):
                    out.append(rec)

    return out
