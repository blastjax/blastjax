# Node be:lotto-scraper: lotto-scraper.py
Kind: module
Language: python, 406 lines of code, location: lotto-scraper.py

Source excerpt: lotto-scraper.py (first 150 lines)
```
   1  #!/usr/bin/env python3
   2  from __future__ import annotations
   3  
   4  import argparse
   5  import csv
   6  import logging
   7  import re
   8  import sqlite3
   9  import sys
  10  import time
  11  from contextlib import closing
  12  from dataclasses import dataclass, field
  13  from datetime import date, datetime, timedelta, timezone
  14  from pathlib import Path
  15  from urllib.parse import urljoin, urlparse
  16  
  17  from bs4 import BeautifulSoup
  18  from curl_cffi import requests
  19  
  20  DEFAULT_URL = "https://www.pcso.gov.ph/SearchLottoResult.aspx"
  21  PH_TIME = timezone(timedelta(hours=8))
  22  RETRIES = 3
  23  MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  24            "August", "September", "October", "November", "December"]
  25  DATE_ROLES = ("start_month", "start_day", "start_year", "end_month", "end_day", "end_year")
  26  PAGER_LINK = re.compile(r"__doPostBack\('([^']+)','(Page\$[^']+)'\)")
  27  MAX_PAGES = 500
  28  
  29  log = logging.getLogger("pcso")
  30  
  31  
  32  class ScrapeError(RuntimeError):
  33      pass
  34  @dataclass
  35  class Draw:
  36      game: str
  37      combination: str
  38      draw_date: str
  39      jackpot: float | None
  40      winners: int | None
  41  
  42      @property
  43      def key(self) -> tuple[str, str, str]:
  44          return self.game, self.draw_date, self.combination
  45  
  46  
  47  @dataclass
  48  class Form:
  49      action: str
  50      fields: dict[str, str]
  51      selects: dict[str, list[tuple[str, str]]]
  52      submit: tuple[str, str] | None
  53      roles: dict[str, str] = field(default_factory=dict)
  54  
  55  
  56  
  57  def parse_form(html: str, page_url: str) -> Form:
  58      soup = BeautifulSoup(html, "html.parser")
  59      viewstate = soup.find("input", attrs={"name": "__VIEWSTATE"})
  60      if viewstate is None:
  61          raise ScrapeError("No ASP.NET form on the page (no __VIEWSTATE). The site may be showing a "
  62                            "block or maintenance page, or it was redesigned; rerun with --dump-html to check.")
  63      form = viewstate.find_parent("form") or soup
  64  
  65      fields: dict[str, str] = {}
  66      buttons: list[tuple[str, str]] = []
  67      for inp in form.find_all("input"):
  68          name, kind = inp.get("name"), (inp.get("type") or "text").lower()
  69          if not name or kind in ("button", "image", "file", "reset"):
  70              continue
  71          if kind == "submit":
  72              buttons.append((name, inp.get("value", "")))
  73          elif kind in ("checkbox", "radio"):
  74              if inp.has_attr("checked"):
  75                  fields[name] = inp.get("value", "on")
  76          else:
  77              fields[name] = inp.get("value", "")
  78  
  79      selects: dict[str, list[tuple[str, str]]] = {}
  80      for sel in form.find_all("select"):
  81          name = sel.get("name")
  82          if not name:
  83              continue
  84          selects[name] = [(o.get("value", o.get_text(strip=True)), o.get_text(strip=True))
  85                           for o in sel.find_all("option")]
  86          chosen = sel.find("option", selected=True) or sel.find("option")
  87          if chosen is not None:
  88              fields[name] = chosen.get("value", chosen.get_text(strip=True))
  89  
  90      def button_score(button: tuple[str, str]) -> int:
  91          name, value = button[0].lower(), button[1].lower()
  92          return 4 * ("lotto" in value) + 2 * name.endswith("btnsearch") + ("search" in name)
  93  
  94      submit = max(buttons, key=button_score) if buttons else None
  95      return Form(urljoin(page_url, form.get("action") or page_url), fields, selects, submit)
  96  
  97  
  98  def classify_dropdowns(selects: dict[str, list[tuple[str, str]]]) -> dict[str, str]:
  99      roles: dict[str, str] = {}
 100      for name in selects:
 101          key = name.rsplit("$", 1)[-1].lower()
 102          if "game" in key:
 103              roles.setdefault("game", name)
 104              continue
 105          side = "start" if "start" in key else "end" if "end" in key else None
 106          part = ("month" if "month" in key else "year" if "year" in key
 107                  else "day" if ("day" in key or "date" in key) else None)
 108          if side and part:
 109              roles.setdefault(f"{side}_{part}", name)
 110      missing = [role for role in DATE_ROLES if role not in roles]
 111      if missing:
 112          raise ScrapeError(f"Couldn't find the {', '.join(missing)} dropdown(s). "
 113                            f"Dropdowns on the page: {', '.join(selects) or 'none'}")
 114      return roles
 115  
 116  
 117  def pick(options: list[tuple[str, str]], *wanted: str) -> str | None:
 118      wanted_lower = {w.lower() for w in wanted}
 119      for value, label in options:
 120          if value.strip().lower() in wanted_lower or label.strip().lower() in wanted_lower:
 121              return value
 122      return None
 123  
 124  
 125  def date_fields(form: Form, side: str, day: date) -> dict[str, str]:
 126      month = MONTHS[day.month - 1]
 127      candidates = {
 128          "month": (month, month[:3], str(day.month), f"{day.month:02d}"),
 129          "day": (str(day.day), f"{day.day:02d}"),
 130          "year": (str(day.year),),
 131      }
 132      chosen = {}
 133      for part, wanted in candidates.items():
 134          name = form.roles[f"{side}_{part}"]
 135          value = pick(form.selects[name], *wanted)
 136          if value is None:
 137              raise ScrapeError(f"Can't select {day}: the {side} {part} dropdown has no {wanted[0]!r} option.")
 138          chosen[name] = value
 139      return chosen
 140  
 141  
 142  def dropdown_years(form: Form) -> list[int]:
 143      years = {int(text) for option in form.selects[form.roles["start_year"]]
 144               for text in (s.strip() for s in option) if re.fullmatch(r"\d{4}", text)}
 145      return sorted(years)
 146  
 147  
 148  def _rows(table) -> list:
 149      rows = []
 150      for child in table.find_all(["thead", "tbody", "tfoot", "tr"], recursive=False):
```

## Outgoing connections
- call -> pcso.gov.ph (lotto results) (ext:pcso)

## Incoming connections
- none
