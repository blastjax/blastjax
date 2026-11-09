# Node be:router:mambo: routers/mambo.py
Kind: module
Language: python, 82 lines of code, location: backend/app/routers/mambo.py

Source excerpt: backend/app/routers/mambo.py (first 95 lines)
```
   1  from __future__ import annotations
   2  
   3  from collections.abc import Callable
   4  from typing import TypeVar
   5  
   6  from fastapi import APIRouter, HTTPException
   7  
   8  from app.schemas.mambo import (
   9      MamboGenerateRequest,
  10      MamboGenerateResponse,
  11      MamboSolveRequest,
  12      MamboSolveResponse,
  13      MamboStep,
  14      MamboStepsRequest,
  15      MamboStepsResponse,
  16  )
  17  from app.services.mambo_solver import generate, solve, solve_steps
  18  
  19  router = APIRouter(tags=["mambo"])
  20  
  21  T = TypeVar("T")
  22  
  23  
  24  def _checked(fn: Callable[[], T]) -> T:
  25      try:
  26          return fn()
  27      except ValueError as exc:
  28          raise HTTPException(status_code=400, detail=str(exc)) from exc
  29  
  30  
  31  @router.post("/api/mambo/solve")
  32  def mambo_solve(body: MamboSolveRequest) -> MamboSolveResponse:
  33      result = _checked(
  34          lambda: solve(
  35              body.grid,
  36              body.h_signs,
  37              body.v_signs,
  38              time_budget_ms=body.time_budget_ms,
  39          )
  40      )
  41      return MamboSolveResponse(
  42          solution=result.solution,
  43          solution_count=result.solution_count,
  44          unique=result.unique,
  45          timed_out=result.timed_out,
  46          node_count=result.node_count,
  47      )
  48  
  49  
  50  @router.post("/api/mambo/steps")
  51  def mambo_steps(body: MamboStepsRequest) -> MamboStepsResponse:
  52      result = _checked(
  53          lambda: solve_steps(
  54              body.grid,
  55              body.h_signs,
  56              body.v_signs,
  57              time_budget_ms=body.time_budget_ms,
  58          )
  59      )
  60      return MamboStepsResponse(
  61          steps=[
  62              MamboStep(r=s.r, c=s.c, value=s.value, technique=s.technique, detail=s.detail)
  63              for s in result.steps
  64          ],
  65          solved=result.solved,
  66          unique=result.unique,
  67          solution_count=result.solution_count,
  68          conflict=result.conflict,
  69          timed_out=result.timed_out,
  70      )
  71  
  72  
  73  @router.post("/api/mambo/generate")
  74  def mambo_generate(body: MamboGenerateRequest) -> MamboGenerateResponse:
  75      result = _checked(
  76          lambda: generate(
  77              body.rows,
  78              body.cols,
  79              body.difficulty,
  80              sign_density=body.sign_density,
  81              max_attempts=body.max_attempts,
  82              time_budget_ms=body.time_budget_ms,
  83          )
  84      )
  85      return MamboGenerateResponse(
  86          grid=result.grid,
  87          solution=result.solution,
  88          h_signs=result.h_signs,
  89          v_signs=result.v_signs,
  90          difficulty=result.difficulty,
  91          difficulty_confirmed=result.difficulty_confirmed,
  92          exact_match=result.exact_match,
  93          attempts=result.attempts,
  94          given_count=result.given_count,
  95      )
```

## Outgoing connections
- call -> schemas/ (Pydantic) (be:schemas)
- call -> services/mambo_solver.py (be:service:mambo_solver)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- /games/mambo (web:games/mambo) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
