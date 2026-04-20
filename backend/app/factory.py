"""FastAPI application factory."""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.workbook_cache import resolve_path
from db import budget_data_is_empty, database_url, init_schema, sync_excel_to_db

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    if not database_url():
        log.warning(
            "DATABASE_URL is not set — API requests that read data will return 503 until .env is configured.",
        )
    init_schema()
    if database_url() and os.environ.get("BUDGET_SEED_EXCEL") == "1":
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


def create_app() -> FastAPI:
    app = FastAPI(
        title="Budget XLSX API",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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
