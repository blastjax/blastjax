from __future__ import annotations

from pydantic import BaseModel, Field


class MosaicCell(BaseModel):
    r: int = Field(ge=0)
    c: int = Field(ge=0)


class MosaicSolveRequest(BaseModel):
    grid: list[list[int]]
    seed: MosaicCell
    time_budget_ms: int = Field(default=3000, ge=1, le=10000)
    max_moves: int | None = Field(default=None, ge=1, le=200)


class MosaicSolveResponse(BaseModel):
    moves: list[int]
    optimal: bool
    node_count: int
    proven: bool


class MosaicFreeMove(BaseModel):
    r: int = Field(ge=0)
    c: int = Field(ge=0)
    color: int = Field(ge=0)


class MosaicFreeSolveRequest(BaseModel):
    grid: list[list[int]]
    num_colors: int | None = Field(default=None, ge=2, le=8)
    time_budget_ms: int = Field(default=5000, ge=1, le=15000)
    max_moves: int | None = Field(default=None, ge=1, le=200)


class MosaicFreeSolveResponse(BaseModel):
    moves: list[MosaicFreeMove]
    optimal: bool
    node_count: int
    proven: bool


class MosaicBestStartRequest(BaseModel):
    grid: list[list[int]]
    time_budget_ms: int = Field(default=5000, ge=1, le=15000)


class MosaicBestStartResponse(BaseModel):
    seed: MosaicCell
    moves: list[int]
    optimal: bool
    regions_tried: int
    total_regions: int


class MosaicGenerateRequest(BaseModel):
    rows: int = Field(ge=2, le=40)
    cols: int = Field(ge=2, le=40)
    num_colors: int = Field(ge=2, le=8)
    target_moves: int = Field(ge=1, le=200)
    max_attempts: int = Field(default=200, ge=1, le=1000)
    time_budget_ms: int = Field(default=8000, ge=1, le=20000)


class MosaicGenerateResponse(BaseModel):
    grid: list[list[int]]
    seed: MosaicCell
    moves: list[int]
    optimal: bool
    attempts: int
    exact_match: bool
