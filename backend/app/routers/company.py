from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError

from app.deps import found, require_db
from app.schemas.company import CompanyCreate, CompanyReorder
from app.schemas.responses import CompanyList, CompanyOne, Ok
from db import (
    delete_company,
    insert_company,
    list_companies,
    reorder_companies,
    update_company,
)

router = APIRouter(prefix="/api/companies", tags=["companies"], dependencies=[Depends(require_db)])

_NOT_FOUND = "Company not found."
_DUPLICATE = "That company already exists."


@router.get("", response_model=CompanyList)
def companies_list() -> dict[str, Any]:
    return {"companies": list_companies()}


@router.post("", response_model=CompanyOne)
def companies_create(body: CompanyCreate) -> dict[str, Any]:
    try:
        return {"company": insert_company(body.name, body.flags_dict())}
    except IntegrityError:
        raise HTTPException(status_code=409, detail=_DUPLICATE)


@router.put("/reorder", response_model=CompanyList)
def companies_reorder(body: CompanyReorder) -> dict[str, Any]:
    rows = reorder_companies(body.ids)
    if rows is None:
        raise HTTPException(
            status_code=400,
            detail="ids must list every company id exactly once.",
        )
    return {"companies": rows}


@router.put("/{company_id}", response_model=CompanyOne)
def companies_update(company_id: UUID, body: CompanyCreate) -> dict[str, Any]:
    try:
        row = update_company(company_id, body.name, body.flags_dict())
    except IntegrityError:
        raise HTTPException(status_code=409, detail=_DUPLICATE)
    return {"company": found(row, _NOT_FOUND)}


@router.delete("/{company_id}", response_model=Ok)
def companies_remove(company_id: UUID) -> dict[str, Any]:
    try:
        deleted = delete_company(company_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True}
