"""OTP login API models."""

from __future__ import annotations

from pydantic import BaseModel, Field


class OtpVerifyBody(BaseModel):
    code: str = Field(..., min_length=6, max_length=6)
