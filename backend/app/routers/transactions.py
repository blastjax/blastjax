"""Budget transaction CRUD."""
from __future__ import annotations
from typing import Any
from fastapi import APIRouter, HTTPException

from app.schemas.transactions import TransactionCreate, TransactionUpdate
from db import delete_budget_transaction, insert_budget_transaction, insert_budget_transfer, update_budget_transaction
from app.workbook_cache import invalidate_cache

router = APIRouter(tags=["transactions"])

@router.post("/api/transaction")
def create_transaction(body: TransactionCreate) -> dict[str, Any]:
    if body.kind == "transfer":
        fa = (body.accounts or "").strip()
        ta = (body.transfer_to_account or "").strip()
        if not fa or not ta:
            raise HTTPException(
                status_code=400,
                detail="Transfer requires accounts (from) and transfer_to_account (to).",
            )
        if fa.lower() == ta.lower():
            raise HTTPException(
                status_code=400,
                detail="From and to accounts must differ.",
            )
        base_desc = (body.description or "").strip()
        desc_out = base_desc or f"Transfer to {ta}"
        desc_in = base_desc or f"Transfer from {fa}"
        id_out, id_in, id_fee = insert_budget_transfer(
            period=body.period,
            from_account=fa,
            to_account=ta,
            category=body.category,
            subcategory=body.subcategory,
            note=body.note,
            php=body.php,
            amount=body.amount,
            currency=body.currency,
            description_out=desc_out,
            description_in=desc_in,
            transfer_fee=body.transfer_fee,
        )
        invalidate_cache()
        out: dict[str, Any] = {
            "id": id_out,
            "transfer_pair_id": id_in,
            "kind": "transfer",
        }
        if id_fee is not None:
            out["fee_id"] = id_fee
        return out

    income_expense = "Income" if body.kind == "income" else "Expense"
    acct = (body.accounts or "").strip() or None
    tid = insert_budget_transaction(
        period=body.period,
        accounts=acct,
        category=body.category,
        subcategory=body.subcategory,
        note=body.note,
        php=body.php,
        income_expense=income_expense,
        description=body.description,
        amount=body.amount,
        currency=body.currency,
    )
    invalidate_cache()
    return {"id": tid, "kind": body.kind}


@router.put("/api/transaction/{transaction_id}")
def replace_transaction(transaction_id: int, body: TransactionUpdate) -> dict[str, Any]:
    raw = body.model_dump(exclude_unset=True)
    if not raw:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        ok = update_budget_transaction(transaction_id, raw)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    if not ok:
        raise HTTPException(status_code=404, detail="Transaction not found")
    invalidate_cache()
    return {"id": transaction_id}


@router.delete("/api/transaction/{transaction_id}")
def remove_transaction(transaction_id: int) -> dict[str, Any]:
    if not delete_budget_transaction(transaction_id):
        raise HTTPException(status_code=404, detail="Transaction not found")
    invalidate_cache()
    return {"ok": True}
