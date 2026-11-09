# Node be:router:travel: routers/travel.py
Kind: module
Language: python, 209 lines of code, location: backend/app/routers/travel.py

Source excerpt: backend/app/routers/travel.py (first 150 lines)
```
   1  from __future__ import annotations
   2  
   3  import datetime as dt
   4  import html
   5  import json
   6  import re
   7  import urllib.error
   8  import urllib.request
   9  from typing import Any
  10  from urllib.parse import unquote_plus, urlparse
  11  from uuid import UUID
  12  
  13  from fastapi import APIRouter, Depends, HTTPException, Query
  14  from pydantic import BaseModel
  15  
  16  import cache
  17  from app.deps import require_db
  18  from app.schemas.travel import (
  19      TravelAccommodationCreate,
  20      TravelCityCreate,
  21      TravelFlightCreate,
  22      TravelItineraryCreate,
  23      TravelTransportCreate,
  24      TravelTripCreate,
  25  )
  26  from db import (
  27      delete_travel_child,
  28      delete_travel_trip,
  29      insert_travel_child,
  30      insert_travel_trip,
  31      list_travel_trips,
  32      update_travel_child,
  33      update_travel_trip,
  34  )
  35  
  36  router = APIRouter(tags=["travel"], dependencies=[Depends(require_db)])
  37  
  38  _ALLOWED_MAP_HOSTS = {"maps.app.goo.gl", "goo.gl", "google.com", "www.google.com", "maps.google.com"}
  39  
  40  
  41  _CITY_NOISE_SUFFIXES = (" City Municipality", " Municipality", " Metropolitan Area")
  42  
  43  
  44  def _clean_city(name: str) -> str:
  45      for suf in _CITY_NOISE_SUFFIXES:
  46          if name.endswith(suf) and len(name) > len(suf):
  47              return name[: -len(suf)].strip()
  48      return name
  49  
  50  
  51  def _reverse_geocode_city_country(lat: float, lon: float) -> tuple[str | None, str | None]:
  52      url = (
  53          "https://nominatim.openstreetmap.org/reverse"
  54          f"?format=json&lat={lat}&lon={lon}&zoom=12&addressdetails=1&accept-language=en"
  55      )
  56      req = urllib.request.Request(
  57          url, headers={"User-Agent": "Mozilla/5.0 (compatible; travel-app-link-resolver/1.0)"}
  58      )
  59      try:
  60          with urllib.request.urlopen(req, timeout=6) as resp:
  61              data = json.loads(resp.read(65_536).decode("utf-8", errors="replace"))
  62      except (urllib.error.URLError, OSError, ValueError):
  63          return None, None
  64      address = data.get("address") or {}
  65      city = address.get("city") or address.get("town") or address.get("village") or address.get("municipality")
  66      return (_clean_city(city) if city else None), address.get("country")
  67  
  68  
  69  def _resolve_google_maps_place(url: str) -> dict[str, Any]:
  70      result: dict[str, Any] = {"name": None, "city": None, "country": None}
  71      parsed = urlparse(url)
  72      if parsed.scheme != "https" or parsed.hostname not in _ALLOWED_MAP_HOSTS:
  73          return result
  74  
  75      req = urllib.request.Request(
  76          url, headers={"User-Agent": "Mozilla/5.0 (compatible; travel-app-link-resolver/1.0)"}
  77      )
  78      try:
  79          with urllib.request.urlopen(req, timeout=6) as resp:
  80              final_url = resp.geturl()
  81              body = resp.read(65_536).decode("utf-8", errors="replace")
  82      except (urllib.error.URLError, OSError, ValueError):
  83          return result
  84  
  85      m = re.search(r"/maps/place/([^/@?]+)", final_url)
  86      if m:
  87          name = unquote_plus(m.group(1)).replace("+", " ").strip()
  88          if name:
  89              result["name"] = name
  90      if result["name"] is None:
  91          m = re.search(r"<title[^>]*>(.*?)</title>", body, re.IGNORECASE | re.DOTALL)
  92          if m:
  93              title = html.unescape(m.group(1)).strip()
  94              title = re.sub(r"\s*[-|]\s*Google Maps\s*$", "", title, flags=re.IGNORECASE)
  95              if title:
  96                  result["name"] = title
  97  
  98      m = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", final_url)
  99      if m:
 100          result["city"], result["country"] = _reverse_geocode_city_country(float(m.group(1)), float(m.group(2)))
 101  
 102      return result
 103  
 104  
 105  @router.get("/api/travel/resolve-map-link")
 106  def travel_resolve_map_link(url: str = Query(min_length=1)) -> dict[str, Any]:
 107      return _resolve_google_maps_place(url)
 108  
 109  
 110  def _nights_and_days(checkin: str, checkout: str) -> tuple[int, int]:
 111      ci = dt.date.fromisoformat(checkin)
 112      co = dt.date.fromisoformat(checkout)
 113      nights = max(0, (co - ci).days)
 114      return nights, nights + 1
 115  
 116  
 117  def _with_stay_length(row: dict[str, Any]) -> dict[str, Any]:
 118      nights, days = _nights_and_days(row["checkin_date"], row["checkout_date"])
 119      return {**row, "nights": nights, "days": days}
 120  
 121  
 122  def _serialize_detail(detail: dict[str, Any]) -> dict[str, Any]:
 123      return {
 124          **detail,
 125          "accommodations": [_with_stay_length(a) for a in detail["accommodations"]],
 126      }
 127  
 128  
 129  _CHILD_LABELS: dict[str, str] = {
 130      "cities": "City",
 131      "flights": "Flight",
 132      "transport": "Transport leg",
 133      "itinerary": "Itinerary item",
 134      "accommodations": "Accommodation",
 135  }
 136  
 137  
 138  def _add_child(kind: str, trip_id: UUID, body: BaseModel) -> dict[str, Any]:
 139      detail = insert_travel_child(kind, trip_id, body.model_dump())
 140      if detail is None:
 141          raise HTTPException(status_code=404, detail="Trip not found.")
 142      return _serialize_detail(detail)
 143  
 144  
 145  def _update_child(
 146      kind: str, trip_id: UUID, child_id: UUID, body: BaseModel
 147  ) -> dict[str, Any]:
 148      detail = update_travel_child(kind, trip_id, child_id, body.model_dump())
 149      if detail is None:
 150          raise HTTPException(status_code=404, detail=f"{_CHILD_LABELS[kind]} not found.")
```

## Outgoing connections
- call -> cache.py (be:core:cache)
- call -> db.py (be:core:db)
- call -> deps.py (be:core:deps)
- call -> schemas/ (Pydantic) (be:schemas)
- read -> travel_accommodation (ds:travel_accommodation)
- write -> travel_accommodation (ds:travel_accommodation)
- read -> travel_city (ds:travel_city)
- write -> travel_city (ds:travel_city)
- read -> travel_flight (ds:travel_flight)
- write -> travel_flight (ds:travel_flight)
- read -> travel_itinerary (ds:travel_itinerary)
- write -> travel_itinerary (ds:travel_itinerary)
- read -> travel_transport (ds:travel_transport)
- write -> travel_transport (ds:travel_transport)
- read -> travel_trip (ds:travel_trip)
- write -> travel_trip (ds:travel_trip)
- call -> Google Maps (link resolve) (ext:google-maps)
- call -> Nominatim (reverse geocode) (ext:nominatim)

## Incoming connections
- factory.py (be:core:factory) -> call
- factory.py (be:core:factory) -> dispatch
- test_core.py (be:core:test_core) -> call
- /calendar (web:calendar) -> dispatch
- components/HomeOverview.tsx (web:components:HomeOverview) -> dispatch
- lib/api.ts (web:lib:api) -> dispatch
- /travels (web:travels) -> dispatch
