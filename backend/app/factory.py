from __future__ import annotations

import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

import cache
from app.deps import require_session
from app.security import forget_login_required
from db import close_connection_pool, init_schema

_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def cors_allow_origins() -> list[str]:
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
    "/api/lotto": "lotto",
    "/api/fixed-expense": "fixed_expense",
    "/api/monthly-expense": "monthly_expense",
    "/api/calendar-day-override": "calendar_day_override",
    "/api/credit-card": "credit_card",
    "/api/pay-period-start-override": "pay_period_start_override",
    "/api/payslip-defaults": "payslip_default",
    "/api/travel": "travel",
    "/api/bill": "bill",
    "/api/bill-category": "bill",
}

_CACHE_ALSO_INVALIDATES: dict[str, tuple[str, ...]] = {
    "installment": ("credit_card",),
    # A linked card reads its statement from the latest bill; removing a category unlinks its monthly expenses.
    "bill": ("credit_card", "monthly_expense"),
    "house_payment": ("monthly_expense",),  # removing one unlinks its monthly expenses
    # Removing a card unlinks its installments; a payment is also a fixed expense.
    "credit_card": ("installment", "fixed_expense"),
}


def _under(path: str, route: str) -> bool:
    return path == route or path.startswith(route + "/")


def _cache_prefixes_for(path: str) -> tuple[str, ...]:
    # No route here sits under another, so the first match is the only one.
    for route, prefix in _CACHE_PREFIXES.items():
        if _under(path, route):
            return (prefix, *_CACHE_ALSO_INVALIDATES.get(prefix, ()))
    return ()


def _forget_what_a_write_changed(path: str) -> None:
    for name in _cache_prefixes_for(path):
        cache.invalidate(name)
    if _under(path, "/api/users"):  # adding the first user turns login on; removing the last turns it off
        forget_login_required()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    init_schema()
    cache.init_cache()
    # A fresh start never serves what an older build (or a change made outside the API) left cached.
    cache.flush()
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
        allow_origins=cors_allow_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def invalidate_cache_on_write(request: Request, call_next):
        response = await call_next(request)
        if request.method in _WRITE_METHODS and response.status_code < 400:
            # Redis is a blocking client: keep it off the event loop.
            await run_in_threadpool(_forget_what_a_write_changed, request.url.path)
        return response

    from app.routers import (
        auth,
        bill,
        blood_pressure,
        calendar_day_override,
        company,
        credit_card,
        fixed_expense,
        health,
        house_payment,
        installment,
        lotto,
        mambo,
        monthly_expense,
        mosaic,
        pay_period_start_override,
        payslip,
        payslip_default,
        search,
        travel,
        user,
    )

    app.include_router(health.router)
    app.include_router(auth.router)

    for router in (
        payslip.router,
        installment.router,
        house_payment.router,
        blood_pressure.router,
        lotto.router,
        fixed_expense.router,
        monthly_expense.router,
        calendar_day_override.router,
        company.router,
        credit_card.router,
        pay_period_start_override.router,
        payslip_default.router,
        mosaic.router,
        mambo.router,
        travel.router,
        bill.router,
        user.router,
        search.router,
    ):
        app.include_router(router, dependencies=[Depends(require_session)])

    return app
