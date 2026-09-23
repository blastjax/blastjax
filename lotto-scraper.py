#!/usr/bin/env python3
"""
PCSO lotto results scraper - https://www.pcso.gov.ph/SearchLottoResult.aspx

The results page is an ASP.NET WebForms form with no JSON API behind it, so the
bot does what the Search button does in a browser: load the page, read its hidden
form state (__VIEWSTATE, __EVENTVALIDATION, ...), set the date dropdowns and post
the form back. Dropdown names are discovered from the page instead of being
hard-coded, long ranges are split into chunks, and requests are spaced out.

The site sits behind Akamai Bot Manager, which 403s python-requests on its TLS
fingerprint alone, so requests go through curl_cffi impersonating Chrome.

Setup:
    pip install curl_cffi beautifulsoup4

Examples:
    python pcso_scraper.py                                    # last 7 days -> pcso_results.csv
    python pcso_scraper.py --start 2025-01-01 --end 2025-06-30 --csv h1_2025.csv
    python pcso_scraper.py --start 2025-01-01 --game 6/58 --game 6/55
    python pcso_scraper.py --start 2020-01-01 --db lotto.db   # backfill into SQLite
    python pcso_scraper.py --db lotto.db --update             # daily run: only what's new

Tip: if you open the CSV in Excel, import "combination" as Text, otherwise
2D/3D results such as 12-25 or 4-7-1 get turned into dates.
"""
from __future__ import annotations

import argparse
import csv
import logging
import re
import sqlite3
import sys
import time
from contextlib import closing
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from curl_cffi import requests

DEFAULT_URL = "https://www.pcso.gov.ph/SearchLottoResult.aspx"
PH_TIME = timezone(timedelta(hours=8))  # the Philippines has no DST, so a fixed offset is exact
RETRIES = 3
MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]
DATE_ROLES = ("start_month", "start_day", "start_year", "end_month", "end_day", "end_year")
PAGER_LINK = re.compile(r"__doPostBack\('([^']+)','(Page\$[^']+)'\)")
MAX_PAGES = 500

log = logging.getLogger("pcso")


class ScrapeError(RuntimeError):
    """The site returned something we can't work with; the message says what."""


@dataclass
class Draw:
    game: str
    combination: str
    draw_date: str              # YYYY-MM-DD
    jackpot: float | None
    winners: int | None

    @property
    def key(self) -> tuple[str, str, str]:
        return self.game, self.draw_date, self.combination


@dataclass
class Form:
    action: str
    fields: dict[str, str]                      # what a browser would post unchanged
    selects: dict[str, list[tuple[str, str]]]   # dropdown name -> [(value, label), ...]
    submit: tuple[str, str] | None              # the Search button's (name, value)
    roles: dict[str, str] = field(default_factory=dict)  # "start_month", "game", ... -> dropdown name


# ----------------------------------------------------------------------------- page parsing

def parse_form(html: str, page_url: str) -> Form:
    soup = BeautifulSoup(html, "html.parser")
    viewstate = soup.find("input", attrs={"name": "__VIEWSTATE"})
    if viewstate is None:
        raise ScrapeError("No ASP.NET form on the page (no __VIEWSTATE). The site may be showing a "
                          "block or maintenance page, or it was redesigned; rerun with --dump-html to check.")
    form = viewstate.find_parent("form") or soup

    fields: dict[str, str] = {}
    buttons: list[tuple[str, str]] = []
    for inp in form.find_all("input"):
        name, kind = inp.get("name"), (inp.get("type") or "text").lower()
        if not name or kind in ("button", "image", "file", "reset"):
            continue
        if kind == "submit":
            buttons.append((name, inp.get("value", "")))
        elif kind in ("checkbox", "radio"):
            if inp.has_attr("checked"):
                fields[name] = inp.get("value", "on")
        else:
            fields[name] = inp.get("value", "")

    selects: dict[str, list[tuple[str, str]]] = {}
    for sel in form.find_all("select"):
        name = sel.get("name")
        if not name:
            continue
        selects[name] = [(o.get("value", o.get_text(strip=True)), o.get_text(strip=True))
                         for o in sel.find_all("option")]
        chosen = sel.find("option", selected=True) or sel.find("option")
        if chosen is not None:
            fields[name] = chosen.get("value", chosen.get_text(strip=True))

    def button_score(button: tuple[str, str]) -> int:  # prefer "Search Lotto" over e.g. a site-search box
        name, value = button[0].lower(), button[1].lower()
        return 4 * ("lotto" in value) + 2 * name.endswith("btnsearch") + ("search" in name)

    submit = max(buttons, key=button_score) if buttons else None
    return Form(urljoin(page_url, form.get("action") or page_url), fields, selects, submit)


def classify_dropdowns(selects: dict[str, list[tuple[str, str]]]) -> dict[str, str]:
    """Work out which dropdown is which from names like ...$ddlStartMonth or ...$ddlEndDay."""
    roles: dict[str, str] = {}
    for name in selects:
        key = name.rsplit("$", 1)[-1].lower()
        if "game" in key:
            roles.setdefault("game", name)
            continue
        side = "start" if "start" in key else "end" if "end" in key else None
        part = ("month" if "month" in key else "year" if "year" in key
                else "day" if ("day" in key or "date" in key) else None)
        if side and part:
            roles.setdefault(f"{side}_{part}", name)
    missing = [role for role in DATE_ROLES if role not in roles]
    if missing:
        raise ScrapeError(f"Couldn't find the {', '.join(missing)} dropdown(s). "
                          f"Dropdowns on the page: {', '.join(selects) or 'none'}")
    return roles


def pick(options: list[tuple[str, str]], *wanted: str) -> str | None:
    """Value of the first option whose value or label matches one of `wanted`."""
    wanted_lower = {w.lower() for w in wanted}
    for value, label in options:
        if value.strip().lower() in wanted_lower or label.strip().lower() in wanted_lower:
            return value
    return None


def date_fields(form: Form, side: str, day: date) -> dict[str, str]:
    month = MONTHS[day.month - 1]
    candidates = {
        "month": (month, month[:3], str(day.month), f"{day.month:02d}"),
        "day": (str(day.day), f"{day.day:02d}"),
        "year": (str(day.year),),
    }
    chosen = {}
    for part, wanted in candidates.items():
        name = form.roles[f"{side}_{part}"]
        value = pick(form.selects[name], *wanted)
        if value is None:
            raise ScrapeError(f"Can't select {day}: the {side} {part} dropdown has no {wanted[0]!r} option.")
        chosen[name] = value
    return chosen


def dropdown_years(form: Form) -> list[int]:
    years = {int(text) for option in form.selects[form.roles["start_year"]]
             for text in (s.strip() for s in option) if re.fullmatch(r"\d{4}", text)}
    return sorted(years)


def _rows(table) -> list:
    rows = []
    for child in table.find_all(["thead", "tbody", "tfoot", "tr"], recursive=False):
        rows.extend([child] if child.name == "tr" else child.find_all("tr", recursive=False))
    return rows


def _cells(row) -> list[str]:
    return [cell.get_text(" ", strip=True) for cell in row.find_all(["th", "td"], recursive=False)]


def _column(header: list[str], *needles: str) -> int | None:
    for i, text in enumerate(header):
        if len(text) <= 40 and any(needle in text for needle in needles):
            return i
    return None


def parse_date(text: str) -> date:
    for fmt in ("%m/%d/%Y", "%m/%d/%Y %I:%M:%S %p", "%Y-%m-%d", "%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(text.strip(), fmt).date()
        except ValueError:
            pass
    raise ValueError(f"unrecognised date: {text!r}")


def parse_number(text: str) -> float | None:
    try:
        return float(re.sub(r"[^\d.]", "", text))
    except ValueError:
        return None


def parse_results(html: str) -> tuple[list[Draw], list[tuple[str, str]]]:
    """Draws in the results grid, plus pager links as (event target, argument) if it's paginated."""
    soup = BeautifulSoup(html, "html.parser")
    draws: list[Draw] = []
    for table in soup.find_all("table"):
        rows = _rows(table)
        header = [text.lower() for text in _cells(rows[0])] if rows else []
        col = {"game": _column(header, "game"), "combination": _column(header, "combination"),
               "draw_date": _column(header, "draw"), "jackpot": _column(header, "jackpot", "prize"),
               "winners": _column(header, "winner")}
        if None in (col["game"], col["combination"], col["draw_date"]):
            continue
        for row in rows[1:]:
            cells = _cells(row)
            if len(cells) < len(header):
                continue                                  # pager or footer row
            try:
                drawn = parse_date(cells[col["draw_date"]])
            except ValueError:
                continue
            jackpot = parse_number(cells[col["jackpot"]]) if col["jackpot"] is not None else None
            winners = parse_number(cells[col["winners"]]) if col["winners"] is not None else None
            draws.append(Draw(game=" ".join(cells[col["game"]].split()),
                              combination=cells[col["combination"]].replace(" ", ""),
                              draw_date=drawn.isoformat(),
                              jackpot=jackpot,
                              winners=int(winners) if winners is not None else None))
        break                                             # the first matching table is the grid
    pager = []
    for link in soup.find_all("a", href=True):
        match = PAGER_LINK.search(link["href"])
        if match:
            pager.append(match.groups())
    return draws, pager


def next_page(pager: list[tuple[str, str]], current: int):
    """The pager link to the page after `current`, as ((target, argument), page_number), or None."""
    numbered = sorted((int(arg[5:]), (target, arg)) for target, arg in pager if arg[5:].isdigit())
    for number, link in numbered:
        if number > current:
            return link, number
    for target, arg in pager:
        if arg.lower() == "page$next":
            return (target, arg), current + 1
    return None


# ----------------------------------------------------------------------------- HTTP client

class PcsoClient:
    def __init__(self, url: str = DEFAULT_URL, delay: float = 3.0, dump_dir: str | None = None):
        self.url, self.delay = url, delay
        self.dump_dir = Path(dump_dir) if dump_dir else None
        if self.dump_dir:
            self.dump_dir.mkdir(parents=True, exist_ok=True)
        # impersonate sets Chrome's TLS/HTTP2 fingerprint and matching headers (User-Agent included)
        self.session = requests.Session(impersonate="chrome")
        self._last_request = 0.0
        self._count = 0

    def _fetch(self, method: str, url: str, data: dict[str, str] | None = None) -> str:
        headers = {}
        if method == "POST":
            site = urlparse(self.url)
            headers = {"Referer": self.url, "Origin": f"{site.scheme}://{site.netloc}"}
        for attempt in range(RETRIES + 1):
            wait = self.delay - (time.monotonic() - self._last_request)
            if wait > 0:
                time.sleep(wait)
            log.debug("%s %s", method, url)
            try:
                resp = self.session.request(method, url, data=data, headers=headers, timeout=60)
            except requests.exceptions.RequestException as exc:
                if attempt == RETRIES:
                    raise
                log.warning("%s; retrying", exc)
            else:
                if resp.status_code not in (502, 503, 504) or attempt == RETRIES:
                    break
                log.warning("HTTP %d from %s; retrying", resp.status_code, urlparse(url).netloc)
            finally:
                self._last_request = time.monotonic()
            time.sleep(3 * 2 ** attempt)
        self._count += 1
        if self.dump_dir:
            path = self.dump_dir / f"{self._count:03d}-{method.lower()}.html"
            path.write_text(resp.text, encoding="utf-8")
        if resp.status_code in (401, 403, 429):
            raise ScrapeError(f"HTTP {resp.status_code} from {urlparse(url).netloc}: the site is refusing "
                              "automated requests right now. Stopping; try later with a longer --delay.")
        resp.raise_for_status()
        return resp.text

    def load_form(self) -> Form:
        form = parse_form(self._fetch("GET", self.url), self.url)
        form.roles = classify_dropdowns(form.selects)
        return form

    def search(self, start: date, end: date, form: Form | None = None) -> list[Draw]:
        """Every game's draws from start to end (inclusive)."""
        form = form or self.load_form()
        if form.submit is None:
            raise ScrapeError("Couldn't find the Search button on the page.")
        data = dict(form.fields)
        data.update(date_fields(form, "start", start))
        data.update(date_fields(form, "end", end))
        game = form.roles.get("game")
        if game:
            everything = next((value for value, label in form.selects[game]
                               if label.lower().startswith("all") or value.strip() == "0"), None)
            if everything is not None:
                data[game] = everything
        data["__EVENTTARGET"] = ""
        data["__EVENTARGUMENT"] = ""
        data[form.submit[0]] = form.submit[1]
        html = self._fetch("POST", form.action, data)
        if "__VIEWSTATE" not in html:
            raise ScrapeError("The search came back with something other than the results page; "
                              "rerun with --dump-html to see what the site sent.")
        draws = self._with_remaining_pages(html, form.action)

        first, last = start.isoformat(), end.isoformat()
        in_range = [d for d in draws if first <= d.draw_date <= last]
        if draws and not in_range:
            log.warning("Got %d draws but none dated %s to %s; the site may have ignored the date filter.",
                        len(draws), first, last)
        return in_range

    def _with_remaining_pages(self, html: str, page_url: str) -> list[Draw]:
        """Follow the grid's pager links, in case the results are paginated."""
        draws, pager = parse_results(html)
        current = 1
        for _ in range(MAX_PAGES):
            step = next_page(pager, current)
            if step is None:
                break
            (target, argument), current = step
            form = parse_form(html, page_url)
            data = dict(form.fields)
            data["__EVENTTARGET"] = target
            data["__EVENTARGUMENT"] = argument
            html = self._fetch("POST", form.action, data)
            more, pager = parse_results(html)
            draws.extend(more)
        else:
            log.warning("Stopped after %d result pages; try a smaller --chunk-days.", MAX_PAGES)
        return draws


# ----------------------------------------------------------------------------- storage

SCHEMA = """
CREATE TABLE IF NOT EXISTS draws (
    game        TEXT NOT NULL,
    combination TEXT NOT NULL,
    draw_date   TEXT NOT NULL,              -- YYYY-MM-DD
    jackpot     REAL,
    winners     INTEGER,
    scraped_at  TEXT NOT NULL,
    PRIMARY KEY (game, draw_date, combination)
);
CREATE INDEX IF NOT EXISTS draws_by_date ON draws (draw_date);
"""

UPSERT = """
INSERT INTO draws (game, combination, draw_date, jackpot, winners, scraped_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT (game, draw_date, combination) DO UPDATE SET
    jackpot = COALESCE(excluded.jackpot, jackpot),
    winners = COALESCE(excluded.winners, winners),
    scraped_at = excluded.scraped_at
"""


def save_db(path: str, draws: list[Draw]) -> int:
    """Upsert draws into SQLite; returns how many were new."""
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with closing(sqlite3.connect(path)) as con:
        con.executescript(SCHEMA)
        before = con.execute("SELECT COUNT(*) FROM draws").fetchone()[0]
        with con:
            con.executemany(UPSERT, [(d.game, d.combination, d.draw_date, d.jackpot, d.winners, now)
                                     for d in draws])
        return con.execute("SELECT COUNT(*) FROM draws").fetchone()[0] - before


def latest_draw_date(path: str) -> date | None:
    if not Path(path).exists():
        return None
    with closing(sqlite3.connect(path)) as con:
        try:
            (latest,) = con.execute("SELECT MAX(draw_date) FROM draws").fetchone()
        except sqlite3.OperationalError:              # file exists but has no draws table yet
            return None
    return date.fromisoformat(latest) if latest else None


def save_csv(path: str, draws: list[Draw]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["draw_date", "game", "combination", "jackpot", "winners"])
        for d in draws:
            writer.writerow([d.draw_date, d.game, d.combination,
                             "" if d.jackpot is None else f"{d.jackpot:.2f}",
                             "" if d.winners is None else d.winners])


# ----------------------------------------------------------------------------- CLI

def iso_date(text: str) -> date:
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"expected YYYY-MM-DD, got {text!r}")


def date_chunks(start: date, end: date, days: int):
    while start <= end:
        stop = min(start + timedelta(days=days - 1), end)
        yield start, stop
        start = stop + timedelta(days=1)


def wanted(draw: Draw, games: list[str]) -> bool:
    return not games or any(g.lower() in draw.game.lower() for g in games)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Scrape lotto results from the PCSO website.",
        epilog="PCSO usually posts results around 10 PM PH time, so schedule --update runs after that.")
    parser.add_argument("--start", type=iso_date, help="first draw date, YYYY-MM-DD (default: 7 days ago)")
    parser.add_argument("--end", type=iso_date, help="last draw date, YYYY-MM-DD (default: today, PH time)")
    parser.add_argument("--game", action="append", default=[], metavar="TEXT",
                        help="keep only games whose name contains TEXT, e.g. 6/58 or 3D (repeatable)")
    parser.add_argument("--csv", metavar="PATH", help="write the results to a CSV file")
    parser.add_argument("--db", metavar="PATH", help="upsert the results into a SQLite database")
    parser.add_argument("--update", action="store_true",
                        help="with --db: start from the latest draw already in the database")
    parser.add_argument("--chunk-days", type=int, default=90, help="days per search request (default: 90)")
    parser.add_argument("--delay", type=float, default=3.0, help="seconds between requests (default: 3)")
    parser.add_argument("--dump-html", metavar="DIR", help="save every page received to DIR, for debugging")
    parser.add_argument("--url", default=DEFAULT_URL, help="results page URL (default: %(default)s)")
    parser.add_argument("-v", "--verbose", action="store_true", help="debug logging")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
    if args.chunk_days < 1:
        parser.error("--chunk-days must be at least 1")

    today = datetime.now(PH_TIME).date()
    end = args.end or today
    start = args.start or today - timedelta(days=7)
    if args.update:
        if not args.db:
            parser.error("--update needs --db")
        latest = latest_draw_date(args.db)
        if latest:
            start = latest - timedelta(days=2)        # small overlap catches late or corrected postings
        elif not args.start:
            parser.error(f"{args.db} has no draws yet; run once with --start to backfill it")
    if start > end:
        parser.error(f"start date {start} is after end date {end}")
    if not (args.csv or args.db):
        args.csv = "pcso_results.csv"

    client = PcsoClient(args.url, args.delay, args.dump_html)
    collected: dict[tuple[str, str, str], Draw] = {}
    new_rows, ok = 0, True
    try:
        form = client.load_form()
        years = dropdown_years(form)
        if years and start.year < years[0]:
            log.warning("The site's year dropdown starts at %d, so starting from %d-01-01.", years[0], years[0])
            start = date(years[0], 1, 1)
            if start > end:
                raise ScrapeError(f"The site only has results from {years[0]} onward.")
        for i, (first, last) in enumerate(date_chunks(start, end, args.chunk_days)):
            draws = [d for d in client.search(first, last, form if i == 0 else None) if wanted(d, args.game)]
            collected.update((d.key, d) for d in draws)
            note = ""
            if args.db:
                added = save_db(args.db, draws)
                new_rows += added
                note = f" ({added} new)"
            log.info("%s to %s: %d draws%s", first, last, len(draws), note)
    except (ScrapeError, requests.exceptions.RequestException) as exc:
        log.error("%s", exc)
        ok = False
    except KeyboardInterrupt:
        log.warning("Interrupted; keeping what was fetched so far.")
        ok = False

    draws = sorted(collected.values(), key=lambda d: (d.draw_date, d.game))
    if args.csv and (draws or ok):                    # don't clobber an old CSV with an empty failed run
        save_csv(args.csv, draws)
        log.info("Wrote %d draws to %s", len(draws), args.csv)
    if args.db:
        log.info("%d new draws saved to %s", new_rows, args.db)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())