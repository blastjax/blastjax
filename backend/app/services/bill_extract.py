"""Reads a bill's dates and amount out of a text PDF: pypdf plus label rules, no AI and no OCR.

Generic rules cover the usual wording. learn() adds what a biller's saved bills teach: the labels next to the
values that were saved, how many days its due date and billing period sit from its bill date, and whether it
writes dates day-first. Try the generic rules on a PDF with

    python backend/app/services/bill_extract.py path/to/bill.pdf [--text]
"""

from __future__ import annotations

import datetime as dt
import io
import re
import statistics
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from pypdf import PdfReader

try:
    from pypdf._codecs import adobe_glyphs
except ImportError:  # moved in a later pypdf: such PDFs then read with scrambled digits again
    adobe_glyphs = {}
# Some PDFs (Meralco's, some months) name digit glyphs "/0".."/9" and punctuation by hex code ("/2e" is "."),
# which pypdf would otherwise print as-is.
for _code in range(0x20, 0x7F):
    adobe_glyphs.setdefault(f"/{_code:02x}", chr(_code))
    adobe_glyphs.setdefault(f"/{_code:02X}", chr(_code))
for _digit in "0123456789":
    adobe_glyphs.setdefault(f"/{_digit}", _digit)

_PAGES = 3  # the summary is on the first page or two; later pages are mostly line items
_CLOSE = 3  # days: how near a printed date must be to where a biller's usual gap puts it
_WAY_OFF = 7  # days: a date this far from where the usual gap puts it was picked from the wrong place

_LABELS: dict[str, list[str]] = {
    "bill_date": [
        r"statement\s+date",
        r"bill(?:ing)?\s+date",
        r"date\s+(?:of\s+bill|issued)",
        r"(?:invoice|issue)\s+date",
        r"issued\s+on",
    ],
    "due_date": [
        r"(?:payment\s+)?due\s+date",
        r"pay(?:ment)?\s+(?:on\s+or\s+)?before",
        r"due\s+on",
        r"pay\s+by",
    ],
    "period": [
        r"billing\s+(?:period|cycle)",
        r"(?:statement|service|coverage)\s+period",
        r"period\s+(?:covered|from)",
        r"for\s+the\s+period",
    ],
    "amount": [
        r"total\s+amount\s+due",
        r"total\s+amount\s+payable",
        r"amount\s+(?:due|payable|to\s+pay)",
        r"total\s+due",
        r"new\s+balance",
    ],
}

# Each label says where its value sits: "after" it on the same line, "below" it in a table column, or "any".
_GENERIC = {f: [(re.compile(rf"\b{label}\b", re.I), "any") for label in labels] for f, labels in _LABELS.items()}
_ANY_LABEL = re.compile("|".join(rf"\b{label}\b" for labels in _LABELS.values() for label in labels), re.I)
# "Previous Due Date", "Minimum Amount Due": right words, wrong value.
_NOT_THIS_ONE = re.compile(r"\b(?:previous|prior|last|minimum|min\.?)\s*$", re.I)
# An account number or another date between a label and a value: the value belongs to another column.
_OTHER_COLUMN = re.compile(r"\d{4,}")
_CURRENCY = {"php", "p", "peso", "pesos"}

_MONTH = (
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?"
    r"|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?"
)
_DAY = r"\d{1,2}(?:st|nd|rd|th)?"
_YEAR = r"(?:\d{4}|'?\d{2})"
_WITH_YEAR = [
    rf"\b{_MONTH}[\s-]*{_DAY}(?:,\s*|[\s-]+){_YEAR}\b",  # Oct 25, 2026
    rf"\b{_DAY}[\s-]*{_MONTH}(?:,\s*|[\s-]+){_YEAR}\b",  # 25 Oct 2026, 25-Oct-26
    r"\b\d{4}-\d{1,2}-\d{1,2}\b",  # 2026-10-25
    r"\b\d{1,2}/\d{1,2}/(?:\d{4}|\d{2})\b",  # 10/25/2026
    r"\b\d{1,2}-\d{1,2}-(?:\d{4}|\d{2})\b",  # 10-25-2026
]
_NO_YEAR = [rf"\b{_MONTH}[\s-]*{_DAY}\b", rf"\b{_DAY}[\s-]*{_MONTH}", r"\b\d{1,2}/\d{1,2}\b"]
_FULL_DATE = "(?:" + "|".join(_WITH_YEAR) + ")"
_ANY_DATE = "(?:" + "|".join(_WITH_YEAR + _NO_YEAR) + ")"
_DATE_RE = re.compile(_FULL_DATE, re.I)
# A period's start often leaves out the year: "Sep 1 - Sep 30, 2026".
_RANGE_RE = re.compile(
    rf"(?P<start>{_ANY_DATE})\s*(?:-|–|—|\bto\b|\bthru\b|\bthrough\b|\buntil\b)\s*(?P<end>{_FULL_DATE})", re.I
)
_AMOUNT_RE = re.compile(r"(?<![\d.,])(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}(?!\d|\.\d)")
_MONTHS = ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
_GAP_FIELDS = ("due_date", "period_start", "period_end")


class UnreadablePdf(Exception):
    pass


@dataclass
class Hints:
    """What one biller's saved bills taught: labels to try first, days from the bill date, date order."""

    labels: dict[str, list[tuple[re.Pattern[str], str]]] = field(default_factory=dict)
    gaps: dict[str, int] = field(default_factory=dict)
    day_first: bool = False


def pdf_text(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not _opens_without_password(reader):
            raise UnreadablePdf("This PDF is password-protected, so nothing could be read from it.")
        text = "\n".join(_page_text(page) for page in reader.pages[:_PAGES])
    except UnreadablePdf:
        raise
    except Exception as exc:
        raise UnreadablePdf("Couldn't read this PDF.") from exc
    if not text.strip():
        raise UnreadablePdf("This PDF has no text in it (it may be a scan), so nothing could be read.")
    return text


def _opens_without_password(reader: PdfReader) -> bool:
    try:
        return bool(reader.decrypt(""))
    except Exception:  # e.g. AES without the optional cryptography package
        return False


def _page_text(page: Any) -> str:
    try:
        # Layout mode keeps a label and its value on one line, and table columns lined up.
        return page.extract_text(extraction_mode="layout", layout_mode_space_vertically=False)
    except Exception:
        return page.extract_text()


def fields_from_text(text: str, hints: Hints | None = None) -> dict[str, Any]:
    hints = hints or Hints()
    lines = text.splitlines()

    def labels(f: str) -> list[tuple[re.Pattern[str], str]]:
        return hints.labels.get(f, []) + _GENERIC[f]

    def date(v: re.Match[str]) -> dt.date | None:
        return _to_date(v.group(), day_first=hints.day_first)

    period = _find(lines, labels("period"), _RANGE_RE, lambda v: _range(v, hints.day_first))
    found = {
        "bill_date": _find(lines, labels("bill_date"), _DATE_RE, date),
        "due_date": _find(lines, labels("due_date"), _DATE_RE, date),
        "period_start": period[0] if period else None,
        "period_end": period[1] if period else None,
    }
    if hints.gaps:
        _settle(found, lines, hints)
    return {
        **{f: d.isoformat() if d else None for f, d in found.items()},
        "amount": _find(lines, labels("amount"), _AMOUNT_RE, _amount),
    }


def learn(examples: list[tuple[str, dict[str, Any]]]) -> Hints:
    """Learns a biller's layout from its saved bills, each given as (PDF text, the values saved for it).

    Labels are only learned for values the generic rules got wrong: a label that merely sat next to the right
    value (say "Charges for this billing period" while nothing was left unpaid) shouldn't overrule rules that
    work. Gaps and date order are learned from every bill."""
    seen: dict[str, Counter[tuple[str, str]]] = {f: Counter() for f in _LABELS}
    gaps: dict[str, list[int]] = {f: [] for f in _GAP_FIELDS}
    order: Counter[bool] = Counter()  # day-first or not, from numeric dates that read both ways
    for text, saved in examples:
        bill = dt.date.fromisoformat(saved["bill_date"])
        for f in _GAP_FIELDS:
            gaps[f].append((dt.date.fromisoformat(saved[f]) - bill).days)
        want = {
            "bill_date": bill,
            "due_date": dt.date.fromisoformat(saved["due_date"]),
            "period": (dt.date.fromisoformat(saved["period_start"]), dt.date.fromisoformat(saved["period_end"])),
            "amount": saved["amount"],
        }
        generic = fields_from_text(text)
        missed = {
            "bill_date": generic["bill_date"] != saved["bill_date"],
            "due_date": generic["due_date"] != saved["due_date"],
            "period": (generic["period_start"], generic["period_end"]) != (saved["period_start"], saved["period_end"]),
            "amount": generic["amount"] != saved["amount"],
        }
        lines = text.splitlines()
        for i, line in enumerate(lines):
            periods = [(r.start(), r.end()) for r in _RANGE_RE.finditer(line)]
            for f, value_re in (("bill_date", _DATE_RE), ("due_date", _DATE_RE), ("period", _RANGE_RE), ("amount", _AMOUNT_RE)):
                for v in value_re.finditer(line):
                    if f.endswith("_date") and any(s <= v.start() and v.end() <= e for s, e in periods):
                        continue  # a date inside a period belongs to the period
                    readings = _readings(f, v)
                    matches = [first for first, value in readings.items() if value == want[f]]
                    if not matches:
                        continue
                    if len(set(readings.values())) > 1:
                        order.update(matches)
                    if missed[f] and (label := _label_at(lines, i, v)):
                        seen[f][label] += 1
    return Hints(
        labels={
            f: [(_label_re(phrase), where) for (phrase, where), _ in counts.most_common(4)]
            for f, counts in seen.items()
        },
        gaps={f: statistics.median_low(days) for f, days in gaps.items() if days},
        day_first=order[True] > order[False],
    )


def _readings(f: str, v: re.Match[str]) -> dict[bool, Any]:
    """The value a match reads as, read month-first (False) and day-first (True)."""
    if f == "amount":
        return {False: _amount(v)}
    if f == "period":
        return {first: _range(v, first) for first in (False, True)}
    return {first: _to_date(v.group(), day_first=first) for first in (False, True)}


def _label_at(lines: list[str], i: int, v: re.Match[str]) -> tuple[str, str] | None:
    """The words a value follows on its line, or else the column heading just above it."""
    before = [text for _, _, text in _chunks(lines[i][: v.start()]) if re.search(r"\d", text) or _phrase(text)]
    if before and not re.search(r"\d", before[-1]):
        return _phrase(before[-1]), "after"  # type: ignore[return-value]
    for above in reversed([line for line in lines[max(0, i - 3) : i] if line.strip()][-2:]):
        over = [
            (min(v.end(), end) - max(v.start(), start), text)
            for start, end, text in _chunks(above)
            if min(v.end(), end) > max(v.start(), start)
        ]
        if over:
            text = max(over)[1]
            phrase = None if re.search(r"\d", text) else _phrase(text)
            return (phrase, "below") if phrase else None
    return None


def _chunks(line: str) -> list[tuple[int, int, str]]:
    """A layout line's cells: text runs split where 3+ spaces separate columns."""
    return [(m.start(), m.end(), m.group()) for m in re.finditer(r"\S+(?:\s{1,2}\S+)*", line)]


def _phrase(text: str) -> str | None:
    words = re.sub(r"[^a-z]+", " ", text.lower()).split()
    while words and words[-1] in _CURRENCY:
        words.pop()
    return " ".join(words) if words and len(words) <= 6 and len("".join(words)) >= 3 else None


def _label_re(phrase: str) -> re.Pattern[str]:
    return re.compile(r"\b" + r"\s+".join(map(re.escape, phrase.split())) + r"\b", re.I)


def _find(
    lines: list[str],
    labels: list[tuple[re.Pattern[str], str]],
    value_re: re.Pattern[str],
    parse: Callable[[re.Match[str]], Any],
) -> Any:
    for label, where in labels:
        hits = [
            (i, m)
            for i, line in enumerate(lines)
            for m in label.finditer(line)
            if not _NOT_THIS_ONE.search(line[: m.start()])
        ]
        if where != "below":  # the value follows the label on its own line, before any other label
            for i, m in hits:
                line = lines[i]
                stop = _ANY_LABEL.search(line, m.end())
                for v in value_re.finditer(line, m.end(), stop.start() if stop else len(line)):
                    if _OTHER_COLUMN.search(line, m.end(), v.start()):
                        break
                    if (value := parse(v)) is not None:
                        return value
        if where != "after":  # the label heads a table column and the value sits under it
            for i, m in hits:
                for below in [line for line in lines[i + 1 : i + 4] if line.strip()][:2]:
                    found = [(v, value) for v in value_re.finditer(below) if (value := parse(v)) is not None]
                    if found:
                        middle = (m.start() + m.end()) / 2
                        return min(found, key=lambda f: abs((f[0].start() + f[0].end()) / 2 - middle))[1]
    return None


def _settle(found: dict[str, dt.date | None], lines: list[str], hints: Hints) -> None:
    """Checks the dates against each other using the biller's usual gaps. A date that's missing, or far from
    where the gaps put it, becomes the date printed nearest that spot (never one that isn't in the PDF)."""
    gaps = {"bill_date": 0, **hints.gaps}
    implied = [day - dt.timedelta(days=gaps[f]) for f, day in found.items() if day and f in gaps]
    if not implied:
        return
    # Each date implies a bill date through its usual gap; go with the one most of them agree on.
    bill = max(implied, key=lambda a: sum(abs((b - a).days) <= _CLOSE for b in implied))
    printed = [day for line in lines for m in _DATE_RE.finditer(line) if (day := _to_date(m.group(), day_first=hints.day_first))]
    for f, gap in gaps.items():
        spot = bill + dt.timedelta(days=gap)
        if found[f] is not None and abs((found[f] - spot).days) <= _WAY_OFF:
            continue
        near = [day for day in printed if abs((day - spot).days) <= _CLOSE]
        if near:
            found[f] = min(near, key=lambda day: abs((day - spot).days))


def _amount(v: re.Match[str]) -> float:
    return float(v.group().replace(",", ""))


def _range(v: re.Match[str], day_first: bool = False) -> tuple[dt.date, dt.date] | None:
    end = _to_date(v.group("end"), day_first=day_first)
    if end is None:
        return None
    start_text = v.group("start")
    start = _to_date(start_text, day_first=day_first) or _to_date(start_text, end.year, day_first)
    if start and start > end and _to_date(start_text, day_first=day_first) is None:
        start = _to_date(start_text, end.year - 1, day_first)  # no year of its own, and it crosses New Year
    return (start, end) if start and start <= end else None


def _to_date(text: str, year: int | None = None, day_first: bool = False) -> dt.date | None:
    nums = [int(n) for n in re.findall(r"\d+", text)]
    name = re.search(r"[a-z]{3}", text.lower())
    if name and name.group() in _MONTHS:  # Oct 25, 2026 / 25 Oct 2026
        month, day, rest = _MONTHS.index(name.group()) + 1, nums[0], nums[1:]
    elif nums[0] > 31:  # 2026-10-25
        year, month, day, rest = nums[0], nums[1], nums[2], []
    else:  # 10/25/2026, or day-first when the first number can't be a month or the biller writes it that way
        if nums[0] > 12 or (day_first and nums[1] <= 12):
            day, month = nums[0], nums[1]
        else:
            month, day = nums[0], nums[1]
        rest = nums[2:]
    if rest:
        year = rest[0] + (2000 if rest[0] < 100 else 0)
    if year is None or not 2000 <= year <= 2100:
        return None
    try:
        return dt.date(year, month, day)
    except ValueError:
        return None


if __name__ == "__main__":
    import sys
    from pathlib import Path

    for path in [arg for arg in sys.argv[1:] if arg != "--text"]:
        print(f"== {path}")
        try:
            text = pdf_text(Path(path).read_bytes())
        except UnreadablePdf as exc:
            print(f"   {exc}")
            continue
        for key, value in fields_from_text(text).items():
            print(f"   {key:<13}{value}")
        if "--text" in sys.argv:
            print(text)
