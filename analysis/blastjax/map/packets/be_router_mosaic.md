# Node be:router:mosaic: routers/mosaic.py
Kind: module
Language: python, 90 lines of code, location: backend/app/routers/mosaic.py

Source excerpt: backend/app/routers/mosaic.py (first 103 lines)
```
   1  from __future__ import annotations
   2  
   3  from fastapi import APIRouter, HTTPException
   4  
   5  from app.schemas.mosaic import (
   6      MosaicBestStartRequest,
   7      MosaicBestStartResponse,
   8      MosaicCell,
   9      MosaicFreeMove,
  10      MosaicFreeSolveRequest,
  11      MosaicFreeSolveResponse,
  12      MosaicGenerateRequest,
  13      MosaicGenerateResponse,
  14      MosaicSolveRequest,
  15      MosaicSolveResponse,
  16  )
  17  from app.services.mosaic_solver import (
  18      Cell,
  19      generate_puzzle,
  20      solve,
  21      solve_best_start,
  22      solve_free_cell,
  23  )
  24  
  25  router = APIRouter(tags=["mosaic"])
  26  
  27  
  28  def _validate_grid(grid: list[list[int]]) -> None:
  29      if not grid or not grid[0]:
  30          raise HTTPException(status_code=400, detail="Grid must be non-empty.")
  31      cols = len(grid[0])
  32      if any(len(row) != cols for row in grid):
  33          raise HTTPException(status_code=400, detail="Grid rows must all be the same length.")
  34  
  35  
  36  @router.post("/api/mosaic/solve")
  37  def mosaic_solve(body: MosaicSolveRequest) -> MosaicSolveResponse:
  38      _validate_grid(body.grid)
  39      rows, cols = len(body.grid), len(body.grid[0])
  40      if not (0 <= body.seed.r < rows and 0 <= body.seed.c < cols):
  41          raise HTTPException(status_code=400, detail="Seed is outside the grid.")
  42      result = solve(
  43          body.grid,
  44          Cell(body.seed.r, body.seed.c),
  45          time_budget_ms=body.time_budget_ms,
  46          max_moves=body.max_moves,
  47      )
  48      return MosaicSolveResponse(
  49          moves=result.moves,
  50          optimal=result.optimal,
  51          node_count=result.node_count,
  52          proven=result.proven,
  53      )
  54  
  55  
  56  @router.post("/api/mosaic/solve-free")
  57  def mosaic_solve_free(body: MosaicFreeSolveRequest) -> MosaicFreeSolveResponse:
  58      _validate_grid(body.grid)
  59      result = solve_free_cell(
  60          body.grid,
  61          num_colors=body.num_colors,
  62          time_budget_ms=body.time_budget_ms,
  63          max_moves=body.max_moves,
  64      )
  65      return MosaicFreeSolveResponse(
  66          moves=[MosaicFreeMove(r=m.r, c=m.c, color=m.color) for m in result.moves],
  67          optimal=result.optimal,
  68          node_count=result.node_count,
  69          proven=result.proven,
  70      )
  71  
  72  
  73  @router.post("/api/mosaic/solve-best-start")
  74  def mosaic_solve_best_start(body: MosaicBestStartRequest) -> MosaicBestStartResponse:
  75      _validate_grid(body.grid)
  76      result = solve_best_start(body.grid, time_budget_ms=body.time_budget_ms)
  77      return MosaicBestStartResponse(
  78          seed=MosaicCell(r=result.seed.r, c=result.seed.c),
  79          moves=result.moves,
  80          optimal=result.optimal,
  81          regions_tried=result.regions_tried,
  82          total_regions=result.total_regions,
  83      )
  84  
  85  
  86  @router.post("/api/mosaic/generate")
  87  def mosaic_generate(body: MosaicGenerateRequest) -> MosaicGenerateResponse:
  88      result = generate_puzzle(
  89          body.rows,
  90          body.cols,
  91          body.num_colors,
  92          body.target_moves,
  93          max_attempts=body.max_attempts,
  94          time_budget_ms=body.time_budget_ms,
  95      )
  96      return MosaicGenerateResponse(
  97          grid=result.grid,
  98          seed=MosaicCell(r=result.seed.r, c=result.seed.c),
  99          moves=result.moves,
 100          optimal=result.optimal,
 101          attempts=result.attempts,
 102          exact_match=result.exact_match,
 103      )
```

## Outgoing connections
- call -> schemas/ (Pydantic) (be:schemas)
- call -> services/mosaic_solver.py (be:service:mosaic_solver)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- /games/mosaic (web:games/mosaic) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
