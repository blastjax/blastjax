from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError

import cache
from app.deps import require_db
from app.schemas.credit_card import (
    CreditCardBalanceAdjust,
    CreditCardCreate,
    CreditCardPaymentCreate,
)
from app.services.installment_service import (
    is_installment_due_this_month,
    serialize_installment_row,
)
from db import (
    adjust_credit_card_balance,
    delete_credit_card,
    delete_credit_card_payment,
    fetch_credit_card_bundles,
    get_credit_card,
    insert_credit_card,
    insert_credit_card_payment,
    update_credit_card,
    update_credit_card_payment,
)

router = APIRouter(tags=["credit_card"], dependencies=[Depends(require_db)])


def _serialize_card(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    for key in ("statement_date", "due_date", "created_at"):
        v = out.get(key)
        if hasattr(v, "isoformat"):
            out[key] = v.isoformat()
    credit_limit = float(out.get("credit_limit") or 0)
    current_balance = float(out.get("current_balance") or 0)
    out["available_limit"] = credit_limit - current_balance
    return out


def _serialize_payment(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    for key in ("payment_date", "created_at"):
        v = out.get(key)
        if hasattr(v, "isoformat"):
            out[key] = v.isoformat()
    return out


def _clean_note(note: str | None) -> str | None:
    if note is None:
        return None
    trimmed = note.strip()
    return trimmed or None


def _monthly_dues(card: dict[str, Any], installments: list[dict[str, Any]]) -> float:
    total = float(card.get("minimum_due") or 0)
    for r in installments:
        if is_installment_due_this_month(r):
            total += float(r.get("due_payment") or r.get("payment_total") or 0)
    return total


def _statement_paid(card: dict[str, Any], payments: list[dict[str, Any]]) -> bool:
    """Whether payments since the statement date cover it. Partial payments don't count, whatever they add up to."""
    since, balance = card.get("statement_date"), float(card.get("last_statement_balance") or 0)
    if not since or balance <= 0:
        return False
    return sum(float(p["amount"]) for p in payments if p["payment_date"] >= since) >= balance


def _serialize_bundle(bundle: dict[str, Any]) -> dict[str, Any]:
    card, installments, payments = bundle["card"], bundle["installments"], bundle["payments"]
    return {
        "card": {
            **_serialize_card(card),
            "monthly_dues": _monthly_dues(card, installments),
            "statement_paid": _statement_paid(card, payments),
        },
        "installments": [
            {**serialize_installment_row(r), "due_this_month": is_installment_due_this_month(r)} for r in installments
        ],
        "payments": [_serialize_payment(p) for p in payments],
    }


@router.get("/api/credit-card")
def credit_card_list() -> dict[str, Any]:
    key = "credit_card:list"
    hit = cache.get(key)
    if hit is not None:
        return hit
    result = {"cards": [_serialize_bundle(b) for b in fetch_credit_card_bundles()]}
    cache.set(key, result)
    return result


_NO_BILL_CATEGORY = "That bill category doesn't exist."


@router.post("/api/credit-card")
def credit_card_create(body: CreditCardCreate) -> dict[str, Any]:
    try:
        row = insert_credit_card(
            body.name.strip(),
            body.credit_limit,
            body.last_statement_balance,
            body.minimum_due,
            body.interest_rate,
            body.statement_date,
            body.due_date,
            body.bill_category_id,
        )
    except IntegrityError:
        raise HTTPException(status_code=404, detail=_NO_BILL_CATEGORY)
    return {"card": _serialize_card(row)}


@router.put("/api/credit-card/{card_id}")
def credit_card_replace(card_id: UUID, body: CreditCardCreate) -> dict[str, Any]:
    try:
        row = update_credit_card(
            card_id,
            body.name.strip(),
            body.credit_limit,
            body.last_statement_balance,
            body.minimum_due,
            body.interest_rate,
            body.statement_date,
            body.due_date,
            body.bill_category_id,
        )
    except IntegrityError:
        raise HTTPException(status_code=404, detail=_NO_BILL_CATEGORY)
    if row is None:
        raise HTTPException(status_code=404, detail="Credit card not found.")
    return {"card": _serialize_card(row)}


@router.patch("/api/credit-card/{card_id}/balance")
def credit_card_adjust_balance(
    card_id: UUID, body: CreditCardBalanceAdjust
) -> dict[str, Any]:
    card = get_credit_card(card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Credit card not found.")
    credit_limit = float(card.get("credit_limit") or 0)
    row = adjust_credit_card_balance(card_id, credit_limit - body.available_limit)
    assert row is not None
    return {"card": _serialize_card(row)}


@router.delete("/api/credit-card/{card_id}")
def credit_card_remove(card_id: UUID) -> dict[str, Any]:
    if not delete_credit_card(card_id):
        raise HTTPException(status_code=404, detail="Credit card not found.")
    return {"ok": True}


@router.post("/api/credit-card/{card_id}/payments")
def credit_card_payment_create(
    card_id: UUID, body: CreditCardPaymentCreate
) -> dict[str, Any]:
    payment = insert_credit_card_payment(
        card_id,
        body.amount,
        body.payment_date,
        _clean_note(body.note),
        body.period_half,
        body.period_year,
        body.period_month,
    )
    if payment is None:
        raise HTTPException(status_code=404, detail="Credit card not found.")
    card = get_credit_card(card_id)
    assert card is not None
    return {"payment": _serialize_payment(payment), "card": _serialize_card(card)}


@router.put("/api/credit-card/payments/{payment_id}")
def credit_card_payment_replace(payment_id: UUID, body: CreditCardPaymentCreate) -> dict[str, Any]:
    payment = update_credit_card_payment(
        payment_id,
        body.amount,
        body.payment_date,
        _clean_note(body.note),
        body.period_half,
        body.period_year,
        body.period_month,
    )
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found.")
    card = get_credit_card(payment["credit_card_id"])
    assert card is not None
    return {"payment": _serialize_payment(payment), "card": _serialize_card(card)}


@router.delete("/api/credit-card/payments/{payment_id}")
def credit_card_payment_remove(payment_id: UUID) -> dict[str, Any]:
    changes = delete_credit_card_payment(payment_id)
    if changes is None:
        raise HTTPException(status_code=404, detail="Payment not found.")
    return {"ok": True, "budget_changes": changes}
