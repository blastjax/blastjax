"""Pulls lotto results from pcso.gov.ph's results search.

There's no API behind it: the page is an ASP.NET WebForms form, so this does
what its Search button does -- GET the page for its hidden form state
(__VIEWSTATE, __EVENTVALIDATION, ...), set the date dropdowns, POST it back and
read the results grid. The site sits behind Akamai Bot Manager, which 403s
python-requests on its TLS fingerprint alone, hence curl_cffi impersonating
Chrome.

One search covers every game PCSO runs (2D through 6/58); only rows naming one
of ``games`` come back, which PCSO spells exactly as ``lotto_game.name`` does
("Ultra Lotto 6/58", "Lotto 6/42", ...). A 90-day search is ~800 rows on a
single page -- the grid isn't paginated -- so ``SYNC_DAYS`` is one request.
"""

from __future__ import annotations

import datetime as dt
import logging
from collections.abc import Collection, Iterable
from dataclasses import dataclass

from bs4 import BeautifulSoup
from curl_cffi import requests
from pydantic import ValidationError

from app.schemas.lotto import LottoNumbers

URL = "https://www.pcso.gov.ph/SearchLottoResult.aspx"
PH_TIME = dt.timezone(dt.timedelta(hours=8))  # no DST in the Philippines, so a fixed offset is exact
# ponytail: one search's worth; a longer gap is left to "Import historic results".
SYNC_DAYS = 90

log = logging.getLogger(__name__)


class PcsoError(RuntimeError):
    """PCSO didn't hand back its results page; the message says what came instead."""


@dataclass
class PcsoResult:
    game: str
    draw_date: dt.date
    numbers: list[int]  # sorted, as lotto_draw stores them
    jackpot_prize: float
    winners: int


def sync_start(latest_results: Iterable[str | None], today: dt.date) -> dt.date:
    """First date worth searching: the day after the newest result of whichever
    game is furthest behind (ISO dates, None for a game with none yet), but no
    more than ``SYNC_DAYS`` back. Later than ``today`` means nothing is missing."""
    floor = today - dt.timedelta(days=SYNC_DAYS - 1)
    resume = [
        dt.date.fromisoformat(d) + dt.timedelta(days=1) if d else floor for d in latest_results
    ]
    return max(floor, min(resume, default=floor))


def fetch_results(start: dt.date, end: dt.date, games: Collection[str]) -> list[PcsoResult]:
    try:
        with requests.Session(impersonate="chrome") as session:
            fields, names = _form(_fetch(session, "GET"))
            search = {
                "ddlStartMonth": f"{start:%B}",
                "ddlStartDate": str(start.day),  # sic: the start day is "Date", the end day "Day"
                "ddlStartYear": str(start.year),
                "ddlEndMonth": f"{end:%B}",
                "ddlEndDay": str(end.day),
                "ddlEndYear": str(end.year),
                "ddlSelectGame": "0",  # All Games
                "btnSearch": "Search Lotto",
            }
            for short, value in search.items():
                if short not in names:
                    raise PcsoError(f"PCSO's results form has no {short}; the page was likely redesigned.")
                fields[names[short]] = value
            html = _fetch(
                session, "POST", data=fields, headers={"Referer": URL, "Origin": "https://www.pcso.gov.ph"}
            )
    except requests.exceptions.RequestException as exc:
        raise PcsoError(f"Couldn't reach pcso.gov.ph: {exc}") from exc
    return parse_results(html, games)


def _fetch(session: requests.Session, method: str, **kwargs) -> str:
    resp = session.request(method, URL, timeout=30, **kwargs)
    if resp.status_code != 200:
        raise PcsoError(f"pcso.gov.ph answered HTTP {resp.status_code} instead of the results page.")
    if "__VIEWSTATE" not in resp.text:
        raise PcsoError("pcso.gov.ph sent something other than the results page (block or maintenance page?).")
    return resp.text


def _form(html: str) -> tuple[dict[str, str], dict[str, str]]:
    """The hidden fields a browser posts back unchanged, and every control's
    full ASP.NET name keyed by its short id, e.g. ``ddlStartMonth`` ->
    ``ctl00$ctl00$cphContainer$cpContent$ddlStartMonth``."""
    fields: dict[str, str] = {}
    names: dict[str, str] = {}
    for tag in BeautifulSoup(html, "html.parser").find_all(["input", "select"], attrs={"name": True}):
        names[tag["name"].rsplit("$", 1)[-1]] = tag["name"]
        if tag.get("type") == "hidden":
            fields[tag["name"]] = tag.get("value", "")
    return fields, names


def parse_results(html: str, games: Collection[str]) -> list[PcsoResult]:
    """Rows of the results grid for ``games``. No grid at all is how PCSO says
    there were no draws in range. A row that won't parse is logged and skipped
    rather than sinking the rest."""
    grid = BeautifulSoup(html, "html.parser").find("table", class_="search-lotto-result-table")
    results: list[PcsoResult] = []
    for row in grid.find_all("tr") if grid else []:
        cells = [td.get_text(strip=True) for td in row.find_all("td")]  # the header row is all <th>
        if len(cells) != 5 or cells[0] not in games:
            continue
        game, combination, drawn, jackpot, winners = cells
        try:
            results.append(
                PcsoResult(
                    game=game,
                    draw_date=dt.datetime.strptime(drawn, "%m/%d/%Y").date(),
                    numbers=LottoNumbers(numbers=[int(n) for n in combination.split("-")]).numbers,
                    jackpot_prize=float(jackpot.replace(",", "")),
                    winners=int(winners),
                )
            )
        except (ValueError, ValidationError) as exc:
            log.warning("Skipping PCSO row %s: %s", cells, exc)
    return results
