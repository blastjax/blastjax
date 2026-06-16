"""Blood-pressure reading API models."""

from __future__ import annotations

from pydantic import BaseModel, Field


class BloodPressureCreate(BaseModel):
    systolic: int = Field(gt=0, le=400, description="Systolic (mmHg)")
    diastolic: int = Field(gt=0, le=400, description="Diastolic (mmHg)")
    pulse: int = Field(gt=0, le=400, description="Pulse (beats/min)")
    notes: str | None = None
