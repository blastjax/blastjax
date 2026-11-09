# Node be:service:pcso_results: services/pcso_results.py
Kind: module
Language: python, 188 lines of code, location: backend/app/services/pcso_results.py

Source excerpt: backend/app/services/pcso_results.py (first 150 lines)
```
   1  """PCSO lotto results from pcso.gov.ph/SearchLottoResult.aspx (an ASP.NET WebForms page).
   2  
   3  The client behaves like one returning Chrome visitor instead of a new bot on every call:
   4  - one long-lived session, so cookies persist and the TLS connection is reused;
   5  - the search POST sends the headers Chrome sends for a same-site form submit;
   6  - a sync repeated within REUSE of the last fetch reuses it instead of contacting PCSO;
   7  - after a block, rate limit or outage it backs off instead of retrying right away.
   8  """
   9  
  10  from __future__ import annotations
  11  
  12  import datetime as dt
  13  import logging
  14  import threading
  15  from collections.abc import Callable, Collection, Iterable
  16  from dataclasses import dataclass
  17  
  18  from bs4 import BeautifulSoup
  19  from curl_cffi import CurlOpt, requests
  20  from pydantic import ValidationError
  21  
  22  from app.schemas.lotto import LottoNumbers
  23  
  24  URL = "https://www.pcso.gov.ph/SearchLottoResult.aspx"
  25  ORIGIN = "https://www.pcso.gov.ph"
  26  PH_TIME = dt.timezone(dt.timedelta(hours=8))
  27  SYNC_DAYS = 90
  28  TIMEOUT = 30
  29  FIRST_RESULTS = dt.time(14, 30)  # PH time; the day's first draw is at 2 PM and takes a while to go up
  30  REUSE = dt.timedelta(minutes=15)  # repeat syncs within this window get the last fetch, no request
  31  BACKOFF = dt.timedelta(minutes=10)  # pause after a failed fetch, doubling per failure in a row
  32  MAX_BACKOFF = dt.timedelta(hours=6)
  33  
  34  # Chrome's header order for a form POST (the GET's headers already come out in this order).
  35  _HEADER_ORDER = (
  36      "content-length,cache-control,sec-ch-ua,sec-ch-ua-mobile,sec-ch-ua-platform,origin,content-type,"
  37      "upgrade-insecure-requests,user-agent,accept,sec-fetch-site,sec-fetch-mode,sec-fetch-user,"
  38      "sec-fetch-dest,referer,accept-encoding,accept-language,cookie,priority"
  39  )
  40  
  41  log = logging.getLogger(__name__)
  42  
  43  
  44  class PcsoError(RuntimeError):
  45      """While backing off, `retry_at` says when the next request to PCSO is allowed."""
  46  
  47      retry_at: dt.datetime | None = None
  48  
  49  
  50  class PcsoBlocked(PcsoError):
  51      """PCSO refused the request (HTTP 403/429). Retrying early turns a soft flag into a ban."""
  52  
  53      def __init__(self, message: str, server_wait: dt.timedelta | None = None) -> None:
  54          super().__init__(message)
  55          self.server_wait = server_wait
  56  
  57  
  58  @dataclass
  59  class PcsoResult:
  60      game: str
  61      draw_date: dt.date
  62      numbers: list[int]
  63      jackpot_prize: float
  64      winners: int
  65  
  66  
  67  def sync_start(latest_results: Iterable[str | None], today: dt.date) -> dt.date:
  68      floor = today - dt.timedelta(days=SYNC_DAYS - 1)
  69      resume = [
  70          dt.date.fromisoformat(d) + dt.timedelta(days=1) if d else floor for d in latest_results
  71      ]
  72      return max(floor, min(resume, default=floor))
  73  
  74  
  75  def fetch_results(start: dt.date, end: dt.date, games: Collection[str]) -> list[PcsoResult]:
  76      """Results for `games` drawn from `start` to `end`.
  77  
  78      Reuses the last fetch, with no request, when it covered this range less than REUSE ago.
  79      Raises PcsoError (PcsoBlocked for 403/429); while backing off it raises straight away
  80      with `retry_at` set.
  81      """
  82      return _client.fetch(start, end, games)
  83  
  84  
  85  def parse_results(html: str, games: Collection[str]) -> list[PcsoResult]:
  86      return _results(_rows(html), games)
  87  
  88  
  89  @dataclass
  90  class _Snapshot:
  91      fetched_at: dt.datetime
  92      start: dt.date
  93      end: dt.date
  94      rows: list[list[str]]
  95  
  96  
  97  class _Client:
  98      def __init__(self, clock: Callable[[], dt.datetime] = lambda: dt.datetime.now(PH_TIME)) -> None:
  99          self._clock = clock
 100          self._lock = threading.Lock()  # one fetch at a time; callers waiting on it then hit the snapshot
 101          self._session: requests.Session | None = None
 102          self._snapshot: _Snapshot | None = None
 103          self._failures = 0
 104          self._retry_at: dt.datetime | None = None
 105  
 106      def fetch(self, start: dt.date, end: dt.date, games: Collection[str]) -> list[PcsoResult]:
 107          with self._lock:
 108              now = self._clock().astimezone(PH_TIME)
 109              end = min(end, _posted_through(now))  # never ask for a day whose draws can't be up yet
 110              if start > end:
 111                  return []
 112              snap = self._snapshot
 113              if snap and snap.start <= start and end <= snap.end and now < snap.fetched_at + REUSE:
 114                  return _results(snap.rows, games, start, end)
 115              if self._retry_at and now < self._retry_at:
 116                  exc = PcsoError(f"Holding off on pcso.gov.ph until {self._retry_at:%Y-%m-%d %H:%M} after a failure.")
 117                  exc.retry_at = self._retry_at
 118                  raise exc
 119              try:
 120                  rows = _rows(self._search(start, end))
 121              except PcsoError as exc:
 122                  self._failures += 1
 123                  wait = min(BACKOFF * 2 ** min(self._failures - 1, 10), MAX_BACKOFF)
 124                  if isinstance(exc, PcsoBlocked):
 125                      if exc.server_wait:
 126                          wait = max(wait, exc.server_wait)
 127                      if self._session:
 128                          self._session.close()  # don't bring the refused session's cookies back
 129                          self._session = None
 130                  self._retry_at = exc.retry_at = now + wait
 131                  log.warning("PCSO fetch failed (%s); next attempt after %s", exc, self._retry_at)
 132                  raise
 133              self._failures, self._retry_at = 0, None
 134              self._snapshot = _Snapshot(now, start, end, rows)
 135              return _results(rows, games, start, end)
 136  
 137      def _search(self, start: dt.date, end: dt.date) -> str:
 138          if self._session is None:
 139              self._session = requests.Session(
 140                  impersonate="chrome", curl_options={CurlOpt.HTTPHEADER_ORDER: _HEADER_ORDER}
 141              )
 142          try:
 143              fields, names = _form(_page(self._session.get(URL, timeout=TIMEOUT)))
 144              search = {
 145                  "ddlStartMonth": f"{start:%B}",
 146                  "ddlStartDate": str(start.day),
 147                  "ddlStartYear": str(start.year),
 148                  "ddlEndMonth": f"{end:%B}",
 149                  "ddlEndDay": str(end.day),
 150                  "ddlEndYear": str(end.year),
```

## Outgoing connections
- call -> schemas/ (Pydantic) (be:schemas)
- call -> pcso.gov.ph (lotto results) (ext:pcso)

## Incoming connections
- test_core.py (be:core:test_core) -> call
- routers/lotto.py (be:router:lotto) -> call
