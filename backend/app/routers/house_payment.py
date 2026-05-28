"""House payment plan endpoints.

A plan only tracks a name and notes. Individual payments are managed via the
``/entry`` sub-routes (date + amount).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

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
    database_url,
    delete_house_payment,
    delete_house_payment_entry,
    fetch_house_payment_with_entries,
    insert_house_payment,
    insert_house_payment_entry,
    list_house_payments,
    update_house_payment,
    update_house_payment_entry,
)

router = APIRouter(tags=["house_payment"])


def _clean_notes(notes: str | None) -> str | None:
    if notes is None:
        return None
    trimmed = notes.strip()
    return trimmed or None


@router.get("/api/house-payment")
def house_payment_list(
    limit: int = Query(default=500, ge=1, le=2000),
) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    rows = list_house_payments(limit=limit)
    return {
        "house_payments": [serialize_house_payment_row(r) for r in rows],
        "summary": house_payment_summary(rows),
    }


@router.post("/api/house-payment")
def house_payment_create(body: HousePaymentCreate) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    hid = insert_house_payment(body.name.strip(), _clean_notes(body.notes))
    return {"id": hid}


@router.get("/api/house-payment/{house_payment_id}")
def house_payment_one(house_payment_id: int) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    detail = fetch_house_payment_with_entries(house_payment_id)
    if not detail:
        raise HTTPException(status_code=404, detail="House payment not found.")
    return {
        "house_payment": serialize_house_payment_row(detail["house_payment"]),
        "entries": [serialize_house_payment_entry(e) for e in detail["entries"]],
    }


@router.put("/api/house-payment/{house_payment_id}")
def house_payment_replace(
    house_payment_id: int, body: HousePaymentCreate
) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    ok = update_house_payment(
        house_payment_id, body.name.strip(), _clean_notes(body.notes)
    )
    if not ok:
        raise HTTPException(status_code=404, detail="House payment not found.")
    return {"id": house_payment_id}


@router.delete("/api/house-payment/{house_payment_id}")
def house_payment_remove(house_payment_id: int) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    if not delete_house_payment(house_payment_id):
        raise HTTPException(status_code=404, detail="House payment not found.")
    return {"ok": True}


@router.post("/api/house-payment/{house_payment_id}/entry")
def house_payment_entry_create(
    house_payment_id: int, body: HousePaymentEntryCreate
) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    entry_id = insert_house_payment_entry(
        house_payment_id, body.paid_on, body.amount
    )
    if entry_id is None:
        raise HTTPException(status_code=404, detail="House payment not found.")
    return {"id": entry_id}


@router.put("/api/house-payment/{house_payment_id}/entry/{entry_id}")
def house_payment_entry_update(
    house_payment_id: int,
    entry_id: int,
    body: HousePaymentEntryUpdate,
) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    ok = update_house_payment_entry(
        house_payment_id, entry_id, body.paid_on, body.amount
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Payment entry not found.")
    return {"id": entry_id}


@router.delete("/api/house-payment/{house_payment_id}/entry/{entry_id}")
def house_payment_entry_remove(
    house_payment_id: int, entry_id: int
) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    if not delete_house_payment_entry(house_payment_id, entry_id):
        raise HTTPException(status_code=404, detail="Payment entry not found.")
    return {"ok": True}
