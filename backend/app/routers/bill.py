from __future__ import annotations

from contextlib import suppress
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool

import cache
from app.deps import image_type, read_upload, require_db
from app.schemas.bill import BillCategoryCreate, BillCreate
from app.services.bill_extract import (
    UnreadablePdf,
    biller_fields,
    fields_from_text,
    image_text,
    learn,
    pdf_text,
    start_after,
)
from db import (
    bill_examples,
    delete_bill,
    delete_bill_category,
    get_bill_pdf,
    insert_bill,
    insert_bill_category,
    last_bill_date_before,
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
        return {"category": insert_bill_category(body.model_dump())}
    except IntegrityError:
        raise HTTPException(status_code=409, detail=_DUPLICATE_CATEGORY)


@router.put("/api/bill-category/{category_id}")
def bill_category_update(category_id: UUID, body: BillCategoryCreate) -> dict[str, Any]:
    try:
        row = update_bill_category(category_id, body.model_dump())
    except IntegrityError:
        raise HTTPException(status_code=409, detail=_DUPLICATE_CATEGORY)
    if row is None:
        raise HTTPException(status_code=404, detail="Category not found.")
    return {"category": row}


@router.delete("/api/bill-category/{category_id}")
def bill_category_remove(category_id: UUID) -> dict[str, Any]:
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
def bill_replace(bill_id: UUID, body: BillCreate) -> dict[str, Any]:
    try:
        row = update_bill(bill_id, body.model_dump())
    except IntegrityError:
        raise HTTPException(status_code=404, detail="Category not found.")
    if row is None:
        raise HTTPException(status_code=404, detail="Bill not found.")
    return {"bill": row}


@router.delete("/api/bill/{bill_id}")
def bill_remove(bill_id: UUID) -> dict[str, Any]:
    if not delete_bill(bill_id):
        raise HTTPException(status_code=404, detail="Bill not found.")
    return {"ok": True}


@router.post("/api/bill/extract")
async def bill_extract(
    file: UploadFile = File(...), category_id: UUID | None = Query(default=None)
) -> dict[str, Any]:
    data = await read_upload(file, images=True)
    try:
        return await run_in_threadpool(_read_bill, data, category_id)
    except UnreadablePdf as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _read_bill(data: bytes, category_id: UUID | None) -> dict[str, Any]:
    """Reads a bill's PDF or photo: by the biller's own layout when it's one this knows, else by what the
    biller's saved bills teach about theirs."""
    text = image_text(data) if image_type(data) else pdf_text(data)
    found = biller_fields(text)
    if found is None:
        examples = []
        for saved, pdf in bill_examples(category_id) if category_id is not None else []:
            if pdf.startswith(b"%PDF"):  # a photo of a bill teaches nothing
                with suppress(UnreadablePdf):
                    examples.append((pdf_text(pdf), saved))
        found = fields_from_text(text, learn(examples))
    if found["period_start"] is None and found["period_end"] is not None and category_id is not None:
        previous = last_bill_date_before(category_id, found["period_end"])
        found["period_start"] = start_after(previous, found["period_end"])
    return {"minimum_due": None, **found}


@router.post("/api/bill/{bill_id}/pdf")
async def bill_upload_pdf(bill_id: UUID, file: UploadFile = File(...)) -> dict[str, Any]:
    if not set_bill_pdf(bill_id, await read_upload(file, images=True)):
        raise HTTPException(status_code=404, detail="Bill not found.")
    return {"ok": True, "has_pdf": True}


@router.get("/api/bill/{bill_id}/pdf")
def bill_get_pdf(bill_id: UUID) -> Response:
    data = get_bill_pdf(bill_id)
    if data is None:
        raise HTTPException(status_code=404, detail="No file attached to this bill.")
    media_type = image_type(data) or "application/pdf"
    extension = media_type.split("/")[1].replace("jpeg", "jpg")
    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="bill-{bill_id}.{extension}"'},
    )
