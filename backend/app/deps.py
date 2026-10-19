from __future__ import annotations

from fastapi import HTTPException, Request, UploadFile

from app.security import login_required, session_is_valid
from db import database_url

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024
_IMAGE_TYPES = {b"\x89PNG\r\n\x1a\n": "image/png", b"\xff\xd8\xff": "image/jpeg"}


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


def image_type(data: bytes) -> str | None:
    return next((kind for magic, kind in _IMAGE_TYPES.items() if data.startswith(magic)), None)


async def read_upload(file: UploadFile, images: bool = False) -> bytes:
    """A PDF, or with images=True also a PNG or JPEG photo, of at most 10 MB."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The file exceeds the 10 MB limit.")
    if images and image_type(data):
        return data
    content_type = (file.content_type or "").lower()
    if content_type not in ("application/pdf", "application/x-pdf") and not data.startswith(b"%PDF"):
        accepted = "PDF, PNG or JPG files" if images else "PDF files"
        raise HTTPException(status_code=400, detail=f"Only {accepted} are accepted.")
    return data
