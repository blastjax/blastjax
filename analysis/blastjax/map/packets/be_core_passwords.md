# Node be:core:passwords: passwords.py
Kind: module
Language: python, 11 lines of code, location: backend/app/passwords.py

Source excerpt: backend/app/passwords.py (first 17 lines)
```
   1  from __future__ import annotations
   2  
   3  from argon2 import PasswordHasher
   4  from argon2.exceptions import InvalidHash, VerifyMismatchError
   5  
   6  _hasher = PasswordHasher()
   7  
   8  
   9  def hash_password(password: str) -> str:
  10      return _hasher.hash(password)
  11  
  12  
  13  def verify_password(password: str, password_hash: str) -> bool:
  14      try:
  15          return _hasher.verify(password_hash, password)
  16      except (VerifyMismatchError, InvalidHash):
  17          return False
```

## Outgoing connections
- none

## Incoming connections
- routers/auth.py (be:router:auth) -> call
- routers/user.py (be:router:user) -> call
