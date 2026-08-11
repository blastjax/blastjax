"""Mambo (Takuzu / Binairo) solver endpoints.

The propagation search, the step-by-step deduction engine and the generator all
run server-side so the browser's main thread never blocks on them — see
app/services/mambo_solver.py for the rules and the algorithms.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

from fastapi import APIRouter, HTTPException

from app.schemas.mambo import (
    MamboGenerateRequest,
    MamboGenerateResponse,
    MamboSolveRequest,
    MamboSolveResponse,
    MamboStep,
    MamboStepsRequest,
    MamboStepsResponse,
)
from app.services.mambo_solver import generate, solve, solve_steps

router = APIRouter(tags=["mambo"])

T = TypeVar("T")


def _checked(fn: Callable[[], T]) -> T:
    """Turn the solver's own rejections into 400s instead of 500s."""
    try:
        return fn()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/mambo/solve")
def mambo_solve(body: MamboSolveRequest) -> MamboSolveResponse:
    result = _checked(
        lambda: solve(
            body.grid,
            body.h_signs,
            body.v_signs,
            time_budget_ms=body.time_budget_ms,
        )
    )
    return MamboSolveResponse(
        solution=result.solution,
        solution_count=result.solution_count,
        unique=result.unique,
        timed_out=result.timed_out,
        node_count=result.node_count,
    )


@router.post("/api/mambo/steps")
def mambo_steps(body: MamboStepsRequest) -> MamboStepsResponse:
    """Every cell the current board forces, in the order a player would find them."""
    result = _checked(
        lambda: solve_steps(
            body.grid,
            body.h_signs,
            body.v_signs,
            time_budget_ms=body.time_budget_ms,
        )
    )
    return MamboStepsResponse(
        steps=[
            MamboStep(r=s.r, c=s.c, value=s.value, technique=s.technique, detail=s.detail)
            for s in result.steps
        ],
        solved=result.solved,
        unique=result.unique,
        solution_count=result.solution_count,
        conflict=result.conflict,
        timed_out=result.timed_out,
    )


@router.post("/api/mambo/generate")
def mambo_generate(body: MamboGenerateRequest) -> MamboGenerateResponse:
    result = _checked(
        lambda: generate(
            body.rows,
            body.cols,
            body.difficulty,
            sign_density=body.sign_density,
            max_attempts=body.max_attempts,
            time_budget_ms=body.time_budget_ms,
        )
    )
    return MamboGenerateResponse(
        grid=result.grid,
        solution=result.solution,
        h_signs=result.h_signs,
        v_signs=result.v_signs,
        difficulty=result.difficulty,
        difficulty_confirmed=result.difficulty_confirmed,
        exact_match=result.exact_match,
        attempts=result.attempts,
        given_count=result.given_count,
    )
