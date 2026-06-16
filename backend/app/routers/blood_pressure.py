"""Blood-pressure reading endpoints (systolic / diastolic / pulse, timestamped)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import require_db
from app.schemas.blood_pressure import BloodPressureCreate
from db import (
    delete_blood_pressure,
    insert_blood_pressure,
    list_blood_pressures,
    update_blood_pressure,
)

router = APIRouter(tags=["blood_pressure"], dependencies=[Depends(require_db)])


def _serialize(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    v = out.get("created_at")
    if hasattr(v, "isoformat"):
        out["created_at"] = v.isoformat()
    return out


def _clean_notes(notes: str | None) -> str | None:
    if notes is None:
        return None
    trimmed = notes.strip()
    return trimmed or None


@router.get("/api/blood-pressure")
def blood_pressure_list(
    limit: int = Query(default=500, ge=1, le=2000),
) -> dict[str, Any]:
    rows = list_blood_pressures(limit=limit)
    return {"readings": [_serialize(r) for r in rows]}


@router.post("/api/blood-pressure")
def blood_pressure_create(body: BloodPressureCreate) -> dict[str, Any]:
    row = insert_blood_pressure(
        body.systolic, body.diastolic, body.pulse, _clean_notes(body.notes)
    )
    return {"reading": _serialize(row)}


@router.put("/api/blood-pressure/{reading_id}")
def blood_pressure_replace(
    reading_id: int, body: BloodPressureCreate
) -> dict[str, Any]:
    row = update_blood_pressure(
        reading_id, body.systolic, body.diastolic, body.pulse, _clean_notes(body.notes)
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Reading not found.")
    return {"reading": _serialize(row)}


@router.delete("/api/blood-pressure/{reading_id}")
def blood_pressure_remove(reading_id: int) -> dict[str, Any]:
    if not delete_blood_pressure(reading_id):
        raise HTTPException(status_code=404, detail="Reading not found.")
    return {"ok": True}
