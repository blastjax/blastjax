"""Installment / loan schedules."""
from __future__ import annotations
from typing import Any
from fastapi import APIRouter, HTTPException, Query

from app.schemas.installment import InstallmentCreate, InstallmentLineUpdate
from app.services.installment_service import installment_summary, serialize_installment_row
from db import (
    database_url,
    delete_installment,
    get_installment,
    insert_installment,
    installment_apply_payment,
    list_installment_lines,
    list_installments,
    update_installment,
    update_installment_line,
)

router = APIRouter(tags=["installment"])

@router.get("/api/installment")
def installment_list(
    limit: int = Query(default=500, ge=1, le=2000),
) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    rows = list_installments(limit=limit)
    serialized = [serialize_installment_row(r) for r in rows]
    return {
        "installments": serialized,
        "summary": installment_summary(rows),
    }


@router.post("/api/installment")
def installment_create(body: InstallmentCreate) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    if body.installment_current > body.installment_total + 1:
        raise HTTPException(
            status_code=400,
            detail="installment_current cannot exceed installment_total + 1.",
        )
    payments_left = body.installment_total - body.installment_current + 1
    if payments_left < 0:
        raise HTTPException(status_code=400, detail="Invalid installment counts.")
    rem = (
        body.remaining
        if body.remaining is not None
        else payments_left * body.payment_total
    )
    orig = (
        body.original_total
        if body.original_total is not None
        else body.installment_total * body.payment_total
    )
    if rem < 0:
        raise HTTPException(status_code=400, detail="remaining cannot be negative.")
    pid = insert_installment(
        body.name.strip(),
        body.installment_current,
        body.installment_total,
        body.principal,
        body.interest,
        body.payment_total,
        body.start_date,
        body.finish_date,
        rem,
        orig,
    )
    return {"id": pid}


@router.get("/api/installment/{installment_id}")
def installment_one(installment_id: int) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    row = get_installment(installment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Installment not found.")
    lines = list_installment_lines(installment_id)
    return {
        "installment": serialize_installment_row(row),
        "lines": lines,
    }


@router.put("/api/installment/{installment_id}/line/{seq}")
def installment_line_update(
    installment_id: int,
    seq: int,
    body: InstallmentLineUpdate,
) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    if seq < 1:
        raise HTTPException(status_code=400, detail="seq must be >= 1.")
    row = get_installment(installment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Installment not found.")
    if seq > int(row.get("installment_total") or 0):
        raise HTTPException(status_code=400, detail="seq exceeds installment total.")
    ok = update_installment_line(
        installment_id,
        seq,
        body.principal,
        body.interest,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Schedule line not found.")
    out = get_installment(installment_id)
    assert out is not None
    return {
        "installment": serialize_installment_row(out),
        "lines": list_installment_lines(installment_id),
    }


@router.put("/api/installment/{installment_id}")
def installment_replace(installment_id: int, body: InstallmentCreate) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    if body.installment_current > body.installment_total + 1:
        raise HTTPException(
            status_code=400,
            detail="installment_current cannot exceed installment_total + 1.",
        )
    payments_left = body.installment_total - body.installment_current + 1
    if payments_left < 0:
        raise HTTPException(status_code=400, detail="Invalid installment counts.")
    rem = (
        body.remaining
        if body.remaining is not None
        else payments_left * body.payment_total
    )
    orig = (
        body.original_total
        if body.original_total is not None
        else body.installment_total * body.payment_total
    )
    if rem < 0:
        raise HTTPException(status_code=400, detail="remaining cannot be negative.")
    ok = update_installment(
        installment_id,
        body.name.strip(),
        body.installment_current,
        body.installment_total,
        body.principal,
        body.interest,
        body.payment_total,
        body.start_date,
        body.finish_date,
        rem,
        orig,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Installment not found.")
    return {"id": installment_id}


@router.delete("/api/installment/{installment_id}")
def installment_remove(installment_id: int) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    if not delete_installment(installment_id):
        raise HTTPException(status_code=404, detail="Installment not found.")
    return {"ok": True}


@router.post("/api/installment/{installment_id}/pay")
def installment_pay(installment_id: int) -> dict[str, Any]:
    """Record one payment: reduces remaining and advances installment_current."""
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    row = installment_apply_payment(installment_id)
    if not row:
        raise HTTPException(
            status_code=400,
            detail="Cannot record payment (not found, already complete, or no balance).",
        )
    return {"installment": serialize_installment_row(row)}
