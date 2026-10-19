"""Reads a bill's dates and amount out of a text PDF: pypdf plus label rules, no AI and no OCR.

Calibrate by adding a biller's wording to _LABELS (earlier labels win). Try it on real bills with

    python backend/app/services/bill_extract.py path/to/bill.pdf [--text]
"""

from __future__ import annotations

import datetime as dt
import io
import re
from collections.abc import Callable
from typing import Any

from pypdf import PdfReader

_PAGES = 3  # the summary is on the first page or two; later pages are mostly line items

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

_LABEL_RES = {field: [re.compile(rf"\b{label}\b", re.I) for label in labels] for field, labels in _LABELS.items()}
_ANY_LABEL = re.compile("|".join(rf"\b{label}\b" for labels in _LABELS.values() for label in labels), re.I)
# "Previous Due Date", "Minimum Amount Due": right words, wrong value.
_NOT_THIS_ONE = re.compile(r"\b(?:previous|prior|last|minimum|min\.?)\s*$", re.I)

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


class UnreadablePdf(Exception):
    pass


def extract_bill_fields(data: bytes) -> dict[str, Any]:
    return fields_from_text(pdf_text(data))


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


def fields_from_text(text: str) -> dict[str, Any]:
    lines = text.splitlines()
    bill_date = _find(lines, "bill_date", _DATE_RE, _date)
    due_date = _find(lines, "due_date", _DATE_RE, _date)
    period = _find(lines, "period", _RANGE_RE, _range)
    amount = _find(lines, "amount", _AMOUNT_RE, lambda v: float(v.group().replace(",", "")))
    return {
        "bill_date": bill_date.isoformat() if bill_date else None,
        "due_date": due_date.isoformat() if due_date else None,
        "period_start": period[0].isoformat() if period else None,
        "period_end": period[1].isoformat() if period else None,
        "amount": amount,
    }


def _find(lines: list[str], field: str, value_re: re.Pattern[str], parse: Callable[[re.Match[str]], Any]) -> Any:
    for label in _LABEL_RES[field]:
        hits = [
            (i, m)
            for i, line in enumerate(lines)
            for m in label.finditer(line)
            if not _NOT_THIS_ONE.search(line[: m.start()])
        ]
        # Best: the value follows the label on its own line, before any other label.
        for i, m in hits:
            stop = _ANY_LABEL.search(lines[i], m.end())
            for v in value_re.finditer(lines[i], m.end(), stop.start() if stop else len(lines[i])):
                if (value := parse(v)) is not None:
                    return value
        # Next best: the label heads a table column and the value sits under it.
        for i, m in hits:
            for below in [line for line in lines[i + 1 : i + 4] if line.strip()][:2]:
                found = [(v, value) for v in value_re.finditer(below) if (value := parse(v)) is not None]
                if found:
                    middle = (m.start() + m.end()) / 2
                    return min(found, key=lambda f: abs((f[0].start() + f[0].end()) / 2 - middle))[1]
    return None


def _date(v: re.Match[str]) -> dt.date | None:
    return _to_date(v.group())


def _range(v: re.Match[str]) -> tuple[dt.date, dt.date] | None:
    end = _to_date(v.group("end"))
    if end is None:
        return None
    start_text = v.group("start")
    start = _to_date(start_text) or _to_date(start_text, end.year)
    if start and start > end and _to_date(start_text) is None:  # no year of its own, and it crosses New Year
        start = _to_date(start_text, end.year - 1)
    return (start, end) if start and start <= end else None


def _to_date(text: str, year: int | None = None) -> dt.date | None:
    nums = [int(n) for n in re.findall(r"\d+", text)]
    name = re.search(r"[a-z]{3}", text.lower())
    if name and name.group() in _MONTHS:  # Oct 25, 2026 / 25 Oct 2026
        month, day, rest = _MONTHS.index(name.group()) + 1, nums[0], nums[1:]
    elif nums[0] > 31:  # 2026-10-25
        year, month, day, rest = nums[0], nums[1], nums[2], []
    else:  # 10/25/2026, or 25/10/2026 when the first number can't be a month
        month, day = (nums[0], nums[1]) if nums[0] <= 12 else (nums[1], nums[0])
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
