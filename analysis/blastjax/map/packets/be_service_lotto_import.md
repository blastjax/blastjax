# Node be:service:lotto_import: services/lotto_import.py
Kind: module
Language: python, 64 lines of code, location: backend/app/services/lotto_import.py

Source excerpt: backend/app/services/lotto_import.py (first 75 lines)
```
   1  from __future__ import annotations
   2  
   3  import datetime as dt
   4  import re
   5  from dataclasses import dataclass
   6  from typing import Any
   7  
   8  from pydantic import ValidationError
   9  
  10  from app.schemas.lotto import LottoNumbers
  11  
  12  _SEP = r"(?:\s*\|\s*|\s+)"
  13  
  14  _ROW_RE = re.compile(
  15      rf"""^\s*\|?\s*
  16          (?:[^\t|]+\t+)?
  17          (?P<numbers>[\d\-]+){_SEP}
  18          (?P<date>\d{{1,2}}/\d{{1,2}}/\d{{4}}){_SEP}
  19          (?P<jackpot>[\d,]+(?:\.\d+)?){_SEP}
  20          (?P<winners>\d+)\s*\|?\s*$
  21      """,
  22      re.VERBOSE,
  23  )
  24  
  25  
  26  @dataclass
  27  class LottoDrawImportRow:
  28      draw_date: dt.date
  29      numbers: list[int]
  30      jackpot_prize: float
  31      winners: int
  32  
  33  
  34  def parse_lotto_draw_text(text: str) -> tuple[list[LottoDrawImportRow], list[str]]:
  35      rows: list[LottoDrawImportRow] = []
  36      errors: list[str] = []
  37      for lineno, raw_line in enumerate(text.splitlines(), start=1):
  38          line = raw_line.strip()
  39          if not line or line.startswith("+") or set(line) <= {"-", "|", " "}:
  40              continue
  41          m = _ROW_RE.match(line)
  42          if not m:
  43              errors.append(f"Line {lineno}: could not parse row: {raw_line!r}")
  44              continue
  45          try:
  46              numbers = LottoNumbers(
  47                  numbers=[int(n) for n in m.group("numbers").split("-")]
  48              ).numbers
  49              draw_date = dt.datetime.strptime(m.group("date"), "%m/%d/%Y").date()
  50              jackpot_prize = float(m.group("jackpot").replace(",", ""))
  51              winners = int(m.group("winners"))
  52          except (ValueError, ValidationError) as exc:
  53              errors.append(f"Line {lineno}: {exc}")
  54              continue
  55          rows.append(
  56              LottoDrawImportRow(
  57                  draw_date=draw_date,
  58                  numbers=numbers,
  59                  jackpot_prize=jackpot_prize,
  60                  winners=winners,
  61              )
  62          )
  63      return rows, errors
  64  
  65  
  66  def import_rows_to_bulk_params(rows: list[LottoDrawImportRow]) -> list[dict[str, Any]]:
  67      return [
  68          {
  69              "draw_date": r.draw_date.isoformat(),
  70              "numbers": r.numbers,
  71              "jackpot_prize": r.jackpot_prize,
  72              "winners": r.winners,
  73          }
  74          for r in rows
  75      ]
```

## Outgoing connections
- call -> schemas/ (Pydantic) (be:schemas)

## Incoming connections
- routers/lotto.py (be:router:lotto) -> call
