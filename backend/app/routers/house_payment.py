from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

import cache
from app.deps import found, require_db
from app.schemas.house_payment import HousePaymentCreate, HousePaymentEntryCreate
from app.schemas.responses import (
    HousePaymentDetail,
    HousePaymentList,
    HousePaymentRow,
    Ok,
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

_NOT_FOUND = "House payment not found."
_NO_ENTRY = "Payment entry not found."


def _summary(rows: list[dict[str, Any]]) -> dict[str, float]:
    return {
        "sum_total_paid": sum((float(r.get("total_paid") or 0) for r in rows), 0.0),
        "total_entries": float(sum(int(r.get("entry_count") or 0) for r in rows)),
        "plan_count": float(len(rows)),
    }


@router.get("/api/house-payment", response_model=HousePaymentList)
def house_payment_list(
    limit: int = Query(default=500, ge=1, le=2000),
) -> dict[str, Any]:
    def load() -> dict[str, Any]:
        rows = list_house_payments(limit=limit)
        return {"house_payments": rows, "summary": _summary(rows)}

    return cache.cached(f"house_payment:list:{limit}", load)


@router.post("/api/house-payment", response_model=HousePaymentRow)
def house_payment_create(body: HousePaymentCreate) -> dict[str, Any]:
    return insert_house_payment(**body.model_dump())


@router.get("/api/house-payment/{house_payment_id}", response_model=HousePaymentDetail)
def house_payment_one(house_payment_id: UUID) -> dict[str, Any]:
    return cache.cached(
        f"house_payment:{house_payment_id}",
        lambda: found(fetch_house_payment_with_entries(house_payment_id), _NOT_FOUND),
    )


@router.put("/api/house-payment/{house_payment_id}", response_model=HousePaymentRow)
def house_payment_replace(house_payment_id: UUID, body: HousePaymentCreate) -> dict[str, Any]:
    return found(update_house_payment(house_payment_id, **body.model_dump()), _NOT_FOUND)


@router.delete("/api/house-payment/{house_payment_id}", response_model=Ok)
def house_payment_remove(house_payment_id: UUID) -> dict[str, Any]:
    if not delete_house_payment(house_payment_id):
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True}


@router.post("/api/house-payment/{house_payment_id}/entry", response_model=HousePaymentDetail)
def house_payment_entry_create(house_payment_id: UUID, body: HousePaymentEntryCreate) -> dict[str, Any]:
    return found(insert_house_payment_entry(house_payment_id, **body.model_dump()), _NOT_FOUND)


@router.put("/api/house-payment/{house_payment_id}/entry/{entry_id}", response_model=HousePaymentDetail)
def house_payment_entry_update(
    house_payment_id: UUID,
    entry_id: UUID,
    body: HousePaymentEntryCreate,
) -> dict[str, Any]:
    return found(update_house_payment_entry(house_payment_id, entry_id, **body.model_dump()), _NO_ENTRY)


@router.delete("/api/house-payment/{house_payment_id}/entry/{entry_id}", response_model=HousePaymentDetail)
def house_payment_entry_remove(house_payment_id: UUID, entry_id: UUID) -> dict[str, Any]:
    return found(delete_house_payment_entry(house_payment_id, entry_id), _NO_ENTRY)
