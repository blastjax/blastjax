"""Lotto draw & attempt endpoints.

A draw is the official result for one date: 6 winning numbers, the jackpot
prize at stake, and how many tickets won it. A draw is upserted by date
(posting the same date again overwrites that date's result) — including via
``POST /api/lotto/import-text``, which bulk-loads pasted historic results
text (the same shape "Paste attempts" reads, one draw per line) in one shot.
``POST /api/lotto/sync-pcso`` pulls new results straight from pcso.gov.ph
instead, and never overwrites a date that already has one.
Attempts are the user's own picks, added, edited, and removed underneath a
draw — linked to it (and so to its date) via ``draw_id``.
"""

from __future__ import annotations

import datetime as dt
import time
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
from app.services.lotto_analysis import LottoAnalysis, NumberStat, PairStat, analyze_draws
from app.services.lotto_import import import_rows_to_bulk_params, parse_lotto_draw_text
from app.services.lotto_prize_analysis import DrawRecord, PrizeAnalysis, analyze_prizes
from app.services.pcso_results import PH_TIME, PcsoError, fetch_results, sync_start
from db import (
    delete_lotto_attempt,
    delete_lotto_draw,
    get_lotto_draw_id_by_date,
    insert_lotto_attempt,
    insert_lotto_attempts_bulk,
    insert_lotto_results,
    list_lotto_draw_results,
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
    """A draw's winning numbers, or `[]` if the result isn't in yet."""
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


def _serialize_number_stat(s: NumberStat) -> dict[str, Any]:
    return {"number": s.number, "count": s.count, "draws_since_seen": s.draws_since_seen}


def _serialize_pair_stat(p: PairStat) -> dict[str, Any]:
    return {"numbers": list(p.numbers), "count": p.count}


def _serialize_analysis(a: LottoAnalysis) -> dict[str, Any]:
    return {
        "draw_count": a.draw_count,
        "numbers": [_serialize_number_stat(s) for s in a.numbers],
        "hottest": [_serialize_number_stat(s) for s in a.hottest],
        "coldest": [_serialize_number_stat(s) for s in a.coldest],
        "most_overdue": [_serialize_number_stat(s) for s in a.most_overdue],
        "top_pairs": [_serialize_pair_stat(p) for p in a.top_pairs],
        "expected_count_per_number": a.expected_count_per_number,
        "chi_square": a.chi_square,
        "chi_square_p_value": a.chi_square_p_value,
        "degrees_of_freedom": a.degrees_of_freedom,
        "sum_mean": a.sum_mean,
        "sum_stdev": a.sum_stdev,
        "theoretical_sum_mean": a.theoretical_sum_mean,
        "odd_count": a.odd_count,
        "even_count": a.even_count,
        "low_count": a.low_count,
        "high_count": a.high_count,
        "consecutive_number_draws": a.consecutive_number_draws,
        "repeat_from_previous_draw_avg": a.repeat_from_previous_draw_avg,
        "theoretical_repeat_avg": a.theoretical_repeat_avg,
    }


def _serialize_bucket(b: Any) -> dict[str, Any]:
    return {
        "label": b.label,
        "draws": b.draws,
        "winner_draws": b.winner_draws,
        "total_winners": b.total_winners,
        "win_rate": b.win_rate,
        "mean_jackpot": b.mean_jackpot,
    }


def _serialize_prize_analysis(a: PrizeAnalysis) -> dict[str, Any]:
    return {
        "draw_count": a.draw_count,
        "first_date": a.first_date.isoformat(),
        "last_date": a.last_date.isoformat(),
        "missing_jackpot_draws": a.missing_jackpot_draws,
        "winner_draws": a.winner_draws,
        "total_winners": a.total_winners,
        "win_rate": a.win_rate,
        "winner_count_distribution": [
            {"winners": w, "draws": n} for w, n in a.winner_count_distribution
        ],
        "multi_winner_draws": [
            {
                "draw_date": d.draw_date.isoformat(),
                "numbers": d.numbers,
                "jackpot_prize": d.jackpot_prize,
                "winners": d.winners,
            }
            for d in a.multi_winner_draws
        ],
        "mean_streak_draws": a.mean_streak_draws,
        "median_streak_draws": a.median_streak_draws,
        "longest_streak": (
            {
                "start": a.longest_streak.start.isoformat(),
                "end": a.longest_streak.end.isoformat(),
                "draws": a.longest_streak.draws,
                "starting_jackpot": a.longest_streak.starting_jackpot,
                "ending_jackpot": a.longest_streak.ending_jackpot,
            }
            if a.longest_streak is not None
            else None
        ),
        "flat_rollover_draws": a.flat_rollover_draws,
        "growing_rollover_draws": a.growing_rollover_draws,
        "mean_rollover_growth": a.mean_rollover_growth,
        "mean_rollover_growth_pct": a.mean_rollover_growth_pct,
        "max_jackpot": (
            {"draw_date": a.max_jackpot[0].isoformat(), "jackpot_prize": a.max_jackpot[1]}
            if a.max_jackpot is not None
            else None
        ),
        "mean_jackpot_when_won": a.mean_jackpot_when_won,
        "mean_jackpot_when_not_won": a.mean_jackpot_when_not_won,
        "jackpot_buckets": [_serialize_bucket(b) for b in a.jackpot_buckets],
        "weekday_buckets": [_serialize_bucket(b) for b in a.weekday_buckets],
        "month_buckets": [_serialize_bucket(b) for b in a.month_buckets],
        "weekdays_by_year": [{"year": y, "weekdays": days} for y, days in a.weekdays_by_year],
        "largest_gaps": [
            {"previous": p.isoformat(), "next": n.isoformat(), "days": d}
            for p, n, d in a.largest_gaps
        ],
        "homogeneity_tests": [
            {
                "label": t.label,
                "chi_square": t.chi_square,
                "degrees_of_freedom": t.degrees_of_freedom,
                "p_value": t.p_value,
                "significant": t.significant,
            }
            for t in a.homogeneity_tests
        ],
        "popularity_groups": [
            {
                "label": g.label,
                "draws": g.draws,
                "mean_birthday_numbers": g.mean_birthday_numbers,
                "z_score": g.z_score,
                "mean_jackpot": g.mean_jackpot,
            }
            for g in a.popularity_groups
        ],
        "expected_birthday_numbers": a.expected_birthday_numbers,
    }


@router.get("/api/lotto/analysis")
def lotto_analysis(top: int = Query(default=10, ge=1, le=58)) -> dict[str, Any]:
    """Descriptive stats over every draw with an announced result.

    ``numbers`` covers the winning numbers themselves — hot/cold/overdue,
    common pairs, and a goodness-of-fit check against a fair random draw.
    ``prizes`` covers the context around them — jackpot rollover structure,
    winner counts, draw dates, and how crowd-pleasing the winning
    combinations were. See the two ``lotto_*_analysis`` services for what
    each field means."""
    key = f"lotto:analysis:{top}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    rows = list_lotto_draw_results()
    if not rows:
        raise HTTPException(status_code=404, detail="No draws with results yet to analyze.")
    numbers_analysis = analyze_draws([_numbers(r) for r in rows], top_n=top)
    records = [
        DrawRecord(
            draw_date=dt.date.fromisoformat(str(d["draw_date"])[:10]),
            numbers=_numbers(d),
            jackpot_prize=d["jackpot_prize"],
            winners=d["winners"],
        )
        for d in rows
    ]
    result = {
        "numbers": _serialize_analysis(numbers_analysis),
        "prizes": _serialize_prize_analysis(analyze_prizes(records, top_n=top)),
    }
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
    """Bulk-load historic results from pasted text — one row per draw:
    ``| n1-n2-n3-n4-n5-n6 | m/d/yyyy | jackpot | winners |`` (a leading
    tab-separated game-name column, e.g. from a spreadsheet paste, is
    tolerated and discarded — see ``parse_lotto_draw_text``). Each row is
    upserted by date within ``game_id`` (same rule as ``POST /api/lotto``),
    so re-pasting the same rows — or a newer batch that also fills in
    jackpot/winner columns for draws already in the database — overwrites
    rather than duplicating."""
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


# pcso.gov.ph is only asked from 10 PM PH time, when the night's draws are
# posted, and then at most once per _PCSO_SYNC_EVERY however often the Lotto
# page loads -- few enough requests to stay under Akamai's bot protection. The
# API runs a single uvicorn worker, so a module global is all the state.
_PCSO_SYNC_FROM = dt.time(22)
_PCSO_SYNC_EVERY = 15 * 60
_pcso_synced_at: float | None = None


@router.post("/api/lotto/sync-pcso")
def lotto_sync_pcso() -> dict[str, Any]:
    """Pull every tracked game's results newer than what's stored from
    pcso.gov.ph -- the Lotto page fires this on load, but it's a no-op before
    10 PM PH time. Only the gap is searched (from the day after the game
    furthest behind, see ``sync_start``), so a night the page wasn't opened is
    caught up the next one, and a game+date that already has a result is
    skipped, never overwritten (see ``insert_lotto_results``). ``inserted`` is
    how many draws were added."""
    global _pcso_synced_at
    ph_now = dt.datetime.now(PH_TIME)
    if ph_now.time() < _PCSO_SYNC_FROM:
        return {"inserted": 0}
    now = time.monotonic()
    if _pcso_synced_at is not None and now - _pcso_synced_at < _PCSO_SYNC_EVERY:
        return {"inserted": 0}
    _pcso_synced_at = now  # stamped up front, so a failing PCSO isn't retried on every load either
    games = list_lotto_latest_results()
    today = ph_now.date()
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
    """Add every attempt in ``body.attempts`` in one round trip — what
    "Paste attempts" uses, instead of one ``POST .../attempts`` per line."""
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
