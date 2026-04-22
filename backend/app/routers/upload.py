"""Excel upload and import into SQLite."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.config import UPLOAD_DIR
from app.workbook_cache import invalidate_cache, resolve_path, set_active_excel_path
from db import database_url, storage_kind, sync_excel_to_db

router = APIRouter(tags=["upload"])


async def save_and_process_upload(file: UploadFile) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(
            status_code=503,
            detail="DATABASE_URL is not set. Configure .env — uploads import into the configured database.",
        )
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Please upload an .xlsx or .xlsm file")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest = UPLOAD_DIR / file.filename
    content = await file.read()
    dest.write_bytes(content)
    set_active_excel_path(dest)
    try:
        r = sync_excel_to_db(resolve_path())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    invalidate_cache()
    return {
        "path": str(resolve_path()),
        "filename": file.filename,
        "source": storage_kind(),
        "inserted": r.inserted,
        "skipped": r.skipped,
        "sheets": r.sheets,
    }


@router.post("/api/upload")
async def upload(file: UploadFile = File(...)) -> dict[str, Any]:
    return await save_and_process_upload(file)


@router.post("/api/import/excel")
async def import_excel(file: UploadFile = File(...)) -> dict[str, Any]:
    """Save Excel to uploads and replace workbook rows in the database with the file contents."""
    return await save_and_process_upload(file)
