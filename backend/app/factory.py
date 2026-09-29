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
    "/api/lotto": "lotto",
    "/api/fixed-expense": "fixed_expense",
    "/api/monthly-expense": "monthly_expense",
    "/api/calendar-day-override": "calendar_day_override",
    "/api/credit-card": "credit_card",
    "/api/pay-period-start-override": "pay_period_start_override",
    "/api/payslip-defaults": "payslip_default",
    "/api/travel": "travel",
}

_CACHE_ALSO_INVALIDATES: dict[str, tuple[str, ...]] = {
    "installment": ("credit_card",),
}


def _cache_prefixes_for(path: str) -> tuple[str, ...]:
    for route in sorted(_CACHE_PREFIXES, key=len, reverse=True):
        if path == route or path.startswith(route + "/"):
            prefix = _CACHE_PREFIXES[route]
            return (prefix, *_CACHE_ALSO_INVALIDATES.get(prefix, ()))
    return ()


def _invalidate_namespaces(names: tuple[str, ...]) -> None:
    for name in names:
        cache.invalidate(name)

_EXTRA_INVALIDATORS: tuple[tuple[str, Any], ...] = (
    ("/api/users", forget_login_required),
)


def _run_extra_invalidators(path: str) -> None:
    for route, fn in _EXTRA_INVALIDATORS:
        if path == route or path.startswith(route + "/"):
            fn()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    init_schema()
    cache.init_cache()
    cache.invalidate("lotto")
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
        path = request.url.path
        is_write = request.method in _WRITE_METHODS
        response = await call_next(request)
        if is_write and response.status_code < 400:
            namespaces = _cache_prefixes_for(path)
            if namespaces:
                await run_in_threadpool(_invalidate_namespaces, namespaces)
            _run_extra_invalidators(path)
        return response

    from app.routers import (
        auth,
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
        user.router,
    ):
        app.include_router(router, dependencies=[Depends(require_session)])

    return app
