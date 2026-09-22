"""Travel trip endpoints.

A trip spans a real start/end date range and holds a list of cities plus
four kinds of nested records: flights, ground transport (bus/train),
itinerary items, and accommodations — each managed via its own sub-route and
always returning the trip's full, refreshed detail so the frontend never has
to re-fetch separately.

An accommodation's nights/days are derived from its check-in/check-out
dates on every read rather than stored, so they can never drift out of sync
with the dates themselves.
"""

from __future__ import annotations

import datetime as dt
import html
import json
import re
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import unquote_plus, urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

import cache
from app.deps import require_db
from app.schemas.travel import (
    TravelAccommodationCreate,
    TravelCityCreate,
    TravelFlightCreate,
    TravelItineraryCreate,
    TravelTransportCreate,
    TravelTripCreate,
)
from db import (
    delete_travel_child,
    delete_travel_trip,
    insert_travel_child,
    insert_travel_trip,
    list_travel_trips,
    update_travel_child,
    update_travel_trip,
)

router = APIRouter(tags=["travel"], dependencies=[Depends(require_db)])

# Hosts a pasted "maps link" is allowed to resolve against -- restricting to
# Google's own domains keeps this from becoming an open URL-fetching proxy.
_ALLOWED_MAP_HOSTS = {"maps.app.goo.gl", "goo.gl", "google.com", "www.google.com", "maps.google.com"}


# Suffixes OSM's reverse geocoder sometimes appends to an administrative
# area's name (Thai municipal boundaries in particular) that read as noise
# on a travel-app title -- stripped when they'd leave something behind.
_CITY_NOISE_SUFFIXES = (" City Municipality", " Municipality", " Metropolitan Area")


def _clean_city(name: str) -> str:
    for suf in _CITY_NOISE_SUFFIXES:
        if name.endswith(suf) and len(name) > len(suf):
            return name[: -len(suf)].strip()
    return name


def _reverse_geocode_city_country(lat: float, lon: float) -> tuple[str | None, str | None]:
    """City + country for a coordinate, via OpenStreetMap's free Nominatim
    reverse-geocoder (no API key; one request per resolved link, well within
    its public-instance usage policy for a single-user app)."""
    url = (
        "https://nominatim.openstreetmap.org/reverse"
        f"?format=json&lat={lat}&lon={lon}&zoom=12&addressdetails=1&accept-language=en"
    )
    req = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (compatible; travel-app-link-resolver/1.0)"}
    )
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read(65_536).decode("utf-8", errors="replace"))
    except (urllib.error.URLError, OSError, ValueError):
        return None, None
    address = data.get("address") or {}
    city = address.get("city") or address.get("town") or address.get("village") or address.get("municipality")
    return (_clean_city(city) if city else None), address.get("country")


def _resolve_google_maps_place(url: str) -> dict[str, Any]:
    """Best-effort name + city/country for a pasted Google Maps link:
    follows redirects (a maps.app.goo.gl short link lands on a full
    .../maps/place/<Name>/@lat,lng... URL), reads the name from the resolved
    URL's path (falling back to the page's <title> tag), and reverse-geocodes
    the URL's coordinates for city/country -- `None` for either when the
    link doesn't resolve or carries no coordinates."""
    result: dict[str, Any] = {"name": None, "city": None, "country": None}
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in _ALLOWED_MAP_HOSTS:
        return result

    req = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (compatible; travel-app-link-resolver/1.0)"}
    )
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            final_url = resp.geturl()
            body = resp.read(65_536).decode("utf-8", errors="replace")
    except (urllib.error.URLError, OSError, ValueError):
        return result

    m = re.search(r"/maps/place/([^/@?]+)", final_url)
    if m:
        name = unquote_plus(m.group(1)).replace("+", " ").strip()
        if name:
            result["name"] = name
    if result["name"] is None:
        m = re.search(r"<title[^>]*>(.*?)</title>", body, re.IGNORECASE | re.DOTALL)
        if m:
            title = html.unescape(m.group(1)).strip()
            title = re.sub(r"\s*[-|]\s*Google Maps\s*$", "", title, flags=re.IGNORECASE)
            if title:
                result["name"] = title

    m = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", final_url)
    if m:
        result["city"], result["country"] = _reverse_geocode_city_country(float(m.group(1)), float(m.group(2)))

    return result


@router.get("/api/travel/resolve-map-link")
def travel_resolve_map_link(url: str = Query(min_length=1)) -> dict[str, Any]:
    return _resolve_google_maps_place(url)


def _nights_and_days(checkin: str, checkout: str) -> tuple[int, int]:
    """Nights = full nights between the two dates; days always counts the
    check-in day, so a same-day stay is 0 nights / 1 day rather than 0/0."""
    ci = dt.date.fromisoformat(checkin)
    co = dt.date.fromisoformat(checkout)
    nights = max(0, (co - ci).days)
    return nights, nights + 1


def _with_stay_length(row: dict[str, Any]) -> dict[str, Any]:
    nights, days = _nights_and_days(row["checkin_date"], row["checkout_date"])
    return {**row, "nights": nights, "days": days}


def _serialize_detail(detail: dict[str, Any]) -> dict[str, Any]:
    """Shape a stored trip detail into its API response.

    Every SELECT already lists exactly the columns the API exposes, so the
    rows need no field-by-field copy. The one thing not stored is an
    accommodation's nights/days, derived on each read so they cannot drift out
    of sync with the dates they come from.
    """
    return {
        **detail,
        "accommodations": [_with_stay_length(a) for a in detail["accommodations"]],
    }


# The noun each sub-resource's 404 uses. The keys are both the URL segment and
# the key db.py stores the records under, so a route cannot drift from its
# table.
_CHILD_LABELS: dict[str, str] = {
    "cities": "City",
    "flights": "Flight",
    "transport": "Transport leg",
    "itinerary": "Itinerary item",
    "accommodations": "Accommodation",
}


def _add_child(kind: str, trip_id: int, body: BaseModel) -> dict[str, Any]:
    detail = insert_travel_child(kind, trip_id, body.model_dump())
    if detail is None:
        raise HTTPException(status_code=404, detail="Trip not found.")
    return _serialize_detail(detail)


def _update_child(
    kind: str, trip_id: int, child_id: int, body: BaseModel
) -> dict[str, Any]:
    detail = update_travel_child(kind, trip_id, child_id, body.model_dump())
    if detail is None:
        raise HTTPException(status_code=404, detail=f"{_CHILD_LABELS[kind]} not found.")
    return _serialize_detail(detail)


def _remove_child(kind: str, trip_id: int, child_id: int) -> dict[str, Any]:
    detail = delete_travel_child(kind, trip_id, child_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"{_CHILD_LABELS[kind]} not found.")
    return _serialize_detail(detail)


@router.get("/api/travel")
def travel_list(limit: int = Query(default=500, ge=1, le=2000)) -> dict[str, Any]:
    key = f"travel:list:{limit}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    rows = list_travel_trips(limit=limit)
    result = {"trips": [_serialize_detail(r) for r in rows]}
    cache.set(key, result)
    return result


@router.post("/api/travel")
def travel_create_trip(body: TravelTripCreate) -> dict[str, Any]:
    detail = insert_travel_trip(body.title, body.start_date, body.end_date, body.notes)
    return _serialize_detail(detail)


@router.put("/api/travel/{trip_id}")
def travel_update_trip(trip_id: int, body: TravelTripCreate) -> dict[str, Any]:
    detail = update_travel_trip(
        trip_id, body.title, body.start_date, body.end_date, body.notes
    )
    if detail is None:
        raise HTTPException(status_code=404, detail="Trip not found.")
    return _serialize_detail(detail)


@router.delete("/api/travel/{trip_id}")
def travel_remove_trip(trip_id: int) -> dict[str, Any]:
    if not delete_travel_trip(trip_id):
        raise HTTPException(status_code=404, detail="Trip not found.")
    return {"ok": True}


@router.post("/api/travel/{trip_id}/flights")
def travel_add_flight(trip_id: int, body: TravelFlightCreate) -> dict[str, Any]:
    return _add_child("flights", trip_id, body)


@router.put("/api/travel/{trip_id}/flights/{flight_id}")
def travel_update_flight(
    trip_id: int, flight_id: int, body: TravelFlightCreate
) -> dict[str, Any]:
    return _update_child("flights", trip_id, flight_id, body)


@router.delete("/api/travel/{trip_id}/flights/{flight_id}")
def travel_remove_flight(trip_id: int, flight_id: int) -> dict[str, Any]:
    return _remove_child("flights", trip_id, flight_id)


@router.post("/api/travel/{trip_id}/transport")
def travel_add_transport(trip_id: int, body: TravelTransportCreate) -> dict[str, Any]:
    return _add_child("transport", trip_id, body)


@router.put("/api/travel/{trip_id}/transport/{transport_id}")
def travel_update_transport(
    trip_id: int, transport_id: int, body: TravelTransportCreate
) -> dict[str, Any]:
    return _update_child("transport", trip_id, transport_id, body)


@router.delete("/api/travel/{trip_id}/transport/{transport_id}")
def travel_remove_transport(trip_id: int, transport_id: int) -> dict[str, Any]:
    return _remove_child("transport", trip_id, transport_id)


@router.post("/api/travel/{trip_id}/itinerary")
def travel_add_itinerary(trip_id: int, body: TravelItineraryCreate) -> dict[str, Any]:
    return _add_child("itinerary", trip_id, body)


@router.put("/api/travel/{trip_id}/itinerary/{item_id}")
def travel_update_itinerary(
    trip_id: int, item_id: int, body: TravelItineraryCreate
) -> dict[str, Any]:
    return _update_child("itinerary", trip_id, item_id, body)


@router.delete("/api/travel/{trip_id}/itinerary/{item_id}")
def travel_remove_itinerary(trip_id: int, item_id: int) -> dict[str, Any]:
    return _remove_child("itinerary", trip_id, item_id)


@router.post("/api/travel/{trip_id}/accommodations")
def travel_add_accommodation(
    trip_id: int, body: TravelAccommodationCreate
) -> dict[str, Any]:
    return _add_child("accommodations", trip_id, body)


@router.put("/api/travel/{trip_id}/accommodations/{accommodation_id}")
def travel_update_accommodation(
    trip_id: int, accommodation_id: int, body: TravelAccommodationCreate
) -> dict[str, Any]:
    return _update_child("accommodations", trip_id, accommodation_id, body)


@router.delete("/api/travel/{trip_id}/accommodations/{accommodation_id}")
def travel_remove_accommodation(trip_id: int, accommodation_id: int) -> dict[str, Any]:
    return _remove_child("accommodations", trip_id, accommodation_id)


@router.post("/api/travel/{trip_id}/cities")
def travel_add_city(trip_id: int, body: TravelCityCreate) -> dict[str, Any]:
    return _add_child("cities", trip_id, body)


@router.put("/api/travel/{trip_id}/cities/{city_id}")
def travel_update_city(
    trip_id: int, city_id: int, body: TravelCityCreate
) -> dict[str, Any]:
    return _update_child("cities", trip_id, city_id, body)


@router.delete("/api/travel/{trip_id}/cities/{city_id}")
def travel_remove_city(trip_id: int, city_id: int) -> dict[str, Any]:
    return _remove_child("cities", trip_id, city_id)
