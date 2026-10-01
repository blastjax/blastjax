from __future__ import annotations

import json
import os
import threading
import time as _time
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any

import psycopg2
from dotenv import load_dotenv
from sqlalchemy import Engine, Integer, and_, create_engine, delete, event, func, inspect, or_, select, update
from sqlalchemy.dialects.postgresql import distinct_on, insert
from sqlalchemy.engine import Row
from sqlalchemy.exc import DisconnectionError
from sqlalchemy.orm import Session, aliased, selectinload

import schema
from schema import (
    AppUser,
    BloodPressure,
    CalendarDayOverride,
    Company,
    CreditCard,
    CreditCardPayment,
    FixedExpense,
    HousePayment,
    HousePaymentEntry,
    Installment,
    InstallmentLine,
    LottoAttempt,
    LottoDraw,
    LottoGame,
    MonthlyExpense,
    PayPeriodStartOverride,
    Payslip,
    PayslipDefault,
    PayslipDefaultSettings,
    TravelAccommodation,
    TravelCity,
    TravelFlight,
    TravelItinerary,
    TravelTransport,
    TravelTrip,
)

_BACKEND_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND_DIR.parent


def _load_env_files() -> None:
    for path in (_REPO_ROOT / ".env", _BACKEND_DIR / ".env"):
        if path.is_file():
            load_dotenv(path, override=True)
    local = _REPO_ROOT / ".env.local"
    if local.is_file():
        load_dotenv(local, override=False)


_load_env_files()


def database_url() -> str:
    for name in ("DATABASE_URL", "DATABASE_URL_UNPOOLED"):
        raw = (os.environ.get(name) or "").strip()
        if raw.startswith(("postgres://", "postgresql://")):
            return raw
    return ""


def storage_kind() -> str:
    return "postgres" if database_url() else "none"


_ENGINE: Any = None
_POOL_LOCK = threading.RLock()
_INFLIGHT = 0
_LAST_ACTIVITY = _time.monotonic()
_REAPER: Any = None
_REAP_TICK_SECONDS = 15.0


def _probe_after_seconds() -> float:
    return float(os.environ.get("BUDGET_DB_PROBE_AFTER_SECONDS", "20"))


def _stamp(_dbapi_conn: Any, record: Any, *_: Any) -> None:
    record.info["last_used"] = _time.monotonic()


def _probe_if_stale(dbapi_conn: Any, record: Any, _proxy: Any) -> None:
    if _time.monotonic() - record.info.get("last_used", 0.0) < _probe_after_seconds():
        return
    try:
        dbapi_conn.autocommit = True
        with dbapi_conn.cursor() as cur:
            cur.execute("SELECT 1")
        dbapi_conn.autocommit = False
    except psycopg2.Error as exc:
        raise DisconnectionError() from exc


def _engine() -> Engine:
    global _ENGINE
    if _ENGINE is None:
        with _POOL_LOCK:
            if _ENGINE is None:
                url = database_url()
                if not url:
                    raise RuntimeError("DATABASE_URL is not set to a Postgres URL")
                maxconn = int(os.environ.get("BUDGET_DB_POOL_MAX", "10"))
                keep = max(1, min(int(os.environ.get("BUDGET_DB_POOL_KEEP", "6")), maxconn))
                engine = create_engine(
                    "postgresql+psycopg2://" + url.split("://", 1)[1],
                    pool_size=keep,
                    max_overflow=maxconn - keep,
                    connect_args={
                        "connect_timeout": 10,
                        "application_name": "blastjax-api",
                        "options": "-c timezone=UTC",
                        "keepalives": 1,
                        "keepalives_idle": 30,
                        "keepalives_interval": 10,
                        "keepalives_count": 5,
                    },
                )
                event.listen(engine, "connect", _stamp)
                event.listen(engine, "checkin", _stamp)
                event.listen(engine, "checkout", _probe_if_stale)
                _ENGINE = engine
                _start_reaper()
    return _ENGINE


def _idle_close_after() -> float:
    return float(os.environ.get("BUDGET_DB_IDLE_CLOSE_SECONDS", "120"))


def _take_idle_engine() -> Engine | None:
    if _idle_close_after() <= 0:
        return None
    with _POOL_LOCK:
        if _ENGINE is None or _INFLIGHT:
            return None
        if _time.monotonic() - _LAST_ACTIVITY < _idle_close_after():
            return None
        return _ENGINE if _ENGINE.pool.checkedin() else None


def _reap_idle_pool() -> None:
    while True:
        _time.sleep(_REAP_TICK_SECONDS)
        with _POOL_LOCK:
            engine = _take_idle_engine()
            if engine is None:
                continue
            try:
                engine.dispose()
            except Exception:
                pass


def _start_reaper() -> None:
    global _REAPER
    if _REAPER is None or not _REAPER.is_alive():
        _REAPER = threading.Thread(target=_reap_idle_pool, name="db-idle-reaper", daemon=True)
        _REAPER.start()


def close_connection_pool() -> None:
    with _POOL_LOCK:
        if _ENGINE is not None:
            _ENGINE.dispose()


@contextmanager
def _session(write: bool = False) -> Iterator[Session]:
    global _INFLIGHT, _LAST_ACTIVITY
    with _POOL_LOCK:
        engine = _engine()
        _INFLIGHT += 1
    try:
        with Session(engine, expire_on_commit=False) as s:
            if write:
                with s.begin():
                    yield s
                return
            raw = s.connection().connection.dbapi_connection
            raw.autocommit = True
            try:
                yield s
            finally:
                if not raw.closed:
                    raw.autocommit = False
    finally:
        with _POOL_LOCK:
            _INFLIGHT -= 1
            _LAST_ACTIVITY = _time.monotonic()


def _normalize(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, memoryview):
        return bytes(value)
    return value


def _row(obj: Any, *omit: str, **extra: Any) -> dict[str, Any]:
    out = {c.key: _normalize(getattr(obj, c.key)) for c in obj.__table__.columns if c.key not in omit}
    out.update({k: _normalize(v) for k, v in extra.items()})
    return out


def _plain(row: Row[Any]) -> dict[str, Any]:
    return {k: _normalize(v) for k, v in row._mapping.items()}


def _bulk_insert(model: Any) -> Any:
    return insert(model).execution_options(render_nulls=True)


def _limit(limit: int) -> int:
    return max(1, min(limit, 2000))


def init_schema() -> None:
    with _session() as s:
        present = set(inspect(s.connection()).get_table_names())
    missing = [t for t in schema.Base.metadata.tables if t not in present]
    if missing:
        raise RuntimeError(
            "Postgres is missing "
            f"{len(missing)} expected table(s): {', '.join(missing)}. "
            "Build them with backend/schema.py's create_all()."
        )
    with _session(write=True) as s:
        schema.sync_lotto_games(s)


_PAYSLIP_INSERT_COLS: tuple[str, ...] = (
    "total",
    "commission",
    "reimbursement",
    "medical_reimbursement",
    "others",
    "mp2",
    "allowances",
    "thirteenth_month",
    "basic_salary",
    "period_year",
    "period_month",
    "period_half",
    "notes",
    "withholding_tax",
    "sss_contribution",
    "philhealth",
    "pag_ibig",
    "bereavement_asst",
)


def _payslip(p: Payslip, has_pdf: bool) -> dict[str, Any]:
    return _row(p, "pdf_data", has_pdf=has_pdf)


def insert_payslip(
    total: float | None,
    commission: float | None,
    reimbursement: float | None,
    medical_reimbursement: float | None,
    others: float | None,
    mp2: float | None,
    allowances: float | None,
    thirteenth_month: float | None,
    basic_salary: float | None,
    period_year: int | None,
    period_month: int | None,
    period_half: int | None,
    notes: str | None,
    withholding_tax: float | None = None,
    sss_contribution: float | None = None,
    philhealth: float | None = None,
    pag_ibig: float | None = None,
    bereavement_asst: float | None = None,
    *,
    company: str,
) -> dict[str, Any]:
    values = dict(locals())
    with _session(write=True) as s:
        return _payslip(s.scalar(insert(Payslip).values(values).returning(Payslip)), False)


def insert_payslips_bulk(records: list[dict[str, Any]]) -> list[int]:
    if not records:
        return []
    rows = [{c: rec.get(c) for c in _PAYSLIP_INSERT_COLS} for rec in records]
    with _session(write=True) as s:
        return list(s.scalars(_bulk_insert(Payslip).returning(Payslip.id, sort_by_parameter_order=True), rows))


def list_payslips(limit: int = 200, company: str | None = None) -> list[dict[str, Any]]:
    stmt = (
        select(Payslip)
        .order_by(
            Payslip.period_year.desc().nulls_last(),
            Payslip.period_month.desc().nulls_last(),
            Payslip.period_half.desc().nulls_last(),
            Payslip.created_at.desc(),
            Payslip.id.desc(),
        )
        .limit(_limit(limit))
    )
    if company is not None:
        stmt = stmt.where(Payslip.company == company)
    with _session() as s:
        return [_payslip(p, p.has_pdf) for p in s.scalars(stmt)]


def get_payslip(payslip_id: int) -> dict[str, Any] | None:
    with _session() as s:
        p = s.get(Payslip, payslip_id)
        return _payslip(p, p.has_pdf) if p else None


def update_payslip(
    payslip_id: int,
    total: float | None,
    commission: float | None,
    reimbursement: float | None,
    medical_reimbursement: float | None,
    others: float | None,
    mp2: float | None,
    allowances: float | None,
    thirteenth_month: float | None,
    basic_salary: float | None,
    period_year: int | None,
    period_month: int | None,
    period_half: int | None,
    notes: str | None,
    withholding_tax: float | None = None,
    sss_contribution: float | None = None,
    philhealth: float | None = None,
    pag_ibig: float | None = None,
    bereavement_asst: float | None = None,
    *,
    company: str,
) -> dict[str, Any] | None:
    values = dict(locals())
    del values["payslip_id"]
    with _session(write=True) as s:
        row = s.execute(
            update(Payslip)
            .where(Payslip.id == payslip_id)
            .values(values)
            .returning(Payslip, Payslip.has_pdf)
        ).first()
        return _payslip(*row) if row else None


def delete_payslip(payslip_id: int) -> bool:
    with _session(write=True) as s:
        return s.execute(delete(Payslip).where(Payslip.id == payslip_id)).rowcount > 0


def _set_payslip_pdf_data(payslip_id: int, data: bytes | None) -> bool:
    with _session(write=True) as s:
        return s.execute(update(Payslip).where(Payslip.id == payslip_id).values(pdf_data=data)).rowcount > 0


def set_payslip_pdf(payslip_id: int, data: bytes) -> bool:
    return _set_payslip_pdf_data(payslip_id, data)


def delete_payslip_pdf(payslip_id: int) -> bool:
    return _set_payslip_pdf_data(payslip_id, None)


def get_payslip_pdf(payslip_id: int) -> bytes | None:
    with _session() as s:
        data = s.scalar(select(Payslip.pdf_data).where(Payslip.id == payslip_id))
        return bytes(data) if data is not None else None


_LINE_COUNT = (
    select(func.count()).where(InstallmentLine.installment_id == Installment.id).scalar_subquery()
)


def _installment_select() -> Any:
    line = aliased(InstallmentLine)
    return select(
        Installment,
        func.coalesce(line.payment_total, Installment.payment_total).label("due_payment"),
    ).outerjoin(
        line,
        and_(line.installment_id == Installment.id, line.seq == Installment.installment_current),
    )


def _installment(inst: Installment, due_payment: float | None) -> dict[str, Any]:
    return _row(inst, due_payment=due_payment)


def _installment_lines(inst: Installment) -> list[dict[str, Any]]:
    return [_row(line, "installment_id") for line in inst.lines]


def _installment_list_select(limit: int, credit_card_id: int | None = None) -> Any:
    stmt = _installment_select().order_by(Installment.finish_date, Installment.name).limit(_limit(limit))
    if credit_card_id is not None:
        stmt = stmt.where(Installment.credit_card_id == credit_card_id)
    return stmt


def _installment_rows(s: Session, limit: int, credit_card_id: int | None = None) -> list[dict[str, Any]]:
    return [_installment(*row) for row in s.execute(_installment_list_select(limit, credit_card_id))]


def list_installments(limit: int = 500, credit_card_id: int | None = None) -> list[dict[str, Any]]:
    with _session() as s:
        return _installment_rows(s, limit, credit_card_id)


def list_installments_with_lines(limit: int = 500) -> list[dict[str, Any]]:
    stmt = _installment_list_select(limit).options(selectinload(Installment.lines))
    with _session() as s:
        return [
            {"installment": _installment(inst, due), "lines": _installment_lines(inst)}
            for inst, due in s.execute(stmt)
        ]


def _installment_row_dict(s: Session, installment_id: int) -> dict[str, Any] | None:
    row = s.execute(
        _installment_select()
        .where(Installment.id == installment_id)
        .execution_options(populate_existing=True)
    ).first()
    return _installment(*row) if row else None


def _installment_detail(s: Session, installment_id: int) -> dict[str, Any] | None:
    row = s.execute(
        _installment_select()
        .where(Installment.id == installment_id)
        .options(selectinload(Installment.lines))
        .execution_options(populate_existing=True)
    ).first()
    if row is None:
        return None
    return {"installment": _installment(*row), "lines": _installment_lines(row[0])}


def get_installment(installment_id: int) -> dict[str, Any] | None:
    with _session() as s:
        return _installment_row_dict(s, installment_id)


def fetch_installment_with_lines(installment_id: int) -> dict[str, Any] | None:
    with _session() as s:
        return _installment_detail(s, installment_id)


def insert_installment(
    name: str,
    installment_current: int,
    installment_total: int,
    principal: float,
    interest: float | None,
    payment_total: float,
    start_date: Any,
    finish_date: Any,
    remaining: float,
    original_total: float,
    credit_card_id: int | None = None,
) -> dict[str, Any]:
    values = dict(locals())
    with _session(write=True) as s:
        iid = s.scalar(insert(Installment).values(values).returning(Installment.id))
        _seed_installment_lines(s, iid, installment_total, principal, interest)
        _recompute_installment_aggregates(s, iid)
        detail = _installment_detail(s, iid)
        assert detail is not None
        return detail


def _line_payment_total(principal: float, interest: float | None) -> float:
    return float(principal) + (float(interest) if interest is not None else 0.0)


def _line_values(
    installment_id: int, count: int, principal: float, interest: float | None
) -> list[dict[str, Any]]:
    ptot = _line_payment_total(principal, interest)
    return [
        {
            "installment_id": installment_id,
            "seq": seq,
            "principal": principal,
            "interest": interest,
            "payment_total": ptot,
        }
        for seq in range(1, count + 1)
    ]


def _seed_installment_lines(
    s: Session,
    installment_id: int,
    installment_total: int,
    principal: float,
    interest: float | None,
) -> None:
    n = int(installment_total)
    if n > 0:
        s.execute(_bulk_insert(InstallmentLine), _line_values(installment_id, n, principal, interest))


def _recompute_installment_aggregates(s: Session, installment_id: int) -> None:
    line, current = InstallmentLine, aliased(InstallmentLine)
    sum_principal = (
        select(func.coalesce(func.sum(line.principal), 0))
        .where(line.installment_id == Installment.id)
        .scalar_subquery()
    )
    sum_remaining = (
        select(func.coalesce(func.sum(line.payment_total), 0))
        .where(line.installment_id == Installment.id, line.seq >= Installment.installment_current)
        .scalar_subquery()
    )
    row = s.execute(
        select(
            sum_principal,
            sum_remaining,
            current.principal,
            current.interest,
            current.payment_total,
            current.installment_id.is_not(None),
        )
        .select_from(Installment)
        .outerjoin(
            current,
            and_(current.installment_id == Installment.id, current.seq == Installment.installment_current),
        )
        .where(Installment.id == installment_id)
    ).first()
    if row is None:
        return
    sum_p, sum_pt_rem, cl_p, cl_i, cl_pt, has_line = row
    values: dict[str, Any] = {"original_total": float(sum_p), "remaining": float(sum_pt_rem)}
    if has_line:
        values |= {"principal": cl_p, "interest": cl_i, "payment_total": float(cl_pt)}
    s.execute(update(Installment).where(Installment.id == installment_id).values(values))


def _update_line(s: Session, installment_id: int, seq: int, principal: float, interest: float | None) -> bool:
    return (
        s.execute(
            update(InstallmentLine)
            .where(InstallmentLine.installment_id == installment_id, InstallmentLine.seq == seq)
            .values(
                principal=principal,
                interest=interest,
                payment_total=_line_payment_total(principal, interest),
            )
        ).rowcount
        > 0
    )


def update_installment_line_and_fetch_detail(
    installment_id: int,
    seq: int,
    principal: float,
    interest: float | None,
) -> dict[str, Any] | None:
    with _session(write=True) as s:
        if not _update_line(s, installment_id, seq, principal, interest):
            return None
        _recompute_installment_aggregates(s, installment_id)
        return _installment_detail(s, installment_id)


def update_installment_lines_bulk(
    installment_id: int,
    items: list[tuple[int, float, float | None]],
) -> dict[str, Any] | None:
    if not items:
        return None
    with _session(write=True) as s:
        updated = [_update_line(s, installment_id, int(seq), p, i) for seq, p, i in items]
        if not any(updated):
            return None
        _recompute_installment_aggregates(s, installment_id)
        return _installment_detail(s, installment_id)


def reorder_installment_lines(
    installment_id: int,
    ordered_line_ids: list[int],
) -> dict[str, Any] | None:
    if not ordered_line_ids:
        return None
    with _session(write=True) as s:
        existing_ids = s.scalars(
            select(InstallmentLine.id)
            .where(InstallmentLine.installment_id == installment_id)
            .order_by(InstallmentLine.seq)
        ).all()
        if len(ordered_line_ids) != len(existing_ids) or set(ordered_line_ids) != set(existing_ids):
            return None
        s.execute(
            update(InstallmentLine)
            .where(InstallmentLine.installment_id == installment_id)
            .values(seq=InstallmentLine.id + 1000000)
        )
        for i, lid in enumerate(ordered_line_ids):
            s.execute(
                update(InstallmentLine)
                .where(InstallmentLine.installment_id == installment_id, InstallmentLine.id == int(lid))
                .values(seq=i + 1)
            )
        _recompute_installment_aggregates(s, installment_id)
        return _installment_detail(s, installment_id)


def _resync_installment_lines_on_total_change(
    s: Session,
    installment_id: int,
    new_total: int,
    principal: float,
    interest: float | None,
) -> None:
    n = int(new_total)
    s.execute(
        delete(InstallmentLine).where(InstallmentLine.installment_id == installment_id, InstallmentLine.seq > n)
    )
    if n <= 0:
        return
    stmt = insert(InstallmentLine).values(_line_values(installment_id, n, principal, interest))
    s.execute(
        stmt.on_conflict_do_update(
            index_elements=["installment_id", "seq"],
            set_={c: stmt.excluded[c] for c in ("principal", "interest", "payment_total")},
        )
    )


def update_installment(
    installment_id: int,
    name: str,
    installment_current: int,
    installment_total: int,
    principal: float,
    interest: float | None,
    payment_total: float,
    start_date: Any,
    finish_date: Any,
    remaining: float,
    original_total: float,
    credit_card_id: int | None = None,
) -> dict[str, Any] | None:
    values = dict(locals())
    del values["installment_id"]
    with _session(write=True) as s:
        row = s.execute(
            select(Installment.installment_total, _LINE_COUNT).where(Installment.id == installment_id)
        ).first()
        if row is None:
            return None
        old_total, has_lines = int(row[0] or 0), int(row[1] or 0) > 0
        s.execute(update(Installment).where(Installment.id == installment_id).values(values))
        if has_lines and old_total != int(installment_total):
            _resync_installment_lines_on_total_change(s, installment_id, installment_total, principal, interest)
        if has_lines:
            _recompute_installment_aggregates(s, installment_id)
        return _installment_detail(s, installment_id)


def delete_installment(installment_id: int) -> bool:
    with _session(write=True) as s:
        return s.execute(delete(Installment).where(Installment.id == installment_id)).rowcount > 0


def installment_apply_payment(installment_id: int) -> dict[str, Any] | None:
    with _session(write=True) as s:
        row = s.execute(
            select(
                Installment.installment_current,
                Installment.installment_total,
                Installment.payment_total,
                Installment.remaining,
                _LINE_COUNT,
            ).where(Installment.id == installment_id)
        ).first()
        if row is None:
            return None
        current, total, pay, rem, line_count = row
        current, total, line_count = int(current), int(total), int(line_count or 0)
        rem = float(rem or 0)
        pay = float(pay or 0)
        if not (current <= total and rem > 0):
            return None
        s.execute(
            update(Installment)
            .where(Installment.id == installment_id)
            .values(installment_current=Installment.installment_current + 1)
        )
        if line_count > 0:
            _recompute_installment_aggregates(s, installment_id)
        else:
            s.execute(
                update(Installment)
                .where(Installment.id == installment_id)
                .values(remaining=max(0.0, rem - pay))
            )
        return _installment_row_dict(s, installment_id)


def _house_payment_select() -> Any:
    entry = HousePaymentEntry
    totals = (
        select(
            entry.house_payment_id,
            func.count().label("entry_count"),
            func.coalesce(func.sum(entry.amount), 0).label("total_paid"),
            func.max(entry.paid_on).label("last_paid_on"),
        )
        .group_by(entry.house_payment_id)
        .subquery()
    )
    return select(
        HousePayment,
        func.coalesce(totals.c.entry_count, 0).label("entry_count"),
        func.coalesce(totals.c.total_paid, 0).label("total_paid"),
        totals.c.last_paid_on,
    ).outerjoin(totals, totals.c.house_payment_id == HousePayment.id)


def _house_payment(row: Row[Any]) -> dict[str, Any]:
    hp, entry_count, total_paid, last_paid_on = row
    return _row(hp, entry_count=entry_count, total_paid=total_paid, last_paid_on=last_paid_on)


def _house_payment_row_dict(s: Session, house_payment_id: int) -> dict[str, Any] | None:
    row = s.execute(_house_payment_select().where(HousePayment.id == house_payment_id)).first()
    return _house_payment(row) if row else None


def _house_payment_detail(s: Session, house_payment_id: int) -> dict[str, Any] | None:
    row = s.execute(
        _house_payment_select()
        .where(HousePayment.id == house_payment_id)
        .options(selectinload(HousePayment.entries))
        .execution_options(populate_existing=True)
    ).first()
    if row is None:
        return None
    return {
        "house_payment": _house_payment(row),
        "entries": [_row(e, "house_payment_id") for e in row[0].entries],
    }


def list_house_payments(limit: int = 500) -> list[dict[str, Any]]:
    stmt = _house_payment_select().order_by(HousePayment.name, HousePayment.id).limit(_limit(limit))
    with _session() as s:
        return [_house_payment(row) for row in s.execute(stmt)]


def fetch_house_payment_with_entries(house_payment_id: int) -> dict[str, Any] | None:
    with _session() as s:
        return _house_payment_detail(s, house_payment_id)


def insert_house_payment(name: str, notes: str | None) -> dict[str, Any]:
    with _session(write=True) as s:
        hp = s.scalar(insert(HousePayment).values(name=name, notes=notes).returning(HousePayment))
        return _row(hp, entry_count=0, total_paid=0.0, last_paid_on=None)


def update_house_payment(house_payment_id: int, name: str, notes: str | None) -> dict[str, Any] | None:
    with _session(write=True) as s:
        updated = s.scalar(
            update(HousePayment)
            .where(HousePayment.id == house_payment_id)
            .values(name=name, notes=notes)
            .returning(HousePayment.id)
        )
        return _house_payment_row_dict(s, house_payment_id) if updated else None


def delete_house_payment(house_payment_id: int) -> bool:
    with _session(write=True) as s:
        return s.execute(delete(HousePayment).where(HousePayment.id == house_payment_id)).rowcount > 0


def insert_house_payment_entry(house_payment_id: int, paid_on: Any, amount: float) -> dict[str, Any] | None:
    with _session(write=True) as s:
        if s.get(HousePayment, house_payment_id) is None:
            return None
        s.execute(
            insert(HousePaymentEntry).values(house_payment_id=house_payment_id, paid_on=paid_on, amount=amount)
        )
        return _house_payment_detail(s, house_payment_id)


def update_house_payment_entry(
    house_payment_id: int, entry_id: int, paid_on: Any, amount: float
) -> dict[str, Any] | None:
    with _session(write=True) as s:
        updated = s.scalar(
            update(HousePaymentEntry)
            .where(HousePaymentEntry.id == entry_id, HousePaymentEntry.house_payment_id == house_payment_id)
            .values(paid_on=paid_on, amount=amount)
            .returning(HousePaymentEntry.id)
        )
        return _house_payment_detail(s, house_payment_id) if updated else None


def delete_house_payment_entry(house_payment_id: int, entry_id: int) -> dict[str, Any] | None:
    with _session(write=True) as s:
        deleted = s.scalar(
            delete(HousePaymentEntry)
            .where(HousePaymentEntry.id == entry_id, HousePaymentEntry.house_payment_id == house_payment_id)
            .returning(HousePaymentEntry.id)
        )
        return _house_payment_detail(s, house_payment_id) if deleted else None


def list_blood_pressures(limit: int = 500) -> list[dict[str, Any]]:
    stmt = (
        select(BloodPressure)
        .order_by(BloodPressure.created_at.desc(), BloodPressure.id.desc())
        .limit(_limit(limit))
    )
    with _session() as s:
        return [_row(bp) for bp in s.scalars(stmt)]


def insert_blood_pressure(
    systolic: int | None,
    diastolic: int | None,
    pulse: int | None,
    spo2: int | None,
    temperature: float | None,
    weight: float | None,
    notes: str | None,
) -> dict[str, Any]:
    values = dict(locals())
    with _session(write=True) as s:
        return _row(s.scalar(insert(BloodPressure).values(values).returning(BloodPressure)))


def update_blood_pressure(
    reading_id: int,
    systolic: int | None,
    diastolic: int | None,
    pulse: int | None,
    spo2: int | None,
    temperature: float | None,
    weight: float | None,
    notes: str | None,
) -> dict[str, Any] | None:
    values = dict(locals())
    del values["reading_id"]
    with _session(write=True) as s:
        bp = s.scalar(
            update(BloodPressure).where(BloodPressure.id == reading_id).values(values).returning(BloodPressure)
        )
        return _row(bp) if bp else None


def delete_blood_pressure(reading_id: int) -> bool:
    with _session(write=True) as s:
        return s.execute(delete(BloodPressure).where(BloodPressure.id == reading_id)).rowcount > 0


def list_fixed_expenses(
    period_half: int | None = None,
    period_year: int | None = None,
    period_month: int | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    stmt = (
        select(FixedExpense)
        .order_by(FixedExpense.created_at.desc(), FixedExpense.id.desc())
        .limit(_limit(limit))
    )
    for col, value in (
        (FixedExpense.period_half, period_half),
        (FixedExpense.period_year, period_year),
        (FixedExpense.period_month, period_month),
    ):
        if value is not None:
            stmt = stmt.where(col == value)
    with _session() as s:
        return [_row(e) for e in s.scalars(stmt)]


def insert_fixed_expense(
    period_half: int,
    amount: float,
    description: str | None,
    period_year: int,
    period_month: int,
) -> dict[str, Any]:
    values = dict(locals())
    with _session(write=True) as s:
        return _row(s.scalar(insert(FixedExpense).values(values).returning(FixedExpense)))


def delete_fixed_expense(expense_id: int) -> bool:
    with _session(write=True) as s:
        return s.execute(delete(FixedExpense).where(FixedExpense.id == expense_id)).rowcount > 0


def list_monthly_expenses(
    period_half: int | None = None,
    period_year: int | None = None,
    period_month: int | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    stmt = (
        select(MonthlyExpense)
        .order_by(MonthlyExpense.created_at.desc(), MonthlyExpense.id.desc())
        .limit(_limit(limit))
    )
    if period_half is not None:
        stmt = stmt.where(MonthlyExpense.period_half == period_half)
    period = [
        col == value
        for col, value in ((MonthlyExpense.period_year, period_year), (MonthlyExpense.period_month, period_month))
        if value is not None
    ]
    if period:
        stmt = stmt.where(or_(MonthlyExpense.is_recurring.is_(True), and_(*period)))
    with _session() as s:
        return [_row(e) for e in s.scalars(stmt)]


def insert_monthly_expense(
    name: str,
    description: str | None,
    amount: float,
    period_half: int,
    period_year: int,
    period_month: int,
    is_recurring: bool = False,
) -> dict[str, Any]:
    values = dict(locals())
    with _session(write=True) as s:
        return _row(s.scalar(insert(MonthlyExpense).values(values).returning(MonthlyExpense)))


def update_monthly_expense(
    expense_id: int,
    name: str,
    description: str | None,
    amount: float,
    period_half: int,
    period_year: int,
    period_month: int,
    is_recurring: bool = False,
) -> dict[str, Any] | None:
    values = dict(locals())
    del values["expense_id"]
    with _session(write=True) as s:
        e = s.scalar(
            update(MonthlyExpense).where(MonthlyExpense.id == expense_id).values(values).returning(MonthlyExpense)
        )
        return _row(e) if e else None


def delete_monthly_expense(expense_id: int) -> bool:
    with _session(write=True) as s:
        return s.execute(delete(MonthlyExpense).where(MonthlyExpense.id == expense_id)).rowcount > 0


def _first_credit_card(s: Session) -> CreditCard | None:
    return s.scalar(select(CreditCard).order_by(CreditCard.id).limit(1))


def get_credit_card() -> dict[str, Any] | None:
    with _session() as s:
        card = _first_credit_card(s)
        return _row(card) if card else None


def fetch_credit_card_bundle(installment_limit: int = 2000) -> dict[str, Any]:
    with _session() as s:
        card = _first_credit_card(s)
        if card is None:
            return {"card": None, "installments": [], "payments": []}
        return {
            "card": _row(card),
            "installments": _installment_rows(s, installment_limit, card.id),
            "payments": _credit_card_payment_rows(s, card.id),
        }


def insert_credit_card(
    name: str,
    credit_limit: float,
    last_statement_balance: float,
    minimum_due: float,
    interest_rate: float,
    statement_date: Any,
    due_date: Any,
) -> dict[str, Any]:
    values = dict(locals(), current_balance=last_statement_balance)
    with _session(write=True) as s:
        return _row(s.scalar(insert(CreditCard).values(values).returning(CreditCard)))


def update_credit_card(
    card_id: int,
    name: str,
    credit_limit: float,
    last_statement_balance: float,
    minimum_due: float,
    interest_rate: float,
    statement_date: Any,
    due_date: Any,
) -> dict[str, Any] | None:
    values = dict(locals(), current_balance=last_statement_balance)
    del values["card_id"]
    with _session(write=True) as s:
        card = s.scalar(update(CreditCard).where(CreditCard.id == card_id).values(values).returning(CreditCard))
        return _row(card) if card else None


def adjust_credit_card_balance(card_id: int, current_balance: float) -> dict[str, Any] | None:
    with _session(write=True) as s:
        card = s.scalar(
            update(CreditCard)
            .where(CreditCard.id == card_id)
            .values(current_balance=current_balance)
            .returning(CreditCard)
        )
        return _row(card) if card else None


def delete_credit_card(card_id: int) -> bool:
    with _session(write=True) as s:
        return s.execute(delete(CreditCard).where(CreditCard.id == card_id)).rowcount > 0


def _credit_card_payment_rows(s: Session, credit_card_id: int) -> list[dict[str, Any]]:
    stmt = (
        select(CreditCardPayment)
        .where(CreditCardPayment.credit_card_id == credit_card_id)
        .order_by(CreditCardPayment.payment_date.desc(), CreditCardPayment.id.desc())
    )
    return [_row(p) for p in s.scalars(stmt)]


def list_credit_card_payments(credit_card_id: int) -> list[dict[str, Any]]:
    with _session() as s:
        return _credit_card_payment_rows(s, credit_card_id)


def _shift_credit_card_balance(s: Session, credit_card_id: int, delta: float) -> None:
    s.execute(
        update(CreditCard)
        .where(CreditCard.id == credit_card_id)
        .values(current_balance=CreditCard.current_balance + delta)
    )


def insert_credit_card_payment(
    credit_card_id: int, amount: float, payment_date: Any, note: str | None
) -> dict[str, Any] | None:
    with _session(write=True) as s:
        if s.get(CreditCard, credit_card_id) is None:
            return None
        payment = s.scalar(
            insert(CreditCardPayment)
            .values(credit_card_id=credit_card_id, amount=amount, payment_date=payment_date, note=note)
            .returning(CreditCardPayment)
        )
        _shift_credit_card_balance(s, credit_card_id, -amount)
        return _row(payment)


def delete_credit_card_payment(payment_id: int) -> bool:
    with _session(write=True) as s:
        row = s.execute(
            delete(CreditCardPayment)
            .where(CreditCardPayment.id == payment_id)
            .returning(CreditCardPayment.credit_card_id, CreditCardPayment.amount)
        ).first()
        if row is None:
            return False
        _shift_credit_card_balance(s, row.credit_card_id, row.amount)
        return True


def _calendar_day_overrides(s: Session) -> list[dict[str, Any]]:
    return [_row(o) for o in s.scalars(select(CalendarDayOverride).order_by(CalendarDayOverride.day))]


def list_calendar_day_overrides() -> list[dict[str, Any]]:
    with _session() as s:
        return _calendar_day_overrides(s)


def upsert_calendar_day_overrides(overrides: list[tuple[str, float, float | None]]) -> list[dict[str, Any]]:
    with _session(write=True) as s:
        for day, amount, saved in overrides:
            stmt = insert(CalendarDayOverride).values(day=day, amount=amount, saved=saved)
            s.execute(
                stmt.on_conflict_do_update(
                    index_elements=["day"],
                    set_={
                        "amount": stmt.excluded.amount,
                        "saved": func.coalesce(stmt.excluded.saved, CalendarDayOverride.saved),
                    },
                )
            )
        return _calendar_day_overrides(s)


def _pay_period(period_year: int, period_month: int, period_half: int) -> Any:
    return and_(
        PayPeriodStartOverride.period_year == period_year,
        PayPeriodStartOverride.period_month == period_month,
        PayPeriodStartOverride.period_half == period_half,
    )


def list_pay_period_start_overrides() -> list[dict[str, Any]]:
    stmt = select(PayPeriodStartOverride).order_by(
        PayPeriodStartOverride.period_year,
        PayPeriodStartOverride.period_month,
        PayPeriodStartOverride.period_half,
    )
    with _session() as s:
        return [_row(o) for o in s.scalars(stmt)]


def get_pay_period_start_override(
    period_year: int, period_month: int, period_half: int
) -> dict[str, Any] | None:
    with _session() as s:
        o = s.scalar(select(PayPeriodStartOverride).where(_pay_period(period_year, period_month, period_half)))
        return _row(o) if o else None


def upsert_pay_period_start_override(
    period_year: int, period_month: int, period_half: int, start_date: str
) -> dict[str, Any]:
    stmt = insert(PayPeriodStartOverride).values(
        period_year=period_year, period_month=period_month, period_half=period_half, start_date=start_date
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["period_year", "period_month", "period_half"],
        set_={"start_date": stmt.excluded.start_date},
    )
    with _session(write=True) as s:
        return _row(s.scalar(stmt.returning(PayPeriodStartOverride)))


def delete_pay_period_start_override(period_year: int, period_month: int, period_half: int) -> bool:
    with _session(write=True) as s:
        deleted = s.scalar(
            delete(PayPeriodStartOverride)
            .where(_pay_period(period_year, period_month, period_half))
            .returning(PayPeriodStartOverride.id)
        )
        return deleted is not None


_PAYSLIP_DEFAULT_FORM_COLS = (
    "period_year",
    "period_month",
    "total",
    "basic_salary",
    "commission",
    "reimbursement",
    "medical_reimbursement",
    "others",
    "mp2",
    "allowances",
    "thirteenth_month",
    "notes",
    "withholding_tax",
    "sss_contribution",
    "philhealth",
    "pag_ibig",
    "bereavement_asst",
)


def _payslip_default_form(row: PayslipDefault | None, half: int) -> dict[str, Any] | None:
    if row is None:
        return None
    out = {k: getattr(row, k) or "" for k in _PAYSLIP_DEFAULT_FORM_COLS}
    out["period_half"] = str(half)
    return out


def get_payslip_defaults(company: str) -> dict[str, Any]:
    with _session() as s:
        by_half = {
            d.half: d for d in s.scalars(select(PayslipDefault).where(PayslipDefault.company == company))
        }
        settings_half = s.scalar(
            select(PayslipDefaultSettings.settings_half).where(PayslipDefaultSettings.company == company)
        )
        return {
            "form_first": _payslip_default_form(by_half.get(1), 1),
            "form_second": _payslip_default_form(by_half.get(2), 2),
            "settings_half": settings_half,
        }


def save_payslip_defaults(
    company: str, form_first: dict[str, Any], form_second: dict[str, Any], settings_half: str
) -> None:
    forms = insert(PayslipDefault).values(
        [
            {"company": company, "half": half, **{c: str(form.get(c) or "") for c in _PAYSLIP_DEFAULT_FORM_COLS}}
            for half, form in ((1, form_first), (2, form_second))
        ]
    )
    settings = insert(PayslipDefaultSettings).values(company=company, settings_half=settings_half)
    with _session(write=True) as s:
        s.execute(
            forms.on_conflict_do_update(
                index_elements=["company", "half"],
                set_={c: forms.excluded[c] for c in _PAYSLIP_DEFAULT_FORM_COLS},
            )
        )
        s.execute(
            settings.on_conflict_do_update(
                index_elements=["company"],
                set_={"settings_half": settings.excluded.settings_half},
            )
        )


_LOTTO_NUMBER_COLS = ("n1", "n2", "n3", "n4", "n5", "n6")
_LOTTO_DRAW_UPSERT_COLS = (*_LOTTO_NUMBER_COLS, "jackpot_prize", "winners")


def _numbers(numbers: list[int] | None) -> dict[str, int | None]:
    return dict(zip(_LOTTO_NUMBER_COLS, numbers if numbers is not None else [None] * 6, strict=True))


def _draw_values(
    game_id: int, draw_date: Any, numbers: list[int] | None, jackpot_prize: float | None, winners: int
) -> dict[str, Any]:
    return {
        "draw_date": draw_date,
        "game_id": game_id,
        **_numbers(numbers),
        "jackpot_prize": jackpot_prize,
        "winners": winners,
    }


def _upsert_draws(rows: list[dict[str, Any]], only_missing_numbers: bool = False) -> Any:
    stmt = insert(LottoDraw).values(rows)
    return stmt.on_conflict_do_update(
        index_elements=["draw_date", "game_id"],
        set_={c: stmt.excluded[c] for c in _LOTTO_DRAW_UPSERT_COLS},
        where=LottoDraw.n1.is_(None) if only_missing_numbers else None,
    )


def list_lotto_games() -> list[dict[str, Any]]:
    jackpot = (
        select(LottoDraw.jackpot_prize)
        .where(LottoDraw.game_id == LottoGame.id, LottoDraw.jackpot_prize.is_not(None))
        .order_by(LottoDraw.draw_date.desc())
        .limit(1)
        .scalar_subquery()
    )
    last_attempted = (
        select(LottoDraw.draw_date)
        .where(LottoDraw.game_id == LottoGame.id, LottoDraw.attempts.any())
        .order_by(LottoDraw.draw_date.desc())
        .limit(1)
        .scalar_subquery()
    )
    stmt = select(
        LottoGame.id,
        LottoGame.name,
        jackpot.label("jackpot_prize"),
        last_attempted.label("last_attempt_draw_date"),
    ).order_by(func.substring(LottoGame.name, r"/(\d+)$").cast(Integer))
    latest = (
        select(LottoDraw)
        .where(LottoDraw.n1.is_not(None))
        .ext(distinct_on(LottoDraw.game_id))
        .order_by(LottoDraw.game_id, LottoDraw.draw_date.desc())
        .options(selectinload(LottoDraw.attempts))
    )
    with _session() as s:
        games = [_plain(row) for row in s.execute(stmt)]
        results = {d.game_id: _latest_result(d) for d in s.scalars(latest)}
    return [{**g, "latest_result": results.get(g["id"])} for g in games]


def _latest_result(draw: LottoDraw) -> dict[str, Any]:
    drawn = [getattr(draw, c) for c in _LOTTO_NUMBER_COLS]
    hits = [sorted(set(drawn) & {getattr(a, c) for c in _LOTTO_NUMBER_COLS}) for a in draw.attempts]
    return {
        "draw_date": _normalize(draw.draw_date),
        "numbers": drawn,
        "winners": draw.winners,
        "best_hits": max(hits, key=len, default=None),
    }


def _lotto_draw(draw: LottoDraw) -> dict[str, Any]:
    return {"draw": _row(draw), "attempts": [_row(a) for a in draw.attempts]}


def _lotto_draw_detail(s: Session, draw_id: int) -> dict[str, Any] | None:
    draw = s.scalar(
        select(LottoDraw)
        .where(LottoDraw.id == draw_id)
        .options(selectinload(LottoDraw.attempts))
        .execution_options(populate_existing=True)
    )
    return _lotto_draw(draw) if draw else None


def list_lotto_draws(game_id: int, limit: int = 200) -> list[dict[str, Any]]:
    stmt = (
        select(LottoDraw)
        .where(LottoDraw.game_id == game_id)
        .order_by(LottoDraw.draw_date.desc(), LottoDraw.id.desc())
        .limit(_limit(limit))
        .options(selectinload(LottoDraw.attempts))
    )
    with _session() as s:
        return [_lotto_draw(d) for d in s.scalars(stmt)]


def upsert_lotto_draw(
    game_id: int,
    draw_date: Any,
    numbers: list[int] | None,
    jackpot_prize: float | None = None,
    winners: int = 0,
) -> dict[str, Any]:
    stmt = _upsert_draws([_draw_values(game_id, draw_date, numbers, jackpot_prize, winners)])
    with _session(write=True) as s:
        draw_id = s.scalar(stmt.returning(LottoDraw.id))
        return _lotto_draw_detail(s, draw_id)


def upsert_lotto_draws_bulk(game_id: int, rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"inserted": 0, "updated": 0, "total": 0}
    with _session(write=True) as s:
        seen = set(
            s.scalars(
                select(LottoDraw.draw_date).where(
                    LottoDraw.game_id == game_id,
                    LottoDraw.draw_date.in_([r["draw_date"] for r in rows]),
                )
            )
        )
        inserted = updated = 0
        for row in rows:
            if row["draw_date"] in seen:
                updated += 1
            else:
                inserted += 1
                seen.add(row["draw_date"])

        by_date = {row["draw_date"]: row for row in rows}
        s.execute(
            _upsert_draws(
                [
                    _draw_values(game_id, d, row["numbers"], row.get("jackpot_prize"), row.get("winners", 0))
                    for d, row in by_date.items()
                ]
            )
        )
        return {"inserted": inserted, "updated": updated, "total": len(rows)}


def list_lotto_latest_results() -> list[dict[str, Any]]:
    stmt = (
        select(LottoGame.id, LottoGame.name, func.max(LottoDraw.draw_date).label("latest"))
        .outerjoin(LottoDraw, and_(LottoDraw.game_id == LottoGame.id, LottoDraw.n1.is_not(None)))
        .group_by(LottoGame.id, LottoGame.name)
    )
    with _session() as s:
        return [_plain(row) for row in s.execute(stmt)]


def insert_lotto_results(rows: list[dict[str, Any]]) -> int:
    by_key = {(r["game_id"], r["draw_date"]): r for r in rows}
    if not by_key:
        return 0
    values = [
        _draw_values(r["game_id"], r["draw_date"], r["numbers"], r["jackpot_prize"], r["winners"])
        for r in by_key.values()
    ]
    with _session(write=True) as s:
        return s.execute(_upsert_draws(values, only_missing_numbers=True)).rowcount


def get_lotto_draw_id_by_date(game_id: int, draw_date: Any) -> int | None:
    with _session() as s:
        return s.scalar(
            select(LottoDraw.id).where(LottoDraw.game_id == game_id, LottoDraw.draw_date == draw_date)
        )


def update_lotto_draw(
    draw_id: int,
    draw_date: Any,
    numbers: list[int] | None,
    jackpot_prize: float | None = None,
    winners: int = 0,
) -> dict[str, Any] | None:
    with _session(write=True) as s:
        updated = s.scalar(
            update(LottoDraw)
            .where(LottoDraw.id == draw_id)
            .values(draw_date=draw_date, **_numbers(numbers), jackpot_prize=jackpot_prize, winners=winners)
            .returning(LottoDraw.id)
        )
        return _lotto_draw_detail(s, draw_id) if updated else None


def delete_lotto_draw(draw_id: int) -> bool:
    with _session(write=True) as s:
        return s.execute(delete(LottoDraw).where(LottoDraw.id == draw_id)).rowcount > 0


def insert_lotto_attempt(draw_id: int, numbers: list[int], ticket: int | None = None) -> dict[str, Any] | None:
    return insert_lotto_attempts_bulk(draw_id, [(numbers, ticket)])


def insert_lotto_attempts_bulk(
    draw_id: int, attempts: list[tuple[list[int], int | None]]
) -> dict[str, Any] | None:
    rows = [{"draw_id": draw_id, "ticket": ticket, **_numbers(numbers)} for numbers, ticket in attempts]
    with _session(write=True) as s:
        if not rows or s.get(LottoDraw, draw_id) is None:
            return None
        s.execute(_bulk_insert(LottoAttempt), rows)
        return _lotto_draw_detail(s, draw_id)


def update_lotto_attempt(
    draw_id: int, attempt_id: int, numbers: list[int], ticket: int | None = None
) -> dict[str, Any] | None:
    with _session(write=True) as s:
        updated = s.scalar(
            update(LottoAttempt)
            .where(LottoAttempt.id == attempt_id, LottoAttempt.draw_id == draw_id)
            .values(ticket=ticket, **_numbers(numbers))
            .returning(LottoAttempt.id)
        )
        return _lotto_draw_detail(s, draw_id) if updated else None


def delete_lotto_attempt(draw_id: int, attempt_id: int) -> dict[str, Any] | None:
    with _session(write=True) as s:
        deleted = s.scalar(
            delete(LottoAttempt)
            .where(LottoAttempt.id == attempt_id, LottoAttempt.draw_id == draw_id)
            .returning(LottoAttempt.id)
        )
        return _lotto_draw_detail(s, draw_id) if deleted else None


def _app_user(u: AppUser, *omit: str) -> dict[str, Any]:
    out = _row(u, *omit)
    out["allowed_pages"] = json.loads(u.allowed_pages) if u.allowed_pages else None
    return out


def _public_user(u: AppUser | None) -> dict[str, Any] | None:
    return _app_user(u, "password_hash") if u else None


def any_app_users() -> bool:
    with _session() as s:
        return s.scalar(select(AppUser.id).limit(1)) is not None


def list_app_users() -> list[dict[str, Any]]:
    stmt = select(AppUser).order_by(func.lower(AppUser.username))
    with _session() as s:
        return [_app_user(u, "password_hash") for u in s.scalars(stmt)]


def insert_app_user(username: str, password_hash: str) -> dict[str, Any]:
    with _session(write=True) as s:
        u = s.scalar(insert(AppUser).values(username=username, password_hash=password_hash).returning(AppUser))
        return _app_user(u, "password_hash")


def get_app_user_by_username(username: str) -> dict[str, Any] | None:
    with _session() as s:
        u = s.scalar(select(AppUser).where(func.lower(AppUser.username) == func.lower(username)))
        return _app_user(u) if u else None


def get_app_user_by_id(user_id: int) -> dict[str, Any] | None:
    with _session() as s:
        return _public_user(s.get(AppUser, user_id))


def update_app_user(
    user_id: int,
    username: str | None,
    password_hash: str | None,
) -> dict[str, Any] | None:
    values = {k: v for k, v in (("username", username), ("password_hash", password_hash)) if v is not None}
    with _session(write=True) as s:
        if values:
            s.execute(update(AppUser).where(AppUser.id == user_id).values(values))
        return _public_user(s.get(AppUser, user_id))


def update_app_user_access(
    user_id: int,
    is_superuser: bool,
    allowed_pages: list[str] | None,
) -> dict[str, Any] | None:
    with _session(write=True) as s:
        return _public_user(
            s.scalar(
                update(AppUser)
                .where(AppUser.id == user_id)
                .values(
                    is_superuser=is_superuser,
                    allowed_pages=json.dumps(allowed_pages) if allowed_pages is not None else None,
                )
                .returning(AppUser)
            )
        )


def delete_app_user(user_id: int) -> bool:
    with _session(write=True) as s:
        return s.execute(delete(AppUser).where(AppUser.id == user_id)).rowcount > 0


_COMPANY_FLAG_COLUMNS: tuple[str, ...] = (
    "show_total",
    "show_basic_salary",
    "show_commission",
    "show_reimbursement",
    "show_medical_reimbursement",
    "show_others",
    "show_allowances",
    "show_thirteenth_month",
    "show_withholding_tax",
    "show_sss_contribution",
    "show_philhealth",
    "show_pag_ibig",
    "show_mp2",
    "show_bereavement_asst",
)

_COMPANY_FLAG_DEFAULTS: dict[str, bool] = {
    c: c != "show_bereavement_asst" for c in _COMPANY_FLAG_COLUMNS
}


def _company_flags(flags: dict[str, bool] | None) -> dict[str, bool]:
    merged = {**_COMPANY_FLAG_DEFAULTS, **(flags or {})}
    return {c: merged[c] for c in _COMPANY_FLAG_COLUMNS}


def _companies(s: Session) -> list[dict[str, Any]]:
    return [_row(c) for c in s.scalars(select(Company).order_by(Company.sort_order))]


def list_companies() -> list[dict[str, Any]]:
    with _session() as s:
        return _companies(s)


def insert_company(name: str, flags: dict[str, bool] | None = None) -> dict[str, Any]:
    next_order = select(func.coalesce(func.max(Company.sort_order), -1) + 1).scalar_subquery()
    with _session(write=True) as s:
        company = s.scalar(
            insert(Company)
            .values(name=name, sort_order=next_order, **_company_flags(flags))
            .returning(Company)
        )
        return _row(company)


def reorder_companies(ordered_ids: list[int]) -> list[dict[str, Any]] | None:
    if not ordered_ids:
        return None
    with _session(write=True) as s:
        existing_ids = set(s.scalars(select(Company.id)))
        if set(ordered_ids) != existing_ids or len(ordered_ids) != len(existing_ids):
            return None
        s.execute(update(Company).values(sort_order=Company.id + 1000000))
        for i, cid in enumerate(ordered_ids):
            s.execute(update(Company).where(Company.id == int(cid)).values(sort_order=i))
        return _companies(s)


def update_company(company_id: int, name: str, flags: dict[str, bool] | None = None) -> dict[str, Any] | None:
    with _session(write=True) as s:
        company = s.scalar(
            update(Company)
            .where(Company.id == company_id)
            .values(name=name, **_company_flags(flags))
            .returning(Company)
        )
        return _row(company) if company else None


def delete_company(company_id: int) -> bool:
    with _session(write=True) as s:
        name = s.scalar(select(Company.name).where(Company.id == company_id))
        if name is None:
            return False
        in_use = s.scalar(select(func.count()).where(Payslip.company == name))
        if in_use:
            raise ValueError(f'Cannot delete "{name}": {in_use} payslip(s) still use it.')
        return s.execute(delete(Company).where(Company.id == company_id)).rowcount > 0


_TRAVEL_CHILDREN: dict[str, Any] = {
    "cities": TravelCity,
    "flights": TravelFlight,
    "transport": TravelTransport,
    "itinerary": TravelItinerary,
    "accommodations": TravelAccommodation,
}

_TRAVEL_SERVER_COLS = frozenset({"id", "trip_id", "created_at", "sort_order"})


def travel_child_columns(kind: str) -> tuple[str, ...]:
    return tuple(
        c.key for c in _TRAVEL_CHILDREN[kind].__table__.columns if c.key not in _TRAVEL_SERVER_COLS
    )


def _travel_write_values(kind: str, values: dict[str, Any]) -> tuple[str, ...]:
    cols = travel_child_columns(kind)
    missing = [c for c in cols if c not in values]
    unknown = [k for k in values if k not in cols]
    if missing or unknown:
        raise ValueError(
            f"travel {kind} write mismatch"
            + (f"; missing {', '.join(missing)}" if missing else "")
            + (f"; unknown {', '.join(unknown)}" if unknown else "")
        )
    return cols


def _trip_select() -> Any:
    return select(TravelTrip).options(*(selectinload(getattr(TravelTrip, k)) for k in _TRAVEL_CHILDREN))


def _trip(trip: TravelTrip) -> dict[str, Any]:
    return {
        "trip": _row(trip),
        **{kind: [_row(child) for child in getattr(trip, kind)] for kind in _TRAVEL_CHILDREN},
    }


def _travel_trip_detail(s: Session, trip_id: int) -> dict[str, Any] | None:
    trip = s.scalar(
        _trip_select().where(TravelTrip.id == trip_id).execution_options(populate_existing=True)
    )
    return _trip(trip) if trip else None


def list_travel_trips(limit: int = 500) -> list[dict[str, Any]]:
    stmt = _trip_select().order_by(TravelTrip.start_date.desc(), TravelTrip.id.desc()).limit(_limit(limit))
    with _session() as s:
        return [_trip(t) for t in s.scalars(stmt)]


def insert_travel_trip(title: str, start_date: Any, end_date: Any, notes: str | None) -> dict[str, Any]:
    with _session(write=True) as s:
        trip_id = s.scalar(
            insert(TravelTrip)
            .values(title=title, start_date=start_date, end_date=end_date, notes=notes)
            .returning(TravelTrip.id)
        )
        detail = _travel_trip_detail(s, trip_id)
        assert detail is not None
        return detail


def update_travel_trip(
    trip_id: int, title: str, start_date: Any, end_date: Any, notes: str | None
) -> dict[str, Any] | None:
    with _session(write=True) as s:
        updated = s.scalar(
            update(TravelTrip)
            .where(TravelTrip.id == trip_id)
            .values(title=title, start_date=start_date, end_date=end_date, notes=notes)
            .returning(TravelTrip.id)
        )
        return _travel_trip_detail(s, trip_id) if updated else None


def delete_travel_trip(trip_id: int) -> bool:
    with _session(write=True) as s:
        return s.execute(delete(TravelTrip).where(TravelTrip.id == trip_id)).rowcount > 0


def insert_travel_child(kind: str, trip_id: int, values: dict[str, Any]) -> dict[str, Any] | None:
    model = _TRAVEL_CHILDREN[kind]
    row = {c: values[c] for c in _travel_write_values(kind, values)}
    if model is TravelCity:
        row["sort_order"] = (
            select(func.coalesce(func.max(TravelCity.sort_order) + 1, 0))
            .where(TravelCity.trip_id == trip_id)
            .scalar_subquery()
        )
    with _session(write=True) as s:
        if s.get(TravelTrip, trip_id) is None:
            return None
        s.execute(insert(model).values(trip_id=trip_id, **row))
        return _travel_trip_detail(s, trip_id)


def update_travel_child(
    kind: str, trip_id: int, child_id: int, values: dict[str, Any]
) -> dict[str, Any] | None:
    model = _TRAVEL_CHILDREN[kind]
    row = {c: values[c] for c in _travel_write_values(kind, values)}
    with _session(write=True) as s:
        updated = s.scalar(
            update(model)
            .where(model.id == child_id, model.trip_id == trip_id)
            .values(row)
            .returning(model.id)
        )
        return _travel_trip_detail(s, trip_id) if updated else None


def delete_travel_child(kind: str, trip_id: int, child_id: int) -> dict[str, Any] | None:
    model = _TRAVEL_CHILDREN[kind]
    with _session(write=True) as s:
        deleted = s.scalar(
            delete(model).where(model.id == child_id, model.trip_id == trip_id).returning(model.id)
        )
        return _travel_trip_detail(s, trip_id) if deleted else None
