from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class MamboBoard(BaseModel):
    grid: list[list[int]]
    h_signs: list[list[int]]
    v_signs: list[list[int]]


class MamboSolveRequest(MamboBoard):
    time_budget_ms: int = Field(default=3000, ge=1, le=10000)


class MamboSolveResponse(BaseModel):
    solution: list[list[int]] | None
    solution_count: int
    unique: bool
    timed_out: bool
    node_count: int


class MamboStep(BaseModel):
    r: int
    c: int
    value: int
    technique: str
    detail: str


class MamboStepsRequest(MamboBoard):
    time_budget_ms: int = Field(default=5000, ge=1, le=15000)


class MamboStepsResponse(BaseModel):
    steps: list[MamboStep]
    solved: bool
    unique: bool
    solution_count: int
    conflict: bool
    timed_out: bool


class MamboGenerateRequest(BaseModel):
    rows: int = Field(ge=4, le=16)
    cols: int = Field(ge=4, le=16)
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    sign_density: float = Field(default=0.15, ge=0.0, le=0.5)
    max_attempts: int = Field(default=12, ge=1, le=100)
    time_budget_ms: int = Field(default=8000, ge=1, le=20000)


class MamboGenerateResponse(BaseModel):
    grid: list[list[int]]
    solution: list[list[int]]
    h_signs: list[list[int]]
    v_signs: list[list[int]]
    difficulty: str
    difficulty_confirmed: bool
    exact_match: bool
    attempts: int
    given_count: int
