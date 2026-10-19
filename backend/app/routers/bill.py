from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool

import cache
from app.deps import read_pdf_upload, require_db
from app.schemas.bill import BillCategoryCreate, BillCreate
from app.services.bill_extract import UnreadablePdf, extract_bill_fields
from db import (
    delete_bill,
    delete_bill_category,
    get_bill_pdf,
    insert_bill,
    insert_bill_category,
    list_bills,
    set_bill_pdf,
    update_bill,
    update_bill_category,
)

router = APIRouter(tags=["bill"], dependencies=[Depends(require_db)])

_DUPLICATE_CATEGORY = "That category already exists."


@router.get("/api/bill")
def bill_list() -> dict[str, Any]:
    hit = cache.get("bill:list")
    if hit is not None:
        return hit
    result = list_bills()
    cache.set("bill:list", result)
    return result


@router.post("/api/bill-category")
def bill_category_create(body: BillCategoryCreate) -> dict[str, Any]:
    try:
        return {"category": insert_bill_category(body.name)}
    except IntegrityError:
        raise HTTPException(status_code=409, detail=_DUPLICATE_CATEGORY)


@router.put("/api/bill-category/{category_id}")
def bill_category_update(category_id: int, body: BillCategoryCreate) -> dict[str, Any]:
    try:
        row = update_bill_category(category_id, body.name)
    except IntegrityError:
        raise HTTPException(status_code=409, detail=_DUPLICATE_CATEGORY)
    if row is None:
        raise HTTPException(status_code=404, detail="Category not found.")
    return {"category": row}


@router.delete("/api/bill-category/{category_id}")
def bill_category_remove(category_id: int) -> dict[str, Any]:
    if not delete_bill_category(category_id):
        raise HTTPException(status_code=404, detail="Category not found.")
    return {"ok": True}


@router.post("/api/bill")
def bill_create(body: BillCreate) -> dict[str, Any]:
    try:
        return {"bill": insert_bill(body.model_dump())}
    except IntegrityError:
        raise HTTPException(status_code=404, detail="Category not found.")


@router.put("/api/bill/{bill_id}")
def bill_replace(bill_id: int, body: BillCreate) -> dict[str, Any]:
    try:
        row = update_bill(bill_id, body.model_dump())
    except IntegrityError:
        raise HTTPException(status_code=404, detail="Category not found.")
    if row is None:
        raise HTTPException(status_code=404, detail="Bill not found.")
    return {"bill": row}


@router.delete("/api/bill/{bill_id}")
def bill_remove(bill_id: int) -> dict[str, Any]:
    if not delete_bill(bill_id):
        raise HTTPException(status_code=404, detail="Bill not found.")
    return {"ok": True}


@router.post("/api/bill/extract")
async def bill_extract(file: UploadFile = File(...)) -> dict[str, Any]:
    data = await read_pdf_upload(file)
    try:
        return await run_in_threadpool(extract_bill_fields, data)
    except UnreadablePdf as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/api/bill/{bill_id}/pdf")
async def bill_upload_pdf(bill_id: int, file: UploadFile = File(...)) -> dict[str, Any]:
    if not set_bill_pdf(bill_id, await read_pdf_upload(file)):
        raise HTTPException(status_code=404, detail="Bill not found.")
    return {"ok": True, "has_pdf": True}


@router.get("/api/bill/{bill_id}/pdf")
def bill_get_pdf(bill_id: int) -> Response:
    data = get_bill_pdf(bill_id)
    if data is None:
        raise HTTPException(status_code=404, detail="No PDF attached to this bill.")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="bill-{bill_id}.pdf"'},
    )
