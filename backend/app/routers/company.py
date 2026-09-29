from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError

from app.deps import require_db
from app.schemas.company import CompanyCreate, CompanyReorder, CompanyUpdate
from db import (
    delete_company,
    insert_company,
    list_companies,
    reorder_companies,
    update_company,
)

router = APIRouter(prefix="/api/companies", tags=["companies"], dependencies=[Depends(require_db)])


def _serialize(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    v = out.get("created_at")
    if hasattr(v, "isoformat"):
        out["created_at"] = v.isoformat()
    return out


@router.get("")
def companies_list() -> dict[str, Any]:
    return {"companies": [_serialize(r) for r in list_companies()]}


@router.post("")
def companies_create(body: CompanyCreate) -> dict[str, Any]:
    try:
        row = insert_company(body.name.strip(), body.flags_dict())
    except IntegrityError:
        raise HTTPException(status_code=409, detail="That company already exists.")
    return {"company": _serialize(row)}


@router.put("/reorder")
def companies_reorder(body: CompanyReorder) -> dict[str, Any]:
    rows = reorder_companies(body.ids)
    if rows is None:
        raise HTTPException(
            status_code=400,
            detail="ids must list every company id exactly once.",
        )
    return {"companies": [_serialize(r) for r in rows]}


@router.put("/{company_id}")
def companies_update(company_id: int, body: CompanyUpdate) -> dict[str, Any]:
    try:
        row = update_company(company_id, body.name.strip(), body.flags_dict())
    except IntegrityError:
        raise HTTPException(status_code=409, detail="That company already exists.")
    if row is None:
        raise HTTPException(status_code=404, detail="Company not found.")
    return {"company": _serialize(row)}


@router.delete("/{company_id}")
def companies_remove(company_id: int) -> dict[str, Any]:
    try:
        deleted = delete_company(company_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="Company not found.")
    return {"ok": True}
