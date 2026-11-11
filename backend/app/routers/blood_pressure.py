from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

import cache
from app.deps import found, require_db
from app.schemas.blood_pressure import BloodPressureCreate
from app.schemas.responses import Ok, Reading, Readings
from db import (
    delete_blood_pressure,
    insert_blood_pressure,
    list_blood_pressures,
    update_blood_pressure,
)

router = APIRouter(tags=["blood_pressure"], dependencies=[Depends(require_db)])

_NOT_FOUND = "Reading not found."


@router.get("/api/blood-pressure", response_model=Readings)
def blood_pressure_list(
    limit: int = Query(default=500, ge=1, le=2000),
) -> dict[str, Any]:
    return cache.cached(f"bp:list:{limit}", lambda: {"readings": list_blood_pressures(limit=limit)})


@router.post("/api/blood-pressure", response_model=Reading)
def blood_pressure_create(body: BloodPressureCreate) -> dict[str, Any]:
    return {"reading": insert_blood_pressure(**body.model_dump())}


@router.put("/api/blood-pressure/{reading_id}", response_model=Reading)
def blood_pressure_replace(reading_id: UUID, body: BloodPressureCreate) -> dict[str, Any]:
    return {"reading": found(update_blood_pressure(reading_id, **body.model_dump()), _NOT_FOUND)}


@router.delete("/api/blood-pressure/{reading_id}", response_model=Ok)
def blood_pressure_remove(reading_id: UUID) -> dict[str, Any]:
    if not delete_blood_pressure(reading_id):
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True}
