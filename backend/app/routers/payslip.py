"""Payslip CRUD, Excel upload, and JSON import."""

from __future__ import annotations

import io
from typing import Any

import pandas as pd
from fastapi import APIRouter, Body, File, HTTPException, Query, UploadFile

from app.schemas.payslip import PayslipCreate
from app.services.payslip_parse import (
    _map_payslip_columns,
    _parse_payslip_horizontal_year_columns,
    _parse_payslip_vertical_blocks,
    _payslip_records_from_nested_json,
    _payslip_row_dict,
    _payslip_row_is_empty,
)
from db import (
    database_url,
    delete_payslip,
    get_payslip,
    insert_payslip,
    list_payslips,
    update_payslip,
)

router = APIRouter(tags=["payslip"])


def _rec_pag_ibig(rec: dict[str, Any]) -> Any:
    """Prefer pag_ibig; accept legacy employee_hdmf from imports."""
    if "pag_ibig" in rec:
        return rec["pag_ibig"]
    return rec.get("employee_hdmf")


@router.get("/api/payslip")
def payslip_list(
    limit: int = Query(default=1000, ge=1, le=2000),
) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(
            status_code=503,
            detail="DATABASE_URL is not set.",
        )
    rows = list_payslips(limit=limit)
    for r in rows:
        ca = r.get("created_at")
        if hasattr(ca, "isoformat"):
            r["created_at"] = ca.isoformat()
    return {"payslips": rows}


@router.post("/api/payslip")
def payslip_create(body: PayslipCreate) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    pid = insert_payslip(
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
    return {"id": pid}


@router.post("/api/payslip/upload")
async def payslip_upload(file: UploadFile = File(...)) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(
            status_code=400,
            detail="Please upload an .xlsx or .xlsm file",
        )
    content = await file.read()
    bio = io.BytesIO(content)
    try:
        df_wide = pd.read_excel(bio, header=0)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read Excel: {e}") from e
    if df_wide.empty or len(df_wide.columns) == 0:
        raise HTTPException(status_code=400, detail="Excel sheet is empty")

    colmap = _map_payslip_columns(df_wide)
    ids: list[int] = []

    def _insert_rec(rec: dict[str, Any]) -> None:
        nonlocal ids
        pid = insert_payslip(
            rec["total"],
            rec["commission"],
            rec["reimbursement"],
            rec["medical_reimbursement"],
            rec["others"],
            rec["mp2"],
            rec["allowances"],
            rec.get("thirteenth_month"),
            rec.get("basic_salary"),
            rec["period_year"],
            rec["period_month"],
            rec["period_half"],
            rec["notes"],
            rec.get("withholding_tax"),
            rec.get("sss_contribution"),
            rec.get("philhealth"),
            _rec_pag_ibig(rec),
        )
        ids.append(pid)

    if colmap:
        for _, row in df_wide.iterrows():
            rec = _payslip_row_dict(row, colmap)
            if _payslip_row_is_empty(rec):
                continue
            _insert_rec(rec)
    else:
        bio.seek(0)
        df_raw = pd.read_excel(bio, header=None)
        if df_raw.empty or len(df_raw.columns) == 0:
            raise HTTPException(status_code=400, detail="Excel sheet is empty")
        horizontal = _parse_payslip_horizontal_year_columns(df_raw)
        vertical = (
            [] if horizontal else _parse_payslip_vertical_blocks(df_raw)
        )
        for rec in (horizontal if horizontal else vertical):
            if _payslip_row_is_empty(rec):
                continue
            _insert_rec(rec)

    if not ids:
        raise HTTPException(
            status_code=400,
            detail="No data rows found. Use a header row (Total, Commission, …), or a "
            "tracker with years across the top (2021, 2022, …) and month rows under each "
            "category, or the vertical layout with section titles in column A and amounts "
            "to the right.",
        )
    return {"filename": file.filename, "inserted": len(ids), "ids": ids}


@router.post("/api/payslip/import-json")
def payslip_import_json(body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    """Import nested year → category → month JSON (arrays [1st half, 2nd half])."""
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="JSON root must be an object.")
    recs = _payslip_records_from_nested_json(body)
    ids: list[int] = []
    src = "payslip-import.json"
    for rec in recs:
        pid = insert_payslip(
            rec["total"],
            rec["commission"],
            rec["reimbursement"],
            rec["medical_reimbursement"],
            rec["others"],
            rec["mp2"],
            rec["allowances"],
            rec.get("thirteenth_month"),
            rec.get("basic_salary"),
            rec["period_year"],
            rec["period_month"],
            rec["period_half"],
            rec.get("notes"),
            rec.get("withholding_tax"),
            rec.get("sss_contribution"),
            rec.get("philhealth"),
            _rec_pag_ibig(rec),
        )
        ids.append(pid)
    if not ids:
        raise HTTPException(
            status_code=400,
            detail="No payslip rows were produced. Expected shape: { "
            '"2024": { "Total": { "January": [a, b], ... }, "Commission": { ... }, ... } }',
        )
    return {"filename": src, "inserted": len(ids), "ids": ids}


@router.get("/api/payslip/{payslip_id}")
def payslip_one(payslip_id: int) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    row = get_payslip(payslip_id)
    if not row:
        raise HTTPException(status_code=404, detail="Payslip not found.")
    ca = row.get("created_at")
    if hasattr(ca, "isoformat"):
        row["created_at"] = ca.isoformat()
    return row


@router.put("/api/payslip/{payslip_id}")
def payslip_replace(payslip_id: int, body: PayslipCreate) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    ok = update_payslip(
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
    if not ok:
        raise HTTPException(status_code=404, detail="Payslip not found.")
    return {"id": payslip_id}


@router.delete("/api/payslip/{payslip_id}")
def payslip_remove(payslip_id: int) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
    if not delete_payslip(payslip_id):
        raise HTTPException(status_code=404, detail="Payslip not found.")
    return {"ok": True}
