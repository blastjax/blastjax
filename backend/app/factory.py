"""FastAPI application factory."""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

import cache
import db_sync
from db import close_connection_pool, database_url, init_schema

log = logging.getLogger(__name__)

_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Holds references to in-flight background cloud-push tasks so they aren't
# garbage-collected before they finish (asyncio only keeps weak refs).
_background_tasks: set[asyncio.Task[None]] = set()


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
    async def mirror_local_db(request: Request, call_next):
        """
        Keep the local mirror in sync with the cloud around each API call.

        Reads mirror cloud -> local first so they serve fresh data. Writes are
        applied to local (the primary) by the endpoint and return immediately —
        the cloud push runs in the *background* so saves aren't blocked on the
        cloud round-trip. The local DB is flagged dirty synchronously first, so
        an unpushed write can never be clobbered by a later pull if the
        background push hasn't finished. No-op unless ``LOCAL_DB_*`` + cloud are
        both set. Blocking DB I/O runs in worker threads, off the event loop.
        """
        path = request.url.path
        active = path.startswith("/api/") and db_sync.sync_enabled()
        # /api/sync already mirrors local -> cloud itself; don't double-push.
        is_write = request.method in _WRITE_METHODS and path != "/api/sync"
        if active and not is_write:
            await run_in_threadpool(db_sync.pull_before_request)
        response = await call_next(request)
        if is_write and response.status_code < 400:
            ns = _cache_prefix(path)
            if ns:
                await run_in_threadpool(cache.invalidate, ns)
            if active:
                # Mark dirty now (cheap, local-only) for safety, then push to the
                # cloud in the background without delaying the response.
                await run_in_threadpool(db_sync.mark_local_dirty)
                task = asyncio.create_task(run_in_threadpool(db_sync.push_after_write))
                _background_tasks.add(task)
                task.add_done_callback(_background_tasks.discard)
        return response

    from app.routers import (
        blood_pressure,
        health,
        house_payment,
        installment,
        payslip,
        sync,
    )

    for router in (
        health.router,
        payslip.router,
        installment.router,
        house_payment.router,
        blood_pressure.router,
        sync.router,
    ):
        app.include_router(router)

    return app
