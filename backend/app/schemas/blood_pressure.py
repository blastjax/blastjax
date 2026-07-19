"""Blood-pressure reading API models."""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class BloodPressureCreate(BaseModel):
    systolic: int | None = Field(default=None, gt=0, le=400, description="Systolic (mmHg)")
    diastolic: int | None = Field(default=None, gt=0, le=400, description="Diastolic (mmHg)")
    pulse: int | None = Field(default=None, gt=0, le=400, description="Pulse (beats/min)")
    spo2: int | None = Field(
        default=None, gt=0, le=100, description="Oxygen saturation (SpO2 %)"
    )
    temperature: float | None = Field(
        default=None, gt=25, le=45, description="Body temperature (°C)"
    )
    weight: float | None = Field(
        default=None, gt=0, le=500, description="Body weight (kg)"
    )
    notes: str | None = None

    @model_validator(mode="after")
    def _check_fields(self) -> "BloodPressureCreate":
        core = (self.systolic, self.diastolic, self.pulse)
        if any(v is not None for v in core) and any(v is None for v in core):
            raise ValueError(
                "Systolic, diastolic, and pulse must all be set together, or all left blank."
            )
        if all(v is None for v in core) and self.spo2 is None and self.temperature is None \
                and self.weight is None and (self.notes is None or not self.notes.strip()):
            raise ValueError("At least one field must be populated.")
        return self
