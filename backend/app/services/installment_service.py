"""Installment schedule helpers (due-this-month, serialization)."""
from __future__ import annotations

import datetime as dt
from typing import Any


def _coerce_date(v: Any) -> dt.date | None:
    """Coerce DATE/TIMESTAMP/text from the DB into ``date``."""
    if v is None:
        return None
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    if isinstance(v, str):
        s = v.strip()
        if len(s) >= 10:
            try:
                return dt.date.fromisoformat(s[:10])
            except ValueError:
                return None
    return None


def _installment_month_start(d: dt.date) -> dt.date:
    """Schedules use month granularity only; ignore day-of-month."""
    return dt.date(d.year, d.month, 1)


def _installment_add_months(d: dt.date, months: int) -> dt.date:
    d = _installment_month_start(d)
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    return dt.date(y, m, 1)


def _installment_due_this_month(
    start: dt.date,
    current: int,
    total: int,
    today: dt.date | None = None,
) -> bool:
    """Whether the next unpaid installment falls in today's month (CC: due month = start + current)."""
    if current < 1 or current > total:
        return False
    today = today or dt.date.today()
    start = _installment_month_start(start)
    due = _installment_add_months(start, current)
    return due.year == today.year and due.month == today.month


def serialize_installment_row(r: dict[str, Any]) -> dict[str, Any]:
    out = dict(r)
    for key in ("start_date", "finish_date", "created_at"):
        v = out.get(key)
        if hasattr(v, "isoformat"):
            out[key] = v.isoformat()
    return out


def installment_summary(rows: list[dict[str, Any]]) -> dict[str, float]:
    sum_original = 0.0
    sum_remaining = 0.0
    due_month = 0.0
    for r in rows:
        sum_original += float(r.get("original_total") or 0)
        sum_remaining += float(r.get("remaining") or 0)
        start = _coerce_date(r.get("start_date"))
        cur = int(r.get("installment_current") or 0)
        total = int(r.get("installment_total") or 0)
        pay = float(r.get("due_payment") or r.get("payment_total") or 0)
        rem = float(r.get("remaining") or 0)
        if (
            start is not None
            and cur <= total
            and cur >= 1
            and rem > 0
            and _installment_due_this_month(start, cur, total)
        ):
            due_month += pay
    return {
        "sum_original_total": sum_original,
        "sum_remaining": sum_remaining,
        "due_this_month": due_month,
    }
