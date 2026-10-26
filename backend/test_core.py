#!/usr/bin/env python
from __future__ import annotations

import datetime as dt
import os
import re
import sys
import time
import uuid
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import db
import schema
from app import security
from app.routers import auth, travel
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

    # Client: `replies` scripts what each request to PCSO returns; an unscripted request fails on pop.
    replies: list[str | Exception] = []

    def search(start: dt.date, end: dt.date) -> str:
        reply = replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply

    client = pcso_results._Client()
    client._search = search  # type: ignore[method-assign]
    at = lambda d, h, m=0: dt.datetime(2026, 9, d, h, m, tzinfo=pcso_results.PH_TIME)  # noqa: E731

    def fetch(now: dt.datetime, start_day: int = 22) -> list[pcso_results.PcsoResult]:
        client._clock = lambda: now
        return client.fetch(dt.date(2026, 9, start_day), now.date(), games)

    replies[:] = [html]
    assert fetch(at(22, 23)) == got
    assert fetch(at(22, 23, 10)) == got, "a repeat sync within REUSE should not hit PCSO"
    assert fetch(at(23, 10), start_day=23) == [], "the 23rd's draws can't be up before 2:30 PM"
    replies[:] = [pcso_results.PcsoBlocked("HTTP 403")]  # 11 hours later the 22nd is fetched again
    try:
        fetch(at(23, 10))
    except pcso_results.PcsoBlocked as exc:
        assert exc.retry_at == at(23, 10, 10), exc.retry_at
    else:
        raise AssertionError("a 403 from PCSO didn't raise")
    try:
        fetch(at(23, 10, 5))
    except pcso_results.PcsoError as exc:
        assert not isinstance(exc, pcso_results.PcsoBlocked) and exc.retry_at == at(23, 10, 10)
    else:
        raise AssertionError("retried PCSO during the backoff")
    replies[:] = [html]
    assert fetch(at(23, 10, 10)) == got
    assert not replies


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


def _swap_session_table(rows: dict[bytes, uuid.UUID]) -> dict[str, object]:
    """Point security's session queries at rows; returns the originals to restore with vars(security).update."""
    stubs = {
        "insert_app_user_session": lambda user_id, token_hash: rows.__setitem__(token_hash, user_id),
        "get_app_user_session_user_id": rows.get,
        "delete_app_user_session": lambda token_hash: rows.pop(token_hash, None),
    }
    saved = {name: getattr(security, name) for name in stubs}
    vars(security).update(stubs)
    return saved


def check_sessions() -> None:
    rows: dict[bytes, uuid.UUID] = {}
    saved = _swap_session_table(rows)
    user = uuid.uuid4()
    try:
        token = security.create_session(user)
        assert security.session_user_id(token) == user
        assert len(rows) == 1 and token.encode() not in rows, "stored the token itself"
        assert security.create_session(user) != token, "two logins share a token"
        assert not security.session_is_valid(token[:-1] + ("B" if token[-1] == "A" else "A")), "accepted a guess"
        assert not security.session_is_valid(""), "accepted no token"
        security.revoke_session(token)
        assert not security.session_is_valid(token), "token still valid after logout"
        assert len(rows) == 1, "logout ended the other session too"
    finally:
        vars(security).update(saved)


def check_passkey_ceremony() -> None:
    import hashlib
    import json

    import cbor2
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec
    from fastapi import HTTPException
    from starlette.requests import Request
    from webauthn.helpers import bytes_to_base64url as b64

    from app.schemas.auth import PasskeyLoginBody, PasskeyRegisterBody

    def request(origin: str, token: str = "") -> Request:
        headers = [(b"origin", origin.encode()), (b"host", b"app.example"), (b"authorization", f"Bearer {token}".encode())]
        return Request({"type": "http", "method": "POST", "path": "/", "headers": headers, "client": ("10.9.8.7", 1)})

    def rejected(call, status: int) -> bool:
        try:
            call()
        except HTTPException as exc:
            return exc.status_code == status
        return False

    rows: list[dict] = []

    def insert(user_id: uuid.UUID, credential_id: bytes, public_key: bytes, sign_count: int, name: str) -> dict:
        rows.append({"id": uuid.uuid4(), "user_id": user_id, "credential_id": credential_id, "public_key": public_key})
        rows[-1] |= {"sign_count": sign_count, "name": name, "created_at": "", "last_used_at": None}
        return rows[-1]

    user = uuid.uuid4()
    stubs = {
        "get_app_user_by_id": lambda uid: {"id": uid, "username": "micah"} if uid == user else None,
        "list_app_user_passkeys": lambda uid: [r for r in rows if r["user_id"] == uid],
        "get_app_user_passkey": lambda cid: next((r for r in rows if r["credential_id"] == cid), None),
        "insert_app_user_passkey": insert,
        "mark_app_user_passkey_used": lambda pid, count: rows[0].update(sign_count=count),
    }
    saved = {name: getattr(auth, name) for name in stubs}
    vars(auth).update(stubs)
    saved_sessions = _swap_session_table({})
    origin, rp_hash = "https://app.example", hashlib.sha256(b"app.example").digest()
    key, cred_id = ec.generate_private_key(ec.SECP256R1()), b"cred-1"
    pub = key.public_key().public_numbers()
    cose = cbor2.dumps({1: 2, 3: -7, -1: 1, -2: pub.x.to_bytes(32, "big"), -3: pub.y.to_bytes(32, "big")})
    try:
        token = security.create_session(user)
        challenge = auth.auth_passkey_register_options(request(origin, token))["challenge"]
        client = json.dumps({"type": "webauthn.create", "challenge": challenge, "origin": origin}).encode()
        auth_data = rp_hash + b"\x45" + (0).to_bytes(4, "big") + bytes(16) + len(cred_id).to_bytes(2, "big") + cred_id + cose
        attestation = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
        made = {"id": b64(cred_id), "rawId": b64(cred_id), "type": "public-key"}
        made["response"] = {"clientDataJSON": b64(client), "attestationObject": b64(attestation)}
        body = PasskeyRegisterBody(credential=made, name=" Laptop ")
        assert auth.auth_passkey_register(body, request(origin, token))["passkey"]["name"] == "Laptop"
        assert rows[0]["user_id"] == user and rows[0]["credential_id"] == cred_id
        assert rejected(lambda: auth.auth_passkey_register(body, request(origin, token)), 400), "registered twice"
        assert rejected(lambda: auth.auth_passkey_register_options(request(origin)), 401), "registered logged out"

        def assertion(sign_count: int, signer: ec.EllipticCurvePrivateKey = key) -> PasskeyLoginBody:
            challenge = auth.auth_passkey_login_options(request(origin))["challenge"]
            client = json.dumps({"type": "webauthn.get", "challenge": challenge, "origin": origin}).encode()
            data = rp_hash + b"\x05" + sign_count.to_bytes(4, "big")
            sig = signer.sign(data + hashlib.sha256(client).digest(), ec.ECDSA(hashes.SHA256()))
            response = {"clientDataJSON": b64(client), "authenticatorData": b64(data), "signature": b64(sig)}
            return PasskeyLoginBody(credential={**made, "response": response})

        signed = assertion(1)
        assert security.session_user_id(auth.auth_passkey_login(signed, request(origin))["token"]) == user
        assert rows[0]["sign_count"] == 1
        assert rejected(lambda: auth.auth_passkey_login(signed, request(origin)), 401), "replayed a login"
        forged = assertion(2, ec.generate_private_key(ec.SECP256R1()))
        assert rejected(lambda: auth.auth_passkey_login(forged, request(origin)), 401), "accepted another key"
        assert rejected(lambda: auth.auth_passkey_login_options(request("https://evil.example")), 400)
    finally:
        vars(auth).update(saved)
        vars(security).update(saved_sessions)
        security.clear_failed_attempts("10.9.8.7")


def check_lotto_game_seed() -> None:
    names = schema.SEED_LOTTO_GAMES
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


def check_fixed_expense_amount_sign() -> None:
    from pydantic import ValidationError

    from app.schemas.fixed_expense import FixedExpenseCreate

    base = {"period_half": 1, "period_year": 2026, "period_month": 10}
    assert FixedExpenseCreate(**base, amount=250).amount == 250
    assert FixedExpenseCreate(**base, amount=-1500).amount == -1500
    try:
        FixedExpenseCreate(**base, amount=0)
    except ValidationError:
        return
    raise AssertionError("accepted a zero amount")


def check_bill_request_models() -> None:
    from pydantic import ValidationError

    from app.schemas.bill import BillCategoryCreate, BillCreate

    assert BillCategoryCreate(name="  Internet ").name == "Internet"
    assert BillCategoryCreate(name="Internet").defaults.due_date is None
    period = {"period_start": {"months": -1, "day": 15}, "period_end": {"months": 0, "day": 14}}
    assert BillCategoryCreate(name="Power", defaults=period).defaults.period_end.day == 14
    bill = {
        "category_id": str(uuid.uuid4()),
        "bill_date": "2026-10-05",
        "due_date": "2026-10-25",
        "period_start": "2026-09-01",
        "period_end": "2026-09-30",
    }
    assert BillCreate(**bill).amount is None
    assert BillCreate(**{**bill, "period_end": "2026-09-01"}).period_end == dt.date(2026, 9, 1)
    assert BillCategoryCreate(name="Visa").is_credit_card is False
    assert BillCreate(**{**bill, "amount": 15000, "minimum_due": 850}).minimum_due == 850
    assert BillCreate(**{**bill, "minimum_due": 850}).minimum_due == 850  # amount not entered yet
    assert BillCreate(**{**bill, "amount": -250.5, "minimum_due": 0}).amount == -250.5  # a credit balance
    assert BillCategoryCreate(name="Visa", defaults={"amount": -100}).defaults.amount == -100
    for model, bad in (
        (BillCategoryCreate, {"name": "   "}),
        (BillCategoryCreate, {"name": "Power", "defaults": {"due_date": {"months": 3, "day": 8}}}),
        (BillCategoryCreate, {"name": "Power", "defaults": {"due_date": {"months": 1, "day": 32}}}),
        (BillCategoryCreate, {"name": "Power", "defaults": {"period_start": {"months": 0, "day": 1}}}),
        (BillCategoryCreate, {"name": "Power", "defaults": {**period, "period_end": {"months": -1, "day": 14}}}),
        (BillCreate, {**bill, "period_end": "2026-08-31"}),
        (BillCreate, {**bill, "minimum_due": -1}),
        (BillCreate, {**bill, "amount": -250.5, "minimum_due": 100}),
        (BillCreate, {**bill, "amount": 500, "minimum_due": 850}),
        (BillCreate, {**bill, "due_date": None}),
    ):
        try:
            model(**bad)
        except ValidationError:
            continue
        raise AssertionError(f"{model.__name__} accepted {bad}")


def check_upload_validation() -> None:
    import asyncio
    import io

    from fastapi import HTTPException, UploadFile
    from starlette.datastructures import Headers

    from app.deps import image_type, read_upload

    def upload(data: bytes, content_type: str = "", images: bool = False) -> bytes | int:
        f = UploadFile(io.BytesIO(data), headers=Headers({"content-type": content_type}))
        try:
            return asyncio.run(read_upload(f, images))
        except HTTPException as exc:
            return exc.status_code

    png, jpg = b"\x89PNG\r\n\x1a\n rest", b"\xff\xd8\xff\xe0 rest"
    assert upload(b"%PDF-1.7 body") == b"%PDF-1.7 body"
    assert upload(b"scan", "application/pdf") == b"scan"
    assert upload(b"<html>", "text/html") == 400
    assert upload(b"") == 400
    assert upload(b"%PDF" + b"0" * (10 * 1024 * 1024)) == 413
    assert upload(png, "image/png") == 400, "payslips take PDFs only"
    assert upload(png, "image/png", images=True) == png and upload(jpg, "image/jpeg", images=True) == jpg
    assert upload(b"GIF89a", "image/gif", images=True) == 400
    assert (image_type(png), image_type(jpg), image_type(b"%PDF")) == ("image/png", "image/jpeg", None)


def check_bill_extraction() -> None:
    import io

    from pypdf import PdfWriter

    from app.services.bill_extract import UnreadablePdf, fields_from_text, learn, pdf_text

    def pdf(lines: list[str]) -> bytes:
        stream = ("BT /F1 10 Tf 12 TL 40 760 Td " + " ".join(f"({line}) '" for line in lines) + " ET").encode()
        objs = [
            b"<< /Type /Catalog /Pages 2 0 R >>",
            b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R"
            b" /Resources << /Font << /F1 5 0 R >> >> >>",
            b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream),
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
        ]
        out, offsets = bytearray(b"%PDF-1.4\n"), []
        for n, body in enumerate(objs, 1):
            offsets.append(len(out))
            out += b"%d 0 obj\n%s\nendobj\n" % (n, body)
        xref = len(out)
        out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
        out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
        out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
        return bytes(out)

    utility = [
        "ACME ELECTRIC COMPANY",
        "Bill Date: October 5, 2026        Previous Due Date: 09/25/2026",
        "Billing Period: Sep 1 - Sep 30, 2026",
        "Due Date: Oct 25, 2026",
        "Previous Balance                    1,000.00",
        "Total Amount Due                PHP 2,345.50",
    ]
    card = [
        "Statement Date    Payment Due Date    Total Amount Due    Minimum Amount Due",
        "10/05/2026        10/25/2026          12,345.67           1,234.56",
        "Statement Period: 09/06/2026 to 10/05/2026",
    ]
    telco = [
        "Date Issued: 03 January 2027",
        "Service Period    Dec 15 - Jan 14, 2027",
        "Please pay on or before 23-Jan-2027",
        "Amount Due    1,699.00",
    ]
    def row(*cells: str) -> str:
        return "".join(cell.ljust(28) for cell in cells).rstrip()

    # Meralco: labels and values on alternating rows; "Bill Date" shares its row with the account number.
    meralco = [
        row("Your electric bill", "", "Account Number", "Due Date"),
        row("Billing Period", "Bill Date", "0618080363", "01 Sep 2026"),
        row("22 Jul 2026 to 21 Aug 2026", "21 Aug 2026"),
        row("Total Amount Due", "PHP 2,611.28"),
    ]
    for lines, want in (
        (utility, ("2026-10-05", "2026-10-25", "2026-09-01", "2026-09-30", 2345.5)),
        (card, ("2026-10-05", "2026-10-25", "2026-09-06", "2026-10-05", 12345.67)),
        (telco, ("2027-01-03", "2027-01-23", "2026-12-15", "2027-01-14", 1699.0)),
        (meralco, ("2026-08-21", "2026-09-01", "2026-07-22", "2026-08-21", 2611.28)),
    ):
        for got in (fields_from_text("\n".join(lines)), fields_from_text(pdf_text(pdf(lines)))):
            assert tuple(got.values()) == want, (lines[0], got)
    assert fields_from_text("Due Date: 25/10/2026")["due_date"] == "2026-10-25"
    assert set(fields_from_text("Thank you for your payment.").values()) == {None}

    # A biller whose wording the generic rules don't know, writing dates day-first: one saved bill teaches it.
    def acme(bill: str, due: str, start: str, end: str, amount: str) -> list[str]:
        return [
            f"Statement generated {bill}",
            f"Kindly settle on or before {due}",
            f"Usage window {start} - {end}",
            f"Pay this amount {amount}",
        ]

    october = acme("01/10/2026", "15/10/2026", "01/09/2026", "30/09/2026", "1,250.00")
    november = acme("01/11/2026", "15/11/2026", "01/10/2026", "31/10/2026", "1,310.40")
    saved = {
        "bill_date": "2026-10-01",
        "due_date": "2026-10-15",
        "period_start": "2026-09-01",
        "period_end": "2026-09-30",
        "amount": 1250.0,
    }
    assert set(fields_from_text("\n".join(november)).values()) == {None}
    hints = learn([("\n".join(october), saved)])
    assert hints.day_first and hints.gaps == {"due_date": 14, "period_start": -30, "period_end": -1}, hints
    november_read = ("2026-11-01", "2026-11-15", "2026-10-01", "2026-10-31", 1310.4)
    assert tuple(fields_from_text("\n".join(november), hints).values()) == november_read
    # The usual gaps fill a date no label points at, and overrule one picked from the wrong place.
    unlabeled = [*november[:1], *november[2:], "Reminder: 15/11/2026"]
    assert fields_from_text("\n".join(unlabeled), hints)["due_date"] == "2026-11-15"
    stray = ["Your next bill date: 01/12/2026", "Printed 01/11/2026", *november[1:]]
    assert fields_from_text("\n".join(stray), hints)["bill_date"] == "2026-11-01"

    def written(writer: PdfWriter) -> bytes:
        buf = io.BytesIO()
        writer.write(buf)
        return buf.getvalue()

    blank, locked = PdfWriter(), PdfWriter()
    blank.add_blank_page(612, 792)
    locked.add_blank_page(612, 792)
    locked.encrypt("secret", algorithm="RC4-128")
    for data in (written(blank), written(locked), b"%PDF-1.7 not really a pdf"):
        try:
            pdf_text(data)
        except UnreadablePdf:
            continue
        raise AssertionError("read a PDF it should have refused")


def check_db_against_postgres() -> None:
    url = os.environ.get("TEST_DATABASE_URL", "")
    if not url:
        print("  --  check_db_against_postgres skipped (set TEST_DATABASE_URL)")
        return
    from sqlalchemy import create_engine, text
    from sqlalchemy.exc import IntegrityError

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
        db.init_schema()  # re-seeding the lotto games again is a no-op
        missing = uuid.uuid4()

        trip_id = db.insert_travel_trip("Osaka", dt.date(2026, 4, 13), dt.date(2026, 4, 16), None)["trip"]["id"]
        city = dict.fromkeys(db.travel_child_columns("cities"))
        for name in ("Osaka", "Kyoto"):
            detail = db.insert_travel_child("cities", trip_id, {**city, "name": name})
        assert [(c["name"], c["sort_order"]) for c in detail["cities"]] == [("Osaka", 0), ("Kyoto", 1)]
        assert isinstance(trip_id, uuid.UUID)
        assert db.insert_travel_child("cities", missing, {**city, "name": "x"}) is None
        kyoto = detail["cities"][1]["id"]
        assert db.update_travel_child("cities", missing, kyoto, {**city, "name": "y"}) is None
        assert [c["name"] for c in db.delete_travel_child("cities", trip_id, kyoto)["cities"]] == ["Osaka"]

        games = {g["name"]: g["id"] for g in db.list_lotto_games()}
        assert sorted(games) == sorted(schema.SEED_LOTTO_GAMES), games
        ultra = games["Ultra Lotto 6/58"]
        db.upsert_lotto_draw(ultra, dt.date(2026, 1, 1), [1, 2, 3, 4, 5, 6])
        rows = [
            {"draw_date": dt.date(2026, 1, 1), "numbers": [1, 2, 3, 4, 5, 6], "jackpot_prize": 1.0, "winners": 1},
            {"draw_date": dt.date(2026, 1, 8), "numbers": [7, 8, 9, 10, 11, 12], "jackpot_prize": 2.0, "winners": 1},
            {"draw_date": dt.date(2026, 1, 8), "numbers": [13, 14, 15, 16, 17, 18], "jackpot_prize": 3.0, "winners": 2},
        ]
        assert db.upsert_lotto_draws_bulk(ultra, rows) == {"inserted": 1, "updated": 2, "total": 3}
        jan8 = next(d["draw"] for d in db.list_lotto_draws(ultra) if d["draw"]["draw_date"] == "2026-01-08")
        assert jan8["n1"] == 13 and jan8["winners"] == 2, jan8

        attempts = [([1, 2, 3, 4, 5, 6], 1), ([7, 8, 9, 10, 11, 12], None)]
        detail = db.insert_lotto_attempts_bulk(jan8["id"], attempts)
        assert [a["ticket"] for a in detail["attempts"]] == [1, None], detail
        assert db.insert_lotto_attempts_bulk(missing, attempts) is None

        result = {"game_id": ultra, "numbers": [2, 3, 4, 5, 6, 7], "jackpot_prize": 9.0, "winners": 0}
        fresh = {**result, "draw_date": dt.date(2026, 1, 15)}
        assert db.insert_lotto_results([{**result, "draw_date": dt.date(2026, 1, 8)}, fresh, fresh]) == 1
        assert db.list_lotto_draws(ultra)[1]["draw"]["n1"] == 13, "results overwrote a draw that had numbers"

        jan15 = db.list_lotto_draws(ultra)[0]["draw"]["id"]
        db.insert_lotto_attempts_bulk(jan15, [([1, 2, 3, 4, 8, 9], None), ([2, 3, 4, 5, 6, 8], None)])
        db.upsert_lotto_draw(ultra, dt.date(2026, 1, 22), None)
        game = next(g for g in db.list_lotto_games() if g["id"] == ultra)
        assert game["latest_result"] == {
            "draw_date": "2026-01-15",
            "numbers": [2, 3, 4, 5, 6, 7],
            "winners": 0,
            "best_hits": [2, 3, 4, 5, 6],
        }, game
        jan29 = db.upsert_lotto_draw(ultra, dt.date(2026, 1, 29), [9, 10, 11, 12, 13, 14], winners=1)["draw"]["id"]
        db.insert_lotto_attempts_bulk(jan29, [([9, 10, 11, 12, 13, 14], 1)])
        db.upsert_lotto_draw(ultra, dt.date(2026, 2, 1), None)
        month = db.list_lotto_results_between(dt.date(2026, 1, 1), dt.date(2026, 2, 1))
        assert [(r["draw_date"], r["winners"], r["best_hits"]) for r in month] == [
            ("2026-01-01", 1, None),
            ("2026-01-08", 2, []),
            ("2026-01-15", 0, [2, 3, 4, 5, 6]),
            ("2026-01-22", 0, None),
            ("2026-01-29", 1, [9, 10, 11, 12, 13, 14]),
        ], month
        assert month[1]["jackpot_prize"] == 3.0, month[1]
        assert month[1]["attempts"] == [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]], month[1]

        payslip = db.insert_payslip(1000, *([None] * 12), company="Acme")
        assert payslip["has_pdf"] is False
        assert db.set_payslip_pdf(payslip["id"], b"%PDF")
        assert db.get_payslip(payslip["id"])["has_pdf"] and db.get_payslip_pdf(payslip["id"]) == b"%PDF"

        names = ["Sophos", "Acme", "Globex"]
        companies = [db.insert_company(n)["id"] for n in names]
        assert [c["name"] for c in db.reorder_companies(companies[::-1])] == names[::-1]
        plan = db.insert_installment("Phone", 1, 3, 100.0, None, 100.0, None, None, 0, 0)
        line_ids = [ln["id"] for ln in plan["lines"]][::-1]
        moved = db.reorder_installment_lines(plan["installment"]["id"], line_ids)["lines"]
        assert [(ln["id"], ln["seq"]) for ln in moved] == list(zip(line_ids, [1, 2, 3])), moved

        db.upsert_calendar_day_overrides([("2026-10-13", 1000.0, 1199.02)])
        rows = db.upsert_calendar_day_overrides([("2026-10-13", 900.0, None), ("2026-10-12", 50.0, None)])
        assert [(r["day"], r["amount"], r["saved"]) for r in rows] == [
            ("2026-10-12", 50.0, None),
            ("2026-10-13", 900.0, 1199.02),
        ], rows
        assert db.upsert_calendar_day_overrides([("2026-10-13", 500.0, -3.5)])[1]["saved"] == -3.5

        bill = db.insert_monthly_expense("Internet", None, 1500.0, 2, 2026, 10, True, dt.date(2026, 10, 20))
        assert bill["expense_date"] == "2026-10-20", bill
        assert db.list_monthly_expenses(period_year=2026, period_month=11)[0]["expense_date"] == "2026-10-20"

        power = db.insert_bill_category({"name": "Electricity"})
        assert power["defaults"] == {}, power
        due = {"due_date": {"months": 1, "day": 8}, "amount": 1500.0}
        assert db.update_bill_category(power["id"], {"name": "Electricity", "defaults": due})["defaults"] == due
        visa = db.insert_bill_category({"name": "Visa", "is_credit_card": True})
        card_bill = {"bill_date": dt.date(2026, 10, 5), "due_date": dt.date(2026, 10, 25), "amount": 15000.0}
        card_bill |= {"period_start": dt.date(2026, 9, 6), "period_end": dt.date(2026, 10, 5), "minimum_due": 850.0}
        assert visa["is_credit_card"] and power["is_credit_card"] is False, (visa, power)
        assert db.insert_bill({**card_bill, "category_id": visa["id"]})["minimum_due"] == 850.0
        card = db.insert_credit_card("Visa", 50000.0, 1000.0, 100.0, 3.5, None, None)
        db.adjust_credit_card_balance(card["id"], 20000.0)
        linked = db.update_credit_card(card["id"], "Visa", 50000.0, 1000.0, 100.0, 3.5, None, None, visa["id"])
        statement = (linked["last_statement_balance"], linked["minimum_due"], linked["statement_date"], linked["due_date"])
        assert statement == (15000.0, 850.0, "2026-10-05", "2026-10-25"), linked
        assert linked["current_balance"] == 20000.0, "linking reset the adjusted balance"
        older = {**card_bill, "bill_date": dt.date(2026, 9, 5), "amount": 9.0, "category_id": visa["id"]}
        db.insert_bill(older)
        assert db.get_credit_card()["last_statement_balance"] == 15000.0, "an older bill became the statement"
        assert db.delete_bill_category(visa["id"])
        unlinked = db.get_credit_card()
        assert unlinked["bill_category_id"] is None and unlinked["last_statement_balance"] == 1000.0, unlinked
        assert db.delete_credit_card(card["id"])
        db.insert_bill_category({"name": "Internet"})
        try:
            db.insert_bill_category({"name": "electricity"})
        except IntegrityError:
            pass
        else:
            raise AssertionError("accepted a duplicate bill category")
        statement = {
            "bill_date": dt.date(2026, 10, 5),
            "due_date": dt.date(2026, 10, 25),
            "period_start": dt.date(2026, 9, 1),
            "period_end": dt.date(2026, 9, 30),
            "amount": None,
        }
        bill = db.insert_bill({**statement, "category_id": power["id"]})
        assert (bill["due_date"], bill["has_pdf"]) == ("2026-10-25", False), bill
        assert db.set_bill_pdf(bill["id"], b"%PDF-1.7") and db.get_bill_pdf(bill["id"]) == b"%PDF-1.7"
        updated = db.update_bill(bill["id"], {**statement, "category_id": power["id"], "amount": 2345.5})
        assert updated is not None and (updated["amount"], updated["has_pdf"]) == (2345.5, True), updated
        listed = db.list_bills()
        assert [c["name"] for c in listed["categories"]] == ["Electricity", "Internet"], listed
        assert listed["bills"][0]["has_pdf"] is True and "pdf_data" not in listed["bills"][0]
        try:
            db.insert_bill({**statement, "category_id": missing})
        except IntegrityError:
            pass
        else:
            raise AssertionError("accepted a bill for a missing category")
        assert db.delete_bill_category(power["id"])
        assert db.list_bills()["bills"] == [], "a deleted category left its bills behind"

        owner = db.insert_app_user("micah", "hash")["id"]
        other = db.insert_app_user("ana", "hash")["id"]
        passkey = db.insert_app_user_passkey(owner, b"cred", b"key", 0, "Laptop")
        assert db.get_app_user_passkey(b"cred")["user_id"] == owner
        db.mark_app_user_passkey_used(passkey["id"], 3)
        used = db.list_app_user_passkeys(owner)[0]
        assert used["sign_count"] == 3 and used["last_used_at"], used
        assert not db.delete_app_user_passkey(other, passkey["id"]), "deleted another user's passkey"
        try:
            db.insert_app_user_passkey(other, b"cred", b"key", 0, "Phone")
        except IntegrityError:
            pass
        else:
            raise AssertionError("registered one credential twice")
        db.insert_app_user_session(owner, b"hash")
        assert db.get_app_user_session_user_id(b"hash") == owner
        db.delete_app_user_session(b"hash")
        assert db.get_app_user_session_user_id(b"hash") is None, "logout left the session behind"
        db.insert_app_user_session(owner, b"hash")
        assert db.delete_app_user(owner) and db.get_app_user_passkey(b"cred") is None, "a deleted user kept its passkeys"
        assert db.get_app_user_session_user_id(b"hash") is None, "a deleted user stayed logged in"

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
