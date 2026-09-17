"use client";

import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useRef, useState } from "react";
import { DatePickerField } from "@/components/DatePickerField";
import { LocationLink } from "@/components/LocationLink";
import { Modal } from "@/components/Modal";
import { PencilIcon, TrashIcon } from "@/components/Icons";
import { TimeField } from "@/components/TimeField";
import {
  ACTION_BUTTON_CLASSES,
  ADD_BUTTON_CLASSES,
  CLOSE_BUTTON_CLASSES,
  DASHED_EMPTY_CLASSES,
  ERROR_ALERT_CLASSES,
  ICON_BUTTON_CLASSES,
  INPUT_CLASSES,
  LABEL_CLASSES,
  PAGE_CONTAINER_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
} from "@/lib/ui";
import {
  createTravelAccommodation,
  createTravelCity,
  createTravelFlight,
  createTravelItinerary,
  createTravelTransport,
  createTravelTrip,
  deleteTravelAccommodation,
  deleteTravelCity,
  deleteTravelFlight,
  deleteTravelItinerary,
  deleteTravelTransport,
  deleteTravelTrip,
  getTravelTrips,
  resolveMapLink,
  updateTravelAccommodation,
  updateTravelCity,
  updateTravelFlight,
  updateTravelItinerary,
  updateTravelTransport,
  updateTravelTrip,
  type TravelAccommodationRow,
  type TravelCityRow,
  type TravelFlightRow,
  type TravelItineraryRow,
  type TravelTransportRow,
  type TravelTripDetail,
} from "@/lib/api";
import { formatDate, formatTimeLabel, formatTimeRange, MONTH_NAMES_SHORT, parseDateOnlyLocal, toIsoDateLocal } from "@/lib/dateFormat";
import { mapsUrlFor } from "@/lib/maps";

const TIME_HELP =
  "Enter time as HH:MM in 24-hour format (e.g. 14:30) — or just digits, e.g. 1430.";

/** Parses free-text "H:MM"/"HH:MM", or plain digits ("1430", "930", "14")
 * as a 24-hour time, zero-padding the result. Blank means "not set"
 * (returns `undefined` so the field is omitted from the request rather
 * than sent as ""). Throws on anything else. */
function parseOptionalTime24(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  let h: number;
  let mi: number;
  const withColon = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (withColon) {
    h = Number(withColon[1]);
    mi = Number(withColon[2]);
  } else {
    const digitsOnly = /^\d{1,4}$/.exec(trimmed);
    if (!digitsOnly) throw new Error(TIME_HELP);
    if (trimmed.length <= 2) {
      h = Number(trimmed);
      mi = 0;
    } else {
      h = Number(trimmed.slice(0, -2));
      mi = Number(trimmed.slice(-2));
    }
  }
  if (h < 0 || h > 23 || mi < 0 || mi > 59) throw new Error(TIME_HELP);
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

/** Blank -> undefined so optional API fields are omitted rather than sent as "". */
function optOrUndefined(s: string): string | undefined {
  const trimmed = s.trim();
  return trimmed ? trimmed : undefined;
}

function addDaysIso(iso: string, days: number): string {
  const d = parseDateOnlyLocal(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return toIsoDateLocal(d);
}

function dayIndexFor(startIso: string, dateIso: string): number {
  const s = parseDateOnlyLocal(startIso);
  const d = parseDateOnlyLocal(dateIso);
  if (!s || !d) return 0;
  return Math.round((d.getTime() - s.getTime()) / 86_400_000);
}

/** Every ISO date from `startIso` to `endIso`, inclusive. */
function isoDateRange(startIso: string, endIso: string): string[] {
  const start = parseDateOnlyLocal(startIso);
  const end = parseDateOnlyLocal(endIso);
  if (!start || !end) return [];
  const out: string[] = [];
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    out.push(toIsoDateLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** "FRI" / "Oct 3" — compact day-column header pieces. */
function dayHeaderParts(iso: string): { weekday: string; label: string } {
  const d = parseDateOnlyLocal(iso);
  if (!d) return { weekday: "", label: iso };
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  return { weekday, label: `${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getDate()}` };
}

/** The city whose date range covers `iso`, or null. Cities with no dates
 * set never match a specific day. */
function cityForDate(cities: TravelCityRow[], iso: string): string | null {
  for (const c of cities) {
    if (c.start_date && c.end_date && iso >= c.start_date && iso <= c.end_date) return c.name;
  }
  return null;
}

function cityChipLabel(c: TravelCityRow): string {
  if (c.start_date && c.end_date) {
    return c.start_date === c.end_date
      ? `${c.name} · ${formatDate(c.start_date)}`
      : `${c.name} · ${formatDate(c.start_date)} – ${formatDate(c.end_date)}`;
  }
  return c.name;
}

/** Place chips in date order — undated ones (no start_date set) sort last,
 * by name among themselves. */
function sortCitiesByDate(cities: TravelCityRow[]): TravelCityRow[] {
  return [...cities].sort((a, b) => {
    if (a.start_date && b.start_date) return a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0;
    if (a.start_date) return -1;
    if (b.start_date) return 1;
    return a.name.localeCompare(b.name);
  });
}

type EntryKind = "flight" | "train" | "bus" | "ferry" | "activity" | "accommodation";

const TYPE_META: Record<EntryKind, { label: string; dot: string; text: string; border: string }> = {
  flight: { label: "FLIGHT", dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-300", border: "border-l-sky-500" },
  train: { label: "TRAIN", dot: "bg-violet-500", text: "text-violet-700 dark:text-violet-300", border: "border-l-violet-500" },
  bus: { label: "BUS", dot: "bg-fuchsia-500", text: "text-fuchsia-700 dark:text-fuchsia-300", border: "border-l-fuchsia-500" },
  ferry: { label: "FERRY", dot: "bg-cyan-500", text: "text-cyan-700 dark:text-cyan-300", border: "border-l-cyan-500" },
  activity: { label: "ACTIVITY", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300", border: "border-l-amber-500" },
  accommodation: { label: "STAY", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300", border: "border-l-emerald-500" },
};

const TRIP_ACCENTS = ["border-l-indigo-500", "border-l-emerald-500", "border-l-amber-500"];

/** Distinct hues for the calendar's place bars, cycling by chronological
 * order so consecutive places never land on the same color — separate from
 * the entry-type palette above (sky/violet/fuchsia/cyan/amber/emerald). */
const PLACE_BAR_COLORS = [
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  "bg-lime-500/20 text-lime-700 dark:text-lime-400",
  "bg-pink-500/15 text-pink-700 dark:text-pink-300",
];

/** Same geometry as `ICON_BUTTON_CLASSES`, recolored for a destructive action. */
const VIEW_DELETE_ICON_CLASSES =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-danger-text transition-colors duration-150 hover:bg-danger-soft disabled:pointer-events-none disabled:opacity-50";

/** Compact edit/delete icon buttons sized for a chip pill rather than a card or modal. */
const CHIP_EDIT_ICON_CLASSES =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-brand-text/70 transition-colors duration-150 hover:text-brand-text disabled:pointer-events-none disabled:opacity-50";
const CHIP_DELETE_ICON_CLASSES =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-danger-text/80 transition-colors duration-150 hover:text-danger-text disabled:pointer-events-none disabled:opacity-50";

/** How long a click waits before acting, in case it's the first half of a
 * double-click — used wherever a single click navigates/does nothing but a
 * double-click reveals edit/delete actions instead. */
const DBLCLICK_WINDOW_MS = 220;

/** Minimum width of one day column in the trip calendar grid, in pixels.
 * Columns otherwise divide the available width evenly (`1fr` each) so a
 * full week fits the screen without horizontal scrolling on typical
 * viewports — this floor only kicks in, and horizontal scroll along with
 * it, once the container gets too narrow to show all 7 legibly. */
const DAY_COLUMN_MIN_WIDTH = 130;

/** True for text that looks like a pasted URL, e.g. a Google Maps link. */
function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

/** Resolves a location field's value for saving. If it's still a raw pasted
 * maps link — e.g. the onBlur resolve (see `resolveLocationFieldOnBlur`)
 * hadn't finished before Save was clicked — this awaits the same lookup so
 * the save is never left with a URL where the name belongs. Already-plain
 * text is returned as-is, with whatever custom map URL/city/country the
 * field already had (untouched). */
async function resolvedLocation(
  value: string,
  existingMapUrl: string,
  existingCity: string,
  existingCountry: string,
): Promise<{ name: string; mapUrl: string; city: string; country: string }> {
  const trimmed = value.trim();
  if (!looksLikeUrl(trimmed)) {
    return { name: trimmed, mapUrl: existingMapUrl, city: existingCity, country: existingCountry };
  }
  try {
    const { name, city, country } = await resolveMapLink(trimmed);
    return { name: name ?? trimmed, mapUrl: trimmed, city: city ?? "", country: country ?? "" };
  } catch {
    return { name: trimmed, mapUrl: trimmed, city: existingCity, country: existingCountry };
  }
}

/** A flight/transport leg's headline: "MNL → NRT" when both ends are known,
 * degrading down to whichever end is set, or the flight/transport number. */
function routeHeadline(from: string | null, to: string | null, fallback: string): string {
  if (from && to) return `${from} → ${to}`;
  return from || to || fallback;
}

/** The calendar title for a flight/transit route: flights always show
 * "City, Country" for each end; transit shows just "City" unless the two
 * ends resolved to different countries (an international leg), in which
 * case it gets the same "City, Country" treatment to flag the crossing.
 * Falls back to the plain location text (or the route's own fallback)
 * whenever a city hasn't been resolved — i.e. the field was typed rather
 * than pasted from a maps link. */
function routeTitle(
  isFlight: boolean,
  from: string | null,
  fromCity: string | null,
  fromCountry: string | null,
  to: string | null,
  toCity: string | null,
  toCountry: string | null,
  fallback: string,
): string {
  const crossesCountry = !!fromCountry && !!toCountry && fromCountry !== toCountry;
  const useCountry = isFlight || crossesCountry;
  const fromLabel = fromCity ? (useCountry && fromCountry ? `${fromCity}, ${fromCountry}` : fromCity) : from;
  const toLabel = toCity ? (useCountry && toCountry ? `${toCity}, ${toCountry}` : toCity) : to;
  return routeHeadline(fromLabel, toLabel, fallback);
}

type TimelineEntry = {
  kind: EntryKind;
  id: number;
  date: string;
  time: string | null;
  timeLabel: string | null;
  title: string;
  route: { from: string | null; to: string | null; fromUrl: string | null; toUrl: string | null } | null;
  location: string | null;
  locationUrl: string | null;
  meta: { k: string; v: string }[] | null;
  notes: string | null;
  /** The last date this entry is still in progress (accommodation checkout
   * / flight or transit arrival), if later than `date` — the entry's card
   * spans from `date` to this day in the calendar, aligned across every
   * day column it passes through instead of repeating per day. */
  spanEndDate: string | null;
};

function buildTimelineEntries(detail: TravelTripDetail): TimelineEntry[] {
  const owns: TimelineEntry[] = [];

  for (const f of detail.flights) {
    if (!f.flight_date) continue;
    owns.push({
      kind: "flight",
      id: f.id,
      date: f.flight_date,
      time: f.departure_time,
      timeLabel: formatTimeRange(f.departure_time, f.arrival_time),
      title: routeTitle(
        true,
        f.from_location,
        f.from_city,
        f.from_country,
        f.to_location,
        f.to_city,
        f.to_country,
        f.flight_number,
      ),
      route:
        f.from_location || f.to_location
          ? {
              from: f.from_location,
              to: f.to_location,
              fromUrl: mapsUrlFor(f.from_location, f.from_map_url),
              toUrl: mapsUrlFor(f.to_location, f.to_map_url),
            }
          : null,
      location: null,
      locationUrl: null,
      meta:
        f.arrival_date && f.arrival_date > f.flight_date
          ? [{ k: "Flight", v: f.flight_number }, { k: "Arrives", v: formatDate(f.arrival_date) }]
          : [{ k: "Flight", v: f.flight_number }],
      notes: f.notes,
      spanEndDate: f.arrival_date,
    });
  }

  for (const t of detail.transport) {
    if (!t.travel_date) continue;
    const modeLabel = t.mode === "bus" ? "Bus" : "Train";
    owns.push({
      kind: t.mode,
      id: t.id,
      date: t.travel_date,
      time: t.departure_time,
      timeLabel: formatTimeRange(t.departure_time, t.arrival_time),
      title: routeTitle(
        false,
        t.from_location,
        t.from_city,
        t.from_country,
        t.to_location,
        t.to_city,
        t.to_country,
        t.number ? `${modeLabel} ${t.number}` : modeLabel,
      ),
      route:
        t.from_location || t.to_location
          ? {
              from: t.from_location,
              to: t.to_location,
              fromUrl: mapsUrlFor(t.from_location, t.from_map_url),
              toUrl: mapsUrlFor(t.to_location, t.to_map_url),
            }
          : null,
      location: null,
      locationUrl: null,
      meta: (() => {
        const m: { k: string; v: string }[] = [];
        if (t.number) m.push({ k: "Number", v: t.number });
        if (t.arrival_date && t.arrival_date > t.travel_date) m.push({ k: "Arrives", v: formatDate(t.arrival_date) });
        return m.length ? m : null;
      })(),
      notes: t.notes,
      spanEndDate: t.arrival_date,
    });
  }

  for (const item of detail.itinerary) {
    const spans = !!item.item_end_date && item.item_end_date !== item.item_date;
    owns.push({
      kind: "activity",
      id: item.id,
      date: item.item_date,
      time: item.start_time,
      timeLabel: formatTimeRange(item.start_time, item.end_time),
      title: item.activity,
      route: null,
      location: item.location_name,
      locationUrl: mapsUrlFor(item.location_name, item.location_map_url),
      meta: spans ? [{ k: "Ends", v: formatDate(item.item_end_date) }] : null,
      notes: item.notes,
      spanEndDate: item.item_end_date,
    });
  }

  for (const a of detail.accommodations) {
    const checkout = `${formatDate(a.checkout_date)}${a.checkout_time ? ` · ${formatTimeLabel(a.checkout_time)}` : ""} (${a.nights} night${a.nights === 1 ? "" : "s"})`;
    const meta: { k: string; v: string }[] = [{ k: "Check-out", v: checkout }];
    if (a.booking_confirmation) meta.push({ k: "Confirmation", v: a.booking_confirmation });
    owns.push({
      kind: "accommodation",
      id: a.id,
      date: a.checkin_date,
      time: a.checkin_time,
      timeLabel: formatTimeRange(a.checkin_time, a.checkout_time),
      title: a.name,
      route: null,
      location: a.location_name,
      locationUrl: mapsUrlFor(a.location_name, a.location_map_url),
      meta,
      notes: [a.instructions, a.notes].filter(Boolean).join("\n\n") || null,
      spanEndDate: a.checkout_date,
    });
  }

  return owns.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.time !== b.time) return (a.time ?? "99:99") < (b.time ?? "99:99") ? -1 : 1;
    return a.id - b.id;
  });
}

/** How many day columns sit in one horizontal band before wrapping to the
 * next — a full calendar week, keeping a long trip readable instead of one
 * very wide scrolling strip. */
const DAYS_PER_BAND = 7;

type PackedEntry = TimelineEntry & {
  startDay: number;
  endDay: number;
  row: number;
  /** True when this card is a clipped piece of an entry that actually
   * started in an earlier band, or continues into a later one — the entry
   * itself doesn't need to line up across bands ("if it's in a different
   * row it's okay"), this just drops the rounded corner on that edge so the
   * cut reads as a continuation rather than a full start/end. */
  continuesFromPrev: boolean;
  continuesToNext: boolean;
};

/** Assigns each entry in `entries` a grid row *within one band* of days
 * ([bandStartDay, bandEndDay], inclusive day indices from the trip start) so
 * a multi-day flight/transit/stay lands in the same row across every day
 * column it spans in this band — a Gantt-style horizontal bar rather than a
 * repeated card per day. An entry outside the band is dropped; one that
 * only partly overlaps is clipped to the band's edges (its row can differ
 * from whatever band it also appears in before/after).
 *
 * Rows stack in strict chronological order and are never backfilled: each
 * entry, in start-day/time order, just takes the next row down. Alignment
 * only ever applies to a single entry's own date span (its bar spans every
 * day it covers) — it does not try to also line up separate, unrelated
 * entries that merely don't conflict, e.g. a stay starting the day a
 * different flight ends. That reuse-for-compactness reads as "this stay is
 * related to that flight" when it isn't, so a later entry always renders
 * below every earlier one instead of hopping back into a freed row. */
function packEntriesForBand(entries: TimelineEntry[], tripStartIso: string, bandStartDay: number, bandEndDay: number): PackedEntry[] {
  return entries
    .map((e) => {
      const startDay = dayIndexFor(tripStartIso, e.date);
      const endDay = dayIndexFor(tripStartIso, e.spanEndDate && e.spanEndDate > e.date ? e.spanEndDate : e.date);
      return { e, startDay, endDay };
    })
    .filter(({ startDay, endDay }) => endDay >= bandStartDay && startDay <= bandEndDay)
    .map(({ e, startDay, endDay }) => ({
      ...e,
      startDay: Math.max(startDay, bandStartDay),
      endDay: Math.min(endDay, bandEndDay),
      continuesFromPrev: startDay < bandStartDay,
      continuesToNext: endDay > bandEndDay,
    }))
    .sort((a, b) => {
      if (a.startDay !== b.startDay) return a.startDay - b.startDay;
      if (a.time !== b.time) return (a.time ?? "99:99") < (b.time ?? "99:99") ? -1 : 1;
      return a.id - b.id;
    })
    .map((e, row) => ({ ...e, row }));
}

type PackedPlace = {
  id: number;
  name: string;
  colorClass: string;
  startDay: number;
  endDay: number;
  row: number;
  continuesFromPrev: boolean;
  continuesToNext: boolean;
};

/** Same clipping-to-a-band idea as `packEntriesForBand`, for the trip's
 * places: each dated city gets a color-coded bar spanning every day it
 * covers, colored by `PLACE_BAR_COLORS` cycling in chronological order so
 * consecutive places are visually distinct from each other. Unlike entries,
 * places are all "the same kind of thing" and normally run back-to-back
 * with no overlap, so rows here *do* get reused when one place's bar has
 * already ended — keeping the places band a single row for the common case
 * instead of growing one row per place regardless of overlap. */
function packPlacesForBand(cities: TravelCityRow[], tripStartIso: string, bandStartDay: number, bandEndDay: number): PackedPlace[] {
  const rowEnds: number[] = [];
  return sortCitiesByDate(cities)
    .filter((c): c is TravelCityRow & { start_date: string; end_date: string } => !!c.start_date && !!c.end_date)
    .map((c, colorIdx) => ({
      c,
      colorClass: PLACE_BAR_COLORS[colorIdx % PLACE_BAR_COLORS.length],
      startDay: dayIndexFor(tripStartIso, c.start_date),
      endDay: dayIndexFor(tripStartIso, c.end_date),
    }))
    .filter(({ startDay, endDay }) => endDay >= bandStartDay && startDay <= bandEndDay)
    .map(({ c, colorClass, startDay, endDay }) => ({
      id: c.id,
      name: c.name,
      colorClass,
      startDay: Math.max(startDay, bandStartDay),
      endDay: Math.min(endDay, bandEndDay),
      continuesFromPrev: startDay < bandStartDay,
      continuesToNext: endDay > bandEndDay,
    }))
    .map((p) => {
      let row = rowEnds.findIndex((end) => end < p.startDay);
      if (row === -1) {
        row = rowEnds.length;
        rowEnds.push(p.endDay);
      } else {
        rowEnds[row] = p.endDay;
      }
      return { ...p, row };
    });
}

function findRawRow(
  detail: TravelTripDetail,
  kind: EntryKind,
  id: number,
): TravelFlightRow | TravelTransportRow | TravelItineraryRow | TravelAccommodationRow | null {
  if (kind === "flight") return detail.flights.find((f) => f.id === id) ?? null;
  if (kind === "activity") return detail.itinerary.find((i) => i.id === id) ?? null;
  if (kind === "accommodation") return detail.accommodations.find((a) => a.id === id) ?? null;
  return detail.transport.find((t) => t.id === id) ?? null;
}

type TripFormState = {
  open: boolean;
  editId: number | null;
  title: string;
  startDate: string;
  numDays: string;
  notes: string;
};
const emptyTripForm = (): TripFormState => ({
  open: true,
  editId: null,
  title: "",
  startDate: toIsoDateLocal(new Date()),
  numDays: "1",
  notes: "",
});
const CLOSED_TRIP_MODAL: TripFormState = { ...emptyTripForm(), open: false };

type PlaceFormState = {
  open: boolean;
  tripId: number | null;
  editId: number | null;
  name: string;
  startDate: string;
  endDate: string;
};
const CLOSED_PLACE_MODAL: PlaceFormState = {
  open: false,
  tripId: null,
  editId: null,
  name: "",
  startDate: "",
  endDate: "",
};

type EntryFormState = {
  open: boolean;
  tripId: number | null;
  kind: EntryKind;
  editId: number | null;
  dayIndex: number;
  time1: string;
  time2: string;
  fromLocation: string;
  toLocation: string;
  /** Custom Google Maps link, set automatically when the matching *Location
   * field is a pasted maps link that resolved to a name. */
  fromMapUrl: string;
  toMapUrl: string;
  locationMapUrl: string;
  /** From/To only — city/country the maps link resolved to, for the
   * calendar's "City, Country" title. Empty when typed manually. */
  fromCity: string;
  fromCountry: string;
  toCity: string;
  toCountry: string;
  /** Flight/transit only — set only for an overnight leg landing on a later
   * calendar date than it departs. */
  arrivalDate: string;
  flightNumber: string;
  number: string;
  activity: string;
  /** Activity only — set only when it spans past its start date (an
   * overnight trek, a multi-day tour). */
  activityEndDate: string;
  name: string;
  locationName: string;
  checkoutDate: string;
  checkoutTime: string;
  bookingConfirmation: string;
  instructions: string;
  notes: string;
};
const emptyEntryForm = (tripId: number, kind: EntryKind): EntryFormState => ({
  open: true,
  tripId,
  kind,
  editId: null,
  dayIndex: 0,
  time1: "",
  time2: "",
  fromLocation: "",
  toLocation: "",
  fromMapUrl: "",
  toMapUrl: "",
  locationMapUrl: "",
  fromCity: "",
  fromCountry: "",
  toCity: "",
  toCountry: "",
  arrivalDate: "",
  flightNumber: "",
  number: "",
  activity: "",
  activityEndDate: "",
  name: "",
  locationName: "",
  checkoutDate: "",
  checkoutTime: "",
  bookingConfirmation: "",
  instructions: "",
  notes: "",
});
const CLOSED_ENTRY_MODAL: EntryFormState = { ...emptyEntryForm(0, "flight"), open: false, tripId: null };

type ViewingState = { entry: TimelineEntry } | null;

export default function TravelsClient() {
  const [trips, setTrips] = useState<TravelTripDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<"list" | "trip">("list");
  const [activeTripId, setActiveTripId] = useState<number | null>(null);

  // Trip cards and place chips hide their edit/delete controls until
  // double-clicked; a single click still does its normal thing (open the
  // trip / nothing, for a chip). `clickTimerRef` lets a click wait briefly
  // to see if a second one turns it into a double-click instead.
  const [revealedTripId, setRevealedTripId] = useState<number | null>(null);
  const [revealedCityId, setRevealedCityId] = useState<number | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "+ Flight/Stay/Activity/Transit/Place" collapse behind a Data tools
  // toggle, same pattern as the Lotto page.
  const [showDataTools, setShowDataTools] = useState(false);

  // Click-and-drag + arrow-key horizontal scrolling for the trip calendar.
  const calendarScrollRef = useRef<HTMLDivElement>(null);
  const calendarDragRef = useRef<{ startX: number; startScrollLeft: number; moved: boolean } | null>(null);
  const [isDraggingCalendar, setIsDraggingCalendar] = useState(false);

  const [tripModal, setTripModal] = useState<TripFormState>(CLOSED_TRIP_MODAL);
  const [tripError, setTripError] = useState<string | null>(null);

  const [placeModal, setPlaceModal] = useState<PlaceFormState>(CLOSED_PLACE_MODAL);
  const [placeError, setPlaceError] = useState<string | null>(null);

  const [entryModal, setEntryModal] = useState<EntryFormState>(CLOSED_ENTRY_MODAL);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [resolvingMapField, setResolvingMapField] = useState<
    "fromLocation" | "toLocation" | "locationName" | null
  >(null);

  const [viewing, setViewing] = useState<ViewingState>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await getTravelTrips(500);
      setTrips(r.trips);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trips");
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCalendarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // left click only
    const el = calendarScrollRef.current;
    if (!el) return;
    calendarDragRef.current = { startX: e.clientX, startScrollLeft: el.scrollLeft, moved: false };
    setIsDraggingCalendar(true);
  };

  useEffect(() => {
    if (!isDraggingCalendar) return;
    const onMove = (e: MouseEvent) => {
      const el = calendarScrollRef.current;
      const drag = calendarDragRef.current;
      if (!el || !drag) return;
      const dx = e.clientX - drag.startX;
      if (Math.abs(dx) > 4) drag.moved = true;
      el.scrollLeft = drag.startScrollLeft - dx;
    };
    const onUp = () => {
      setIsDraggingCalendar(false);
      // A real drag shouldn't also fire the click it ends on (e.g. opening
      // whichever card the cursor happened to land on).
      if (calendarDragRef.current?.moved) {
        const suppressClick = (e: MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
        };
        window.addEventListener("click", suppressClick, { capture: true, once: true });
      }
      calendarDragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDraggingCalendar]);

  const onCalendarKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = calendarScrollRef.current;
    if (!el) return;
    if (e.key === "ArrowRight") {
      el.scrollBy({ left: el.clientWidth * 0.9, behavior: "smooth" });
    } else if (e.key === "ArrowLeft") {
      el.scrollBy({ left: -(el.clientWidth * 0.9), behavior: "smooth" });
    } else {
      return;
    }
    e.preventDefault();
  };

  const upsertLocalTrip = (detail: TravelTripDetail) => {
    setTrips((ts) => {
      const i = ts.findIndex((t) => t.trip.id === detail.trip.id);
      const out = i === -1 ? [detail, ...ts] : ts.map((t, idx) => (idx === i ? detail : t));
      return out.sort((a, b) => {
        if (a.trip.start_date !== b.trip.start_date) return b.trip.start_date < a.trip.start_date ? -1 : 1;
        return b.trip.id - a.trip.id;
      });
    });
  };

  const activeDetail = activeTripId != null ? trips.find((t) => t.trip.id === activeTripId) ?? null : null;

  // --- Trip ---

  const openAddTrip = () => {
    setTripError(null);
    setTripModal(emptyTripForm());
  };
  const openEditTrip = (detail: TravelTripDetail) => {
    setTripError(null);
    const days = isoDateRange(detail.trip.start_date, detail.trip.end_date).length;
    setTripModal({
      open: true,
      editId: detail.trip.id,
      title: detail.trip.title,
      startDate: detail.trip.start_date,
      numDays: String(Math.max(1, days)),
      notes: detail.trip.notes ?? "",
    });
  };
  const closeTripModal = () => {
    setTripModal(CLOSED_TRIP_MODAL);
    setTripError(null);
  };
  const submitTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setTripError(null);
    const title = tripModal.title.trim();
    const numDays = Math.max(1, parseInt(tripModal.numDays, 10) || 1);
    if (!title) {
      setTripError("Enter a title.");
      return;
    }
    if (!tripModal.startDate) {
      setTripError("Pick a start date.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        title,
        start_date: tripModal.startDate,
        end_date: addDaysIso(tripModal.startDate, numDays - 1),
        notes: optOrUndefined(tripModal.notes) ?? null,
      };
      const detail =
        tripModal.editId != null
          ? await updateTravelTrip(tripModal.editId, body)
          : await createTravelTrip(body);
      upsertLocalTrip(detail);
      closeTripModal();
      if (tripModal.editId == null) {
        setView("trip");
        setActiveTripId(detail.trip.id);
      }
    } catch (err) {
      setTripError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };
  const onDeleteTrip = async (tripId: number) => {
    if (!confirm("Delete this trip and everything under it (flights, itinerary, stays)?")) return;
    setSaving(true);
    setError(null);
    try {
      await deleteTravelTrip(tripId);
      setTrips((ts) => ts.filter((t) => t.trip.id !== tripId));
      if (activeTripId === tripId) {
        setView("list");
        setActiveTripId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  // --- Place (city) ---

  const openAddPlace = (tripId: number) => {
    setPlaceError(null);
    setPlaceModal({ open: true, tripId, editId: null, name: "", startDate: "", endDate: "" });
  };
  const openEditPlace = (tripId: number, city: TravelCityRow) => {
    setPlaceError(null);
    setRevealedCityId(null);
    setPlaceModal({
      open: true,
      tripId,
      editId: city.id,
      name: city.name,
      startDate: city.start_date ?? "",
      endDate: city.end_date ?? "",
    });
  };
  const closePlaceModal = () => {
    setPlaceModal(CLOSED_PLACE_MODAL);
    setPlaceError(null);
  };
  const submitPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlaceError(null);
    if (placeModal.tripId == null) return;
    const name = placeModal.name.trim();
    if (!name) {
      setPlaceError("Enter a place or country.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name,
        start_date: optOrUndefined(placeModal.startDate) ?? null,
        end_date: optOrUndefined(placeModal.endDate) ?? null,
      };
      const detail =
        placeModal.editId != null
          ? await updateTravelCity(placeModal.tripId, placeModal.editId, body)
          : await createTravelCity(placeModal.tripId, body);
      upsertLocalTrip(detail);
      closePlaceModal();
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };
  const onDeletePlace = async (tripId: number, cityId: number) => {
    setSaving(true);
    setError(null);
    try {
      const detail = await deleteTravelCity(tripId, cityId);
      upsertLocalTrip(detail);
      setRevealedCityId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  // --- Entry (flight / train / bus / ferry / activity / accommodation) ---

  /** When a Location/From/To field is a pasted Google Maps link, resolves
   * it to a place name on blur — swapping the field's text to the name
   * while keeping the pasted link as that field's custom maps URL. For
   * From/To, also stashes the resolved city/country (used to build the
   * calendar's "City, Country" title) — omitted for Location, which has no
   * route title. */
  const resolveLocationFieldOnBlur = async (
    field: "fromLocation" | "toLocation" | "locationName",
    mapUrlField: "fromMapUrl" | "toMapUrl" | "locationMapUrl",
    cityField?: "fromCity" | "toCity",
    countryField?: "fromCountry" | "toCountry",
  ) => {
    const value = entryModal[field].trim();
    if (!looksLikeUrl(value)) return;
    setResolvingMapField(field);
    try {
      const { name, city, country } = await resolveMapLink(value);
      setEntryModal((m) =>
        m[field] === entryModal[field]
          ? {
              ...m,
              [field]: name ?? value,
              [mapUrlField]: value,
              ...(cityField ? { [cityField]: city ?? "" } : {}),
              ...(countryField ? { [countryField]: country ?? "" } : {}),
            }
          : m,
      );
    } catch {
      setEntryModal((m) => (m[field] === entryModal[field] ? { ...m, [mapUrlField]: value } : m));
    } finally {
      setResolvingMapField((f) => (f === field ? null : f));
    }
  };

  const openAddEntry = (tripId: number, kind: EntryKind) => {
    setEntryError(null);
    setEntryModal(emptyEntryForm(tripId, kind));
  };

  const openEditEntry = (tripId: number, kind: EntryKind, id: number) => {
    const detail = trips.find((t) => t.trip.id === tripId);
    if (!detail) return;
    const raw = findRawRow(detail, kind, id);
    if (!raw) return;
    setEntryError(null);
    const start = detail.trip.start_date;
    if (kind === "flight") {
      const f = raw as TravelFlightRow;
      setEntryModal({
        ...emptyEntryForm(tripId, kind),
        editId: id,
        dayIndex: dayIndexFor(start, f.flight_date ?? start),
        time1: formatTimeLabel(f.departure_time) ?? "",
        time2: formatTimeLabel(f.arrival_time) ?? "",
        fromLocation: f.from_location ?? "",
        toLocation: f.to_location ?? "",
        fromMapUrl: f.from_map_url ?? "",
        fromCity: f.from_city ?? "",
        fromCountry: f.from_country ?? "",
        toMapUrl: f.to_map_url ?? "",
        toCity: f.to_city ?? "",
        toCountry: f.to_country ?? "",
        arrivalDate: f.arrival_date ?? "",
        flightNumber: f.flight_number,
        notes: f.notes ?? "",
      });
    } else if (kind === "activity") {
      const item = raw as TravelItineraryRow;
      setEntryModal({
        ...emptyEntryForm(tripId, kind),
        editId: id,
        dayIndex: dayIndexFor(start, item.item_date),
        time1: formatTimeLabel(item.start_time) ?? "",
        time2: formatTimeLabel(item.end_time) ?? "",
        activity: item.activity,
        activityEndDate: item.item_end_date ?? "",
        locationName: item.location_name ?? "",
        locationMapUrl: item.location_map_url ?? "",
        notes: item.notes ?? "",
      });
    } else if (kind === "accommodation") {
      const a = raw as TravelAccommodationRow;
      setEntryModal({
        ...emptyEntryForm(tripId, kind),
        editId: id,
        dayIndex: dayIndexFor(start, a.checkin_date),
        time1: formatTimeLabel(a.checkin_time) ?? "",
        checkoutDate: a.checkout_date,
        checkoutTime: formatTimeLabel(a.checkout_time) ?? "",
        name: a.name,
        locationName: a.location_name ?? "",
        locationMapUrl: a.location_map_url ?? "",
        bookingConfirmation: a.booking_confirmation ?? "",
        instructions: a.instructions ?? "",
        notes: a.notes ?? "",
      });
    } else {
      const t = raw as TravelTransportRow;
      setEntryModal({
        ...emptyEntryForm(tripId, t.mode),
        editId: id,
        dayIndex: dayIndexFor(start, t.travel_date ?? start),
        time1: formatTimeLabel(t.departure_time) ?? "",
        time2: formatTimeLabel(t.arrival_time) ?? "",
        fromLocation: t.from_location ?? "",
        toLocation: t.to_location ?? "",
        fromMapUrl: t.from_map_url ?? "",
        fromCity: t.from_city ?? "",
        fromCountry: t.from_country ?? "",
        toMapUrl: t.to_map_url ?? "",
        toCity: t.to_city ?? "",
        toCountry: t.to_country ?? "",
        arrivalDate: t.arrival_date ?? "",
        number: t.number ?? "",
        notes: t.notes ?? "",
      });
    }
  };

  const closeEntryModal = () => {
    setEntryModal(CLOSED_ENTRY_MODAL);
    setEntryError(null);
  };

  const submitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setEntryError(null);
    const m = entryModal;
    if (m.tripId == null) return;
    const detail = trips.find((t) => t.trip.id === m.tripId);
    if (!detail) return;
    const date = addDaysIso(detail.trip.start_date, m.dayIndex);
    const arrivalDate = optOrUndefined(m.arrivalDate) ?? null;
    if (arrivalDate && arrivalDate < date) {
      setEntryError("Arrival date must be on or after the departure date.");
      return;
    }
    const activityEndDate = optOrUndefined(m.activityEndDate) ?? null;
    if (activityEndDate && activityEndDate < date) {
      setEntryError("End date must be on or after the start date.");
      return;
    }
    let time1: string | undefined;
    let time2: string | undefined;
    let checkoutTime: string | undefined;
    try {
      time1 = parseOptionalTime24(m.time1);
      time2 = parseOptionalTime24(m.time2);
      checkoutTime = parseOptionalTime24(m.checkoutTime);
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : "Invalid time");
      return;
    }
    setSaving(true);
    try {
      // Re-resolve any location field that's still a raw pasted maps link —
      // the onBlur resolve (resolveLocationFieldOnBlur) may not have
      // finished yet if Save was clicked right after pasting.
      const [from, to, loc] = await Promise.all([
        resolvedLocation(m.fromLocation, m.fromMapUrl, m.fromCity, m.fromCountry),
        resolvedLocation(m.toLocation, m.toMapUrl, m.toCity, m.toCountry),
        resolvedLocation(m.locationName, m.locationMapUrl, "", ""),
      ]);
      let result: TravelTripDetail;
      if (m.kind === "flight") {
        const flightNumber = m.flightNumber.trim();
        if (!flightNumber) throw new Error("Enter a flight number.");
        const body = {
          flight_number: flightNumber,
          flight_date: date,
          arrival_date: arrivalDate,
          departure_time: time1 ?? null,
          arrival_time: time2 ?? null,
          from_location: optOrUndefined(from.name) ?? null,
          from_map_url: optOrUndefined(from.mapUrl) ?? null,
          from_city: optOrUndefined(from.city) ?? null,
          from_country: optOrUndefined(from.country) ?? null,
          to_location: optOrUndefined(to.name) ?? null,
          to_map_url: optOrUndefined(to.mapUrl) ?? null,
          to_city: optOrUndefined(to.city) ?? null,
          to_country: optOrUndefined(to.country) ?? null,
          notes: optOrUndefined(m.notes) ?? null,
        };
        result =
          m.editId != null
            ? await updateTravelFlight(m.tripId, m.editId, body)
            : await createTravelFlight(m.tripId, body);
      } else if (m.kind === "train" || m.kind === "bus" || m.kind === "ferry") {
        const body = {
          mode: m.kind,
          number: optOrUndefined(m.number) ?? null,
          travel_date: date,
          arrival_date: arrivalDate,
          departure_time: time1 ?? null,
          arrival_time: time2 ?? null,
          from_location: optOrUndefined(from.name) ?? null,
          from_map_url: optOrUndefined(from.mapUrl) ?? null,
          from_city: optOrUndefined(from.city) ?? null,
          from_country: optOrUndefined(from.country) ?? null,
          to_location: optOrUndefined(to.name) ?? null,
          to_map_url: optOrUndefined(to.mapUrl) ?? null,
          to_city: optOrUndefined(to.city) ?? null,
          to_country: optOrUndefined(to.country) ?? null,
          notes: optOrUndefined(m.notes) ?? null,
        };
        result =
          m.editId != null
            ? await updateTravelTransport(m.tripId, m.editId, body)
            : await createTravelTransport(m.tripId, body);
      } else if (m.kind === "activity") {
        const activity = m.activity.trim();
        if (!activity) throw new Error("Enter an activity.");
        const body = {
          item_date: date,
          item_end_date: activityEndDate,
          start_time: time1 ?? null,
          end_time: time2 ?? null,
          activity,
          location_name: optOrUndefined(loc.name) ?? null,
          location_map_url: optOrUndefined(loc.mapUrl) ?? null,
          notes: optOrUndefined(m.notes) ?? null,
        };
        result =
          m.editId != null
            ? await updateTravelItinerary(m.tripId, m.editId, body)
            : await createTravelItinerary(m.tripId, body);
      } else {
        const name = m.name.trim();
        if (!name) throw new Error("Enter a name.");
        if (!m.checkoutDate) throw new Error("Pick a check-out date.");
        if (m.checkoutDate < date) throw new Error("Check-out date must be on or after check-in date.");
        const body = {
          name,
          checkin_date: date,
          checkout_date: m.checkoutDate,
          checkin_time: time1 ?? null,
          checkout_time: checkoutTime ?? null,
          booking_confirmation: optOrUndefined(m.bookingConfirmation) ?? null,
          instructions: optOrUndefined(m.instructions) ?? null,
          location_name: optOrUndefined(loc.name) ?? null,
          location_map_url: optOrUndefined(loc.mapUrl) ?? null,
          notes: optOrUndefined(m.notes) ?? null,
        };
        result =
          m.editId != null
            ? await updateTravelAccommodation(m.tripId, m.editId, body)
            : await createTravelAccommodation(m.tripId, body);
      }
      upsertLocalTrip(result);
      closeEntryModal();
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onDeleteEntry = async (tripId: number, kind: EntryKind, id: number) => {
    if (!confirm("Delete this item?")) return;
    setSaving(true);
    setError(null);
    try {
      let result: TravelTripDetail;
      if (kind === "flight") result = await deleteTravelFlight(tripId, id);
      else if (kind === "activity") result = await deleteTravelItinerary(tripId, id);
      else if (kind === "accommodation") result = await deleteTravelAccommodation(tripId, id);
      else result = await deleteTravelTransport(tripId, id);
      upsertLocalTrip(result);
      setViewing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  // --- Rendering ---

  const renderTripCard = (detail: TravelTripDetail, index: number) => {
    const { trip } = detail;
    const itemCount =
      detail.flights.length + detail.transport.length + detail.itinerary.length + detail.accommodations.length;
    const dayCount = isoDateRange(trip.start_date, trip.end_date).length;
    const revealed = revealedTripId === trip.id;
    const openTrip = () => {
      setView("trip");
      setActiveTripId(trip.id);
    };
    return (
      <div
        key={trip.id}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (clickTimerRef.current) return;
          clickTimerRef.current = setTimeout(() => {
            clickTimerRef.current = null;
            openTrip();
          }, DBLCLICK_WINDOW_MS);
        }}
        onDoubleClick={() => {
          if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
          }
          setRevealedTripId((cur) => (cur === trip.id ? null : trip.id));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") openTrip();
        }}
        className={`cursor-pointer rounded-xl border border-line bg-surface p-5 shadow-xs transition-shadow hover:shadow-pop border-l-4 ${TRIP_ACCENTS[index % TRIP_ACCENTS.length]}`}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 truncate text-lg font-semibold text-ink">{trip.title}</h3>
          {revealed && (
            <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                aria-label="Edit trip"
                disabled={saving}
                className={ICON_BUTTON_CLASSES}
                onClick={() => openEditTrip(detail)}
              >
                <PencilIcon className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Delete trip"
                disabled={saving}
                className={VIEW_DELETE_ICON_CLASSES}
                onClick={() => void onDeleteTrip(trip.id)}
              >
                <TrashIcon className="size-5" />
              </button>
            </div>
          )}
        </div>
        <div className="mt-1 text-sm text-ink-3">
          {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
        </div>
        <div className="mt-3 text-xs text-ink-3">
          {dayCount} day{dayCount === 1 ? "" : "s"} · {itemCount} item{itemCount === 1 ? "" : "s"}
        </div>
      </div>
    );
  };

  const renderListView = () => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {trips.map((t, i) => renderTripCard(t, i))}
      <button
        type="button"
        onClick={openAddTrip}
        className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-line-strong px-4 py-6 text-sm font-medium text-ink-3 transition-colors duration-150 hover:border-brand hover:text-brand"
      >
        + New Trip
      </button>
    </div>
  );

  /** The calendar card is just the badge, time, and title — route, location,
   * maps links, meta, and notes only show once you click through to the
   * view modal. `bandIdx`/`bandStartDay` place it within its own band's
   * local columns; `rowOffset` (the band's place-bar row count) pushes it
   * below those. A card clipped at a band edge (`continuesFromPrev`/
   * `continuesToNext`) loses the rounded corner on that side so the cut
   * reads as a continuation rather than a full start/end. */
  const renderEntryCard = (entry: PackedEntry, bandIdx: number, bandStartDay: number, rowOffset: number) => {
    const meta = TYPE_META[entry.kind];
    const localStart = entry.startDay - bandStartDay;
    const localEnd = entry.endDay - bandStartDay;
    return (
      <button
        key={`${entry.kind}-${entry.id}-${bandIdx}`}
        type="button"
        onClick={() => setViewing({ entry })}
        style={{ gridColumn: `${localStart + 1} / ${localEnd + 2}`, gridRow: entry.row + 2 + rowOffset }}
        className={`flex flex-col gap-0.5 self-start border border-line bg-surface p-3 text-left border-l-[3px] ${meta.border} transition-shadow hover:shadow-xs ${
          entry.continuesFromPrev ? "rounded-l-none" : "rounded-l-lg"
        } ${entry.continuesToNext ? "rounded-r-none" : "rounded-r-lg"}`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className={`text-[11px] font-bold tracking-wide ${meta.text}`}>{meta.label}</span>
          {entry.timeLabel && <span className="whitespace-nowrap text-xs font-semibold text-ink-2">{entry.timeLabel}</span>}
        </div>
        <div className="text-sm font-semibold leading-snug text-ink">{entry.title}</div>
      </button>
    );
  };

  /** A place's colored bar, spanning every day column it covers within this
   * band — non-interactive (places are edited/deleted via their chip in the
   * header), just a compact colored strip so it reads as distinct from the
   * bordered entry cards below it. */
  const renderPlaceBar = (place: PackedPlace, bandIdx: number, bandStartDay: number) => {
    const localStart = place.startDay - bandStartDay;
    const localEnd = place.endDay - bandStartDay;
    return (
      <div
        key={`place-${place.id}-${bandIdx}`}
        style={{ gridColumn: `${localStart + 1} / ${localEnd + 2}`, gridRow: place.row + 2 }}
        className={`truncate px-3 py-1.5 text-xs font-semibold ${place.colorClass} ${
          place.continuesFromPrev ? "rounded-l-none" : "rounded-l-full"
        } ${place.continuesToNext ? "rounded-r-none" : "rounded-r-full"}`}
      >
        {place.name}
      </div>
    );
  };

  const renderTripView = (detail: TravelTripDetail) => {
    const { trip, cities } = detail;
    const tripDays = isoDateRange(trip.start_date, trip.end_date);
    // Rows align to real calendar weeks (Sun–Sat) without padding the
    // calendar with fake pre-trip days: the first row is just whatever's
    // left of that week (as short as a single day if the trip starts on a
    // Saturday), so it renders as real, full-width columns instead of a
    // mostly-empty week with the trip's start squeezed into one slot — every
    // row after that is a full Sunday-to-Saturday week since the short
    // first row already lands them on a Sunday.
    const startWeekday = parseDateOnlyLocal(trip.start_date)?.getDay() ?? 0;
    const firstBandLength = Math.min(tripDays.length, 7 - startWeekday);
    const entries = buildTimelineEntries(detail);
    const bands: { days: string[]; startDay: number; endDay: number }[] = [
      { days: tripDays.slice(0, firstBandLength), startDay: 0, endDay: firstBandLength - 1 },
    ];
    for (let i = firstBandLength; i < tripDays.length; i += DAYS_PER_BAND) {
      const chunk = tripDays.slice(i, i + DAYS_PER_BAND);
      bands.push({ days: chunk, startDay: i, endDay: i + chunk.length - 1 });
    }

    return (
      <>
        <button
          type="button"
          onClick={() => {
            setView("list");
            setActiveTripId(null);
          }}
          className="mb-4 text-sm font-medium text-ink-3 transition-colors hover:text-ink"
        >
          ← All trips
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-3xl font-semibold text-ink">{trip.title}</h2>
            <div className="mt-1.5 text-sm text-ink-3">
              {formatDate(trip.start_date)} – {formatDate(trip.end_date)} · {tripDays.length} day
              {tripDays.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {sortCitiesByDate(cities).map((c) => (
              <span
                key={c.id}
                onDoubleClick={() => setRevealedCityId((cur) => (cur === c.id ? null : c.id))}
                className="flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand-text"
              >
                {cityChipLabel(c)}
                {revealedCityId === c.id && (
                  <span className="flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={`Edit ${c.name}`}
                      disabled={saving}
                      onClick={() => openEditPlace(trip.id, c)}
                      className={CHIP_EDIT_ICON_CLASSES}
                    >
                      <PencilIcon className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${c.name}`}
                      disabled={saving}
                      onClick={() => void onDeletePlace(trip.id, c.id)}
                      className={CHIP_DELETE_ICON_CLASSES}
                    >
                      <TrashIcon className="size-3.5" />
                    </button>
                  </span>
                )}
              </span>
            ))}
            <button
              type="button"
              className={ACTION_BUTTON_CLASSES}
              aria-expanded={showDataTools}
              onClick={() => setShowDataTools((v) => !v)}
            >
              Data tools <span aria-hidden>{showDataTools ? "▴" : "▾"}</span>
            </button>
          </div>
        </div>

        {showDataTools && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => openAddPlace(trip.id)}
              className="rounded-full border border-dashed border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-3 hover:border-brand hover:text-brand"
            >
              + Place
            </button>
            <button type="button" disabled={saving} className={ADD_BUTTON_CLASSES} onClick={() => openAddEntry(trip.id, "flight")}>
              + Flight
            </button>
            <button
              type="button"
              disabled={saving}
              className={ADD_BUTTON_CLASSES}
              onClick={() => openAddEntry(trip.id, "accommodation")}
            >
              + Stay
            </button>
            <button type="button" disabled={saving} className={ADD_BUTTON_CLASSES} onClick={() => openAddEntry(trip.id, "activity")}>
              + Activity
            </button>
            <button type="button" disabled={saving} className={ADD_BUTTON_CLASSES} onClick={() => openAddEntry(trip.id, "train")}>
              + Transit
            </button>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-4 rounded-lg border border-line bg-surface p-3.5">
          {(Object.keys(TYPE_META) as EntryKind[]).map((k) => (
            <div key={k} className="flex items-center gap-1.5 text-xs text-ink-3">
              <span className={`h-2 w-2 rounded-full ${TYPE_META[k].dot}`} />
              {TYPE_META[k].label}
            </div>
          ))}
        </div>

        <div
          ref={calendarScrollRef}
          tabIndex={0}
          role="region"
          aria-label="Trip calendar — drag or use the left/right arrow keys to scroll"
          onMouseDown={onCalendarMouseDown}
          onKeyDown={onCalendarKeyDown}
          className={`mt-5 flex flex-col gap-6 overflow-x-auto rounded-lg pb-4 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
            isDraggingCalendar ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          {bands.map((band, bandIdx) => {
            const packed = packEntriesForBand(entries, trip.start_date, band.startDay, band.endDay);
            const places = packPlacesForBand(cities, trip.start_date, band.startDay, band.endDay);
            const placeRows = places.reduce((n, p) => Math.max(n, p.row + 1), 0);
            const daysWithEntries = new Set<number>();
            for (const e of packed) {
              for (let d = e.startDay; d <= e.endDay; d++) daysWithEntries.add(d);
            }
            return (
              <div
                key={`band-${band.startDay}`}
                className="grid items-start gap-x-4 gap-y-4"
                style={{ gridTemplateColumns: `repeat(${band.days.length}, minmax(${DAY_COLUMN_MIN_WIDTH}px, 1fr))` }}
              >
                {band.days.map((iso, i) => {
                  const { weekday, label } = dayHeaderParts(iso);
                  return (
                    <div
                      key={`hdr-${iso}`}
                      style={{ gridColumn: i + 1, gridRow: 1 }}
                      className="sticky top-0 bg-page pb-4 border-b-2 border-ink"
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                        {weekday} · {label}
                      </div>
                    </div>
                  );
                })}

                {places.map((place) => renderPlaceBar(place, bandIdx, band.startDay))}

                {packed.map((entry) => renderEntryCard(entry, bandIdx, band.startDay, placeRows))}

                {band.days.map((iso, i) => {
                  if (daysWithEntries.has(band.startDay + i)) return null;
                  return (
                    <p key={`empty-${iso}`} style={{ gridColumn: i + 1, gridRow: 2 + placeRows }} className="px-0.5 py-3 text-xs text-ink-4">
                      No items yet
                    </p>
                  );
                })}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  const isTransit = entryModal.kind === "train" || entryModal.kind === "bus" || entryModal.kind === "ferry";
  const kindLabels: Record<EntryKind, string> = {
    flight: "flight",
    train: "transit",
    bus: "transit",
    ferry: "transit",
    activity: "activity",
    accommodation: "stay",
  };

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="Travels"
        description={
          <>
            Trips laid out day by day — flights, stays, activities, and transit color-coded on
            one timeline per trip. Location links open in Google Maps.
          </>
        }
      />

      {error && (
        <div className={ERROR_ALERT_CLASSES} role="alert">
          {error}
        </div>
      )}

      {!loading && trips.length === 0 && view === "list" && (
        <p className={DASHED_EMPTY_CLASSES}>No trips yet — add one to get started.</p>
      )}

      {view === "list" ? renderListView() : activeDetail ? renderTripView(activeDetail) : null}

      {/* Trip modal */}
      <Modal open={tripModal.open} onClose={closeTripModal} ariaLabelledBy="travel-trip-title">
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 id="travel-trip-title" className="text-lg font-semibold text-ink">
            {tripModal.editId != null ? "Edit trip" : "New trip"}
          </h2>
          <button type="button" className={CLOSE_BUTTON_CLASSES} onClick={closeTripModal}>
            Close
          </button>
        </div>
        <form onSubmit={submitTrip} className="flex flex-col gap-4">
          {tripError && (
            <div className={ERROR_ALERT_CLASSES} role="alert">
              {tripError}
            </div>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className={LABEL_CLASSES}>Trip name</span>
            <input
              required
              type="text"
              className={INPUT_CLASSES}
              value={tripModal.title}
              disabled={saving}
              placeholder="e.g. Rome, Florence & Venice"
              onChange={(e) => setTripModal((m) => ({ ...m, title: e.target.value }))}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className={LABEL_CLASSES}>Start date</span>
              <DatePickerField
                value={tripModal.startDate}
                disabled={saving}
                onChange={(iso) => setTripModal((m) => ({ ...m, startDate: iso }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className={LABEL_CLASSES}># Days</span>
              <input
                required
                type="number"
                min={1}
                className={INPUT_CLASSES}
                value={tripModal.numDays}
                disabled={saving}
                onChange={(e) => setTripModal((m) => ({ ...m, numDays: e.target.value }))}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className={LABEL_CLASSES}>
              Notes <span className="font-normal text-ink-4">(optional)</span>
            </span>
            <textarea
              rows={2}
              className={INPUT_CLASSES}
              value={tripModal.notes}
              disabled={saving}
              onChange={(e) => setTripModal((m) => ({ ...m, notes: e.target.value }))}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON_CLASSES}>
              {saving ? "Saving…" : tripModal.editId != null ? "Save" : "Create"}
            </button>
            <button type="button" disabled={saving} className={SECONDARY_BUTTON_CLASSES} onClick={closeTripModal}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* Place (city) modal */}
      <Modal open={placeModal.open} onClose={closePlaceModal} ariaLabelledBy="travel-place-title">
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 id="travel-place-title" className="text-lg font-semibold text-ink">
            {placeModal.editId != null ? "Edit place" : "Add place"}
          </h2>
          <button type="button" className={CLOSE_BUTTON_CLASSES} onClick={closePlaceModal}>
            Close
          </button>
        </div>
        <form onSubmit={submitPlace} className="flex flex-col gap-4">
          {placeError && (
            <div className={ERROR_ALERT_CLASSES} role="alert">
              {placeError}
            </div>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className={LABEL_CLASSES}>Place or country</span>
            <input
              required
              type="text"
              className={INPUT_CLASSES}
              value={placeModal.name}
              disabled={saving}
              placeholder="e.g. Kyoto, Japan"
              onChange={(e) => setPlaceModal((m) => ({ ...m, name: e.target.value }))}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className={LABEL_CLASSES}>
                From <span className="font-normal text-ink-4">(optional)</span>
              </span>
              <DatePickerField
                value={placeModal.startDate}
                disabled={saving}
                minDate={activeDetail?.trip.start_date}
                maxDate={activeDetail?.trip.end_date}
                anchorDate={activeDetail?.trip.start_date}
                onChange={(iso) => setPlaceModal((m) => ({ ...m, startDate: iso }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className={LABEL_CLASSES}>
                To <span className="font-normal text-ink-4">(optional)</span>
              </span>
              <DatePickerField
                value={placeModal.endDate}
                disabled={saving}
                minDate={activeDetail?.trip.start_date}
                maxDate={activeDetail?.trip.end_date}
                anchorDate={activeDetail?.trip.start_date}
                onChange={(iso) => setPlaceModal((m) => ({ ...m, endDate: iso }))}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON_CLASSES}>
              {saving ? "Saving…" : placeModal.editId != null ? "Save" : "Add"}
            </button>
            <button type="button" disabled={saving} className={SECONDARY_BUTTON_CLASSES} onClick={closePlaceModal}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* Entry modal (flight / transit / activity / stay) */}
      <Modal open={entryModal.open} onClose={closeEntryModal} ariaLabelledBy="travel-entry-title">
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 id="travel-entry-title" className="text-lg font-semibold text-ink">
            {entryModal.editId != null ? "Edit " : "Add "}
            {kindLabels[entryModal.kind]}
          </h2>
          <button type="button" className={CLOSE_BUTTON_CLASSES} onClick={closeEntryModal}>
            Close
          </button>
        </div>
        <form onSubmit={submitEntry} className="flex flex-col gap-4">
          {entryError && (
            <div className={ERROR_ALERT_CLASSES} role="alert">
              {entryError}
            </div>
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span className={LABEL_CLASSES}>Day</span>
            <DatePickerField
              value={activeDetail ? addDaysIso(activeDetail.trip.start_date, entryModal.dayIndex) : ""}
              disabled={saving}
              minDate={activeDetail?.trip.start_date}
              maxDate={activeDetail?.trip.end_date}
              onChange={(iso) =>
                activeDetail &&
                setEntryModal((m) => ({ ...m, dayIndex: dayIndexFor(activeDetail.trip.start_date, iso) }))
              }
            />
            {activeDetail &&
              (() => {
                const city = cityForDate(activeDetail.cities, addDaysIso(activeDetail.trip.start_date, entryModal.dayIndex));
                return city ? <p className="text-xs text-ink-3">{city}</p> : null;
              })()}
          </label>

          {isTransit && (
            <div className="flex gap-2">
              {(["train", "bus", "ferry"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setEntryModal((m) => ({ ...m, kind: mode }))}
                  className={`rounded-lg border px-3.5 py-1.5 text-sm font-semibold capitalize transition-colors ${
                    entryModal.kind === mode
                      ? "border-brand bg-brand text-brand-on"
                      : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          )}

          {entryModal.kind === "flight" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className={LABEL_CLASSES}>Flight number</span>
              <input
                required
                type="text"
                className={INPUT_CLASSES}
                value={entryModal.flightNumber}
                disabled={saving}
                placeholder="e.g. DL 234"
                onChange={(e) => setEntryModal((m) => ({ ...m, flightNumber: e.target.value }))}
              />
            </label>
          )}

          {isTransit && (
            <label className="flex flex-col gap-1 text-sm">
              <span className={LABEL_CLASSES}>
                Number <span className="font-normal text-ink-4">(optional)</span>
              </span>
              <input
                type="text"
                className={INPUT_CLASSES}
                value={entryModal.number}
                disabled={saving}
                placeholder="e.g. FR 9454"
                onChange={(e) => setEntryModal((m) => ({ ...m, number: e.target.value }))}
              />
            </label>
          )}

          {entryModal.kind === "activity" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className={LABEL_CLASSES}>Activity</span>
              <input
                required
                type="text"
                className={INPUT_CLASSES}
                value={entryModal.activity}
                disabled={saving}
                placeholder="e.g. Colosseum tour"
                onChange={(e) => setEntryModal((m) => ({ ...m, activity: e.target.value }))}
              />
            </label>
          )}

          {entryModal.kind === "activity" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className={LABEL_CLASSES}>
                End date <span className="font-normal text-ink-4">(if different — optional)</span>
              </span>
              <DatePickerField
                value={entryModal.activityEndDate}
                disabled={saving}
                placeholder="Same day"
                minDate={addDaysIso(activeDetail?.trip.start_date ?? "", entryModal.dayIndex)}
                anchorDate={addDaysIso(activeDetail?.trip.start_date ?? "", entryModal.dayIndex)}
                onChange={(iso) => setEntryModal((m) => ({ ...m, activityEndDate: iso }))}
              />
            </label>
          )}

          {entryModal.kind === "accommodation" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className={LABEL_CLASSES}>Name</span>
              <input
                required
                type="text"
                className={INPUT_CLASSES}
                value={entryModal.name}
                disabled={saving}
                placeholder="e.g. Hotel Artemide"
                onChange={(e) => setEntryModal((m) => ({ ...m, name: e.target.value }))}
              />
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className={LABEL_CLASSES}>
                {entryModal.kind === "accommodation" ? "Check-in time" : entryModal.kind === "activity" ? "Start time" : "Departure time"}{" "}
                <span className="font-normal text-ink-4">(optional)</span>
              </span>
              <TimeField
                value={entryModal.time1}
                disabled={saving}
                onChange={(hhmm) => setEntryModal((m) => ({ ...m, time1: hhmm }))}
              />
            </label>
            {entryModal.kind !== "accommodation" && (
              <label className="flex flex-col gap-1 text-sm">
                <span className={LABEL_CLASSES}>
                  {entryModal.kind === "activity" ? "End time" : "Arrival time"}{" "}
                  <span className="font-normal text-ink-4">(optional)</span>
                </span>
                <TimeField
                  value={entryModal.time2}
                  disabled={saving}
                  onChange={(hhmm) => setEntryModal((m) => ({ ...m, time2: hhmm }))}
                />
              </label>
            )}
          </div>

          {(entryModal.kind === "flight" || isTransit) && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className={LABEL_CLASSES}>
                  From{" "}
                  <span className="font-normal text-ink-4">
                    {resolvingMapField === "fromLocation" ? "(resolving…)" : "(optional)"}
                  </span>
                </span>
                <input
                  type="text"
                  className={INPUT_CLASSES}
                  value={entryModal.fromLocation}
                  disabled={saving}
                  onChange={(e) =>
                    setEntryModal((m) => ({ ...m, fromLocation: e.target.value, fromMapUrl: "", fromCity: "", fromCountry: "" }))
                  }
                  onBlur={() => void resolveLocationFieldOnBlur("fromLocation", "fromMapUrl", "fromCity", "fromCountry")}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className={LABEL_CLASSES}>
                  To{" "}
                  <span className="font-normal text-ink-4">
                    {resolvingMapField === "toLocation" ? "(resolving…)" : "(optional)"}
                  </span>
                </span>
                <input
                  type="text"
                  className={INPUT_CLASSES}
                  value={entryModal.toLocation}
                  disabled={saving}
                  onChange={(e) =>
                    setEntryModal((m) => ({ ...m, toLocation: e.target.value, toMapUrl: "", toCity: "", toCountry: "" }))
                  }
                  onBlur={() => void resolveLocationFieldOnBlur("toLocation", "toMapUrl", "toCity", "toCountry")}
                />
              </label>
            </div>
          )}

          {(entryModal.kind === "flight" || isTransit) && (
            <label className="flex flex-col gap-1 text-sm">
              <span className={LABEL_CLASSES}>
                Arrival date <span className="font-normal text-ink-4">(if different — optional)</span>
              </span>
              <DatePickerField
                value={entryModal.arrivalDate}
                disabled={saving}
                placeholder="Same day"
                minDate={addDaysIso(activeDetail?.trip.start_date ?? "", entryModal.dayIndex)}
                anchorDate={addDaysIso(activeDetail?.trip.start_date ?? "", entryModal.dayIndex)}
                onChange={(iso) => setEntryModal((m) => ({ ...m, arrivalDate: iso }))}
              />
            </label>
          )}

          {(entryModal.kind === "activity" || entryModal.kind === "accommodation") && (
            <label className="flex flex-col gap-1 text-sm">
              <span className={LABEL_CLASSES}>
                Location{" "}
                <span className="font-normal text-ink-4">
                  {resolvingMapField === "locationName" ? "(resolving…)" : "(optional)"}
                </span>
              </span>
              <input
                type="text"
                className={INPUT_CLASSES}
                value={entryModal.locationName}
                disabled={saving}
                placeholder="Address, place, or a Google Maps link"
                onChange={(e) => setEntryModal((m) => ({ ...m, locationName: e.target.value, locationMapUrl: "" }))}
                onBlur={() => void resolveLocationFieldOnBlur("locationName", "locationMapUrl")}
              />
            </label>
          )}

          {entryModal.kind === "accommodation" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className={LABEL_CLASSES}>Check-out date</span>
                  <DatePickerField
                    value={entryModal.checkoutDate}
                    disabled={saving}
                    minDate={activeDetail ? addDaysIso(activeDetail.trip.start_date, entryModal.dayIndex) : undefined}
                    anchorDate={activeDetail ? addDaysIso(activeDetail.trip.start_date, entryModal.dayIndex) : undefined}
                    onChange={(iso) => setEntryModal((m) => ({ ...m, checkoutDate: iso }))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className={LABEL_CLASSES}>
                    Check-out time <span className="font-normal text-ink-4">(optional)</span>
                  </span>
                  <TimeField
                    value={entryModal.checkoutTime}
                    disabled={saving}
                    onChange={(hhmm) => setEntryModal((m) => ({ ...m, checkoutTime: hhmm }))}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className={LABEL_CLASSES}>
                  Booking confirmation <span className="font-normal text-ink-4">(optional)</span>
                </span>
                <input
                  type="text"
                  className={INPUT_CLASSES}
                  value={entryModal.bookingConfirmation}
                  disabled={saving}
                  onChange={(e) => setEntryModal((m) => ({ ...m, bookingConfirmation: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className={LABEL_CLASSES}>
                  Instructions <span className="font-normal text-ink-4">(optional)</span>
                </span>
                <textarea
                  rows={2}
                  className={INPUT_CLASSES}
                  value={entryModal.instructions}
                  disabled={saving}
                  onChange={(e) => setEntryModal((m) => ({ ...m, instructions: e.target.value }))}
                />
              </label>
            </>
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span className={LABEL_CLASSES}>
              Notes <span className="font-normal text-ink-4">(optional)</span>
            </span>
            <textarea
              rows={2}
              className={INPUT_CLASSES}
              value={entryModal.notes}
              disabled={saving}
              placeholder="Confirmation number, tips, etc."
              onChange={(e) => setEntryModal((m) => ({ ...m, notes: e.target.value }))}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON_CLASSES}>
              {saving ? "Saving…" : entryModal.editId != null ? "Save" : "Add"}
            </button>
            <button type="button" disabled={saving} className={SECONDARY_BUTTON_CLASSES} onClick={closeEntryModal}>
              Cancel
            </button>
            {entryModal.editId != null && entryModal.tripId != null && (
              <button
                type="button"
                aria-label="Delete"
                disabled={saving}
                className={`${VIEW_DELETE_ICON_CLASSES} ml-auto`}
                onClick={() => void onDeleteEntry(entryModal.tripId!, entryModal.kind, entryModal.editId!)}
              >
                <TrashIcon className="size-5" />
              </button>
            )}
          </div>
        </form>
      </Modal>

      {/* View modal — read-only, opens into the entry modal on Edit */}
      <Modal
        open={viewing != null}
        onClose={() => setViewing(null)}
        ariaLabelledBy="travel-view-title"
        dialogClassName="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-pop sm:p-8"
      >
        {viewing && activeDetail && (
          <>
            <div className="mb-4 flex items-baseline justify-between gap-2">
              <span className={`text-sm font-bold tracking-wide ${TYPE_META[viewing.entry.kind].text}`}>
                {TYPE_META[viewing.entry.kind].label}
              </span>
              {viewing.entry.timeLabel && (
                <span className="text-lg font-semibold text-ink-2">{viewing.entry.timeLabel}</span>
              )}
            </div>
            <h2 id="travel-view-title" className="font-serif text-3xl font-semibold leading-snug text-ink">
              {viewing.entry.title}
            </h2>
            {viewing.entry.route && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-base">
                <LocationLink name={viewing.entry.route.from} url={viewing.entry.route.fromUrl} />
                {viewing.entry.route.from && viewing.entry.route.to && <span className="text-ink-4">→</span>}
                <LocationLink name={viewing.entry.route.to} url={viewing.entry.route.toUrl} />
              </div>
            )}
            {viewing.entry.location && (
              <div className="mt-3 text-base">
                <LocationLink name={viewing.entry.location} url={viewing.entry.locationUrl} />
              </div>
            )}
            {viewing.entry.meta && (
              <div className="mt-4 flex flex-wrap gap-5 border-t border-line pt-4">
                {viewing.entry.meta.map((m) => (
                  <div key={m.k} className="text-sm text-ink-2">
                    <span className="text-ink-4">{m.k}:</span> {m.v}
                  </div>
                ))}
              </div>
            )}
            {viewing.entry.notes && (
              <div className="mt-4 whitespace-pre-line text-base italic text-ink-3">{viewing.entry.notes}</div>
            )}

            <div className="mt-8 flex items-center gap-3">
              <button
                type="button"
                aria-label="Edit"
                disabled={saving}
                className={ICON_BUTTON_CLASSES}
                onClick={() => {
                  const entry = viewing.entry;
                  setViewing(null);
                  openEditEntry(activeDetail.trip.id, entry.kind, entry.id);
                }}
              >
                <PencilIcon className="size-6" />
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
