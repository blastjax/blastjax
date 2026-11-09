# Node be:core:test_core: test_core.py
Kind: module
Language: python, 848 lines of code, location: backend/test_core.py

Source excerpt: backend/test_core.py (first 150 lines)
```
   1  #!/usr/bin/env python
   2  from __future__ import annotations
   3  
   4  import datetime as dt
   5  import os
   6  import re
   7  import sys
   8  import time
   9  import uuid
  10  from decimal import Decimal
  11  from pathlib import Path
  12  
  13  sys.path.insert(0, str(Path(__file__).resolve().parent))
  14  
  15  import db
  16  import schema
  17  from app import security
  18  from app.routers import auth, travel
  19  from app.services import pcso_results
  20  
  21  
  22  def check_normalize() -> None:
  23      n = db._normalize
  24      assert n(dt.datetime(2026, 4, 13, 2, 6, 38)) == "2026-04-13T02:06:38"
  25      assert n(dt.date(2026, 4, 13)) == "2026-04-13"
  26      assert n(dt.time(2, 6, 38)) == "02:06:38"
  27      assert n(Decimal("12.50")) == 12.5
  28      assert isinstance(n(Decimal("12.50")), float)
  29      assert n(memoryview(b"pdf")) == b"pdf"
  30      assert n(None) is None
  31      assert n("plain") == "plain"
  32      assert n(7) == 7
  33  
  34  
  35  def check_nights_and_days() -> None:
  36      nd = travel._nights_and_days
  37      assert nd("2026-04-13", "2026-04-16") == (3, 4)
  38      assert nd("2026-04-13", "2026-04-13") == (0, 1)
  39      assert nd("2026-01-30", "2026-02-02") == (3, 4)
  40      assert nd("2026-12-30", "2027-01-02") == (3, 4)
  41  
  42  
  43  def check_request_models_match_writable_columns() -> None:
  44      from app.schemas.travel import (
  45          TravelAccommodationCreate,
  46          TravelCityCreate,
  47          TravelFlightCreate,
  48          TravelItineraryCreate,
  49          TravelTransportCreate,
  50      )
  51  
  52      models = {
  53          "cities": TravelCityCreate,
  54          "flights": TravelFlightCreate,
  55          "transport": TravelTransportCreate,
  56          "itinerary": TravelItineraryCreate,
  57          "accommodations": TravelAccommodationCreate,
  58      }
  59      assert set(models) == set(db._TRAVEL_CHILDREN), "a child kind has no request model"
  60      for kind, model in models.items():
  61          fields = set(model.model_fields)
  62          cols = set(db.travel_child_columns(kind))
  63          assert fields == cols, f"{kind}: model/column mismatch {fields ^ cols}"
  64  
  65      assert "sort_order" not in db.travel_child_columns("cities")
  66      assert set(db.travel_child_columns("cities")) == {"name", "start_date", "end_date"}
  67  
  68  
  69  def check_write_values_rejects_drift() -> None:
  70      for bad in ({"name": "x"}, {"name": "x", "start_date": None, "end_date": None, "oops": 1}):
  71          try:
  72              db._travel_write_values("cities", bad)
  73          except ValueError:
  74              continue
  75          raise AssertionError(f"accepted mismatched write values: {bad}")
  76  
  77      ok = {"name": "x", "start_date": None, "end_date": None}
  78      assert db._travel_write_values("cities", ok) == ("name", "start_date", "end_date")
  79  
  80  
  81  def check_pcso_results() -> None:
  82      html = """<table class="Grid search-lotto-result-table">
  83        <tr><th>LOTTO GAME</th><th>COMBINATIONS</th><th>DRAW DATE</th><th>JACKPOT (PHP)</th><th>WINNERS</th></tr>
  84        <tr><td>Ultra Lotto 6/58</td><td>18-03-22-20-19-43</td><td>9/22/2026</td><td>322,258,134.01</td><td>1</td></tr>
  85        <tr><td>3D Lotto 2PM</td><td>0-3-4</td><td>9/22/2026</td><td>4,500.00</td><td>164</td></tr>
  86        <tr><td>Lotto 6/42</td><td>01-01-02-03-04-05</td><td>9/22/2026</td><td>5,000,000.00</td><td>0</td></tr>
  87      </table>"""
  88      games = {"Ultra Lotto 6/58", "Lotto 6/42"}
  89      got = pcso_results.parse_results(html, games)
  90      assert got == [
  91          pcso_results.PcsoResult(
  92              game="Ultra Lotto 6/58",
  93              draw_date=dt.date(2026, 9, 22),
  94              numbers=[3, 18, 19, 20, 22, 43],
  95              jackpot_prize=322258134.01,
  96              winners=1,
  97          )
  98      ], got
  99      assert pcso_results.parse_results("<p>no draws</p>", games) == []
 100  
 101      today = dt.date(2026, 9, 23)
 102      assert pcso_results.sync_start(["2026-09-22", "2026-09-20"], today) == dt.date(2026, 9, 21)
 103      floor = today - dt.timedelta(days=pcso_results.SYNC_DAYS - 1)
 104      assert pcso_results.sync_start(["2026-09-22", None], today) == floor
 105      assert pcso_results.sync_start(["2020-01-01"], today) == floor
 106      assert pcso_results.sync_start(["2026-09-23"], today) > today
 107  
 108      # Client: `replies` scripts what each request to PCSO returns; an unscripted request fails on pop.
 109      replies: list[str | Exception] = []
 110  
 111      def search(start: dt.date, end: dt.date) -> str:
 112          reply = replies.pop(0)
 113          if isinstance(reply, Exception):
 114              raise reply
 115          return reply
 116  
 117      client = pcso_results._Client()
 118      client._search = search  # type: ignore[method-assign]
 119      at = lambda d, h, m=0: dt.datetime(2026, 9, d, h, m, tzinfo=pcso_results.PH_TIME)  # noqa: E731
 120  
 121      def fetch(now: dt.datetime, start_day: int = 22) -> list[pcso_results.PcsoResult]:
 122          client._clock = lambda: now
 123          return client.fetch(dt.date(2026, 9, start_day), now.date(), games)
 124  
 125      replies[:] = [html]
 126      assert fetch(at(22, 23)) == got
 127      assert fetch(at(22, 23, 10)) == got, "a repeat sync within REUSE should not hit PCSO"
 128      assert fetch(at(23, 10), start_day=23) == [], "the 23rd's draws can't be up before 2:30 PM"
 129      replies[:] = [pcso_results.PcsoBlocked("HTTP 403")]  # 11 hours later the 22nd is fetched again
 130      try:
 131          fetch(at(23, 10))
 132      except pcso_results.PcsoBlocked as exc:
 133          assert exc.retry_at == at(23, 10, 10), exc.retry_at
 134      else:
 135          raise AssertionError("a 403 from PCSO didn't raise")
 136      try:
 137          fetch(at(23, 10, 5))
 138      except pcso_results.PcsoError as exc:
 139          assert not isinstance(exc, pcso_results.PcsoBlocked) and exc.retry_at == at(23, 10, 10)
 140      else:
 141          raise AssertionError("retried PCSO during the backoff")
 142      replies[:] = [html]
 143      assert fetch(at(23, 10, 10)) == got
 144      assert not replies
 145  
 146  
 147  def check_serialize_detail_shape() -> None:
 148      detail: dict[str, object] = {"trip": {"id": 1, "title": "Osaka"}}
 149      for kind in db._TRAVEL_CHILDREN:
 150          detail[kind] = []
```

## Outgoing connections
- call -> db.py (be:core:db)
- call -> deps.py (be:core:deps)
- call -> schema.py (be:core:schema)
- call -> security.py (be:core:security)
- call -> routers/auth.py (be:router:auth)
- call -> routers/credit_card.py (be:router:credit_card)
- call -> routers/travel.py (be:router:travel)
- call -> schemas/ (Pydantic) (be:schemas)
- call -> services/bill_extract.py (be:service:bill_extract)
- call -> services/payslip_parse.py (be:service:payslip_parse)
- call -> services/pcso_results.py (be:service:pcso_results)

## Incoming connections
- none
