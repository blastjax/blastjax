from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError

import cache
from app.deps import found, require_db
from app.schemas.credit_card import (
    CreditCardBalanceAdjust,
    CreditCardCreate,
    CreditCardPaymentCreate,
)
from app.schemas.responses import (
    CreditCardList,
    CreditCardOne,
    CreditCardPaymentRemoved,
    CreditCardPaymentSaved,
    Ok,
)
from app.services.installment_service import due_payment, is_installment_due_this_month
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

_NOT_FOUND = "Credit card not found."
_NO_PAYMENT = "Payment not found."
_NO_BILL_CATEGORY = "That bill category doesn't exist."


def _serialize_card(row: dict[str, Any]) -> dict[str, Any]:
    return {**row, "available_limit": float(row.get("credit_limit") or 0) - float(row.get("current_balance") or 0)}


def _statement_paid(card: dict[str, Any], payments: list[dict[str, Any]]) -> bool:
    """Whether payments since the statement date cover it. Partial payments don't count, whatever they add up to."""
    since, balance = card.get("statement_date"), float(card.get("last_statement_balance") or 0)
    if not since or balance <= 0:
        return False
    return sum(float(p["amount"]) for p in payments if p["payment_date"] >= since) >= balance


def _serialize_bundle(bundle: dict[str, Any]) -> dict[str, Any]:
    card, payments = bundle["card"], bundle["payments"]
    installments = [{**r, "due_this_month": is_installment_due_this_month(r)} for r in bundle["installments"]]
    return {
        "card": {
            **_serialize_card(card),
            "monthly_dues": sum(
                (due_payment(r) for r in installments if r["due_this_month"]),
                float(card.get("minimum_due") or 0),
            ),
            "statement_paid": _statement_paid(card, payments),
        },
        "installments": installments,
        "payments": payments,
    }


def _payment_with_card(payment: dict[str, Any]) -> dict[str, Any]:
    return {"payment": payment, "card": _serialize_card(found(get_credit_card(payment["credit_card_id"]), _NOT_FOUND))}


@router.get("/api/credit-card", response_model=CreditCardList)
def credit_card_list() -> dict[str, Any]:
    return cache.cached(
        "credit_card:list",
        lambda: {"cards": [_serialize_bundle(b) for b in fetch_credit_card_bundles()]},
    )


@router.post("/api/credit-card", response_model=CreditCardOne)
def credit_card_create(body: CreditCardCreate) -> dict[str, Any]:
    try:
        row = insert_credit_card(**body.model_dump())
    except IntegrityError:
        raise HTTPException(status_code=404, detail=_NO_BILL_CATEGORY)
    return {"card": _serialize_card(row)}


@router.put("/api/credit-card/{card_id}", response_model=CreditCardOne)
def credit_card_replace(card_id: UUID, body: CreditCardCreate) -> dict[str, Any]:
    try:
        row = update_credit_card(card_id, **body.model_dump())
    except IntegrityError:
        raise HTTPException(status_code=404, detail=_NO_BILL_CATEGORY)
    return {"card": _serialize_card(found(row, _NOT_FOUND))}


@router.patch("/api/credit-card/{card_id}/balance", response_model=CreditCardOne)
def credit_card_adjust_balance(card_id: UUID, body: CreditCardBalanceAdjust) -> dict[str, Any]:
    card = found(get_credit_card(card_id), _NOT_FOUND)
    credit_limit = float(card.get("credit_limit") or 0)
    row = adjust_credit_card_balance(card_id, credit_limit - body.available_limit)
    return {"card": _serialize_card(found(row, _NOT_FOUND))}


@router.delete("/api/credit-card/{card_id}", response_model=Ok)
def credit_card_remove(card_id: UUID) -> dict[str, Any]:
    if not delete_credit_card(card_id):
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True}


@router.post("/api/credit-card/{card_id}/payments", response_model=CreditCardPaymentSaved)
def credit_card_payment_create(card_id: UUID, body: CreditCardPaymentCreate) -> dict[str, Any]:
    return _payment_with_card(found(insert_credit_card_payment(card_id, **body.model_dump()), _NOT_FOUND))


@router.put("/api/credit-card/payments/{payment_id}", response_model=CreditCardPaymentSaved)
def credit_card_payment_replace(payment_id: UUID, body: CreditCardPaymentCreate) -> dict[str, Any]:
    return _payment_with_card(found(update_credit_card_payment(payment_id, **body.model_dump()), _NO_PAYMENT))


@router.delete("/api/credit-card/payments/{payment_id}", response_model=CreditCardPaymentRemoved)
def credit_card_payment_remove(payment_id: UUID) -> dict[str, Any]:
    return {"ok": True, "budget_changes": found(delete_credit_card_payment(payment_id), _NO_PAYMENT)}
