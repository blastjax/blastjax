"""Blood-pressure reading API models."""

from __future__ import annotations

from pydantic import BaseModel, Field


class BloodPressureCreate(BaseModel):
    systolic: int = Field(gt=0, le=400, description="Systolic (mmHg)")
    diastolic: int = Field(gt=0, le=400, description="Diastolic (mmHg)")
    pulse: int = Field(gt=0, le=400, description="Pulse (beats/min)")
    spo2: int | None = Field(
        default=None, gt=0, le=100, description="Oxygen saturation (SpO2 %)"
    )
    notes: str | None = None
