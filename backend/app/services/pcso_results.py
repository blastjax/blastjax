"""PCSO lotto results from pcso.gov.ph/SearchLottoResult.aspx (an ASP.NET WebForms page).

The client behaves like one returning Chrome visitor instead of a new bot on every call:
- one long-lived session, so cookies persist and the TLS connection is reused;
- the search POST sends the headers Chrome sends for a same-site form submit;
- a sync repeated within REUSE of the last fetch reuses it instead of contacting PCSO;
- after a block, rate limit or outage it backs off instead of retrying right away.
"""

from __future__ import annotations

import datetime as dt
import logging
import threading
from collections.abc import Callable, Collection, Iterable
from dataclasses import dataclass

from bs4 import BeautifulSoup
from curl_cffi import CurlOpt, requests
from pydantic import ValidationError

from app.schemas.lotto import LottoNumbers

URL = "https://www.pcso.gov.ph/SearchLottoResult.aspx"
ORIGIN = "https://www.pcso.gov.ph"
PH_TIME = dt.timezone(dt.timedelta(hours=8))
SYNC_DAYS = 90
TIMEOUT = 30
FIRST_RESULTS = dt.time(14, 30)  # PH time; the day's first draw is at 2 PM and takes a while to go up
REUSE = dt.timedelta(minutes=15)  # repeat syncs within this window get the last fetch, no request
BACKOFF = dt.timedelta(minutes=10)  # pause after a failed fetch, doubling per failure in a row
MAX_BACKOFF = dt.timedelta(hours=6)

# Chrome's header order for a form POST (the GET's headers already come out in this order).
_HEADER_ORDER = (
    "content-length,cache-control,sec-ch-ua,sec-ch-ua-mobile,sec-ch-ua-platform,origin,content-type,"
    "upgrade-insecure-requests,user-agent,accept,sec-fetch-site,sec-fetch-mode,sec-fetch-user,"
    "sec-fetch-dest,referer,accept-encoding,accept-language,cookie,priority"
)

log = logging.getLogger(__name__)


class PcsoError(RuntimeError):
    """While backing off, `retry_at` says when the next request to PCSO is allowed."""

    retry_at: dt.datetime | None = None


class PcsoBlocked(PcsoError):
    """PCSO refused the request (HTTP 403/429). Retrying early turns a soft flag into a ban."""

    def __init__(self, message: str, server_wait: dt.timedelta | None = None) -> None:
        super().__init__(message)
        self.server_wait = server_wait


@dataclass
class PcsoResult:
    game: str
    draw_date: dt.date
    numbers: list[int]
    jackpot_prize: float
    winners: int


def sync_start(latest_results: Iterable[str | None], today: dt.date) -> dt.date:
    floor = today - dt.timedelta(days=SYNC_DAYS - 1)
    resume = [
        dt.date.fromisoformat(d) + dt.timedelta(days=1) if d else floor for d in latest_results
    ]
    return max(floor, min(resume, default=floor))


def fetch_results(start: dt.date, end: dt.date, games: Collection[str]) -> list[PcsoResult]:
    """Results for `games` drawn from `start` to `end`.

    Reuses the last fetch, with no request, when it covered this range less than REUSE ago.
    Raises PcsoError (PcsoBlocked for 403/429); while backing off it raises straight away
    with `retry_at` set.
    """
    return _client.fetch(start, end, games)


def parse_results(html: str, games: Collection[str]) -> list[PcsoResult]:
    return _results(_rows(html), games)


@dataclass
class _Snapshot:
    fetched_at: dt.datetime
    start: dt.date
    end: dt.date
    rows: list[list[str]]


class _Client:
    def __init__(self, clock: Callable[[], dt.datetime] = lambda: dt.datetime.now(PH_TIME)) -> None:
        self._clock = clock
        self._lock = threading.Lock()  # one fetch at a time; callers waiting on it then hit the snapshot
        self._session: requests.Session | None = None
        self._snapshot: _Snapshot | None = None
        self._failures = 0
        self._retry_at: dt.datetime | None = None

    def fetch(self, start: dt.date, end: dt.date, games: Collection[str]) -> list[PcsoResult]:
        with self._lock:
            now = self._clock().astimezone(PH_TIME)
            end = min(end, _posted_through(now))  # never ask for a day whose draws can't be up yet
            if start > end:
                return []
            snap = self._snapshot
            if snap and snap.start <= start and end <= snap.end and now < snap.fetched_at + REUSE:
                return _results(snap.rows, games, start, end)
            if self._retry_at and now < self._retry_at:
                exc = PcsoError(f"Holding off on pcso.gov.ph until {self._retry_at:%Y-%m-%d %H:%M} after a failure.")
                exc.retry_at = self._retry_at
                raise exc
            try:
                rows = _rows(self._search(start, end))
            except PcsoError as exc:
                self._failures += 1
                wait = min(BACKOFF * 2 ** min(self._failures - 1, 10), MAX_BACKOFF)
                if isinstance(exc, PcsoBlocked):
                    if exc.server_wait:
                        wait = max(wait, exc.server_wait)
                    if self._session:
                        self._session.close()  # don't bring the refused session's cookies back
                        self._session = None
                self._retry_at = exc.retry_at = now + wait
                log.warning("PCSO fetch failed (%s); next attempt after %s", exc, self._retry_at)
                raise
            self._failures, self._retry_at = 0, None
            self._snapshot = _Snapshot(now, start, end, rows)
            return _results(rows, games, start, end)

    def _search(self, start: dt.date, end: dt.date) -> str:
        if self._session is None:
            self._session = requests.Session(
                impersonate="chrome", curl_options={CurlOpt.HTTPHEADER_ORDER: _HEADER_ORDER}
            )
        try:
            fields, names = _form(_page(self._session.get(URL, timeout=TIMEOUT)))
            search = {
                "ddlStartMonth": f"{start:%B}",
                "ddlStartDate": str(start.day),
                "ddlStartYear": str(start.year),
                "ddlEndMonth": f"{end:%B}",
                "ddlEndDay": str(end.day),
                "ddlEndYear": str(end.year),
                "ddlSelectGame": "0",
                "btnSearch": "Search Lotto",
            }
            for short, value in search.items():
                if short not in names:
                    raise PcsoError(f"PCSO's results form has no {short}; the page was likely redesigned.")
                fields[names[short]] = value
            headers = {
                "Cache-Control": "max-age=0",
                "Origin": ORIGIN,
                "Content-Type": "application/x-www-form-urlencoded",
                "Sec-Fetch-Site": "same-origin",  # curl_cffi's default "none" contradicts the Referer
                "Referer": URL,
            }
            return _page(self._session.post(URL, data=fields, headers=headers, timeout=TIMEOUT))
        except requests.exceptions.RequestException as exc:
            raise PcsoError(f"Couldn't reach pcso.gov.ph: {exc}") from exc


def _page(resp: requests.Response) -> str:
    if resp.status_code in (403, 429):
        wait = resp.headers.get("Retry-After") or ""
        raise PcsoBlocked(
            f"pcso.gov.ph refused the request (HTTP {resp.status_code}).",
            dt.timedelta(seconds=int(wait)) if wait.isdigit() else None,
        )
    if resp.status_code != 200:
        raise PcsoError(f"pcso.gov.ph answered HTTP {resp.status_code} instead of the results page.")
    if "__VIEWSTATE" not in resp.text:
        raise PcsoError("pcso.gov.ph sent something other than the results page (block or maintenance page?).")
    return resp.text


def _form(html: str) -> tuple[dict[str, str], dict[str, str]]:
    fields: dict[str, str] = {}
    names: dict[str, str] = {}
    for tag in BeautifulSoup(html, "html.parser").find_all(["input", "select"], attrs={"name": True}):
        names[tag["name"].rsplit("$", 1)[-1]] = tag["name"]
        if tag.get("type") == "hidden":
            fields[tag["name"]] = tag.get("value", "")
    return fields, names


def _rows(html: str) -> list[list[str]]:
    grid = BeautifulSoup(html, "html.parser").find("table", class_="search-lotto-result-table")
    rows = [[td.get_text(strip=True) for td in tr.find_all("td")] for tr in grid.find_all("tr")] if grid else []
    return [cells for cells in rows if len(cells) == 5]


def _results(
    rows: Iterable[list[str]], games: Collection[str], start: dt.date = dt.date.min, end: dt.date = dt.date.max
) -> list[PcsoResult]:
    results: list[PcsoResult] = []
    for cells in rows:
        if cells[0] not in games:
            continue
        game, combination, drawn, jackpot, winners = cells
        try:
            result = PcsoResult(
                game=game,
                draw_date=dt.datetime.strptime(drawn, "%m/%d/%Y").date(),
                numbers=LottoNumbers(numbers=[int(n) for n in combination.split("-")]).numbers,
                jackpot_prize=float(jackpot.replace(",", "")),
                winners=int(winners),
            )
        except (ValueError, ValidationError) as exc:
            log.warning("Skipping PCSO row %s: %s", cells, exc)
            continue
        if start <= result.draw_date <= end:
            results.append(result)
    return results


def _posted_through(now: dt.datetime) -> dt.date:
    """Latest draw date whose results can be on the site by `now`."""
    now = now.astimezone(PH_TIME)
    return now.date() if now.time() >= FIRST_RESULTS else now.date() - dt.timedelta(days=1)


_client = _Client()
