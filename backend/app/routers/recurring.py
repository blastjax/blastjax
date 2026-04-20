"""Repeat / recurring rules."""
from __future__ import annotations
from typing import Any
from fastapi import APIRouter, HTTPException

from app.schemas.recurring import RecurringRuleCreate, RecurringRuleUpdate
from app.services.recurring_service import post_due_recurring_inner
from db import database_url, delete_recurring_rule, insert_recurring_rule, list_recurring_rules, update_recurring_rule
from app.workbook_cache import invalidate_cache

router = APIRouter(tags=["recurring"])

@router.get("/api/recurring-rules")
def get_recurring_rules() -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    return {"rules": list_recurring_rules()}


@router.post("/api/recurring-rules")
def create_recurring_rule(body: RecurringRuleCreate) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    if body.frequency == "monthly" and body.day_of_month is None:
        raise HTTPException(
            status_code=400, detail="Monthly repeat requires day_of_month (1–31).",
        )
    if body.frequency == "weekly" and body.weekday is None:
        raise HTTPException(
            status_code=400, detail="Weekly repeat requires weekday (Mon=0 … Sun=6).",
        )
    if body.frequency == "quarterly" and body.day_of_month is None:
        raise HTTPException(
            status_code=400,
            detail="Quarterly repeat requires day_of_month (due in Jan / Apr / Jul / Oct).",
        )
    if body.frequency == "yearly" and (
        body.day_of_month is None or body.month_of_year is None
    ):
        raise HTTPException(
            status_code=400,
            detail="Yearly repeat requires day_of_month and month_of_year (1–12).",
        )
    dom = body.day_of_month
    wk = body.weekday
    moy = body.month_of_year
    if body.frequency == "monthly":
        wk, moy = None, None
    elif body.frequency == "weekly":
        dom, moy = None, None
    elif body.frequency == "quarterly":
        wk, moy = None, None
    else:
        wk = None
    rid = insert_recurring_rule(
        label=body.label.strip(),
        kind=body.kind,
        frequency=body.frequency,
        day_of_month=dom,
        weekday=wk,
        month_of_year=moy,
        accounts=body.accounts,
        category=body.category,
        subcategory=body.subcategory,
        note=body.note,
        description=body.description,
        amount=body.amount,
        currency=body.currency,
        is_active=body.is_active,
    )
    invalidate_cache()
    return {"id": rid}


@router.put("/api/recurring-rules/{rule_id}")
def put_recurring_rule(rule_id: int, body: RecurringRuleUpdate) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    raw = body.model_dump(exclude_unset=True)
    if not raw:
        raise HTTPException(status_code=400, detail="No fields to update")
    ok = update_recurring_rule(rule_id, raw)
    if not ok:
        raise HTTPException(status_code=404, detail="Rule not found")
    invalidate_cache()
    return {"id": rule_id}


@router.delete("/api/recurring-rules/{rule_id}")
def remove_recurring_rule(rule_id: int) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    if not delete_recurring_rule(rule_id):
        raise HTTPException(status_code=404, detail="Rule not found")
    invalidate_cache()
    return {"ok": True}


@router.post("/api/recurring-rules/post-due")
def post_due_recurring_rules() -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    posted = post_due_recurring_inner()
    if posted:
        invalidate_cache()
    return {"posted": posted}
