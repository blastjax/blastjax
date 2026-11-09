# Node be:schemas: schemas/ (Pydantic)
Kind: module
Language: python, 722 lines of code, location: backend/app/schemas

Files in this directory (largest first):
- backend/app/schemas/travel.py
- backend/app/schemas/company.py
- backend/app/schemas/bill.py
- backend/app/schemas/lotto.py
- backend/app/schemas/mosaic.py
- backend/app/schemas/mambo.py
- backend/app/schemas/blood_pressure.py
- backend/app/schemas/monthly_expense.py
- backend/app/schemas/user.py
- backend/app/schemas/payslip.py
- backend/app/schemas/installment.py
- backend/app/schemas/credit_card.py
- backend/app/schemas/payslip_default.py
- backend/app/schemas/fixed_expense.py
- backend/app/schemas/auth.py
- backend/app/schemas/house_payment.py
- backend/app/schemas/calendar_day_override.py
- backend/app/schemas/pay_period_start_override.py
- backend/app/schemas/__init__.py

Source excerpt: backend/app/schemas/travel.py (first 150 lines)
```
   1  from __future__ import annotations
   2  
   3  import datetime as dt
   4  from typing import Literal
   5  
   6  from pydantic import BaseModel, Field, field_validator, model_validator
   7  
   8  
   9  def _clean_optional(v: str | None) -> str | None:
  10      if v is None:
  11          return None
  12      trimmed = v.strip()
  13      return trimmed or None
  14  
  15  
  16  def _blank_time_to_none(v: object) -> object:
  17      if isinstance(v, str):
  18          return v.strip() or None
  19      return v
  20  
  21  
  22  def _require_text(v: str, label: str) -> str:
  23      trimmed = v.strip()
  24      if not trimmed:
  25          raise ValueError(f"{label} is required.")
  26      return trimmed
  27  
  28  
  29  class TravelTripCreate(BaseModel):
  30      title: str = Field(min_length=1)
  31      start_date: dt.date
  32      end_date: dt.date
  33      notes: str | None = None
  34  
  35      @field_validator("title")
  36      @classmethod
  37      def _title(cls, v: str) -> str:
  38          return _require_text(v, "Title")
  39  
  40      @field_validator("notes")
  41      @classmethod
  42      def _notes(cls, v: str | None) -> str | None:
  43          return _clean_optional(v)
  44  
  45      @model_validator(mode="after")
  46      def _end_after_start(self) -> "TravelTripCreate":
  47          if self.end_date < self.start_date:
  48              raise ValueError("End date must be on or after the start date.")
  49          return self
  50  
  51  
  52  class TravelCityCreate(BaseModel):
  53      name: str = Field(min_length=1)
  54      start_date: dt.date | None = None
  55      end_date: dt.date | None = None
  56  
  57      @field_validator("name")
  58      @classmethod
  59      def _name(cls, v: str) -> str:
  60          return _require_text(v, "Name")
  61  
  62      @model_validator(mode="after")
  63      def _end_after_start(self) -> "TravelCityCreate":
  64          if self.start_date is not None and self.end_date is not None and self.end_date < self.start_date:
  65              raise ValueError("End date must be on or after the start date.")
  66          return self
  67  
  68  
  69  class TravelFlightCreate(BaseModel):
  70      flight_number: str = Field(min_length=1)
  71      flight_date: dt.date | None = None
  72      arrival_date: dt.date | None = None
  73      departure_time: dt.time | None = None
  74      arrival_time: dt.time | None = None
  75      from_location: str | None = None
  76      from_map_url: str | None = None
  77      from_city: str | None = None
  78      from_country: str | None = None
  79      to_location: str | None = None
  80      to_map_url: str | None = None
  81      to_city: str | None = None
  82      to_country: str | None = None
  83      notes: str | None = None
  84      title: str | None = None
  85      airline: str | None = None
  86      seat: str | None = None
  87      terminal: str | None = None
  88      gate: str | None = None
  89      baggage: str | None = None
  90      confirmation: str | None = None
  91  
  92      @field_validator("flight_number")
  93      @classmethod
  94      def _flight_number(cls, v: str) -> str:
  95          return _require_text(v, "Flight number")
  96  
  97      @field_validator("departure_time", "arrival_time", mode="before")
  98      @classmethod
  99      def _blank_time(cls, v: object) -> object:
 100          return _blank_time_to_none(v)
 101  
 102      @field_validator(
 103          "from_location",
 104          "from_map_url",
 105          "from_city",
 106          "from_country",
 107          "to_location",
 108          "to_map_url",
 109          "to_city",
 110          "to_country",
 111          "notes",
 112          "title",
 113          "airline",
 114          "seat",
 115          "terminal",
 116          "gate",
 117          "baggage",
 118          "confirmation",
 119      )
 120      @classmethod
 121      def _optional(cls, v: str | None) -> str | None:
 122          return _clean_optional(v)
 123  
 124      @model_validator(mode="after")
 125      def _arrival_after_departure(self) -> "TravelFlightCreate":
 126          if self.flight_date is not None and self.arrival_date is not None and self.arrival_date < self.flight_date:
 127              raise ValueError("Arrival date must be on or after the flight date.")
 128          return self
 129  
 130  
 131  class TravelTransportCreate(BaseModel):
 132      mode: Literal["bus", "train", "ferry"]
 133      number: str | None = None
 134      travel_date: dt.date | None = None
 135      arrival_date: dt.date | None = None
 136      departure_time: dt.time | None = None
 137      arrival_time: dt.time | None = None
 138      from_location: str | None = None
 139      from_map_url: str | None = None
 140      from_city: str | None = None
 141      from_country: str | None = None
 142      to_location: str | None = None
 143      to_map_url: str | None = None
 144      to_city: str | None = None
 145      to_country: str | None = None
 146      notes: str | None = None
 147      title: str | None = None
 148      operator: str | None = None
 149      seat: str | None = None
 150      travel_class: str | None = None
```

## Outgoing connections
- call -> Google Maps (link resolve) (ext:google-maps)
- call -> Nominatim (reverse geocode) (ext:nominatim)

## Incoming connections
- test_core.py (be:core:test_core) -> call
- routers/auth.py (be:router:auth) -> call
- routers/bill.py (be:router:bill) -> call
- routers/blood_pressure.py (be:router:blood_pressure) -> call
- routers/calendar_day_override.py (be:router:calendar_day_override) -> call
- routers/company.py (be:router:company) -> call
- routers/credit_card.py (be:router:credit_card) -> call
- routers/fixed_expense.py (be:router:fixed_expense) -> call
- routers/house_payment.py (be:router:house_payment) -> call
- routers/installment.py (be:router:installment) -> call
- routers/lotto.py (be:router:lotto) -> call
- routers/mambo.py (be:router:mambo) -> call
- routers/monthly_expense.py (be:router:monthly_expense) -> call
- routers/mosaic.py (be:router:mosaic) -> call
- routers/pay_period_start_override.py (be:router:pay_period_start_override) -> call
- routers/payslip.py (be:router:payslip) -> call
- routers/payslip_default.py (be:router:payslip_default) -> call
- routers/travel.py (be:router:travel) -> call
- routers/user.py (be:router:user) -> call
- services/lotto_import.py (be:service:lotto_import) -> call
- services/pcso_results.py (be:service:pcso_results) -> call
