"""Category / subcategory catalog."""
from __future__ import annotations
from typing import Any
from fastapi import APIRouter, HTTPException

from app.schemas.catalog import (
    CategoryCatalogCreate,
    CategoryCatalogPatch,
    SubcategoryCatalogCreate,
    SubcategoryCatalogRename,
)
from db import (
    apply_category_patch,
    create_category,
    create_subcategory,
    database_url,
    delete_category,
    delete_subcategory,
    list_category_catalog_tree,
    rename_subcategory,
    seed_category_catalog_from_budget_data,
)
from app.workbook_cache import invalidate_cache

router = APIRouter(tags=["catalog"])

@router.get("/api/category-catalog")
def get_category_catalog() -> dict[str, Any]:
    """Managed category and subcategory labels (see Categories page)."""
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    return {"categories": list_category_catalog_tree()}


@router.post("/api/category-catalog/seed-from-budget")
def post_seed_category_catalog_from_budget() -> dict[str, Any]:
    """
    Insert distinct Category / Subcategory values from `budget_data` into the
    catalog tables (skips duplicates). Safe to run after imports or sync.
    """
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    out = seed_category_catalog_from_budget_data()
    invalidate_cache()
    return out


@router.post("/api/category-catalog")
def post_category_catalog(body: CategoryCatalogCreate) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    try:
        cid = create_category(body.name, kind=body.kind)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    invalidate_cache()
    return {"id": cid}


@router.patch("/api/category-catalog/{category_id}")
def patch_category_catalog(
    category_id: int, body: CategoryCatalogPatch
) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    try:
        apply_category_patch(
            category_id,
            new_name=body.name,
            is_hidden=body.is_hidden,
            kind=body.kind,
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Category not found") from None
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    invalidate_cache()
    return {"id": category_id}


@router.delete("/api/category-catalog/{category_id}")
def remove_category_catalog(category_id: int) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    try:
        delete_category(category_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Category not found") from None
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    invalidate_cache()
    return {"ok": True}


@router.post("/api/category-catalog/{category_id}/subcategories")
def post_subcategory_catalog(
    category_id: int, body: SubcategoryCatalogCreate
) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    try:
        sid = create_subcategory(category_id, body.name)
    except LookupError:
        raise HTTPException(status_code=404, detail="Category not found") from None
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return {"id": sid, "category_id": category_id}


@router.patch("/api/subcategory-catalog/{subcategory_id}")
def patch_subcategory_catalog(
    subcategory_id: int, body: SubcategoryCatalogRename
) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    try:
        rename_subcategory(subcategory_id, body.name)
    except LookupError:
        raise HTTPException(status_code=404, detail="Subcategory not found") from None
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    invalidate_cache()
    return {"id": subcategory_id}


@router.delete("/api/subcategory-catalog/{subcategory_id}")
def remove_subcategory_catalog(subcategory_id: int) -> dict[str, Any]:
    if not database_url():
        raise HTTPException(status_code=503, detail="Database not configured")
    try:
        delete_subcategory(subcategory_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Subcategory not found") from None
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    invalidate_cache()
    return {"ok": True}
