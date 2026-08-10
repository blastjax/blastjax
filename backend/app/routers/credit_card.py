"""Credit card summary, statement, and payment tracking."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

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
    get_credit_card,
    insert_credit_card,
    insert_credit_card_payment,
    list_credit_card_payments,
    list_installments,
    update_credit_card,
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
    """Minimum due plus this month's payments on installments carried on the card."""
    total = float(card.get("minimum_due") or 0)
    for r in installments:
        if is_installment_due_this_month(r):
            total += float(r.get("due_payment") or r.get("payment_total") or 0)
    return total


@router.get("/api/credit-card")
def credit_card_get() -> dict[str, Any]:
    key = "credit_card:get"
    hit = cache.get(key)
    if hit is not None:
        return hit
    card = get_credit_card()
    if not card:
        result = {"card": None, "installments": [], "payments": []}
        cache.set(key, result)
        return result
    installments = list_installments(limit=2000, credit_card_id=card["id"])
    payments = list_credit_card_payments(card["id"])
    serialized_card = _serialize_card(card)
    serialized_card["monthly_dues"] = _monthly_dues(card, installments)
    result = {
        "card": serialized_card,
        "installments": [serialize_installment_row(r) for r in installments],
        "payments": [_serialize_payment(p) for p in payments],
    }
    cache.set(key, result)
    return result


@router.post("/api/credit-card")
def credit_card_create(body: CreditCardCreate) -> dict[str, Any]:
    if get_credit_card() is not None:
        raise HTTPException(status_code=409, detail="A credit card already exists.")
    row = insert_credit_card(
        body.name.strip(),
        body.credit_limit,
        body.last_statement_balance,
        body.minimum_due,
        body.interest_rate,
        body.statement_date,
        body.due_date,
    )
    return {"card": _serialize_card(row)}


@router.put("/api/credit-card/{card_id}")
def credit_card_replace(card_id: int, body: CreditCardCreate) -> dict[str, Any]:
    row = update_credit_card(
        card_id,
        body.name.strip(),
        body.credit_limit,
        body.last_statement_balance,
        body.minimum_due,
        body.interest_rate,
        body.statement_date,
        body.due_date,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Credit card not found.")
    return {"card": _serialize_card(row)}


@router.patch("/api/credit-card/{card_id}/balance")
def credit_card_adjust_balance(
    card_id: int, body: CreditCardBalanceAdjust
) -> dict[str, Any]:
    card = get_credit_card()
    if not card or card["id"] != card_id:
        raise HTTPException(status_code=404, detail="Credit card not found.")
    credit_limit = float(card.get("credit_limit") or 0)
    row = adjust_credit_card_balance(card_id, credit_limit - body.available_limit)
    assert row is not None
    return {"card": _serialize_card(row)}


@router.delete("/api/credit-card/{card_id}")
def credit_card_remove(card_id: int) -> dict[str, Any]:
    if not delete_credit_card(card_id):
        raise HTTPException(status_code=404, detail="Credit card not found.")
    return {"ok": True}


@router.post("/api/credit-card/{card_id}/payments")
def credit_card_payment_create(
    card_id: int, body: CreditCardPaymentCreate
) -> dict[str, Any]:
    payment = insert_credit_card_payment(
        card_id, body.amount, body.payment_date, _clean_note(body.note)
    )
    if payment is None:
        raise HTTPException(status_code=404, detail="Credit card not found.")
    card = get_credit_card()
    assert card is not None
    return {"payment": _serialize_payment(payment), "card": _serialize_card(card)}


@router.delete("/api/credit-card/payments/{payment_id}")
def credit_card_payment_remove(payment_id: int) -> dict[str, Any]:
    if not delete_credit_card_payment(payment_id):
        raise HTTPException(status_code=404, detail="Payment not found.")
    card = get_credit_card()
    return {"ok": True, "card": _serialize_card(card) if card else None}
