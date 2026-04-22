"""FastAPI application factory."""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.workbook_cache import resolve_path
from db import (
    apply_sqlite_working_copy_maybe,
    budget_data_is_empty,
    database_url,
    init_schema,
    minimal_schema_enabled,
    sync_excel_to_db,
    sync_sqlite_working_copy_maybe,
)

log = logging.getLogger(__name__)


def _cors_allow_origins() -> list[str]:
    """Browser origins allowed for the API (extend via ``BUDGET_CORS_ORIGINS``)."""
    defaults = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    raw = os.environ.get("BUDGET_CORS_ORIGINS", "")
    extra = [o.strip() for o in raw.split(",") if o.strip()]
    merged = [*defaults, *extra]
    return list(dict.fromkeys(merged))


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    apply_sqlite_working_copy_maybe()
    try:
        if not database_url():
            log.warning(
                "DATABASE_URL is not set — API requests that read data will return 503 until .env is configured.",
            )
        init_schema()
        if (
            database_url()
            and os.environ.get("BUDGET_SEED_EXCEL") == "1"
            and not minimal_schema_enabled()
        ):
            p = resolve_path()
            if p.is_file():
                if budget_data_is_empty():
                    try:
                        r = sync_excel_to_db(p)
                        log.info(
                            "BUDGET_SEED_EXCEL: inserted=%s skipped=%s",
                            r.inserted,
                            r.skipped,
                        )
                    except Exception as e:
                        log.warning("BUDGET_SEED_EXCEL failed: %s", e)
                else:
                    log.info(
                        "BUDGET_SEED_EXCEL: skipped — budget_data already has rows "
                        "(use upload/import to replace; avoids wiping DB on every reload).",
                    )
        yield
    finally:
        sync_sqlite_working_copy_maybe()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Budget XLSX API",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_allow_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from app.routers import (
        analyze,
        budget_labels,
        calendar,
        catalog,
        health,
        installment,
        payslip,
        recurring,
        transactions,
        upload,
        user_preferences,
        workbook,
    )

    if minimal_schema_enabled():
        for router in (
            health.router,
            payslip.router,
            installment.router,
        ):
            app.include_router(router)
    else:
        for router in (
            health.router,
            workbook.router,
            calendar.router,
            analyze.router,
            transactions.router,
            recurring.router,
            catalog.router,
            budget_labels.router,
            payslip.router,
            installment.router,
            upload.router,
            user_preferences.router,
        ):
            app.include_router(router)

    return app
