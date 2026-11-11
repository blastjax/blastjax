from __future__ import annotations

import datetime as dt
from typing import Any


def is_installment_due_this_month(r: dict[str, Any], today: dt.date | None = None) -> bool:
    """Payment number `installment_current` falls due that many months after the month the plan started."""
    start = r.get("start_date")
    current = int(r.get("installment_current") or 0)
    if not start or not 1 <= current <= int(r.get("installment_total") or 0) or float(r.get("remaining") or 0) <= 0:
        return False
    first, today = dt.date.fromisoformat(start[:10]), today or dt.date.today()
    return first.year * 12 + first.month + current == today.year * 12 + today.month


def due_payment(r: dict[str, Any]) -> float:
    """What the next payment costs: its own schedule line when the plan has one."""
    return float(r.get("due_payment") or r.get("payment_total") or 0)


def installment_summary(rows: list[dict[str, Any]]) -> dict[str, float]:
    return {
        "sum_original_total": sum((float(r.get("original_total") or 0) for r in rows), 0.0),
        "sum_remaining": sum((float(r.get("remaining") or 0) for r in rows), 0.0),
        "due_this_month": sum((due_payment(r) for r in rows if is_installment_due_this_month(r)), 0.0),
    }
