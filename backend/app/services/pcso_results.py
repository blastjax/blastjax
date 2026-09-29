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
PH_TIME = dt.timezone(dt.timedelta(hours=8))
SYNC_DAYS = 90

log = logging.getLogger(__name__)


class PcsoError(RuntimeError):
    pass
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
    try:
        with requests.Session(impersonate="chrome") as session:
            fields, names = _form(_fetch(session, "GET"))
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
    fields: dict[str, str] = {}
    names: dict[str, str] = {}
    for tag in BeautifulSoup(html, "html.parser").find_all(["input", "select"], attrs={"name": True}):
        names[tag["name"].rsplit("$", 1)[-1]] = tag["name"]
        if tag.get("type") == "hidden":
            fields[tag["name"]] = tag.get("value", "")
    return fields, names


def parse_results(html: str, games: Collection[str]) -> list[PcsoResult]:
    grid = BeautifulSoup(html, "html.parser").find("table", class_="search-lotto-result-table")
    results: list[PcsoResult] = []
    for row in grid.find_all("tr") if grid else []:
        cells = [td.get_text(strip=True) for td in row.find_all("td")]
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
