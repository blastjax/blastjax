"""Post due recurring rules into budget_data."""
from __future__ import annotations

import calendar
import datetime as dt
from typing import Any

from db import (
    insert_budget_transaction,
    list_recurring_rules,
    update_recurring_rule,
)

def post_due_recurring_inner() -> list[dict[str, Any]]:
    """Insert budget rows for active rules missing the current period (month / week / quarter / year)."""
    today = dt.datetime.now(dt.timezone.utc).date()
    posted: list[dict[str, Any]] = []

    def push_post(
        r: dict[str, Any],
        rid: int,
        ie: str,
        desc: str,
        period: dt.datetime,
        key: str,
    ) -> None:
        tid = insert_budget_transaction(
            period=period,
            accounts=r.get("accounts"),
            category=r.get("category"),
            subcategory=r.get("subcategory"),
            note=r.get("note"),
            php=None,
            income_expense=ie,
            description=desc,
            amount=float(r["amount"]),
            currency=r.get("currency"),
        )
        update_recurring_rule(rid, {"last_posted_period": key})
        posted.append(
            {"rule_id": rid, "transaction_id": tid, "period_key": key},
        )

    for r in list_recurring_rules():
        if not r.get("is_active"):
            continue
        rid = int(r["id"])
        ie = "Income" if r["kind"] == "income" else "Expense"
        last = r.get("last_posted_period")
        desc = (r.get("description") or "").strip() or f'{r["label"]} (repeat)'
        freq = r["frequency"]

        if freq == "monthly":
            dom = r.get("day_of_month")
            if dom is None:
                continue
            y, m = today.year, today.month
            key = f"{y}-{m:02d}"
            if last == key:
                continue
            _, lastday = calendar.monthrange(y, m)
            d = min(int(dom), lastday)
            period = dt.datetime(y, m, d, 12, 0, 0, tzinfo=dt.timezone.utc)
            push_post(r, rid, ie, desc, period, key)

        elif freq == "weekly":
            wd = r.get("weekday")
            if wd is None:
                continue
            y, w, _ = today.isocalendar()
            key = f"{y}-W{w:02d}"
            if last == key:
                continue
            iso_dow = int(wd) + 1
            due_date = dt.datetime.strptime(
                f"{y}-W{w:02d}-{iso_dow}",
                "%G-W%V-%u",
            ).date()
            period = dt.datetime.combine(
                due_date, dt.time(12, 0), tzinfo=dt.timezone.utc
            )
            push_post(r, rid, ie, desc, period, key)

        elif freq == "quarterly":
            dom = r.get("day_of_month")
            if dom is None:
                continue
            y = today.year
            q = (today.month - 1) // 3 + 1
            key = f"{y}-Q{q}"
            if last == key:
                continue
            m = 3 * (q - 1) + 1
            _, lastday = calendar.monthrange(y, m)
            d = min(int(dom), lastday)
            period = dt.datetime(y, m, d, 12, 0, 0, tzinfo=dt.timezone.utc)
            push_post(r, rid, ie, desc, period, key)

        elif freq == "yearly":
            dom = r.get("day_of_month")
            moy = r.get("month_of_year")
            if dom is None or moy is None:
                continue
            y = today.year
            key = str(y)
            if last == key:
                continue
            mo = int(moy)
            _, lastday = calendar.monthrange(y, mo)
            d = min(int(dom), lastday)
            period = dt.datetime(y, mo, d, 12, 0, 0, tzinfo=dt.timezone.utc)
            push_post(r, rid, ie, desc, period, key)

    return posted
