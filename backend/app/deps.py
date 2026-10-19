from __future__ import annotations

from fastapi import HTTPException, Request, UploadFile

from app.security import login_required, session_is_valid
from db import database_url

_MAX_PDF_BYTES = 10 * 1024 * 1024


def require_db() -> None:
    if not database_url():
        raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")


def require_session(request: Request) -> None:
    if not login_required():
        return
    header = request.headers.get("authorization") or ""
    token = header[7:] if header.lower().startswith("bearer ") else ""
    if not session_is_valid(token):
        raise HTTPException(status_code=401, detail="Login required.")


async def read_pdf_upload(file: UploadFile) -> bytes:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(data) > _MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="PDF exceeds the 10 MB limit.")
    content_type = (file.content_type or "").lower()
    if content_type not in ("application/pdf", "application/x-pdf") and not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")
    return data
