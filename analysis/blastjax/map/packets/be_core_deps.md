# Node be:core:deps: deps.py
Kind: module
Language: python, 32 lines of code, location: backend/app/deps.py

Source excerpt: backend/app/deps.py (first 43 lines)
```
   1  from __future__ import annotations
   2  
   3  from fastapi import HTTPException, Request, UploadFile
   4  
   5  from app.security import login_required, session_is_valid
   6  from db import database_url
   7  
   8  _MAX_UPLOAD_BYTES = 10 * 1024 * 1024
   9  _IMAGE_TYPES = {b"\x89PNG\r\n\x1a\n": "image/png", b"\xff\xd8\xff": "image/jpeg"}
  10  
  11  
  12  def require_db() -> None:
  13      if not database_url():
  14          raise HTTPException(status_code=503, detail="DATABASE_URL is not set.")
  15  
  16  
  17  def require_session(request: Request) -> None:
  18      if not login_required():
  19          return
  20      header = request.headers.get("authorization") or ""
  21      token = header[7:] if header.lower().startswith("bearer ") else ""
  22      if not session_is_valid(token):
  23          raise HTTPException(status_code=401, detail="Login required.")
  24  
  25  
  26  def image_type(data: bytes) -> str | None:
  27      return next((kind for magic, kind in _IMAGE_TYPES.items() if data.startswith(magic)), None)
  28  
  29  
  30  async def read_upload(file: UploadFile, images: bool = False) -> bytes:
  31      """A PDF, or with images=True also a PNG or JPEG photo, of at most 10 MB."""
  32      data = await file.read()
  33      if not data:
  34          raise HTTPException(status_code=400, detail="Uploaded file is empty.")
  35      if len(data) > _MAX_UPLOAD_BYTES:
  36          raise HTTPException(status_code=413, detail="The file exceeds the 10 MB limit.")
  37      if images and image_type(data):
  38          return data
  39      content_type = (file.content_type or "").lower()
  40      if content_type not in ("application/pdf", "application/x-pdf") and not data.startswith(b"%PDF"):
  41          accepted = "PDF, PNG or JPG files" if images else "PDF files"
  42          raise HTTPException(status_code=400, detail=f"Only {accepted} are accepted.")
  43      return data
```

## Outgoing connections
- call -> db.py (be:core:db)
- call -> security.py (be:core:security)

## Incoming connections
- factory.py (be:core:factory) -> call
- test_core.py (be:core:test_core) -> call
- routers/bill.py (be:router:bill) -> call
- routers/blood_pressure.py (be:router:blood_pressure) -> call
- routers/calendar_day_override.py (be:router:calendar_day_override) -> call
- routers/company.py (be:router:company) -> call
- routers/credit_card.py (be:router:credit_card) -> call
- routers/fixed_expense.py (be:router:fixed_expense) -> call
- routers/house_payment.py (be:router:house_payment) -> call
- routers/installment.py (be:router:installment) -> call
- routers/lotto.py (be:router:lotto) -> call
- routers/monthly_expense.py (be:router:monthly_expense) -> call
- routers/pay_period_start_override.py (be:router:pay_period_start_override) -> call
- routers/payslip.py (be:router:payslip) -> call
- routers/payslip_default.py (be:router:payslip_default) -> call
- routers/search.py (be:router:search) -> call
- routers/travel.py (be:router:travel) -> call
- routers/user.py (be:router:user) -> call
