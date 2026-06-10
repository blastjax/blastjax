"""House payment plan endpoints.

A plan only tracks a name and notes. Individual payments are managed via the
``/entry`` sub-routes (date + amount).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import require_db
from app.schemas.house_payment import (
    HousePaymentCreate,
    HousePaymentEntryCreate,
    HousePaymentEntryUpdate,
)
from app.services.house_payment_service import (
    house_payment_summary,
    serialize_house_payment_entry,
    serialize_house_payment_row,
)
from db import (
    delete_house_payment,
    delete_house_payment_entry,
    fetch_house_payment_with_entries,
    insert_house_payment,
    insert_house_payment_entry,
    list_house_payments,
    update_house_payment,
    update_house_payment_entry,
)

router = APIRouter(tags=["house_payment"], dependencies=[Depends(require_db)])


def _clean_notes(notes: str | None) -> str | None:
    if notes is None:
        return None
    trimmed = notes.strip()
    return trimmed or None


def _serialize_detail(detail: dict[str, Any]) -> dict[str, Any]:
    return {
        "house_payment": serialize_house_payment_row(detail["house_payment"]),
        "entries": [serialize_house_payment_entry(e) for e in detail["entries"]],
    }


@router.get("/api/house-payment")
def house_payment_list(
    limit: int = Query(default=500, ge=1, le=2000),
) -> dict[str, Any]:
    rows = list_house_payments(limit=limit)
    return {
        "house_payments": [serialize_house_payment_row(r) for r in rows],
        "summary": house_payment_summary(rows),
    }


@router.post("/api/house-payment")
def house_payment_create(body: HousePaymentCreate) -> dict[str, Any]:
    row = insert_house_payment(body.name.strip(), _clean_notes(body.notes))
    return serialize_house_payment_row(row)


@router.get("/api/house-payment/{house_payment_id}")
def house_payment_one(house_payment_id: int) -> dict[str, Any]:
    detail = fetch_house_payment_with_entries(house_payment_id)
    if not detail:
        raise HTTPException(status_code=404, detail="House payment not found.")
    return _serialize_detail(detail)


@router.put("/api/house-payment/{house_payment_id}")
def house_payment_replace(
    house_payment_id: int, body: HousePaymentCreate
) -> dict[str, Any]:
    row = update_house_payment(
        house_payment_id, body.name.strip(), _clean_notes(body.notes)
    )
    if row is None:
        raise HTTPException(status_code=404, detail="House payment not found.")
    return serialize_house_payment_row(row)


@router.delete("/api/house-payment/{house_payment_id}")
def house_payment_remove(house_payment_id: int) -> dict[str, Any]:
    if not delete_house_payment(house_payment_id):
        raise HTTPException(status_code=404, detail="House payment not found.")
    return {"ok": True}


@router.post("/api/house-payment/{house_payment_id}/entry")
def house_payment_entry_create(
    house_payment_id: int, body: HousePaymentEntryCreate
) -> dict[str, Any]:
    detail = insert_house_payment_entry(
        house_payment_id, body.paid_on, body.amount
    )
    if detail is None:
        raise HTTPException(status_code=404, detail="House payment not found.")
    return _serialize_detail(detail)


@router.put("/api/house-payment/{house_payment_id}/entry/{entry_id}")
def house_payment_entry_update(
    house_payment_id: int,
    entry_id: int,
    body: HousePaymentEntryUpdate,
) -> dict[str, Any]:
    detail = update_house_payment_entry(
        house_payment_id, entry_id, body.paid_on, body.amount
    )
    if detail is None:
        raise HTTPException(status_code=404, detail="Payment entry not found.")
    return _serialize_detail(detail)


@router.delete("/api/house-payment/{house_payment_id}/entry/{entry_id}")
def house_payment_entry_remove(
    house_payment_id: int, entry_id: int
) -> dict[str, Any]:
    detail = delete_house_payment_entry(house_payment_id, entry_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Payment entry not found.")
    return _serialize_detail(detail)
