from __future__ import annotations

import datetime as dt
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

import cache
from app.deps import require_db
from app.schemas.lotto import (
    LottoAttemptCreate,
    LottoAttemptsBulkCreate,
    LottoDrawCreate,
    LottoImportText,
)
from app.services.lotto_import import import_rows_to_bulk_params, parse_lotto_draw_text
from app.services.pcso_results import PH_TIME, PcsoError, fetch_results, sync_start
from db import (
    delete_lotto_attempt,
    delete_lotto_draw,
    get_lotto_draw_id_by_date,
    insert_lotto_attempt,
    insert_lotto_attempts_bulk,
    insert_lotto_results,
    list_lotto_draws,
    list_lotto_games,
    list_lotto_latest_results,
    update_lotto_attempt,
    update_lotto_draw,
    upsert_lotto_draw,
    upsert_lotto_draws_bulk,
)

router = APIRouter(tags=["lotto"], dependencies=[Depends(require_db)])


def _numbers(row: dict[str, Any]) -> list[int]:
    if row["n1"] is None:
        return []
    return [row["n1"], row["n2"], row["n3"], row["n4"], row["n5"], row["n6"]]


def _serialize_draw(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "draw_date": row["draw_date"],
        "numbers": _numbers(row),
        "jackpot_prize": row["jackpot_prize"],
        "winners": row["winners"],
        "created_at": row["created_at"],
    }


def _serialize_attempt(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "draw_id": row["draw_id"],
        "ticket": row["ticket"],
        "numbers": _numbers(row),
        "created_at": row["created_at"],
    }


def _serialize_detail(detail: dict[str, Any]) -> dict[str, Any]:
    return {
        "draw": _serialize_draw(detail["draw"]),
        "attempts": [_serialize_attempt(a) for a in detail["attempts"]],
    }


@router.get("/api/lotto/games")
def lotto_games() -> dict[str, Any]:
    key = "lotto:games"
    hit = cache.get(key)
    if hit is not None:
        return hit
    result = {"games": list_lotto_games()}
    cache.set(key, result)
    return result


@router.get("/api/lotto")
def lotto_list(
    game_id: int = Query(..., gt=0), limit: int = Query(default=200, ge=1, le=2000)
) -> dict[str, Any]:
    key = f"lotto:list:{game_id}:{limit}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    rows = list_lotto_draws(game_id, limit=limit)
    result = {"draws": [_serialize_detail(r) for r in rows]}
    cache.set(key, result)
    return result


@router.post("/api/lotto")
def lotto_set_draw(body: LottoDrawCreate) -> dict[str, Any]:
    detail = upsert_lotto_draw(
        body.game_id, body.draw_date.isoformat(), body.numbers, body.jackpot_prize, body.winners
    )
    return _serialize_detail(detail)


@router.post("/api/lotto/import-text")
def lotto_import_text(body: LottoImportText) -> dict[str, Any]:
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Paste in some rows first.")
    parsed, errors = parse_lotto_draw_text(body.text)
    if not parsed:
        detail = "No valid draw rows found."
        if errors:
            detail += f" First error — {errors[0]}"
        raise HTTPException(status_code=400, detail=detail)
    summary = upsert_lotto_draws_bulk(body.game_id, import_rows_to_bulk_params(parsed))
    return {**summary, "errors": errors}


@router.post("/api/lotto/sync-pcso")
def lotto_sync_pcso() -> dict[str, Any]:
    games = list_lotto_latest_results()
    today = dt.datetime.now(PH_TIME).date()
    start = sync_start((g["latest"] for g in games), today)
    if start > today:
        return {"inserted": 0}
    game_ids = {g["name"]: g["id"] for g in games}
    try:
        results = fetch_results(start, today, game_ids.keys())
    except PcsoError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    rows = [
        {
            "game_id": game_ids[r.game],
            "draw_date": r.draw_date.isoformat(),
            "numbers": r.numbers,
            "jackpot_prize": r.jackpot_prize,
            "winners": r.winners,
        }
        for r in results
    ]
    return {"inserted": insert_lotto_results(rows)}


@router.put("/api/lotto/{draw_id}")
def lotto_update_draw(draw_id: int, body: LottoDrawCreate) -> dict[str, Any]:
    draw_date = body.draw_date.isoformat()
    existing_id = get_lotto_draw_id_by_date(body.game_id, draw_date)
    if existing_id is not None and existing_id != draw_id:
        raise HTTPException(
            status_code=409, detail="Another result already exists for that date."
        )
    detail = update_lotto_draw(
        draw_id, draw_date, body.numbers, body.jackpot_prize, body.winners
    )
    if detail is None:
        raise HTTPException(status_code=404, detail="Draw not found.")
    return _serialize_detail(detail)


@router.delete("/api/lotto/{draw_id}")
def lotto_remove_draw(draw_id: int) -> dict[str, Any]:
    if not delete_lotto_draw(draw_id):
        raise HTTPException(status_code=404, detail="Draw not found.")
    return {"ok": True}


@router.post("/api/lotto/{draw_id}/attempts")
def lotto_add_attempt(draw_id: int, body: LottoAttemptCreate) -> dict[str, Any]:
    detail = insert_lotto_attempt(draw_id, body.numbers, body.ticket)
    if detail is None:
        raise HTTPException(status_code=404, detail="Draw not found.")
    return _serialize_detail(detail)


@router.post("/api/lotto/{draw_id}/attempts/bulk")
def lotto_add_attempts_bulk(draw_id: int, body: LottoAttemptsBulkCreate) -> dict[str, Any]:
    detail = insert_lotto_attempts_bulk(
        draw_id, [(a.numbers, a.ticket) for a in body.attempts]
    )
    if detail is None:
        raise HTTPException(status_code=404, detail="Draw not found.")
    return _serialize_detail(detail)


@router.put("/api/lotto/{draw_id}/attempts/{attempt_id}")
def lotto_update_attempt(
    draw_id: int, attempt_id: int, body: LottoAttemptCreate
) -> dict[str, Any]:
    detail = update_lotto_attempt(draw_id, attempt_id, body.numbers, body.ticket)
    if detail is None:
        raise HTTPException(status_code=404, detail="Attempt not found.")
    return _serialize_detail(detail)


@router.delete("/api/lotto/{draw_id}/attempts/{attempt_id}")
def lotto_remove_attempt(draw_id: int, attempt_id: int) -> dict[str, Any]:
    detail = delete_lotto_attempt(draw_id, attempt_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Attempt not found.")
    return _serialize_detail(detail)
