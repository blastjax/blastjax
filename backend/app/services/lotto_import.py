"""Parsing for the historic lotto draw-results text format.

Accepts rows shaped like either::

    | 26-10-05-24-49-12 | 1/3/2016 | 50,000,000.00 | 1 |
    26-10-05-24-49-12 1/3/2016 50,000,000.00 1

i.e. winning numbers - draw date - jackpot prize - winner count, one draw per
line, with the four fields separated by pipes, plain whitespace, or a mix of
both (the pipes are cosmetic — only the field order matters).

A row copied straight out of the results site's spreadsheet leads with a
tab-separated game-name column, e.g.::

    Ultra Lotto 6/58	32-25-23-22-01-41	9/1/2026	258,474,543.62	0

That leading column is discarded — this app only ever tracks one game, so the
name itself doesn't matter, only that a tab follows it (a space-separated
game name would be indistinguishable from the numbers field otherwise).

Blank lines and lines that don't match are skipped and reported back in
``errors`` rather than aborting the whole import, so one bad row in a large
paste doesn't block the rest.
"""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from app.schemas.lotto import LottoNumbers

_SEP = r"(?:\s*\|\s*|\s+)"  # a pipe (spaces optional around it) or plain whitespace

_ROW_RE = re.compile(
    rf"""^\s*\|?\s*
        (?:[^\t|]+\t+)?
        (?P<numbers>[\d\-]+){_SEP}
        (?P<date>\d{{1,2}}/\d{{1,2}}/\d{{4}}){_SEP}
        (?P<jackpot>[\d,]+(?:\.\d+)?){_SEP}
        (?P<winners>\d+)\s*\|?\s*$
    """,
    re.VERBOSE,
)


@dataclass
class LottoDrawImportRow:
    draw_date: dt.date
    numbers: list[int]
    jackpot_prize: float
    winners: int


def parse_lotto_draw_text(text: str) -> tuple[list[LottoDrawImportRow], list[str]]:
    """Parse every row of the pasted/uploaded text. Returns ``(rows, errors)``
    — ``errors`` names the 1-indexed source line for anything that didn't
    parse or failed validation (e.g. non-unique numbers), so the caller can
    surface exactly what to fix without losing the rows that were fine."""
    rows: list[LottoDrawImportRow] = []
    errors: list[str] = []
    for lineno, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("+") or set(line) <= {"-", "|", " "}:
            continue  # blank line or an ASCII-table border/rule
        m = _ROW_RE.match(line)
        if not m:
            errors.append(f"Line {lineno}: could not parse row: {raw_line!r}")
            continue
        try:
            numbers = LottoNumbers(
                numbers=[int(n) for n in m.group("numbers").split("-")]
            ).numbers
            draw_date = dt.datetime.strptime(m.group("date"), "%m/%d/%Y").date()
            jackpot_prize = float(m.group("jackpot").replace(",", ""))
            winners = int(m.group("winners"))
        except (ValueError, ValidationError) as exc:
            errors.append(f"Line {lineno}: {exc}")
            continue
        rows.append(
            LottoDrawImportRow(
                draw_date=draw_date,
                numbers=numbers,
                jackpot_prize=jackpot_prize,
                winners=winners,
            )
        )
    return rows, errors


def import_rows_to_bulk_params(rows: list[LottoDrawImportRow]) -> list[dict[str, Any]]:
    """Shape parsed rows for ``db.upsert_lotto_draws_bulk``."""
    return [
        {
            "draw_date": r.draw_date.isoformat(),
            "numbers": r.numbers,
            "jackpot_prize": r.jackpot_prize,
            "winners": r.winners,
        }
        for r in rows
    ]
