from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

import cache
from app.deps import found, require_db
from app.schemas.installment import (
    InstallmentCreate,
    InstallmentLinesBulkUpdate,
    InstallmentLinesReorder,
    InstallmentLineUpdate,
)
from app.schemas.responses import (
    InstallmentDetail,
    InstallmentList,
    InstallmentPaid,
    InstallmentSchedules,
    Ok,
)
from app.services.installment_service import installment_summary
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
    update_installment_lines_bulk,
)

router = APIRouter(tags=["installment"], dependencies=[Depends(require_db)])

_NOT_FOUND = "Installment not found."


def _values(body: InstallmentCreate) -> dict[str, Any]:
    """The body as `db` stores it: the two totals the web may leave out are worked out from the counts."""
    if body.installment_current > body.installment_total + 1:
        raise HTTPException(
            status_code=400,
            detail="installment_current cannot exceed installment_total + 1.",
        )
    payments_left = body.installment_total - body.installment_current + 1
    remaining = body.remaining if body.remaining is not None else payments_left * body.payment_total
    if remaining < 0:
        raise HTTPException(status_code=400, detail="remaining cannot be negative.")
    original_total = (
        body.original_total
        if body.original_total is not None
        else float(body.installment_total) * float(body.principal)
    )
    return body.model_dump() | {"remaining": remaining, "original_total": original_total}


def _total(installment_id: UUID) -> int:
    row = found(get_installment(installment_id), _NOT_FOUND)
    return int(row.get("installment_total") or 0)


@router.get("/api/installment", response_model=InstallmentList)
def installment_list(
    limit: int = Query(default=500, ge=1, le=2000),
) -> dict[str, Any]:
    def load() -> dict[str, Any]:
        rows = list_installments(limit=limit)
        return {"installments": rows, "summary": installment_summary(rows)}

    return cache.cached(f"installment:list:{limit}", load)


@router.get("/api/installment-schedules", response_model=InstallmentSchedules)
def installment_schedules(
    limit: int = Query(default=500, ge=1, le=2000),
) -> dict[str, Any]:
    return cache.cached(
        f"installment:schedules:{limit}",
        lambda: {"schedules": list_installments_with_lines(limit=limit)},
    )


@router.post("/api/installment", response_model=InstallmentDetail)
def installment_create(body: InstallmentCreate) -> dict[str, Any]:
    return insert_installment(**_values(body))


@router.get("/api/installment/{installment_id}", response_model=InstallmentDetail)
def installment_one(installment_id: UUID) -> dict[str, Any]:
    return cache.cached(
        f"installment:{installment_id}",
        lambda: found(fetch_installment_with_lines(installment_id), _NOT_FOUND),
    )


@router.put("/api/installment/{installment_id}/line/{seq}", response_model=InstallmentDetail)
def installment_line_update(
    installment_id: UUID,
    seq: int,
    body: InstallmentLineUpdate,
) -> dict[str, Any]:
    if seq < 1:
        raise HTTPException(status_code=400, detail="seq must be >= 1.")
    if seq > _total(installment_id):
        raise HTTPException(status_code=400, detail="seq exceeds installment total.")
    return found(
        update_installment_line_and_fetch_detail(installment_id, seq, body.principal, body.interest),
        "Schedule line not found.",
    )


@router.put("/api/installment/{installment_id}/lines", response_model=InstallmentDetail)
def installment_lines_bulk_update(
    installment_id: UUID,
    body: InstallmentLinesBulkUpdate,
) -> dict[str, Any]:
    total = _total(installment_id)
    for ln in body.lines:
        if ln.seq > total:
            raise HTTPException(status_code=400, detail=f"seq {ln.seq} exceeds installment total.")
    return found(
        update_installment_lines_bulk(installment_id, [(ln.seq, ln.principal, ln.interest) for ln in body.lines]),
        "Schedule lines not found.",
    )


@router.put("/api/installment/{installment_id}/lines/reorder", response_model=InstallmentDetail)
def installment_lines_reorder(
    installment_id: UUID,
    body: InstallmentLinesReorder,
) -> dict[str, Any]:
    found(get_installment(installment_id), _NOT_FOUND)
    detail = reorder_installment_lines(installment_id, body.line_ids)
    if not detail:
        raise HTTPException(
            status_code=400,
            detail="line_ids must list every schedule row id for this installment exactly once.",
        )
    return detail


@router.put("/api/installment/{installment_id}", response_model=InstallmentDetail)
def installment_replace(installment_id: UUID, body: InstallmentCreate) -> dict[str, Any]:
    return found(update_installment(installment_id, **_values(body)), _NOT_FOUND)


@router.delete("/api/installment/{installment_id}", response_model=Ok)
def installment_remove(installment_id: UUID) -> dict[str, Any]:
    if not delete_installment(installment_id):
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True}


@router.post("/api/installment/{installment_id}/pay", response_model=InstallmentPaid)
def installment_pay(installment_id: UUID) -> dict[str, Any]:
    row = installment_apply_payment(installment_id)
    if not row:
        raise HTTPException(
            status_code=400,
            detail="Cannot record payment (not found, already complete, or no balance).",
        )
    return {"installment": row}
