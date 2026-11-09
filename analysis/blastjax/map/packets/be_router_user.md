# Node be:router:user: routers/user.py
Kind: module
Language: python, 60 lines of code, location: backend/app/routers/user.py

Source excerpt: backend/app/routers/user.py (first 78 lines)
```
   1  from __future__ import annotations
   2  
   3  from typing import Any
   4  from uuid import UUID
   5  
   6  from fastapi import APIRouter, Depends, HTTPException
   7  from sqlalchemy.exc import IntegrityError
   8  
   9  from app.deps import require_db
  10  from app.passwords import hash_password, verify_password
  11  from app.schemas.user import AppUserAccessUpdate, AppUserCreate, AppUserUpdate, AppUserVerify
  12  from db import (
  13      delete_app_user,
  14      get_app_user_by_username,
  15      insert_app_user,
  16      list_app_users,
  17      update_app_user,
  18      update_app_user_access,
  19  )
  20  
  21  router = APIRouter(prefix="/api/users", tags=["users"], dependencies=[Depends(require_db)])
  22  
  23  
  24  def _serialize(row: dict[str, Any]) -> dict[str, Any]:
  25      out = dict(row)
  26      v = out.get("created_at")
  27      if hasattr(v, "isoformat"):
  28          out["created_at"] = v.isoformat()
  29      return out
  30  
  31  
  32  @router.get("")
  33  def users_list() -> dict[str, Any]:
  34      return {"users": [_serialize(r) for r in list_app_users()]}
  35  
  36  
  37  @router.post("")
  38  def users_create(body: AppUserCreate) -> dict[str, Any]:
  39      try:
  40          row = insert_app_user(body.username.strip(), hash_password(body.password))
  41      except IntegrityError:
  42          raise HTTPException(status_code=409, detail="That username is already taken.")
  43      return {"user": _serialize(row)}
  44  
  45  
  46  @router.post("/verify")
  47  def users_verify(body: AppUserVerify) -> dict[str, Any]:
  48      row = get_app_user_by_username(body.username.strip())
  49      valid = row is not None and verify_password(body.password, row["password_hash"])
  50      return {"valid": valid}
  51  
  52  
  53  @router.put("/{user_id}")
  54  def users_update(user_id: UUID, body: AppUserUpdate) -> dict[str, Any]:
  55      username = body.username.strip() if body.username is not None else None
  56      password_hash = hash_password(body.password) if body.password is not None else None
  57      try:
  58          row = update_app_user(user_id, username, password_hash)
  59      except IntegrityError:
  60          raise HTTPException(status_code=409, detail="That username is already taken.")
  61      if row is None:
  62          raise HTTPException(status_code=404, detail="User not found.")
  63      return {"user": _serialize(row)}
  64  
  65  
  66  @router.put("/{user_id}/access")
  67  def users_update_access(user_id: UUID, body: AppUserAccessUpdate) -> dict[str, Any]:
  68      row = update_app_user_access(user_id, body.is_superuser, body.allowed_pages)
  69      if row is None:
  70          raise HTTPException(status_code=404, detail="User not found.")
  71      return {"user": _serialize(row)}
  72  
  73  
  74  @router.delete("/{user_id}")
  75  def users_remove(user_id: UUID) -> dict[str, Any]:
  76      if not delete_app_user(user_id):
  77          raise HTTPException(status_code=404, detail="User not found.")
  78      return {"ok": True}
```

## Outgoing connections
- call -> db.py (be:core:db)
- call -> deps.py (be:core:deps)
- call -> passwords.py (be:core:passwords)
- call -> schemas/ (Pydantic) (be:schemas)
- read -> app_user (ds:app_user)
- write -> app_user (ds:app_user)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
- /settings (web:settings) -> dispatch
