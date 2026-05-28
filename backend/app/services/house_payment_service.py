"""Serializers and summary helpers for house-payment plans."""

from __future__ import annotations

from typing import Any


def serialize_house_payment_row(r: dict[str, Any]) -> dict[str, Any]:
    out = dict(r)
    for key in ("created_at", "last_paid_on"):
        v = out.get(key)
        if hasattr(v, "isoformat"):
            out[key] = v.isoformat()
    return out


def serialize_house_payment_entry(r: dict[str, Any]) -> dict[str, Any]:
    out = dict(r)
    for key in ("paid_on", "created_at"):
        v = out.get(key)
        if hasattr(v, "isoformat"):
            out[key] = v.isoformat()
    return out


def house_payment_summary(rows: list[dict[str, Any]]) -> dict[str, float]:
    """Aggregate across all plans: total paid + total payment count."""
    sum_paid = 0.0
    total_entries = 0
    for r in rows:
        sum_paid += float(r.get("total_paid") or 0)
        total_entries += int(r.get("entry_count") or 0)
    return {
        "sum_total_paid": sum_paid,
        "total_entries": float(total_entries),
        "plan_count": float(len(rows)),
    }
