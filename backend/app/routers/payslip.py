from __future__ import annotations

import base64
from typing import Any
from uuid import UUID

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
from starlette.concurrency import run_in_threadpool

import cache
from app.deps import found, read_upload, require_db
from app.schemas.payslip import PayslipCreate
from app.schemas.responses import (
    Ok,
    PayslipImport,
    PayslipList,
    PayslipPdfFields,
    PayslipRow,
    PdfState,
)
from app.services.bill_extract import UnreadablePdf, pdf_text
from app.services.payslip_parse import (
    _payslip_records_from_nested_json,
    payslip_from_text,
)
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

_NOT_FOUND = "Payslip not found."


@router.get("/api/payslip", response_model=PayslipList)
def payslip_list(
    limit: int = Query(default=1000, ge=1, le=2000),
    company: str | None = Query(default=None),
) -> dict[str, Any]:
    return cache.cached(
        f"payslip:list:{limit}:{company or ''}",
        lambda: {"payslips": list_payslips(limit=limit, company=company)},
    )


@router.post("/api/payslip", response_model=PayslipRow)
def payslip_create(body: PayslipCreate) -> dict[str, Any]:
    return insert_payslip(**body.model_dump())


@router.post("/api/payslip/import-json", response_model=PayslipImport)
def payslip_import_json(body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    recs = _payslip_records_from_nested_json(body)
    if not recs:
        raise HTTPException(
            status_code=400,
            detail="No payslip rows were produced. Expected shape: { "
            '"2024": { "Total": { "January": [a, b], ... }, "Commission": { ... }, ... } }',
        )
    ids = insert_payslips_bulk(recs)
    return {"filename": "payslip-import.json", "inserted": len(ids), "ids": ids}


@router.post("/api/payslip/extract", response_model=PayslipPdfFields)
async def payslip_extract(file: UploadFile = File(...)) -> dict[str, Any]:
    data = await read_upload(file)
    try:
        found_fields = payslip_from_text(await run_in_threadpool(pdf_text, data))
    except UnreadablePdf as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if found_fields is None:
        raise HTTPException(
            status_code=422,
            detail="This doesn't look like a Sophos payslip from August 2025 on, so nothing could be read from it.",
        )
    return found_fields


@router.get("/api/payslip/{payslip_id}", response_model=PayslipRow)
def payslip_one(payslip_id: UUID) -> dict[str, Any]:
    return cache.cached(f"payslip:{payslip_id}", lambda: found(get_payslip(payslip_id), _NOT_FOUND))


@router.put("/api/payslip/{payslip_id}", response_model=PayslipRow)
def payslip_replace(payslip_id: UUID, body: PayslipCreate) -> dict[str, Any]:
    return found(update_payslip(payslip_id, **body.model_dump()), _NOT_FOUND)


@router.delete("/api/payslip/{payslip_id}", response_model=Ok)
def payslip_remove(payslip_id: UUID) -> dict[str, Any]:
    if not delete_payslip(payslip_id):
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True}


@router.post("/api/payslip/{payslip_id}/pdf", response_model=PdfState)
async def payslip_upload_pdf(
    payslip_id: UUID,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    data = await read_upload(file)
    # In a worker thread: storing a file of up to 10 MB here would hold up every other request.
    if not await run_in_threadpool(set_payslip_pdf, payslip_id, data):
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True, "has_pdf": True}


@router.get("/api/payslip/{payslip_id}/pdf")
def payslip_get_pdf(payslip_id: UUID) -> Response:
    key = f"payslip:pdf:{payslip_id}"
    cached = cache.get(key)
    if cached is not None:
        data = base64.b64decode(cached)
    else:
        data = found(get_payslip_pdf(payslip_id), "No PDF attached to this payslip.")
        cache.set(key, base64.b64encode(data).decode("ascii"))
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="payslip-{payslip_id}.pdf"'},
    )


@router.delete("/api/payslip/{payslip_id}/pdf", response_model=PdfState)
def payslip_delete_pdf(payslip_id: UUID) -> dict[str, Any]:
    if not delete_payslip_pdf(payslip_id):
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True, "has_pdf": False}
