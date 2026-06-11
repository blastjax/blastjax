"""Payslip nested-JSON import parsing helpers (pure Python, no pandas)."""
from __future__ import annotations

import math
import re
from typing import Any


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
    "13thmonth": "thirteenth_month",
    "thirteenthmonth": "thirteenth_month",
    "basicsalary": "basic_salary",
    "notes": "notes",
    "note": "notes",
    "periodyear": "period_year",
    "payyear": "period_year",
    "periodmonth": "period_month",
    "paymonth": "period_month",
    "periodhalf": "period_half",
    "payhalf": "period_half",
}


def _payslip_empty_rec() -> dict[str, Any]:
    return {
        "total": None,
        "commission": None,
        "reimbursement": None,
        "medical_reimbursement": None,
        "others": None,
        "mp2": None,
        "allowances": None,
        "thirteenth_month": None,
        "basic_salary": None,
        "period_year": None,
        "period_month": None,
        "period_half": None,
        "notes": None,
    }


def _payslip_row_is_empty(rec: dict[str, Any]) -> bool:
    for k in (
        "total",
        "commission",
        "reimbursement",
        "medical_reimbursement",
        "others",
        "mp2",
        "allowances",
        "thirteenth_month",
        "basic_salary",
    ):
        v = rec.get(k)
        if v is not None and not (isinstance(v, float) and math.isnan(v)):
            return False
    n = rec.get("notes")
    return not (n and str(n).strip())


def _payslip_parse_number_cell(x: Any) -> float | None:
    if x is None or isinstance(x, bool):
        return None
    if isinstance(x, (int, float)):
        v = float(x)
        return None if math.isnan(v) else v
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


def _payslip_month_number(month_label: str) -> int | None:
    for i, (_, lab) in enumerate(_MONTH_KEYS, start=1):
        if lab == month_label:
            return i
    return None


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
                "thirteenth_month",
                "basic_salary",
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
