"""Payslip CRUD and JSON import."""

from __future__ import annotations

import base64
from typing import Any

from fastapi import (
    APIRouter,
    Body,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
)

import cache
from app.deps import require_db
from app.schemas.payslip import PayslipCreate
from app.services.payslip_parse import _payslip_records_from_nested_json
from db import (
    delete_payslip,
    delete_payslip_pdf,
    get_payslip,
    get_payslip_pdf,
    insert_payslip,
    insert_payslips_bulk,
    list_payslips,
    set_payslip_pdf,
    update_payslip,
)

router = APIRouter(tags=["payslip"], dependencies=[Depends(require_db)])

# Payslip PDFs are single-page statements; cap the upload well below that.
_MAX_PDF_BYTES = 10 * 1024 * 1024


def _serialize_payslip(row: dict[str, Any]) -> dict[str, Any]:
    ca = row.get("created_at")
    if hasattr(ca, "isoformat"):
        row["created_at"] = ca.isoformat()
    return row


@router.get("/api/payslip")
def payslip_list(
    limit: int = Query(default=1000, ge=1, le=2000),
    company: str | None = Query(default=None),
) -> dict[str, Any]:
    key = f"payslip:list:{limit}:{company or ''}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    result = {
        "payslips": [_serialize_payslip(r) for r in list_payslips(limit=limit, company=company)]
    }
    cache.set(key, result)
    return result


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
        company=body.company.strip(),
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
    key = f"payslip:{payslip_id}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    row = get_payslip(payslip_id)
    if not row:
        raise HTTPException(status_code=404, detail="Payslip not found.")
    result = _serialize_payslip(row)
    cache.set(key, result)
    return result


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
        company=body.company.strip(),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Payslip not found.")
    return _serialize_payslip(row)


@router.delete("/api/payslip/{payslip_id}")
def payslip_remove(payslip_id: int) -> dict[str, Any]:
    if not delete_payslip(payslip_id):
        raise HTTPException(status_code=404, detail="Payslip not found.")
    return {"ok": True}


@router.post("/api/payslip/{payslip_id}/pdf")
async def payslip_upload_pdf(
    payslip_id: int,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """Attach (or replace) the one PDF tied to this payslip entry."""
    if get_payslip(payslip_id) is None:
        raise HTTPException(status_code=404, detail="Payslip not found.")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(data) > _MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="PDF exceeds the 10 MB limit.")
    content_type = (file.content_type or "").lower()
    is_pdf = content_type in ("application/pdf", "application/x-pdf") or data.startswith(
        b"%PDF"
    )
    if not is_pdf:
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")
    if not set_payslip_pdf(payslip_id, data):
        raise HTTPException(status_code=404, detail="Payslip not found.")
    return {"ok": True, "has_pdf": True}


@router.get("/api/payslip/{payslip_id}/pdf")
def payslip_get_pdf(payslip_id: int) -> Response:
    """Serve the payslip's PDF inline so the browser can render it."""
    key = f"payslip:pdf:{payslip_id}"
    cached = cache.get(key)
    if cached is not None:
        data = base64.b64decode(cached)
    else:
        data = get_payslip_pdf(payslip_id)
        if data is None:
            raise HTTPException(status_code=404, detail="No PDF attached to this payslip.")
        cache.set(key, base64.b64encode(data).decode("ascii"))
    disposition = f'inline; filename="payslip-{payslip_id}.pdf"'
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": disposition},
    )


@router.delete("/api/payslip/{payslip_id}/pdf")
def payslip_delete_pdf(payslip_id: int) -> dict[str, Any]:
    if not delete_payslip_pdf(payslip_id):
        raise HTTPException(status_code=404, detail="Payslip not found.")
    return {"ok": True, "has_pdf": False}
