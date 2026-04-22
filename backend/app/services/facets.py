"""Facet helpers for sheet and workbook column value lists."""
from __future__ import annotations

from typing import Any

import pandas as pd

from db import db_cursor, get_connection

from app.reserved_names import is_reserved_category_label
from app.services.dataframe import column_kind


def filter_reserved_category_facet_items(
    column_name: str, items: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Hide reserved labels (e.g. Accounts) from Category/Subcategory pickers; data preview unchanged."""
    if column_name not in ("Category", "Subcategory"):
        return items
    return [
        d
        for d in items
        if not is_reserved_category_label(
            d.get("value") if isinstance(d.get("value"), str) else str(d.get("value", ""))
        )
    ]

def _merged_column_series(
    frames: dict[str, pd.DataFrame], column_name: str
) -> pd.Series | None:
    parts: list[pd.Series] = []
    for df in frames.values():
        cols = set(df.columns)
        if column_name in cols:
            parts.append(df[column_name])
    if not parts:
        return None
    return pd.concat(parts, ignore_index=True)


def _merge_catalog_into_facet_items(
    column_name: str,
    items: list[dict[str, Any]],
    limit: int,
    sort: str,
    q: str | None,
) -> list[dict[str, Any]]:
    """Include managed catalog names in workbook-wide Category / Subcategory facets."""
    if column_name == "Category":
        sql = "SELECT DISTINCT name FROM category_catalog ORDER BY LOWER(name)"
    elif column_name == "Subcategory":
        sql = "SELECT DISTINCT name FROM subcategory_catalog ORDER BY LOWER(name)"
    else:
        return filter_reserved_category_facet_items(column_name, items[:limit])
    try:
        with get_connection() as conn:
            with db_cursor(conn) as cur:
                cur.execute(sql)
                extra_names = [r[0] for r in cur.fetchall()]
    except Exception:
        return filter_reserved_category_facet_items(column_name, items[:limit])
    qnorm = (q or "").strip().lower()
    seen = {str(d["value"]) for d in items}
    for nm in extra_names:
        if is_reserved_category_label(nm):
            continue
        if qnorm and qnorm not in str(nm).lower():
            continue
        ks = str(nm)
        if ks not in seen:
            seen.add(ks)
            items.append({"value": nm, "count": 0})
    if sort == "alpha":
        items.sort(key=lambda x: str(x["value"]).lower())
    items = filter_reserved_category_facet_items(column_name, items)
    return items[:limit]

def _facet_items_from_vc(vc: pd.Series, limit: int, sort: str) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 500))
    if sort == "alpha":
        keys = sorted(vc.index.tolist(), key=lambda x: str(x).lower())[:limit]
        return [{"value": str(k), "count": int(vc[k])} for k in keys]
    top = vc.head(limit)
    return [{"value": str(idx), "count": int(cnt)} for idx, cnt in top.items()]
