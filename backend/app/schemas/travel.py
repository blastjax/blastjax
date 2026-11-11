from __future__ import annotations

import datetime as dt
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, Field, field_validator, model_validator

from app.schemas.text import OptionalText


def _blank_time_to_none(v: object) -> object:
    if isinstance(v, str):
        return v.strip() or None
    return v


# A time field left empty arrives as "".
OptionalTime = Annotated[dt.time | None, BeforeValidator(_blank_time_to_none)]


def _require_text(v: str, label: str) -> str:
    trimmed = v.strip()
    if not trimmed:
        raise ValueError(f"{label} is required.")
    return trimmed


class TravelTripCreate(BaseModel):
    title: str = Field(min_length=1)
    start_date: dt.date
    end_date: dt.date
    notes: OptionalText = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        return _require_text(v, "Title")

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
    arrival_date: dt.date | None = None
    departure_time: OptionalTime = None
    arrival_time: OptionalTime = None
    from_location: OptionalText = None
    from_map_url: OptionalText = None
    from_city: OptionalText = None
    from_country: OptionalText = None
    to_location: OptionalText = None
    to_map_url: OptionalText = None
    to_city: OptionalText = None
    to_country: OptionalText = None
    notes: OptionalText = None
    title: OptionalText = None
    airline: OptionalText = None
    seat: OptionalText = None
    terminal: OptionalText = None
    gate: OptionalText = None
    baggage: OptionalText = None
    confirmation: OptionalText = None

    @field_validator("flight_number")
    @classmethod
    def _flight_number(cls, v: str) -> str:
        return _require_text(v, "Flight number")

    @model_validator(mode="after")
    def _arrival_after_departure(self) -> "TravelFlightCreate":
        if self.flight_date is not None and self.arrival_date is not None and self.arrival_date < self.flight_date:
            raise ValueError("Arrival date must be on or after the flight date.")
        return self


class TravelTransportCreate(BaseModel):
    mode: Literal["bus", "train", "ferry"]
    number: OptionalText = None
    travel_date: dt.date | None = None
    arrival_date: dt.date | None = None
    departure_time: OptionalTime = None
    arrival_time: OptionalTime = None
    from_location: OptionalText = None
    from_map_url: OptionalText = None
    from_city: OptionalText = None
    from_country: OptionalText = None
    to_location: OptionalText = None
    to_map_url: OptionalText = None
    to_city: OptionalText = None
    to_country: OptionalText = None
    notes: OptionalText = None
    title: OptionalText = None
    operator: OptionalText = None
    seat: OptionalText = None
    travel_class: OptionalText = None
    platform: OptionalText = None
    confirmation: OptionalText = None

    @model_validator(mode="after")
    def _arrival_after_departure(self) -> "TravelTransportCreate":
        if self.travel_date is not None and self.arrival_date is not None and self.arrival_date < self.travel_date:
            raise ValueError("Arrival date must be on or after the travel date.")
        return self


class TravelItineraryCreate(BaseModel):
    item_date: dt.date
    item_end_date: dt.date | None = None
    start_time: OptionalTime = None
    end_time: OptionalTime = None
    activity: str = Field(min_length=1)
    location_name: OptionalText = None
    location_map_url: OptionalText = None
    notes: OptionalText = None
    booked_via: OptionalText = None
    price: OptionalText = None
    confirmation: OptionalText = None

    @field_validator("activity")
    @classmethod
    def _activity(cls, v: str) -> str:
        return _require_text(v, "Activity")

    @model_validator(mode="after")
    def _end_date_after_start(self) -> "TravelItineraryCreate":
        if self.item_end_date is not None and self.item_end_date < self.item_date:
            raise ValueError("End date must be on or after the start date.")
        return self


class TravelAccommodationCreate(BaseModel):
    name: str = Field(min_length=1)
    checkin_date: dt.date
    checkout_date: dt.date
    checkin_time: OptionalTime = None
    checkout_time: OptionalTime = None
    booking_confirmation: OptionalText = None
    instructions: OptionalText = None
    location_name: OptionalText = None
    location_map_url: OptionalText = None
    notes: OptionalText = None
    room: OptionalText = None
    guests: OptionalText = None
    phone: OptionalText = None
    booked_via: OptionalText = None
    price: OptionalText = None
    paid_price: OptionalText = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _require_text(v, "Name")

    @model_validator(mode="after")
    def _checkout_after_checkin(self) -> "TravelAccommodationCreate":
        if self.checkout_date < self.checkin_date:
            raise ValueError("Check-out date must be on or after check-in date.")
        return self
