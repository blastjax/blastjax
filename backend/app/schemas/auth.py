from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class LoginBody(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=200)


class PasskeyLoginBody(BaseModel):
    credential: dict[str, Any]


class PasskeyRegisterBody(BaseModel):
    credential: dict[str, Any]
    name: str = Field(default="", max_length=100)
