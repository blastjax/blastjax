"""Payslip CRUD and JSON import."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from app.deps import require_db
from app.schemas.payslip import PayslipCreate
from app.services.payslip_parse import _payslip_records_from_nested_json
from db import (
    delete_payslip,
    get_payslip,
    insert_payslip,
    insert_payslips_bulk,
    list_payslips,
    update_payslip,
)

router = APIRouter(tags=["payslip"], dependencies=[Depends(require_db)])


def _serialize_payslip(row: dict[str, Any]) -> dict[str, Any]:
    ca = row.get("created_at")
    if hasattr(ca, "isoformat"):
        row["created_at"] = ca.isoformat()
    return row


@router.get("/api/payslip")
def payslip_list(
    limit: int = Query(default=1000, ge=1, le=2000),
) -> dict[str, Any]:
    return {"payslips": [_serialize_payslip(r) for r in list_payslips(limit=limit)]}


@router.post("/api/payslip")
def payslip_create(body: PayslipCreate) -> dict[str, Any]:
    row = insert_payslip(
        body.total,
        body.commission,
        body.reimbursement,
        body.medical_reimbursement,
        body.others,
        body.mp2,
        body.allowances,
        body.thirteenth_month,
        body.basic_salary,
        body.period_year,
        body.period_month,
        body.period_half,
        body.notes,
        body.withholding_tax,
        body.sss_contribution,
        body.philhealth,
        body.pag_ibig,
    )
    return _serialize_payslip(row)


@router.post("/api/payslip/import-json")
def payslip_import_json(body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    """Import nested year → category → month JSON (arrays [1st half, 2nd half])."""
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="JSON root must be an object.")
    recs = _payslip_records_from_nested_json(body)
    if not recs:
        raise HTTPException(
            status_code=400,
            detail="No payslip rows were produced. Expected shape: { "
            '"2024": { "Total": { "January": [a, b], ... }, "Commission": { ... }, ... } }',
        )
    # One transaction for the whole import: all rows commit together or none do.
    ids = insert_payslips_bulk(recs)
    return {"filename": "payslip-import.json", "inserted": len(ids), "ids": ids}


@router.get("/api/payslip/{payslip_id}")
def payslip_one(payslip_id: int) -> dict[str, Any]:
    row = get_payslip(payslip_id)
    if not row:
        raise HTTPException(status_code=404, detail="Payslip not found.")
    return _serialize_payslip(row)


@router.put("/api/payslip/{payslip_id}")
def payslip_replace(payslip_id: int, body: PayslipCreate) -> dict[str, Any]:
    row = update_payslip(
        payslip_id,
        body.total,
        body.commission,
        body.reimbursement,
        body.medical_reimbursement,
        body.others,
        body.mp2,
        body.allowances,
        body.thirteenth_month,
        body.basic_salary,
        body.period_year,
        body.period_month,
        body.period_half,
        body.notes,
        body.withholding_tax,
        body.sss_contribution,
        body.philhealth,
        body.pag_ibig,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Payslip not found.")
    return _serialize_payslip(row)


@router.delete("/api/payslip/{payslip_id}")
def payslip_remove(payslip_id: int) -> dict[str, Any]:
    if not delete_payslip(payslip_id):
        raise HTTPException(status_code=404, detail="Payslip not found.")
    return {"ok": True}
