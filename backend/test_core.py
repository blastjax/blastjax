#!/usr/bin/env python
from __future__ import annotations

import datetime as dt
import os
import re
import sys
import time
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import db
import schema
from app import security
from app.routers import travel
from app.services import pcso_results


def check_normalize() -> None:
    n = db._normalize
    assert n(dt.datetime(2026, 4, 13, 2, 6, 38)) == "2026-04-13T02:06:38"
    assert n(dt.date(2026, 4, 13)) == "2026-04-13"
    assert n(dt.time(2, 6, 38)) == "02:06:38"
    assert n(Decimal("12.50")) == 12.5
    assert isinstance(n(Decimal("12.50")), float)
    assert n(memoryview(b"pdf")) == b"pdf"
    assert n(None) is None
    assert n("plain") == "plain"
    assert n(7) == 7


def check_nights_and_days() -> None:
    nd = travel._nights_and_days
    assert nd("2026-04-13", "2026-04-16") == (3, 4)
    assert nd("2026-04-13", "2026-04-13") == (0, 1)
    assert nd("2026-01-30", "2026-02-02") == (3, 4)
    assert nd("2026-12-30", "2027-01-02") == (3, 4)


def check_request_models_match_writable_columns() -> None:
    from app.schemas.travel import (
        TravelAccommodationCreate,
        TravelCityCreate,
        TravelFlightCreate,
        TravelItineraryCreate,
        TravelTransportCreate,
    )

    models = {
        "cities": TravelCityCreate,
        "flights": TravelFlightCreate,
        "transport": TravelTransportCreate,
        "itinerary": TravelItineraryCreate,
        "accommodations": TravelAccommodationCreate,
    }
    assert set(models) == set(db._TRAVEL_CHILDREN), "a child kind has no request model"
    for kind, model in models.items():
        fields = set(model.model_fields)
        cols = set(db.travel_child_columns(kind))
        assert fields == cols, f"{kind}: model/column mismatch {fields ^ cols}"

    assert "sort_order" not in db.travel_child_columns("cities")
    assert set(db.travel_child_columns("cities")) == {"name", "start_date", "end_date"}


def check_write_values_rejects_drift() -> None:
    for bad in ({"name": "x"}, {"name": "x", "start_date": None, "end_date": None, "oops": 1}):
        try:
            db._travel_write_values("cities", bad)
        except ValueError:
            continue
        raise AssertionError(f"accepted mismatched write values: {bad}")

    ok = {"name": "x", "start_date": None, "end_date": None}
    assert db._travel_write_values("cities", ok) == ("name", "start_date", "end_date")


def check_pcso_results() -> None:
    html = """<table class="Grid search-lotto-result-table">
      <tr><th>LOTTO GAME</th><th>COMBINATIONS</th><th>DRAW DATE</th><th>JACKPOT (PHP)</th><th>WINNERS</th></tr>
      <tr><td>Ultra Lotto 6/58</td><td>18-03-22-20-19-43</td><td>9/22/2026</td><td>322,258,134.01</td><td>1</td></tr>
      <tr><td>3D Lotto 2PM</td><td>0-3-4</td><td>9/22/2026</td><td>4,500.00</td><td>164</td></tr>
      <tr><td>Lotto 6/42</td><td>01-01-02-03-04-05</td><td>9/22/2026</td><td>5,000,000.00</td><td>0</td></tr>
    </table>"""
    games = {"Ultra Lotto 6/58", "Lotto 6/42"}
    got = pcso_results.parse_results(html, games)
    assert got == [
        pcso_results.PcsoResult(
            game="Ultra Lotto 6/58",
            draw_date=dt.date(2026, 9, 22),
            numbers=[3, 18, 19, 20, 22, 43],
            jackpot_prize=322258134.01,
            winners=1,
        )
    ], got
    assert pcso_results.parse_results("<p>no draws</p>", games) == []

    today = dt.date(2026, 9, 23)
    assert pcso_results.sync_start(["2026-09-22", "2026-09-20"], today) == dt.date(2026, 9, 21)
    floor = today - dt.timedelta(days=pcso_results.SYNC_DAYS - 1)
    assert pcso_results.sync_start(["2026-09-22", None], today) == floor
    assert pcso_results.sync_start(["2020-01-01"], today) == floor
    assert pcso_results.sync_start(["2026-09-23"], today) > today


def check_serialize_detail_shape() -> None:
    detail: dict[str, object] = {"trip": {"id": 1, "title": "Osaka"}}
    for kind in db._TRAVEL_CHILDREN:
        detail[kind] = []
    detail["accommodations"] = [
        {"id": 9, "name": "Hotel", "checkin_date": "2026-04-13", "checkout_date": "2026-04-16"}
    ]

    out = travel._serialize_detail(detail)
    assert set(out) == set(detail), "response gained or lost a top-level field"
    assert out["trip"] == detail["trip"]
    acc = out["accommodations"][0]
    assert (acc["nights"], acc["days"]) == (3, 4)
    assert acc["id"] == 9 and acc["name"] == "Hotel"


def check_clean_city() -> None:
    c = travel._clean_city
    assert c("Makati City Municipality") == "Makati"
    assert c("Bangkok Metropolitan Area") == "Bangkok"
    assert c("Cebu") == "Cebu"
    assert c("Municipality") == "Municipality"


def check_auth_disable_flag() -> None:
    d = security._auth_disabled
    for on in ("1", "true", "TRUE", "yes", " 1 "):
        os.environ["BUDGET_DISABLE_AUTH"] = on
        assert d() is True, on
    for off in ("", "0", "false", "no", "maybe"):
        os.environ["BUDGET_DISABLE_AUTH"] = off
        assert d() is False, off
    del os.environ["BUDGET_DISABLE_AUTH"]
    assert d() is False


def check_lotto_game_seed() -> None:
    ids = [i for i, _ in schema.SEED_LOTTO_GAMES]
    names = [n for _, n in schema.SEED_LOTTO_GAMES]
    assert len(set(ids)) == len(ids), f"duplicate seed ids: {ids}"
    assert len(set(names)) == len(names), f"duplicate seed names: {names}"
    for name in names:
        assert re.search(r"/\d+$", name), f"no field size in {name!r}"


def check_models_cover_what_the_app_writes() -> None:
    tables = schema.Base.metadata.tables
    for table, cols in (
        ("payslip", db._PAYSLIP_INSERT_COLS),
        ("payslip_default", db._PAYSLIP_DEFAULT_FORM_COLS),
        ("company", db._COMPANY_FLAG_COLUMNS),
    ):
        missing = set(cols) - set(tables[table].columns.keys())
        assert not missing, f"{table}: written but not in the model: {sorted(missing)}"


def check_db_idle_reaper() -> None:
    class _Pool:
        def __init__(self) -> None:
            self.idle = 1

        def checkedin(self) -> int:
            return self.idle

    class _Engine:
        def __init__(self) -> None:
            self.pool = _Pool()

    saved = (db._ENGINE, db._INFLIGHT, db._LAST_ACTIVITY)
    prior = os.environ.get("BUDGET_DB_IDLE_CLOSE_SECONDS")
    try:
        os.environ["BUDGET_DB_IDLE_CLOSE_SECONDS"] = "120"

        db._ENGINE, db._INFLIGHT = _Engine(), 0
        db._LAST_ACTIVITY = time.monotonic()
        assert db._take_idle_engine() is None, "reaped a pool still in use"

        db._LAST_ACTIVITY = time.monotonic() - 600
        db._INFLIGHT = 1
        assert db._take_idle_engine() is None, "reaped under a live checkout"

        db._INFLIGHT = 0
        assert db._take_idle_engine() is db._ENGINE, "idle pool was not reaped"
        db._ENGINE.pool.idle = 0
        assert db._take_idle_engine() is None, "reaped a pool with nothing idle"

        os.environ["BUDGET_DB_IDLE_CLOSE_SECONDS"] = "0"
        db._ENGINE = _Engine()
        assert db._take_idle_engine() is None, "reaped while disabled"
    finally:
        db._ENGINE, db._INFLIGHT, db._LAST_ACTIVITY = saved
        if prior is None:
            os.environ.pop("BUDGET_DB_IDLE_CLOSE_SECONDS", None)
        else:
            os.environ["BUDGET_DB_IDLE_CLOSE_SECONDS"] = prior


def check_calendar_override_bulk_bounds() -> None:
    from pydantic import ValidationError

    from app.schemas.calendar_day_override import CalendarDayOverrideBulkUpsert as Bulk

    one = {"day": "2026-10-13", "amount": 2199.02}
    assert len(Bulk(overrides=[one]).overrides) == 1
    assert Bulk(overrides=[one]).overrides[0].saved is None
    assert Bulk(overrides=[{**one, "saved": -250.5}]).overrides[0].saved == -250.5
    assert len(Bulk(overrides=[one] * 60).overrides) == 60
    for bad in ([], [one] * 101, [{"day": "2026-10-13", "amount": -1}]):
        try:
            Bulk(overrides=bad)
        except ValidationError:
            continue
        raise AssertionError(f"accepted {len(bad)} override(s) it should reject")


def check_db_against_postgres() -> None:
    url = os.environ.get("TEST_DATABASE_URL", "")
    if not url:
        print("  --  check_db_against_postgres skipped (set TEST_DATABASE_URL)")
        return
    from sqlalchemy import create_engine, text

    url = "postgresql+psycopg2://" + url.split("://", 1)[1]
    admin = create_engine(url)
    with admin.begin() as c:
        c.execute(text("DROP SCHEMA IF EXISTS blastjax_test CASCADE"))
        c.execute(text("CREATE SCHEMA blastjax_test"))
    engine = create_engine(url, connect_args={"options": "-c timezone=UTC -c search_path=blastjax_test"})
    saved = db._ENGINE
    db._ENGINE = engine
    try:
        with engine.begin() as c:
            schema.create_all(c)
        db.init_schema()

        trip_id = db.insert_travel_trip("Osaka", dt.date(2026, 4, 13), dt.date(2026, 4, 16), None)["trip"]["id"]
        city = dict.fromkeys(db.travel_child_columns("cities"))
        for name in ("Osaka", "Kyoto"):
            detail = db.insert_travel_child("cities", trip_id, {**city, "name": name})
        assert [(c["name"], c["sort_order"]) for c in detail["cities"]] == [("Osaka", 0), ("Kyoto", 1)]
        assert db.insert_travel_child("cities", 404, {**city, "name": "x"}) is None
        kyoto = detail["cities"][1]["id"]
        assert db.update_travel_child("cities", 404, kyoto, {**city, "name": "y"}) is None
        assert [c["name"] for c in db.delete_travel_child("cities", trip_id, kyoto)["cities"]] == ["Osaka"]

        db.upsert_lotto_draw(3, dt.date(2026, 1, 1), [1, 2, 3, 4, 5, 6])
        rows = [
            {"draw_date": dt.date(2026, 1, 1), "numbers": [1, 2, 3, 4, 5, 6], "jackpot_prize": 1.0, "winners": 0},
            {"draw_date": dt.date(2026, 1, 8), "numbers": [7, 8, 9, 10, 11, 12], "jackpot_prize": 2.0, "winners": 1},
            {"draw_date": dt.date(2026, 1, 8), "numbers": [13, 14, 15, 16, 17, 18], "jackpot_prize": 3.0, "winners": 2},
        ]
        assert db.upsert_lotto_draws_bulk(3, rows) == {"inserted": 1, "updated": 2, "total": 3}
        jan8 = next(d["draw"] for d in db.list_lotto_draws(3) if d["draw"]["draw_date"] == "2026-01-08")
        assert jan8["n1"] == 13 and jan8["winners"] == 2, jan8

        attempts = [([1, 2, 3, 4, 5, 6], 1), ([7, 8, 9, 10, 11, 12], None)]
        detail = db.insert_lotto_attempts_bulk(jan8["id"], attempts)
        assert [a["ticket"] for a in detail["attempts"]] == [1, None], detail
        assert db.insert_lotto_attempts_bulk(404, attempts) is None

        result = {"game_id": 3, "numbers": [2, 3, 4, 5, 6, 7], "jackpot_prize": 9.0, "winners": 0}
        fresh = {**result, "draw_date": dt.date(2026, 1, 15)}
        assert db.insert_lotto_results([{**result, "draw_date": dt.date(2026, 1, 8)}, fresh, fresh]) == 1
        assert db.list_lotto_draws(3)[1]["draw"]["n1"] == 13, "results overwrote a draw that had numbers"

        payslip = db.insert_payslip(1000, *([None] * 12), company="Acme")
        assert payslip["has_pdf"] is False
        assert db.set_payslip_pdf(payslip["id"], b"%PDF")
        assert db.get_payslip(payslip["id"])["has_pdf"] and db.get_payslip_pdf(payslip["id"]) == b"%PDF"

        db.upsert_calendar_day_overrides([("2026-10-13", 1000.0, 1199.02)])
        rows = db.upsert_calendar_day_overrides([("2026-10-13", 900.0, None), ("2026-10-12", 50.0, None)])
        assert [(r["day"], r["amount"], r["saved"]) for r in rows] == [
            ("2026-10-12", 50.0, None),
            ("2026-10-13", 900.0, 1199.02),
        ], rows
        assert db.upsert_calendar_day_overrides([("2026-10-13", 500.0, -3.5)])[1]["saved"] == -3.5

        db.list_payslips()
        with engine.connect() as c:
            assert c.connection.dbapi_connection.autocommit is False, "read session leaked autocommit"
    finally:
        db._ENGINE = saved
        engine.dispose()
        with admin.begin() as c:
            c.execute(text("DROP SCHEMA blastjax_test CASCADE"))
        admin.dispose()


def main() -> int:
    checks = [v for k, v in sorted(globals().items()) if k.startswith("check_")]
    for fn in checks:
        fn()
        print(f"  ok  {fn.__name__}")
    print(f"\n{len(checks)} checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
