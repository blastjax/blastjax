"""Installment / loan schedules."""
from __future__ import annotations
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import require_db
from app.schemas.installment import (
    InstallmentCreate,
    InstallmentLineUpdate,
    InstallmentLinesReorder,
)
from app.services.installment_service import (
    installment_summary,
    serialize_installment_row,
)
from db import (
    delete_installment,
    fetch_installment_with_lines,
    get_installment,
    insert_installment,
    installment_apply_payment,
    list_installments,
    list_installments_with_lines,
    reorder_installment_lines,
    update_installment,
    update_installment_line_and_fetch_detail,
)

router = APIRouter(tags=["installment"], dependencies=[Depends(require_db)])


def _serialize_detail(detail: dict[str, Any]) -> dict[str, Any]:
    return {
        "installment": serialize_installment_row(detail["installment"]),
        "lines": detail["lines"],
    }


def _validate_installment_body(body: InstallmentCreate) -> tuple[float, float]:
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
        else float(body.installment_total) * float(body.principal)
    )
    if rem < 0:
        raise HTTPException(status_code=400, detail="remaining cannot be negative.")
    return rem, orig


@router.get("/api/installment")
def installment_list(
    limit: int = Query(default=500, ge=1, le=2000),
) -> dict[str, Any]:
    rows = list_installments(limit=limit)
    return {
        "installments": [serialize_installment_row(r) for r in rows],
        "summary": installment_summary(rows),
    }


@router.get("/api/installment-schedules")
def installment_schedules(
    limit: int = Query(default=500, ge=1, le=2000),
) -> dict[str, Any]:
    """All plans with their schedule lines in one response (payments-by-month view)."""
    items = list_installments_with_lines(limit=limit)
    return {
        "schedules": [
            {
                "installment": serialize_installment_row(it["installment"]),
                "lines": it["lines"],
            }
            for it in items
        ]
    }


@router.post("/api/installment")
def installment_create(body: InstallmentCreate) -> dict[str, Any]:
    rem, orig = _validate_installment_body(body)
    detail = insert_installment(
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
    return _serialize_detail(detail)


@router.get("/api/installment/{installment_id}")
def installment_one(installment_id: int) -> dict[str, Any]:
    detail = fetch_installment_with_lines(installment_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Installment not found.")
    return _serialize_detail(detail)


@router.put("/api/installment/{installment_id}/line/{seq}")
def installment_line_update(
    installment_id: int,
    seq: int,
    body: InstallmentLineUpdate,
) -> dict[str, Any]:
    if seq < 1:
        raise HTTPException(status_code=400, detail="seq must be >= 1.")
    row = get_installment(installment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Installment not found.")
    if seq > int(row.get("installment_total") or 0):
        raise HTTPException(status_code=400, detail="seq exceeds installment total.")
    detail = update_installment_line_and_fetch_detail(
        installment_id,
        seq,
        body.principal,
        body.interest,
    )
    if not detail:
        raise HTTPException(status_code=404, detail="Schedule line not found.")
    return _serialize_detail(detail)


@router.put("/api/installment/{installment_id}/lines/reorder")
def installment_lines_reorder(
    installment_id: int,
    body: InstallmentLinesReorder,
) -> dict[str, Any]:
    """Reorder schedule rows (month order); renumbers ``seq`` and recomputes aggregates."""
    if not get_installment(installment_id):
        raise HTTPException(status_code=404, detail="Installment not found.")
    detail = reorder_installment_lines(installment_id, body.line_ids)
    if not detail:
        raise HTTPException(
            status_code=400,
            detail="line_ids must list every schedule row id for this installment exactly once.",
        )
    return _serialize_detail(detail)


@router.put("/api/installment/{installment_id}")
def installment_replace(installment_id: int, body: InstallmentCreate) -> dict[str, Any]:
    rem, orig = _validate_installment_body(body)
    detail = update_installment(
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
    if detail is None:
        raise HTTPException(status_code=404, detail="Installment not found.")
    return _serialize_detail(detail)


@router.delete("/api/installment/{installment_id}")
def installment_remove(installment_id: int) -> dict[str, Any]:
    if not delete_installment(installment_id):
        raise HTTPException(status_code=404, detail="Installment not found.")
    return {"ok": True}


@router.post("/api/installment/{installment_id}/pay")
def installment_pay(installment_id: int) -> dict[str, Any]:
    """Record one payment: reduces remaining and advances installment_current."""
    row = installment_apply_payment(installment_id)
    if not row:
        raise HTTPException(
            status_code=400,
            detail="Cannot record payment (not found, already complete, or no balance).",
        )
    return {"installment": serialize_installment_row(row)}
