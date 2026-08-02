"""FastAPI application factory."""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

import cache
from db import close_connection_pool, database_url, init_schema

log = logging.getLogger(__name__)

_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _cors_allow_origins() -> list[str]:
    defaults = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    raw = os.environ.get("BUDGET_CORS_ORIGINS", "")
    extra = [o.strip() for o in raw.split(",") if o.strip()]
    merged = [*defaults, *extra]
    return list(dict.fromkeys(merged))


_CACHE_PREFIXES: dict[str, str] = {
    "/api/payslip": "payslip",
    "/api/installment": "installment",
    "/api/house-payment": "house_payment",
    "/api/blood-pressure": "bp",
    "/api/fixed-expense": "fixed_expense",
    "/api/monthly-expense": "monthly_expense",
    "/api/calendar-day-override": "calendar_day_override",
    "/api/credit-card": "credit_card",
    "/api/pay-period-start-override": "pay_period_start_override",
}


def _cache_prefix(path: str) -> str | None:
    for route, prefix in _CACHE_PREFIXES.items():
        if path.startswith(route):
            return prefix
    return None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    if not database_url():
        log.warning(
            "DATABASE_URL (or DB_*) is not set — API requests that need the DB will fail until .env is configured.",
        )
    init_schema()
    cache.init_cache()
    try:
        yield
    finally:
        cache.close_cache()
        close_connection_pool()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Budget payslip & installments API",
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

    @app.middleware("http")
    async def invalidate_cache_on_write(request: Request, call_next):
        """Invalidate the relevant cache namespace after a successful write."""
        path = request.url.path
        is_write = request.method in _WRITE_METHODS
        response = await call_next(request)
        if is_write and response.status_code < 400:
            ns = _cache_prefix(path)
            if ns:
                await run_in_threadpool(cache.invalidate, ns)
        return response

    from app.routers import (
        blood_pressure,
        calendar_day_override,
        credit_card,
        fixed_expense,
        health,
        house_payment,
        installment,
        monthly_expense,
        pay_period_start_override,
        payslip,
    )

    for router in (
        health.router,
        payslip.router,
        installment.router,
        house_payment.router,
        blood_pressure.router,
        fixed_expense.router,
        monthly_expense.router,
        calendar_day_override.router,
        credit_card.router,
        pay_period_start_override.router,
    ):
        app.include_router(router)

    return app
