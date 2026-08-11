"""Mambo solver API models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class MamboBoard(BaseModel):
    """A board plus its signs.

    `grid` cells are -1 (empty), 0 (circle) or 1 (square). `h_signs` is
    rows x (cols - 1) and holds the sign between (r, c) and (r, c + 1);
    `v_signs` is (rows - 1) x cols, between (r, c) and (r + 1, c). Sign values
    are 0 (none), 1 (=) or 2 (x).
    """

    grid: list[list[int]]
    h_signs: list[list[int]]
    v_signs: list[list[int]]


class MamboSolveRequest(MamboBoard):
    time_budget_ms: int = Field(default=3000, ge=1, le=10000)


class MamboSolveResponse(BaseModel):
    solution: list[list[int]] | None
    # Capped at 2, so 2 means "two or more".
    solution_count: int
    unique: bool
    # True only if the budget cut the search short, making the counts above
    # lower bounds rather than answers.
    timed_out: bool
    node_count: int


class MamboStep(BaseModel):
    """One forced cell, with the technique that forced it."""

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
    # True when the entries already on the board break a rule against each
    # other, as opposed to merely leading nowhere.
    conflict: bool
    timed_out: bool


class MamboGenerateRequest(BaseModel):
    rows: int = Field(ge=4, le=16)
    cols: int = Field(ge=4, le=16)
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    # Share of neighbouring pairs that start out signed; the generator prunes
    # every sign the puzzle doesn't need, so this is an upper bound.
    sign_density: float = Field(default=0.15, ge=0.0, le=0.5)
    max_attempts: int = Field(default=12, ge=1, le=100)
    time_budget_ms: int = Field(default=8000, ge=1, le=20000)


class MamboGenerateResponse(BaseModel):
    grid: list[list[int]]
    solution: list[list[int]]
    h_signs: list[list[int]]
    v_signs: list[list[int]]
    difficulty: str
    # False when the clock ran out before the tier could be established, in
    # which case `difficulty` is the worst case rather than a measurement.
    difficulty_confirmed: bool
    exact_match: bool
    attempts: int
    given_count: int
