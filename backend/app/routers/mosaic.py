"""Mosaic solver endpoints.

Runs the IDA* region-graph search server-side so the browser's main thread
never blocks on it — see app/services/mosaic_solver.py for the algorithm.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.mosaic import (
    MosaicBestStartRequest,
    MosaicBestStartResponse,
    MosaicCell,
    MosaicFreeMove,
    MosaicFreeSolveRequest,
    MosaicFreeSolveResponse,
    MosaicGenerateRequest,
    MosaicGenerateResponse,
    MosaicSolveRequest,
    MosaicSolveResponse,
)
from app.services.mosaic_solver import (
    Cell,
    generate_puzzle,
    solve,
    solve_best_start,
    solve_free_cell,
)

router = APIRouter(tags=["mosaic"])


def _validate_grid(grid: list[list[int]]) -> None:
    if not grid or not grid[0]:
        raise HTTPException(status_code=400, detail="Grid must be non-empty.")
    cols = len(grid[0])
    if any(len(row) != cols for row in grid):
        raise HTTPException(status_code=400, detail="Grid rows must all be the same length.")


@router.post("/api/mosaic/solve")
def mosaic_solve(body: MosaicSolveRequest) -> MosaicSolveResponse:
    _validate_grid(body.grid)
    rows, cols = len(body.grid), len(body.grid[0])
    if not (0 <= body.seed.r < rows and 0 <= body.seed.c < cols):
        raise HTTPException(status_code=400, detail="Seed is outside the grid.")
    result = solve(
        body.grid,
        Cell(body.seed.r, body.seed.c),
        time_budget_ms=body.time_budget_ms,
        max_moves=body.max_moves,
    )
    return MosaicSolveResponse(
        moves=result.moves,
        optimal=result.optimal,
        node_count=result.node_count,
        proven=result.proven,
    )


@router.post("/api/mosaic/solve-free")
def mosaic_solve_free(body: MosaicFreeSolveRequest) -> MosaicFreeSolveResponse:
    """Optimal solve under the "tap any tile" rule (not a fixed start blob)."""
    _validate_grid(body.grid)
    result = solve_free_cell(
        body.grid,
        num_colors=body.num_colors,
        time_budget_ms=body.time_budget_ms,
        max_moves=body.max_moves,
    )
    return MosaicFreeSolveResponse(
        moves=[MosaicFreeMove(r=m.r, c=m.c, color=m.color) for m in result.moves],
        optimal=result.optimal,
        node_count=result.node_count,
        proven=result.proven,
    )


@router.post("/api/mosaic/solve-best-start")
def mosaic_solve_best_start(body: MosaicBestStartRequest) -> MosaicBestStartResponse:
    _validate_grid(body.grid)
    result = solve_best_start(body.grid, time_budget_ms=body.time_budget_ms)
    return MosaicBestStartResponse(
        seed=MosaicCell(r=result.seed.r, c=result.seed.c),
        moves=result.moves,
        optimal=result.optimal,
        regions_tried=result.regions_tried,
        total_regions=result.total_regions,
    )


@router.post("/api/mosaic/generate")
def mosaic_generate(body: MosaicGenerateRequest) -> MosaicGenerateResponse:
    result = generate_puzzle(
        body.rows,
        body.cols,
        body.num_colors,
        body.target_moves,
        max_attempts=body.max_attempts,
        time_budget_ms=body.time_budget_ms,
    )
    return MosaicGenerateResponse(
        grid=result.grid,
        seed=MosaicCell(r=result.seed.r, c=result.seed.c),
        moves=result.moves,
        optimal=result.optimal,
        attempts=result.attempts,
        exact_match=result.exact_match,
    )
