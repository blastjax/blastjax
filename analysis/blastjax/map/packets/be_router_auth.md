# Node be:router:auth: routers/auth.py
Kind: module
Language: python, 199 lines of code, location: backend/app/routers/auth.py

Source excerpt: backend/app/routers/auth.py (first 150 lines)
```
   1  from __future__ import annotations
   2  
   3  from typing import Any
   4  from urllib.parse import urlparse
   5  from uuid import UUID
   6  
   7  from fastapi import APIRouter, HTTPException, Request
   8  from sqlalchemy.exc import IntegrityError
   9  from webauthn import (
  10      generate_authentication_options,
  11      generate_registration_options,
  12      verify_authentication_response,
  13      verify_registration_response,
  14  )
  15  from webauthn.helpers import (
  16      options_to_json_dict,
  17      parse_authentication_credential_json,
  18      parse_client_data_json,
  19      parse_registration_credential_json,
  20  )
  21  from webauthn.helpers.exceptions import WebAuthnException
  22  from webauthn.helpers.structs import (
  23      AuthenticatorSelectionCriteria,
  24      PublicKeyCredentialDescriptor,
  25      ResidentKeyRequirement,
  26      UserVerificationRequirement,
  27  )
  28  
  29  from app.factory import cors_allow_origins
  30  from app.passwords import verify_password
  31  from app.schemas.auth import LoginBody, PasskeyLoginBody, PasskeyRegisterBody
  32  from app.security import (
  33      clear_failed_attempts,
  34      create_session,
  35      login_required,
  36      record_failed_attempt,
  37      remember_passkey_challenge,
  38      revoke_session,
  39      session_user_id,
  40      take_passkey_challenge,
  41      too_many_failed_attempts,
  42  )
  43  from db import (
  44      delete_app_user_passkey,
  45      get_app_user_by_id,
  46      get_app_user_by_username,
  47      get_app_user_passkey,
  48      insert_app_user_passkey,
  49      list_app_user_passkeys,
  50      mark_app_user_passkey_used,
  51  )
  52  
  53  router = APIRouter(prefix="/api/auth", tags=["auth"])
  54  
  55  _PASSKEY_RP_NAME = "Blastjax"
  56  
  57  
  58  def _bearer_token(request: Request) -> str:
  59      header = request.headers.get("authorization") or ""
  60      return header[7:] if header.lower().startswith("bearer ") else ""
  61  
  62  
  63  def _client_ip(request: Request) -> str:
  64      return request.client.host if request.client else "unknown"
  65  
  66  
  67  def _session_user(request: Request) -> dict[str, Any]:
  68      user_id = session_user_id(_bearer_token(request))
  69      user = get_app_user_by_id(user_id) if user_id is not None else None
  70      if user is None:
  71          raise HTTPException(status_code=401, detail="Log in to manage passkeys.")
  72      return user
  73  
  74  
  75  def _passkey_origin(request: Request) -> tuple[str, str]:
  76      """The web page's origin, and its host: the RP ID every passkey here is bound to."""
  77      origin = request.headers.get("origin") or ""
  78      host = urlparse(origin).hostname or ""
  79      if not host or (host != request.url.hostname and origin not in cors_allow_origins()):
  80          raise HTTPException(status_code=400, detail="Passkeys only work from the app's own web address.")
  81      return origin, host
  82  
  83  
  84  def _public_passkey(row: dict[str, Any]) -> dict[str, Any]:
  85      return {k: row[k] for k in ("id", "name", "created_at", "last_used_at")}
  86  
  87  
  88  @router.get("/config")
  89  def auth_config() -> dict[str, Any]:
  90      return {"login_required": login_required()}
  91  
  92  
  93  @router.post("/login")
  94  def auth_login(body: LoginBody, request: Request) -> dict[str, Any]:
  95      ip = _client_ip(request)
  96      if too_many_failed_attempts(ip):
  97          raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
  98  
  99      row = get_app_user_by_username(body.username.strip())
 100      if row is None or not verify_password(body.password, row["password_hash"]):
 101          record_failed_attempt(ip)
 102          raise HTTPException(status_code=401, detail="Invalid username or password.")
 103  
 104      clear_failed_attempts(ip)
 105      return {"token": create_session(row["id"])}
 106  
 107  
 108  @router.post("/passkey/login/options")
 109  def auth_passkey_login_options(request: Request) -> dict[str, Any]:
 110      _, rp_id = _passkey_origin(request)
 111      options = generate_authentication_options(rp_id=rp_id, user_verification=UserVerificationRequirement.REQUIRED)
 112      remember_passkey_challenge(options.challenge)
 113      return options_to_json_dict(options)
 114  
 115  
 116  @router.post("/passkey/login")
 117  def auth_passkey_login(body: PasskeyLoginBody, request: Request) -> dict[str, Any]:
 118      ip = _client_ip(request)
 119      if too_many_failed_attempts(ip):
 120          raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
 121  
 122      origin, rp_id = _passkey_origin(request)
 123      try:
 124          credential = parse_authentication_credential_json(body.credential)
 125          challenge = parse_client_data_json(credential.response.client_data_json).challenge
 126          if not take_passkey_challenge(challenge):
 127              raise WebAuthnException("unknown or expired challenge")
 128          passkey = get_app_user_passkey(credential.raw_id)
 129          if passkey is None:
 130              raise WebAuthnException("unknown passkey")
 131          verified = verify_authentication_response(
 132              credential=credential,
 133              expected_challenge=challenge,
 134              expected_rp_id=rp_id,
 135              expected_origin=origin,
 136              credential_public_key=passkey["public_key"],
 137              credential_current_sign_count=passkey["sign_count"],
 138              require_user_verification=True,
 139          )
 140      except WebAuthnException:
 141          record_failed_attempt(ip)
 142          raise HTTPException(status_code=401, detail="That passkey isn't registered here, or the request expired.")
 143  
 144      mark_app_user_passkey_used(passkey["id"], verified.new_sign_count)
 145      clear_failed_attempts(ip)
 146      return {"token": create_session(passkey["user_id"])}
 147  
 148  
 149  @router.post("/passkey/register/options")
 150  def auth_passkey_register_options(request: Request) -> dict[str, Any]:
```

## Outgoing connections
- call -> db.py (be:core:db)
- call -> factory.py (be:core:factory)
- call -> passwords.py (be:core:passwords)
- call -> security.py (be:core:security)
- call -> schemas/ (Pydantic) (be:schemas)
- read -> app_user (ds:app_user)
- read -> app_user_passkey (ds:app_user_passkey)
- write -> app_user_passkey (ds:app_user_passkey)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- test_core.py (be:core:test_core) -> call
- components/AuthGate.tsx (web:components:AuthGate) -> dispatch
- components/SidebarNav.tsx (web:components:SidebarNav) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
- /settings (web:settings) -> dispatch
