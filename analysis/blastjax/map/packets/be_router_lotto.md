# Node be:router:lotto: routers/lotto.py
Kind: module
Language: python, 180 lines of code, location: backend/app/routers/lotto.py

Source excerpt: backend/app/routers/lotto.py (first 150 lines)
```
   1  from __future__ import annotations
   2  
   3  import datetime as dt
   4  from typing import Any
   5  from uuid import UUID
   6  
   7  from fastapi import APIRouter, Depends, HTTPException, Query
   8  
   9  import cache
  10  from app.deps import require_db
  11  from app.schemas.lotto import (
  12      LottoAttemptCreate,
  13      LottoAttemptsBulkCreate,
  14      LottoDrawCreate,
  15      LottoImportText,
  16  )
  17  from app.services.lotto_import import import_rows_to_bulk_params, parse_lotto_draw_text
  18  from app.services.pcso_results import PH_TIME, PcsoError, fetch_results, sync_start
  19  from db import (
  20      delete_lotto_attempt,
  21      delete_lotto_draw,
  22      get_lotto_draw_id_by_date,
  23      insert_lotto_attempt,
  24      insert_lotto_attempts_bulk,
  25      insert_lotto_results,
  26      list_lotto_draws,
  27      list_lotto_games,
  28      list_lotto_latest_results,
  29      list_lotto_results_between,
  30      update_lotto_attempt,
  31      update_lotto_draw,
  32      upsert_lotto_draw,
  33      upsert_lotto_draws_bulk,
  34  )
  35  
  36  router = APIRouter(tags=["lotto"], dependencies=[Depends(require_db)])
  37  
  38  
  39  def _numbers(row: dict[str, Any]) -> list[int]:
  40      if row["n1"] is None:
  41          return []
  42      return [row["n1"], row["n2"], row["n3"], row["n4"], row["n5"], row["n6"]]
  43  
  44  
  45  def _serialize_draw(row: dict[str, Any]) -> dict[str, Any]:
  46      return {
  47          "id": row["id"],
  48          "draw_date": row["draw_date"],
  49          "numbers": _numbers(row),
  50          "jackpot_prize": row["jackpot_prize"],
  51          "winners": row["winners"],
  52          "created_at": row["created_at"],
  53      }
  54  
  55  
  56  def _serialize_attempt(row: dict[str, Any]) -> dict[str, Any]:
  57      return {
  58          "id": row["id"],
  59          "draw_id": row["draw_id"],
  60          "ticket": row["ticket"],
  61          "numbers": _numbers(row),
  62          "created_at": row["created_at"],
  63      }
  64  
  65  
  66  def _serialize_detail(detail: dict[str, Any]) -> dict[str, Any]:
  67      return {
  68          "draw": _serialize_draw(detail["draw"]),
  69          "attempts": [_serialize_attempt(a) for a in detail["attempts"]],
  70      }
  71  
  72  
  73  @router.get("/api/lotto/games")
  74  def lotto_games() -> dict[str, Any]:
  75      key = "lotto:games"
  76      hit = cache.get(key)
  77      if hit is not None:
  78          return hit
  79      result = {"games": list_lotto_games()}
  80      cache.set(key, result)
  81      return result
  82  
  83  
  84  @router.get("/api/lotto")
  85  def lotto_list(
  86      game_id: UUID, limit: int = Query(default=200, ge=1, le=2000)
  87  ) -> dict[str, Any]:
  88      key = f"lotto:list:{game_id}:{limit}"
  89      hit = cache.get(key)
  90      if hit is not None:
  91          return hit
  92      rows = list_lotto_draws(game_id, limit=limit)
  93      result = {"draws": [_serialize_detail(r) for r in rows]}
  94      cache.set(key, result)
  95      return result
  96  
  97  
  98  @router.get("/api/lotto/calendar")
  99  def lotto_calendar(
 100      year: int = Query(..., ge=1900, le=2100), month: int = Query(..., ge=1, le=12)
 101  ) -> dict[str, Any]:
 102      key = f"lotto:calendar:{year}-{month}"
 103      hit = cache.get(key)
 104      if hit is not None:
 105          return hit
 106      start = dt.date(year, month, 1)
 107      next_month = (start + dt.timedelta(days=31)).replace(day=1)
 108      result = {"draws": list_lotto_results_between(start, next_month)}
 109      cache.set(key, result)
 110      return result
 111  
 112  
 113  @router.post("/api/lotto")
 114  def lotto_set_draw(body: LottoDrawCreate) -> dict[str, Any]:
 115      detail = upsert_lotto_draw(
 116          body.game_id, body.draw_date.isoformat(), body.numbers, body.jackpot_prize, body.winners
 117      )
 118      return _serialize_detail(detail)
 119  
 120  
 121  @router.post("/api/lotto/import-text")
 122  def lotto_import_text(body: LottoImportText) -> dict[str, Any]:
 123      if not body.text.strip():
 124          raise HTTPException(status_code=400, detail="Paste in some rows first.")
 125      parsed, errors = parse_lotto_draw_text(body.text)
 126      if not parsed:
 127          detail = "No valid draw rows found."
 128          if errors:
 129              detail += f" First error — {errors[0]}"
 130          raise HTTPException(status_code=400, detail=detail)
 131      summary = upsert_lotto_draws_bulk(body.game_id, import_rows_to_bulk_params(parsed))
 132      return {**summary, "errors": errors}
 133  
 134  
 135  @router.post("/api/lotto/sync-pcso")
 136  def lotto_sync_pcso() -> dict[str, Any]:
 137      games = list_lotto_latest_results()
 138      today = dt.datetime.now(PH_TIME).date()
 139      start = sync_start((g["latest"] for g in games), today)
 140      if start > today:
 141          return {"inserted": 0}
 142      game_ids = {g["name"]: g["id"] for g in games}
 143      try:
 144          results = fetch_results(start, today, game_ids.keys())
 145      except PcsoError as exc:
 146          raise HTTPException(status_code=502, detail=str(exc)) from exc
 147      rows = [
 148          {
 149              "game_id": game_ids[r.game],
 150              "draw_date": r.draw_date.isoformat(),
```

## Outgoing connections
- call -> cache.py (be:core:cache)
- call -> db.py (be:core:db)
- call -> deps.py (be:core:deps)
- call -> schemas/ (Pydantic) (be:schemas)
- call -> services/lotto_import.py (be:service:lotto_import)
- call -> services/pcso_results.py (be:service:pcso_results)
- read -> lotto_attempt (ds:lotto_attempt)
- write -> lotto_attempt (ds:lotto_attempt)
- read -> lotto_draw (ds:lotto_draw)
- write -> lotto_draw (ds:lotto_draw)
- read -> lotto_game (ds:lotto_game)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
- /lotto (web:lotto) -> dispatch
