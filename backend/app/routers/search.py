from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from app.deps import require_db
from app.schemas.responses import SearchResults
from db import search_records

router = APIRouter(tags=["search"], dependencies=[Depends(require_db)])


@router.get("/api/search", response_model=SearchResults)
def search(q: str = Query(min_length=2, max_length=100)) -> dict[str, Any]:
    return {"results": search_records(q.strip())}
