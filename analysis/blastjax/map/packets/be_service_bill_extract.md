# Node be:service:bill_extract: services/bill_extract.py
Kind: module
Language: python, 425 lines of code, location: backend/app/services/bill_extract.py

Source excerpt: backend/app/services/bill_extract.py (first 150 lines)
```
   1  """Reads a bill's dates and amount out of a text PDF (pypdf) or a photo of one (Tesseract OCR), no AI.
   2  
   3  Billers this knows (UnionBank, Meralco, Globe, The Beacon) are read by their own layout: biller_fields().
   4  Anyone else gets the generic rules, which cover the usual wording, plus what learn() takes from the biller's
   5  saved bills: the labels next to the values that were saved, how many days its due date and billing period sit
   6  from its bill date, and whether it writes dates day-first. Try it on a PDF or photo with
   7  
   8      python backend/app/services/bill_extract.py path/to/bill.pdf [--text]
   9  """
  10  
  11  from __future__ import annotations
  12  
  13  import calendar
  14  import datetime as dt
  15  import io
  16  import re
  17  import shutil
  18  import statistics
  19  import subprocess
  20  from collections import Counter
  21  from collections.abc import Callable
  22  from dataclasses import dataclass, field
  23  from typing import Any
  24  
  25  from PIL import Image, ImageOps
  26  from pypdf import PdfReader
  27  
  28  try:
  29      from pypdf._codecs import adobe_glyphs
  30  except ImportError:  # moved in a later pypdf: such PDFs then read with scrambled digits again
  31      adobe_glyphs = {}
  32  # Some PDFs (Meralco's, some months) name digit glyphs "/0".."/9" and punctuation by hex code ("/2e" is "."),
  33  # which pypdf would otherwise print as-is.
  34  for _code in range(0x20, 0x7F):
  35      adobe_glyphs.setdefault(f"/{_code:02x}", chr(_code))
  36      adobe_glyphs.setdefault(f"/{_code:02X}", chr(_code))
  37  for _digit in "0123456789":
  38      adobe_glyphs.setdefault(f"/{_digit}", _digit)
  39  
  40  _PAGES = 3  # the summary is on the first page or two; later pages are mostly line items
  41  _CLOSE = 3  # days: how near a printed date must be to where a biller's usual gap puts it
  42  _WAY_OFF = 7  # days: a date this far from where the usual gap puts it was picked from the wrong place
  43  _OCR_WIDTH = 2400  # px: narrower photos are scaled up to this first, or Tesseract reads 6 as 8 in small print
  44  _CYCLE = 45  # days: a statement that prints no period starts the day after a previous one at most this far back
  45  
  46  _LABELS: dict[str, list[str]] = {
  47      "bill_date": [
  48          r"statement\s+date",
  49          r"bill(?:ing)?\s+date",
  50          r"date\s+(?:of\s+bill|issued)",
  51          r"(?:invoice|issue)\s+date",
  52          r"issued\s+on",
  53      ],
  54      "due_date": [
  55          r"(?:payment\s+)?due\s+date",
  56          r"pay(?:ment)?\s+(?:on\s+or\s+)?before",
  57          r"due\s+on",
  58          r"pay\s+by",
  59      ],
  60      "period": [
  61          r"billing\s+(?:period|cycle)",
  62          r"(?:statement|service|coverage)\s+period",
  63          r"period\s+(?:covered|from)",
  64          r"for\s+the\s+period",
  65      ],
  66      "amount": [
  67          r"total\s+amount\s+due",
  68          r"total\s+amount\s+payable",
  69          r"amount\s+(?:due|payable|to\s+pay)",
  70          r"total\s+due",
  71          r"new\s+balance",
  72      ],
  73  }
  74  
  75  # Each label says where its value sits: "after" it on the same line, "below" it in a table column, or "any".
  76  _GENERIC = {f: [(re.compile(rf"\b{label}\b", re.I), "any") for label in labels] for f, labels in _LABELS.items()}
  77  _ANY_LABEL = re.compile("|".join(rf"\b{label}\b" for labels in _LABELS.values() for label in labels), re.I)
  78  # "Previous Due Date", "Minimum Amount Due": right words, wrong value.
  79  _NOT_THIS_ONE = re.compile(r"\b(?:previous|prior|last|minimum|min\.?)\s*$", re.I)
  80  # An account number or another date between a label and a value: the value belongs to another column.
  81  _OTHER_COLUMN = re.compile(r"\d{4,}")
  82  _CURRENCY = {"php", "p", "peso", "pesos"}
  83  
  84  _MONTH = (
  85      r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?"
  86      r"|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?"
  87  )
  88  _DAY = r"\d{1,2}(?:st|nd|rd|th)?"
  89  _YEAR = r"(?:\d{4}|'?\d{2})"
  90  _WITH_YEAR = [
  91      rf"\b{_MONTH}[\s-]*{_DAY}(?:,\s*|[\s-]+){_YEAR}\b",  # Oct 25, 2026
  92      rf"\b{_DAY}[\s-]*{_MONTH}(?:,\s*|[\s-]+){_YEAR}\b",  # 25 Oct 2026, 25-Oct-26
  93      r"\b\d{4}-\d{1,2}-\d{1,2}\b",  # 2026-10-25
  94      r"\b\d{1,2}/\d{1,2}/(?:\d{4}|\d{2})\b",  # 10/25/2026
  95      r"\b\d{1,2}-\d{1,2}-(?:\d{4}|\d{2})\b",  # 10-25-2026
  96  ]
  97  _NO_YEAR = [rf"\b{_MONTH}[\s-]*{_DAY}\b", rf"\b{_DAY}[\s-]*{_MONTH}", r"\b\d{1,2}/\d{1,2}\b"]
  98  _FULL_DATE = "(?:" + "|".join(_WITH_YEAR) + ")"
  99  _ANY_DATE = "(?:" + "|".join(_WITH_YEAR + _NO_YEAR) + ")"
 100  _DATE_RE = re.compile(_FULL_DATE, re.I)
 101  # A period's start often leaves out the year: "Sep 1 - Sep 30, 2026".
 102  _RANGE_RE = re.compile(
 103      rf"(?P<start>{_ANY_DATE})\s*(?:-|–|—|\bto\b|\bthru\b|\bthrough\b|\buntil\b)\s*(?P<end>{_FULL_DATE})", re.I
 104  )
 105  _AMOUNT_RE = re.compile(r"(?<![\d.,])(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}(?!\d|\.\d)")
 106  _MONTHS = ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
 107  _GAP_FIELDS = ("due_date", "period_start", "period_end")
 108  
 109  
 110  class UnreadablePdf(Exception):
 111      pass
 112  
 113  
 114  @dataclass
 115  class Hints:
 116      """What one biller's saved bills taught: labels to try first, days from the bill date, date order."""
 117  
 118      labels: dict[str, list[tuple[re.Pattern[str], str]]] = field(default_factory=dict)
 119      gaps: dict[str, int] = field(default_factory=dict)
 120      day_first: bool = False
 121  
 122  
 123  def pdf_text(data: bytes) -> str:
 124      try:
 125          reader = PdfReader(io.BytesIO(data))
 126          if reader.is_encrypted and not _opens_without_password(reader):
 127              raise UnreadablePdf("This PDF is password-protected, so nothing could be read from it.")
 128          text = "\n".join(_page_text(page) for page in reader.pages[:_PAGES])
 129      except UnreadablePdf:
 130          raise
 131      except Exception as exc:
 132          raise UnreadablePdf("Couldn't read this PDF.") from exc
 133      if not text.strip():
 134          raise UnreadablePdf("This PDF has no text in it (it may be a scan), so nothing could be read.")
 135      return text
 136  
 137  
 138  def image_text(data: bytes) -> str:
 139      """The text of a PNG or JPEG of a bill, by Tesseract on a grayscale copy scaled up so small print reads."""
 140      if shutil.which("tesseract") is None:
 141          raise UnreadablePdf("Reading photos needs Tesseract OCR, which isn't installed on this server.")
 142      try:
 143          img = ImageOps.grayscale(ImageOps.exif_transpose(Image.open(io.BytesIO(data))))
 144          if img.width < _OCR_WIDTH:
 145              img = img.resize((_OCR_WIDTH, round(img.height * _OCR_WIDTH / img.width)), Image.Resampling.LANCZOS)
 146          png = io.BytesIO()
 147          img.save(png, "PNG")
 148          # --psm 6: one block of text, which keeps a label and its value on one line.
 149          run = subprocess.run(
 150              ["tesseract", "-", "-", "--psm", "6"], input=png.getvalue(), capture_output=True, check=True, timeout=60
```

## Outgoing connections
- none

## Incoming connections
- test_core.py (be:core:test_core) -> call
- routers/bill.py (be:router:bill) -> call
- routers/payslip.py (be:router:payslip) -> call
- scripts/ (migrations) (be:scripts) -> call
