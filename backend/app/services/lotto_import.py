from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from app.schemas.lotto import LottoNumbers

_SEP = r"(?:\s*\|\s*|\s+)"

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
    rows: list[LottoDrawImportRow] = []
    errors: list[str] = []
    for lineno, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("+") or set(line) <= {"-", "|", " "}:
            continue
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
    return [
        {
            "draw_date": r.draw_date.isoformat(),
            "numbers": r.numbers,
            "jackpot_prize": r.jackpot_prize,
            "winners": r.winners,
        }
        for r in rows
    ]
