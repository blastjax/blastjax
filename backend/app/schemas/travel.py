"""Travel trip API models.

A trip spans a real start/end date range and holds a list of cities visited
plus four kinds of nested records: flights, ground transport (bus/train),
itinerary items, and accommodations. Locations on itinerary/accommodation
rows (and a flight's or transport leg's origin/destination) carry an
optional custom Google Maps link; when one isn't set, the frontend builds a
maps search link from the location's name instead.
"""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


def _clean_optional(v: str | None) -> str | None:
    if v is None:
        return None
    trimmed = v.strip()
    return trimmed or None


def _blank_time_to_none(v: object) -> object:
    """Let an empty or whitespace-only string mean "no time".

    Runs before Pydantic parses the value, because the time fields are typed
    ``dt.time`` now that the columns are real TIME: clearing the field in the
    UI sends ``""``, which would otherwise fail validation instead of unsetting
    the value the way it did when these were plain strings.
    """
    if isinstance(v, str):
        return v.strip() or None
    return v


def _require_text(v: str, label: str) -> str:
    trimmed = v.strip()
    if not trimmed:
        raise ValueError(f"{label} is required.")
    return trimmed


class TravelTripCreate(BaseModel):
    title: str = Field(min_length=1)
    start_date: dt.date
    end_date: dt.date
    notes: str | None = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        return _require_text(v, "Title")

    @field_validator("notes")
    @classmethod
    def _notes(cls, v: str | None) -> str | None:
        return _clean_optional(v)

    @model_validator(mode="after")
    def _end_after_start(self) -> "TravelTripCreate":
        if self.end_date < self.start_date:
            raise ValueError("End date must be on or after the start date.")
        return self


class TravelCityCreate(BaseModel):
    name: str = Field(min_length=1)
    start_date: dt.date | None = None
    end_date: dt.date | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _require_text(v, "Name")

    @model_validator(mode="after")
    def _end_after_start(self) -> "TravelCityCreate":
        if self.start_date is not None and self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("End date must be on or after the start date.")
        return self


class TravelFlightCreate(BaseModel):
    flight_number: str = Field(min_length=1)
    flight_date: dt.date | None = None
    # Set only when the flight lands on a later calendar date than it departs
    # (an overnight/red-eye) — None means it lands the same day.
    arrival_date: dt.date | None = None
    departure_time: dt.time | None = None
    arrival_time: dt.time | None = None
    from_location: str | None = None
    from_map_url: str | None = None
    # City/country the maps link resolved to, if it was one -- used to build
    # a "City, Country" calendar title instead of the full place name.
    from_city: str | None = None
    from_country: str | None = None
    to_location: str | None = None
    to_map_url: str | None = None
    to_city: str | None = None
    to_country: str | None = None
    notes: str | None = None

    @field_validator("flight_number")
    @classmethod
    def _flight_number(cls, v: str) -> str:
        return _require_text(v, "Flight number")

    @field_validator("departure_time", "arrival_time", mode="before")
    @classmethod
    def _blank_time(cls, v: object) -> object:
        return _blank_time_to_none(v)

    @field_validator(
        "from_location",
        "from_map_url",
        "from_city",
        "from_country",
        "to_location",
        "to_map_url",
        "to_city",
        "to_country",
        "notes",
    )
    @classmethod
    def _optional(cls, v: str | None) -> str | None:
        return _clean_optional(v)

    @model_validator(mode="after")
    def _arrival_after_departure(self) -> "TravelFlightCreate":
        if self.flight_date is not None and self.arrival_date is not None and self.arrival_date < self.flight_date:
            raise ValueError("Arrival date must be on or after the flight date.")
        return self


class TravelTransportCreate(BaseModel):
    """A bus, train, or ferry leg — same shape as a flight, plus a mode, with
    the number optional since a bus/ferry route isn't always known/labeled
    the way a flight number is."""

    mode: Literal["bus", "train", "ferry"]
    number: str | None = None
    travel_date: dt.date | None = None
    # Set only when the leg arrives on a later calendar date than it departs
    # (an overnight train/ferry) — None means it arrives the same day.
    arrival_date: dt.date | None = None
    departure_time: dt.time | None = None
    arrival_time: dt.time | None = None
    from_location: str | None = None
    from_map_url: str | None = None
    from_city: str | None = None
    from_country: str | None = None
    to_location: str | None = None
    to_map_url: str | None = None
    to_city: str | None = None
    to_country: str | None = None
    notes: str | None = None

    @field_validator("departure_time", "arrival_time", mode="before")
    @classmethod
    def _blank_time(cls, v: object) -> object:
        return _blank_time_to_none(v)

    @field_validator(
        "number",
        "from_location",
        "from_map_url",
        "from_city",
        "from_country",
        "to_location",
        "to_map_url",
        "to_city",
        "to_country",
        "notes",
    )
    @classmethod
    def _optional(cls, v: str | None) -> str | None:
        return _clean_optional(v)

    @model_validator(mode="after")
    def _arrival_after_departure(self) -> "TravelTransportCreate":
        if self.travel_date is not None and self.arrival_date is not None and self.arrival_date < self.travel_date:
            raise ValueError("Arrival date must be on or after the travel date.")
        return self


class TravelItineraryCreate(BaseModel):
    item_date: dt.date
    # Optional — set only when the item spans past its start date (an
    # overnight train, a multi-day trek). None means a same-day item.
    item_end_date: dt.date | None = None
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    activity: str = Field(min_length=1)
    location_name: str | None = None
    location_map_url: str | None = None
    notes: str | None = None

    @field_validator("activity")
    @classmethod
    def _activity(cls, v: str) -> str:
        return _require_text(v, "Activity")

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def _blank_time(cls, v: object) -> object:
        return _blank_time_to_none(v)

    @field_validator("location_name", "location_map_url", "notes")
    @classmethod
    def _optional(cls, v: str | None) -> str | None:
        return _clean_optional(v)

    @model_validator(mode="after")
    def _end_date_after_start(self) -> "TravelItineraryCreate":
        if self.item_end_date is not None and self.item_end_date < self.item_date:
            raise ValueError("End date must be on or after the start date.")
        return self


class TravelAccommodationCreate(BaseModel):
    name: str = Field(min_length=1)
    checkin_date: dt.date
    checkout_date: dt.date
    checkin_time: dt.time | None = None
    checkout_time: dt.time | None = None
    booking_confirmation: str | None = None
    instructions: str | None = None
    location_name: str | None = None
    location_map_url: str | None = None
    notes: str | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _require_text(v, "Name")

    @field_validator("checkin_time", "checkout_time", mode="before")
    @classmethod
    def _blank_time(cls, v: object) -> object:
        return _blank_time_to_none(v)

    @field_validator(
        "booking_confirmation",
        "instructions",
        "location_name",
        "location_map_url",
        "notes",
    )
    @classmethod
    def _optional(cls, v: str | None) -> str | None:
        return _clean_optional(v)

    @model_validator(mode="after")
    def _checkout_after_checkin(self) -> "TravelAccommodationCreate":
        if self.checkout_date < self.checkin_date:
            raise ValueError("Check-out date must be on or after check-in date.")
        return self
