"""FastAPI application factory."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
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


"""
Namespaces a write must bust *in addition to* its own. An installment write
changes the credit-card response too (the card's monthly dues are derived from
its installments), so the two caches can't be invalidated independently.
"""
_CACHE_ALSO_INVALIDATES: dict[str, tuple[str, ...]] = {
    "installment": ("credit_card",),
}


def _cache_prefixes_for(path: str) -> tuple[str, ...]:
    """Every cache namespace a write to ``path`` invalidates, own namespace first.

    A route matches only on a path-segment boundary, and longer routes are
    tried first. Both matter: ``/api/payslip`` is a *string* prefix of
    ``/api/payslip-defaults`` without being a *path* prefix of it, so a plain
    ``startswith`` scan in table order sent every defaults save to the
    ``payslip`` namespace and left ``payslip_default:bundle`` stale for a full
    TTL — Settings kept serving the values from before the save.
    """
    for route in sorted(_CACHE_PREFIXES, key=len, reverse=True):
        if path == route or path.startswith(route + "/"):
            prefix = _CACHE_PREFIXES[route]
            return (prefix, *_CACHE_ALSO_INVALIDATES.get(prefix, ()))
    return ()


def _invalidate_namespaces(names: tuple[str, ...]) -> None:
    for name in names:
        cache.invalidate(name)


"""
Paths whose writes invalidate something that isn't a response cache namespace.
Adding or removing a user is what switches login on and off, and
``require_session`` answers that from a cache on every request.
"""
_EXTRA_INVALIDATORS: tuple[tuple[str, Any], ...] = (
    ("/api/users", forget_login_required),
)


def _run_extra_invalidators(path: str) -> None:
    for route, fn in _EXTRA_INVALIDATORS:
        if path == route or path.startswith(route + "/"):
            fn()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_schema()
    cache.init_cache()
    # Startup may have just added a lotto_game row (schema.sync_lotto_games),
    # and the games list is cached for a day with nothing to invalidate it --
    # no request wrote to /api/lotto. Without this the new game stays hidden
    # until the TTL lapses.
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

    # health and auth stay open — everything else requires a login session
    # (see require_session; it's a no-op until a user exists — Settings → Users).
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
