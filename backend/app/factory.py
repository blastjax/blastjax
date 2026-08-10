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


"""
Namespaces a write must bust *in addition to* its own. An installment write
changes the credit-card response too (the card's monthly dues are derived from
its installments), so the two caches can't be invalidated independently.
"""
_CACHE_ALSO_INVALIDATES: dict[str, tuple[str, ...]] = {
    "installment": ("credit_card",),
}


def _cache_prefixes_for(path: str) -> tuple[str, ...]:
    """Every cache namespace a write to ``path`` invalidates, own namespace first."""
    for route, prefix in _CACHE_PREFIXES.items():
        if path.startswith(route):
            return (prefix, *_CACHE_ALSO_INVALIDATES.get(prefix, ()))
    return ()


def _invalidate_namespaces(names: tuple[str, ...]) -> None:
    for name in names:
        cache.invalidate(name)


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
        """
        Invalidate the affected cache namespaces after a successful write.

        This is the *only* place writes bust the cache. Every write endpoint used
        to also call ``cache.invalidate`` itself for the same namespace this
        middleware derives from the path, so each write ran the SCAN + DELETE
        loop twice (three times for installment writes, which busted two
        namespaces). Centralizing it here also means cache-invalidation policy
        lives in one readable table instead of being restated in 28 handlers.
        """
        path = request.url.path
        is_write = request.method in _WRITE_METHODS
        response = await call_next(request)
        if is_write and response.status_code < 400:
            namespaces = _cache_prefixes_for(path)
            if namespaces:
                await run_in_threadpool(_invalidate_namespaces, namespaces)
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
        mosaic,
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
        mosaic.router,
    ):
        app.include_router(router)

    return app
