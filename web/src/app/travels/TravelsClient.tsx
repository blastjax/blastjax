"use client";

import Link from "next/link";
import { Source_Serif_4 } from "next/font/google";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { DatePickerField } from "@/components/DatePickerField";
import { Modal } from "@/components/Modal";
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
  getTravelTrips,
  resolveMapLink,
  updateTravelAccommodation,
  updateTravelFlight,
  updateTravelItinerary,
  updateTravelTransport,
  updateTravelTrip,
  type TravelTripDetail,
} from "@/lib/api";
import { toIsoDateLocal } from "@/lib/dateFormat";
import { mapsUrlFor } from "@/lib/maps";

/**
 * Travels, ported 1:1 from the Claude Design "Travel Itinerary v2" file: trip
 * cards → one trip's week-by-week calendar (or day-by-day agenda) → a detail
 * drawer per item, plus the add/edit modals. Colors are the `tv-*` tokens
 * scoped to `.travels-page` in globals.css.
 */

const serif = Source_Serif_4({ subsets: ["latin"], weight: ["600", "700"], variable: "--tv-serif" });

type Kind = "flight" | "train" | "bus" | "ferry" | "activity" | "stay";
type FormKind = "flight" | "transit" | "stay" | "activity";
type Table = "flights" | "transport" | "itinerary" | "accommodations";

const TYPES: Record<Kind, { label: string; h: number }> = {
  flight: { label: "Flight", h: 250 },
  train: { label: "Train", h: 295 },
  bus: { label: "Bus", h: 340 },
  ferry: { label: "Ferry", h: 210 },
  activity: { label: "Activity", h: 75 },
  stay: { label: "Stay", h: 160 },
};
const KINDS = Object.keys(TYPES) as Kind[];
const isRoute = (k: Kind) => k === "flight" || k === "train" || k === "bus" || k === "ferry";
const formKindOf = (k: Kind): FormKind => (k === "flight" || k === "activity" || k === "stay" ? k : "transit");
const tc = (k: Kind) => `oklch(var(--tv-type) ${TYPES[k].h})`;
const tbg = (k: Kind) => `oklch(var(--tv-type-bg) ${TYPES[k].h})`;
const tfg = (k: Kind) => `oklch(var(--tv-type-fg) ${TYPES[k].h})`;
const PH = [185, 15, 255, 60, 135, 320, 95];
const pcol = (i: number) => {
  const h = PH[i % PH.length];
  return { fg: `oklch(var(--tv-place-fg) ${h})`, bg: `oklch(var(--tv-place-bg) ${h})`, dot: `oklch(var(--tv-place-dot) ${h})` };
};

const pd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addD = (s: string, n: number) => {
  const d = pd(s);
  d.setDate(d.getDate() + n);
  return toIsoDateLocal(d);
};
const diffD = (a: string, b: string) => Math.round((pd(b).getTime() - pd(a).getTime()) / 86_400_000);
const fmtD = (s: string) => pd(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtDL = (s: string) => pd(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const rangeOf = (a: string, b: string) => `${fmtD(a)} – ${fmtD(b)}, ${pd(b).getFullYear()}`;
const placeRange = (a: string, b: string) => (a === b ? fmtD(a) : `${fmtD(a)} – ${fmtD(b)}`);
const short = (s: string) => s.split(",")[0].trim();

/** One flight / transit leg / activity / stay, flattened to the design's shape. */
type Entry = {
  key: string;
  table: Table;
  id: number;
  type: Kind;
  title: string;
  from: string;
  to: string;
  /** Calendar labels: the resolved city when a maps link gave one, else the text before the first comma. */
  fromShort: string;
  toShort: string;
  location: string;
  startDate: string;
  startTime: string;
  /** Only set when later than `startDate` — multi-day items span the calendar. */
  endDate: string;
  endTime: string;
  ref: string;
  seat: string;
  conf: string;
  notes: string;
  airline: string;
  terminal: string;
  gate: string;
  baggage: string;
  room: string;
  guests: string;
  bookedVia: string;
  price: string;
  phone: string;
  // Stored but not edited here — carried through an edit untouched.
  fromMapUrl: string;
  fromCity: string;
  fromCountry: string;
  toMapUrl: string;
  toCity: string;
  toCountry: string;
  locationMapUrl: string;
  instructions: string;
};

const s = (v: string | null | undefined) => v ?? "";
const hm = (t: string | null) => (t ? t.slice(0, 5) : "");
const after = (end: string | null, start: string) => (end && end > start ? end : "");

const NO_DETAILS = {
  title: "", from: "", to: "", fromShort: "", toShort: "", location: "", endDate: "", ref: "", seat: "", conf: "",
  notes: "", airline: "", terminal: "", gate: "", baggage: "", room: "", guests: "", bookedVia: "", price: "",
  phone: "", fromMapUrl: "", fromCity: "", fromCountry: "", toMapUrl: "", toCity: "", toCountry: "",
  locationMapUrl: "", instructions: "",
};

type RouteRow = {
  from_location: string | null;
  from_map_url: string | null;
  from_city: string | null;
  from_country: string | null;
  to_location: string | null;
  to_map_url: string | null;
  to_city: string | null;
  to_country: string | null;
};
const routeOf = (r: RouteRow) => ({
  from: s(r.from_location),
  to: s(r.to_location),
  fromShort: r.from_city || short(s(r.from_location)),
  toShort: r.to_city || short(s(r.to_location)),
  fromMapUrl: s(r.from_map_url),
  fromCity: s(r.from_city),
  fromCountry: s(r.from_country),
  toMapUrl: s(r.to_map_url),
  toCity: s(r.to_city),
  toCountry: s(r.to_country),
});

function toEntries(d: TravelTripDetail): Entry[] {
  const out: Entry[] = [];
  for (const f of d.flights) {
    if (!f.flight_date) continue;
    out.push({
      ...NO_DETAILS, ...routeOf(f), key: `flights:${f.id}`, table: "flights", id: f.id, type: "flight", title: s(f.title),
      startDate: f.flight_date, startTime: hm(f.departure_time), endDate: after(f.arrival_date, f.flight_date), endTime: hm(f.arrival_time),
      ref: f.flight_number, seat: s(f.seat), conf: s(f.confirmation), notes: s(f.notes), airline: s(f.airline),
      terminal: s(f.terminal), gate: s(f.gate), baggage: s(f.baggage),
    });
  }
  for (const t of d.transport) {
    if (!t.travel_date) continue;
    out.push({
      ...NO_DETAILS, ...routeOf(t), key: `transport:${t.id}`, table: "transport", id: t.id, type: t.mode, title: s(t.title),
      startDate: t.travel_date, startTime: hm(t.departure_time), endDate: after(t.arrival_date, t.travel_date), endTime: hm(t.arrival_time),
      ref: s(t.number), seat: s(t.seat), conf: s(t.confirmation), notes: s(t.notes), airline: s(t.operator),
      terminal: s(t.travel_class), gate: s(t.platform),
    });
  }
  for (const i of d.itinerary) {
    out.push({
      ...NO_DETAILS, key: `itinerary:${i.id}`, table: "itinerary", id: i.id, type: "activity", title: i.activity,
      location: s(i.location_name), locationMapUrl: s(i.location_map_url),
      startDate: i.item_date, startTime: hm(i.start_time), endDate: after(i.item_end_date, i.item_date), endTime: hm(i.end_time),
      conf: s(i.confirmation), notes: s(i.notes), bookedVia: s(i.booked_via), price: s(i.price),
    });
  }
  for (const a of d.accommodations) {
    out.push({
      ...NO_DETAILS, key: `accommodations:${a.id}`, table: "accommodations", id: a.id, type: "stay", title: a.name,
      location: s(a.location_name), locationMapUrl: s(a.location_map_url),
      startDate: a.checkin_date, startTime: hm(a.checkin_time), endDate: after(a.checkout_date, a.checkin_date), endTime: hm(a.checkout_time),
      conf: s(a.booking_confirmation), notes: s(a.notes), instructions: s(a.instructions), room: s(a.room),
      guests: s(a.guests), phone: s(a.phone), bookedVia: s(a.booked_via), price: s(a.price),
    });
  }
  return out;
}

const isMulti = (e: Entry) => !!e.endDate;
const endOf = (e: Entry) => e.endDate || e.startDate;
const titleOf = (e: Entry, sh: boolean) =>
  e.title || (e.from || e.to ? `${sh ? e.fromShort : e.from} → ${sh ? e.toShort : e.to}` : TYPES[e.type].label);

/** Places keep their insertion-order color; undated ones have `startDate` "" and stay off the calendar. */
type Place = { id: number; name: string; startDate: string; endDate: string; c: ReturnType<typeof pcol> };
const placesOf = (d: TravelTripDetail): Place[] =>
  d.cities.map((c, i) => ({ id: c.id, name: c.name, startDate: s(c.start_date), endDate: s(c.end_date) || s(c.start_date), c: pcol(i) }));

const itemCount = (d: TravelTripDetail) =>
  d.flights.length + d.transport.length + d.itinerary.length + d.accommodations.length;

// --- Calendar layout ---------------------------------------------------------
//
// Each week is a 14-column grid (two half-day columns per day) so a stay that
// checks in at 14:00 starts mid-cell. Rows, top to bottom: day numbers, place
// bands, single-day items that start before the day's first multi-day span,
// the multi-day spans, then the remaining single-day items. Every week gets
// the tallest week's height so rows line up down the page.

type Clip = { c0: number; n: number; cl: boolean; cr: boolean; col: string; radius: string; margin: string; lane: number; row: number };
type Band = Clip & { label: string; bg: string; fg: string };
type Span = Clip & { e: Entry; title: string; startLabel: string; endLabel: string; narrow: boolean; line1: string; line2: string };
type Item = { key: string; title: string; time: string; st: string; bg: string; bd: string };
type Cell = { iso: string; col: string; num: number; wd: string; opacity: number; before: Item[]; after: Item[] };
type Week = {
  ws: string;
  monthHeader: string | null;
  cells: Cell[];
  bands: Band[];
  spans: Span[];
  beforeRow: number;
  beforeH: number;
  itemRow: number;
  itemH: number;
  minH: number;
};

const hOf = (n: number) => (n ? n * 64 + (n - 1) * 5 + 2 : 0);

/** Greedy lane assignment; returns the lane count. */
function pack(segs: Clip[]): number {
  const ends: number[] = [];
  [...segs]
    .sort((a, b) => a.c0 - b.c0 || b.n - a.n)
    .forEach((sg) => {
      let l = 0;
      while (ends[l] !== undefined && ends[l] >= sg.c0) l++;
      ends[l] = sg.c0 + sg.n - 1;
      sg.lane = l;
    });
  return ends.length;
}

function buildWeeks(start: string, end: string, entries: Entry[], places: Place[]): Week[] {
  const gs = addD(start, -pd(start).getDay());
  const ge = addD(end, 6 - pd(end).getDay());
  const ps = places.filter((p) => p.startDate);
  const multis = entries.filter(isMulti);
  const weeks: Week[] = [];
  for (let ws = gs; ws <= ge; ws = addD(ws, 7)) {
    const we = addD(ws, 6);
    // hs/he: the segment starts/ends on a half-day boundary.
    const clip = (a: string, b: string, hs: boolean, he: boolean): Clip | null => {
      if (b < ws || a > we) return null;
      const cl = a < ws;
      const cr = b > we;
      const cs = cl ? ws : a;
      const d0 = diffD(ws, cs);
      const dn = diffD(cs, cr ? we : b) + 1;
      const u0 = 2 * d0 + (hs && !cl ? 1 : 0);
      const u1 = 2 * (d0 + dn) - (he && !cr ? 1 : 0);
      return {
        c0: u0, n: u1 - u0, cl, cr, col: `${u0 + 1} / ${u1 + 1}`,
        radius: `${cl ? 0 : 7}px ${cr ? 0 : 7}px ${cr ? 0 : 7}px ${cl ? 0 : 7}px`,
        margin: `0 ${cr ? 0 : he ? 2 : 4}px 0 ${cl ? 0 : hs ? 2 : 4}px`,
        lane: 0, row: 0,
      };
    };

    const bands: Band[] = ps.flatMap((p) => {
      const c = clip(
        p.startDate,
        p.endDate,
        ps.some((q) => q !== p && q.endDate === p.startDate),
        ps.some((q) => q !== p && q.startDate === p.endDate),
      );
      return c ? [{ ...c, label: c.n < 2 ? "" : p.name, bg: p.c.bg, fg: p.c.fg }] : [];
    });
    const bl = pack(bands);

    const spans: Span[] = multis.flatMap((e) => {
      const hs = (!!e.startTime && e.startTime >= "12:00") || multis.some((q) => q !== e && q.endDate === e.startDate);
      const he = (!!e.endTime && e.endTime <= "12:00") || multis.some((q) => q !== e && q.startDate === e.endDate);
      const route = isRoute(e.type);
      const split = route && (e.startDate < ws || e.endDate > we);
      const c = clip(e.startDate, e.endDate, !split && hs, !split && he);
      if (!c) return [];
      const untitledRoute = route && !e.title;
      const title = untitledRoute && c.cl && e.to ? e.toShort : untitledRoute && c.cr && e.from ? e.fromShort : titleOf(e, true);
      const st = e.startTime;
      const et = e.endTime;
      const base: Span = {
        ...c, e, title, startLabel: c.cl ? "" : st, endLabel: c.cr ? "→" : et ? `→ ${et}` : "",
        narrow: false, line1: "", line2: "",
      };
      if (c.n < 2) return [{ ...base, title: "", startLabel: "", endLabel: "" }];
      if (c.n <= 3 && c.cl && !untitledRoute) return [{ ...base, title: "", startLabel: "" }];
      if (c.n <= 3) {
        let l1: string;
        let l2: string;
        if (untitledRoute) {
          if (c.cr && !c.cl) [l1, l2] = [st, `${e.fromShort} →`];
          else if (c.cl && !c.cr) [l1, l2] = [e.toShort, et ? `→ ${et}` : ""];
          else if (c.cl && c.cr) [l1, l2] = [`${e.fromShort} → ${e.toShort}`, ""];
          else [l1, l2] = [`${st} ${e.fromShort} →`.trim(), `${e.toShort}${et ? ` → ${et}` : ""}`];
        } else {
          l1 = c.cl ? "" : title;
          l2 = c.cl ? (c.cr ? "" : et ? `→ ${et}` : "") : c.cr ? st : [st, et && `→ ${et}`].filter(Boolean).join(" ");
        }
        return [{ ...base, narrow: true, line1: l1, line2: l2 }];
      }
      return [{ ...base, title: c.cl && !untitledRoute ? "" : title }];
    });
    const sl = pack(spans);

    const cells: Cell[] = Array.from({ length: 7 }, (_, i) => {
      const d = addD(ws, i);
      const dt = pd(d);
      const items: Item[] = entries
        .filter((e) => !isMulti(e) && e.startDate === d)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .map((e) => ({
          key: e.key,
          title: titleOf(e, true),
          st: e.startTime,
          time: e.startTime ? (e.endTime ? `${e.startTime}–${e.endTime}` : e.startTime) : "",
          bg: `oklch(var(--tv-item-bg) ${TYPES[e.type].h})`,
          bd: `oklch(var(--tv-item-bd) ${TYPES[e.type].h})`,
        }));
      const firstSpan = multis.filter((q) => q.startDate === d).map((q) => q.startTime || "00:00").sort()[0];
      const before = firstSpan ? items.filter((it) => it.st && it.st < firstSpan) : [];
      return {
        iso: d,
        col: `${2 * i + 1} / span 2`,
        num: dt.getDate(),
        wd: dt.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
        opacity: d >= start && d <= end ? 1 : 0.3,
        before,
        after: items.filter((it) => !before.includes(it)),
      };
    });
    let monthHeader: string | null = null;
    for (const c of cells) {
      if (c.iso >= start && c.iso <= end && (c.num === 1 || c.iso === start)) {
        monthHeader = pd(c.iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
      }
    }

    const nb = Math.max(0, ...cells.map((c) => c.before.length));
    const na = Math.max(0, ...cells.map((c) => c.after.length));
    const off = nb ? 1 : 0;
    for (const b of bands) b.row = 2 + b.lane;
    for (const sp of spans) sp.row = 2 + bl + off + sp.lane;
    const rows = [38, ...Array<number>(bl).fill(22), ...(nb ? [hOf(nb)] : []), ...Array<number>(sl).fill(40), hOf(na)];
    weeks.push({
      ws, monthHeader, cells, bands, spans,
      beforeRow: 2 + bl, beforeH: hOf(nb), itemRow: 2 + bl + off + sl, itemH: hOf(na),
      minH: rows.reduce((x, y) => x + y, 0) + (rows.length - 1) * 5 + 12,
    });
  }
  const maxH = Math.max(0, ...weeks.map((w) => w.minH));
  return weeks.map((w) => ({ ...w, minH: maxH }));
}

function buildAgenda(start: string, end: string, entries: Entry[], places: Place[]) {
  const days = [];
  for (let d = start; d <= end; d = addD(d, 1)) {
    const dt = pd(d);
    const items = entries
      .filter((e) => d >= e.startDate && d <= endOf(e))
      .map((e) => {
        const route = isRoute(e.type);
        const stay = e.type === "stay";
        const pos = !isMulti(e) ? "one" : d === e.startDate ? "start" : d === e.endDate ? "end" : "mid";
        const tag =
          pos === "one" ? TYPES[e.type].label.toUpperCase()
          : pos === "start" ? (stay ? "CHECK-IN" : route ? "DEPARTS" : "STARTS")
          : pos === "end" ? (stay ? "CHECK-OUT" : route ? "ARRIVES" : "ENDS")
          : stay ? `NIGHT ${diffD(e.startDate, d) + 1}` : route ? "IN TRANSIT" : "ONGOING";
        const time =
          pos === "one" ? (e.startTime ? (e.endTime ? `${e.startTime} – ${e.endTime}` : e.startTime) : "All day")
          : pos === "start" ? e.startTime || "All day"
          : pos === "end" ? e.endTime || "All day"
          : "";
        return {
          key: e.key, time, tag, title: titleOf(e, false),
          sub: e.title && route ? `${e.from} → ${e.to}` : e.location || null,
          color: tc(e.type), mid: pos === "mid", sort: pos === "mid" ? "00:00" : time || "99",
        };
      })
      .sort((a, b) => a.sort.localeCompare(b.sort));
    days.push({
      iso: d,
      num: dt.getDate(),
      mon: dt.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
      wd: dt.toLocaleDateString("en-US", { weekday: "long" }),
      places: places.filter((p) => p.startDate && d >= p.startDate && d <= p.endDate),
      items,
    });
  }
  return days;
}

// --- Forms -------------------------------------------------------------------

const FIELDS = [
  "name", "title", "from", "to", "location", "startDate", "startTime", "endDate", "endTime", "ref", "seat", "conf",
  "notes", "airline", "terminal", "gate", "baggage", "room", "guests", "bookedVia", "price", "phone",
] as const;
type Field = (typeof FIELDS)[number];
type Form = Record<Field, string> & { kind: FormKind; type: Kind; orig: Entry | null };
const BLANK: Form = {
  ...(Object.fromEntries(FIELDS.map((k) => [k, ""])) as Record<Field, string>),
  kind: "flight",
  type: "flight",
  orig: null,
};

/** A place field's saved name + maps link (+ city/country for routes). A
 * pasted Google Maps link resolves to its place name and is kept as the
 * link; a field the edit didn't touch keeps what it already had. */
async function placeOf(text: string, prev: string, url: string, city: string, country: string) {
  const name = text.trim();
  if (name === prev) return { name, url, city, country };
  if (!/^https?:\/\//i.test(name)) return { name, url: "", city: "", country: "" };
  try {
    const r = await resolveMapLink(name);
    return { name: r.name ?? name, url: name, city: r.city ?? "", country: r.country ?? "" };
  } catch {
    return { name, url: name, city: "", country: "" };
  }
}

const DELETE: Record<Table, (tripId: number, id: number) => Promise<TravelTripDetail>> = {
  flights: deleteTravelFlight,
  transport: deleteTravelTransport,
  itinerary: deleteTravelItinerary,
  accommodations: deleteTravelAccommodation,
};

const n = (v: string) => v.trim() || null;

const ACCENT = "cursor-pointer rounded-lg bg-tv-accent text-[13px] font-semibold text-tv-accent-on disabled:opacity-60";
const GHOST = "cursor-pointer rounded-lg border border-tv-line-3 px-4 py-[9px] text-[13px] font-semibold text-tv-2";
const INPUT = "rounded-lg border border-tv-line-3 bg-tv-well px-[11px] text-[13.5px] text-tv-1 outline-none focus:border-tv-focus";
const CAP = "text-[11px] font-semibold tracking-[.06em] text-tv-6";
const BACKDROP = "fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-5";
const POPOVER = "border-tv-line-3 bg-tv-menu shadow-[0_12px_30px_rgba(0,0,0,.12)] dark:shadow-[0_12px_30px_rgba(0,0,0,.5)]";

function FormField({ label, wide, children }: { label: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`flex flex-col gap-[5px] text-xs text-tv-5 ${wide ? "col-span-full" : ""}`}>
      {label}
      {children}
    </label>
  );
}

export default function TravelsClient() {
  const [trips, setTrips] = useState<TravelTripDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "trip">("list");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [mode, setMode] = useState<"calendar" | "agenda">("calendar");
  const [drawerKey, setDrawerKey] = useState<string | null>(null);
  const [modal, setModal] = useState<"entry" | "trip" | "place" | null>(null);
  const [f, setF] = useState<Form>(BLANK);
  const [addMenu, setAddMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTravelTrips(500)
      .then((r) => setTrips(r.trips))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load trips"))
      .finally(() => setLoading(false));
  }, []);

  // Modal handles Escape for the drawer and dialogs; the add menu isn't one.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAddMenu(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const closeAll = () => {
    setDrawerKey(null);
    setModal(null);
    setAddMenu(false);
    setError(null);
  };

  const trip = view === "trip" ? (trips.find((t) => t.trip.id === activeId) ?? null) : null;
  const entries = trip ? toEntries(trip) : [];
  const places = trip ? placesOf(trip) : [];
  const detail = entries.find((e) => e.key === drawerKey) ?? null;
  const inTrip = (iso: string) => !!trip && iso >= trip.trip.start_date && iso <= trip.trip.end_date;

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const upsert = (d: TravelTripDetail) =>
    setTrips((ts) => (ts.some((t) => t.trip.id === d.trip.id) ? ts.map((t) => (t.trip.id === d.trip.id ? d : t)) : [...ts, d]));

  /** Stores `d`, first stretching its trip to cover [a, b] like the design does. */
  const commit = async (d: TravelTripDetail, a: string, b: string) => {
    const t = d.trip;
    if (a < t.start_date || b > t.end_date) {
      d = await updateTravelTrip(t.id, {
        title: t.title,
        start_date: a < t.start_date ? a : t.start_date,
        end_date: b > t.end_date ? b : t.end_date,
        notes: t.notes,
      });
    }
    upsert(d);
  };

  const openTrip = (id: number) => {
    setView("trip");
    setActiveId(id);
    setDrawerKey(null);
  };
  const backToList = () => {
    setView("list");
    setDrawerKey(null);
  };

  const openEntry = (kind: FormKind, e?: Entry) => {
    if (!trip) return;
    setError(null);
    setAddMenu(false);
    setDrawerKey(null);
    setF(
      e
        ? { ...BLANK, ...e, kind: formKindOf(e.type), orig: e }
        : { ...BLANK, kind, type: kind === "transit" ? "train" : kind, startDate: trip.trip.start_date },
    );
    setModal("entry");
  };
  const openSmall = (which: "trip" | "place") => {
    setError(null);
    setAddMenu(false);
    setF(trip && which === "place" ? { ...BLANK, startDate: trip.trip.start_date, endDate: trip.trip.end_date } : BLANK);
    setModal(which);
  };

  const saveEntry = () =>
    run(async () => {
      if (!trip) return;
      if (!f.startDate) throw new Error("Pick a start date.");
      const o = f.orig;
      const tid = trip.trip.id;
      const endDate = f.endDate > f.startDate ? f.endDate : "";
      const [from, to, loc] = await Promise.all([
        placeOf(f.from, o?.from ?? "", o?.fromMapUrl ?? "", o?.fromCity ?? "", o?.fromCountry ?? ""),
        placeOf(f.to, o?.to ?? "", o?.toMapUrl ?? "", o?.toCity ?? "", o?.toCountry ?? ""),
        placeOf(f.location, o?.location ?? "", o?.locationMapUrl ?? "", "", ""),
      ]);
      const ends = {
        from_location: n(from.name), from_map_url: n(from.url), from_city: n(from.city), from_country: n(from.country),
        to_location: n(to.name), to_map_url: n(to.url), to_city: n(to.city), to_country: n(to.country),
      };
      const startTime = f.startTime || null;
      const endTime = f.endTime || null;
      let table: Table;
      let d: TravelTripDetail;
      if (f.kind === "flight") {
        table = "flights";
        const body = {
          flight_number: f.ref.trim(), flight_date: f.startDate, arrival_date: endDate || null,
          departure_time: startTime, arrival_time: endTime, ...ends, notes: n(f.notes), title: n(f.title),
          airline: n(f.airline), seat: n(f.seat), terminal: n(f.terminal), gate: n(f.gate), baggage: n(f.baggage),
          confirmation: n(f.conf),
        };
        d = o ? await updateTravelFlight(tid, o.id, body) : await createTravelFlight(tid, body);
      } else if (f.kind === "transit") {
        table = "transport";
        const body = {
          mode: f.type as "train" | "bus" | "ferry", number: n(f.ref), travel_date: f.startDate, arrival_date: endDate || null,
          departure_time: startTime, arrival_time: endTime, ...ends, notes: n(f.notes), title: n(f.title),
          operator: n(f.airline), seat: n(f.seat), travel_class: n(f.terminal), platform: n(f.gate), confirmation: n(f.conf),
        };
        d = o ? await updateTravelTransport(tid, o.id, body) : await createTravelTransport(tid, body);
      } else if (f.kind === "activity") {
        table = "itinerary";
        const body = {
          item_date: f.startDate, item_end_date: endDate || null, start_time: startTime, end_time: endTime,
          activity: f.title.trim(), location_name: n(loc.name), location_map_url: n(loc.url), notes: n(f.notes),
          booked_via: n(f.bookedVia), price: n(f.price), confirmation: n(f.conf),
        };
        d = o ? await updateTravelItinerary(tid, o.id, body) : await createTravelItinerary(tid, body);
      } else {
        table = "accommodations";
        const body = {
          name: f.title.trim(), checkin_date: f.startDate, checkout_date: endDate || f.startDate,
          checkin_time: startTime, checkout_time: endTime, booking_confirmation: n(f.conf),
          instructions: o?.instructions || null, location_name: n(loc.name), location_map_url: n(loc.url),
          notes: n(f.notes), room: n(f.room), guests: n(f.guests), phone: n(f.phone), booked_via: n(f.bookedVia),
          price: n(f.price),
        };
        d = o ? await updateTravelAccommodation(tid, o.id, body) : await createTravelAccommodation(tid, body);
      }
      // A new row's id is the one the refreshed detail has that the old one didn't.
      const before = new Set((trip[table] as { id: number }[]).map((r) => r.id));
      const id = o?.id ?? (d[table] as { id: number }[]).find((r) => !before.has(r.id))?.id;
      await commit(d, f.startDate, endDate || f.startDate);
      setModal(null);
      setDrawerKey(id != null ? `${table}:${id}` : null);
    });

  const saveSmall = () =>
    run(async () => {
      const name = f.name.trim();
      if (!name || !f.startDate) {
        throw new Error(modal === "trip" ? "Enter a trip name and a start date." : "Enter a place and a start date.");
      }
      const endDate = f.endDate && f.endDate >= f.startDate ? f.endDate : f.startDate;
      if (modal === "trip") {
        const d = await createTravelTrip({ title: name, start_date: f.startDate, end_date: endDate });
        upsert(d);
        openTrip(d.trip.id);
      } else if (trip) {
        const d = await createTravelCity(trip.trip.id, { name, start_date: f.startDate, end_date: endDate });
        await commit(d, f.startDate, endDate);
      }
      setModal(null);
    });

  const deleteEntry = (e: Entry) => {
    if (!trip || !confirm("Delete this item?")) return;
    void run(async () => {
      upsert(await DELETE[e.table](trip.trip.id, e.id));
      setDrawerKey(null);
    });
  };
  const removePlace = (id: number) => {
    if (!trip) return;
    void run(async () => upsert(await deleteTravelCity(trip.trip.id, id)));
  };

  const on = (k: Field) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = ev.target.value;
    setF((x) => ({ ...x, [k]: v }));
  };
  const txt = (k: Field, placeholder: string) => (
    <input className={`${INPUT} py-[9px]`} value={f[k]} onChange={on(k)} placeholder={placeholder} />
  );
  const dateTime = (k: Field, type: "date" | "time") => (
    <input type={type} className={`${INPUT} py-2`} value={f[k]} onChange={on(k)} />
  );
  const errorLine = error && (
    <p role="alert" className="text-[13px] text-tv-danger">
      {error}
    </p>
  );

  // --- List ---

  const renderList = () => (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold tracking-[.04em] text-tv-5">YOUR TRIPS</h2>
        <button type="button" onClick={() => openSmall("trip")} className={`${ACCENT} px-3.5 py-2`}>
          + New trip
        </button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-4">
        {[...trips]
          .sort((a, b) => a.trip.start_date.localeCompare(b.trip.start_date))
          .map((d) => {
            const t = d.trip;
            const total = diffD(t.start_date, t.end_date) + 1;
            const ps = placesOf(d);
            return (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => openTrip(t.id)}
                onKeyDown={(e) => e.key === "Enter" && openTrip(t.id)}
                className="flex cursor-pointer flex-col gap-3.5 rounded-[14px] border border-tv-line bg-tv-card p-5 hover:border-tv-line-4 hover:bg-tv-card-hover"
              >
                <div>
                  <div className="font-tv-serif text-[22px] font-bold">{t.title}</div>
                  <div className="mt-1 text-[13px] text-tv-5">
                    {rangeOf(t.start_date, t.end_date)} · {total} days
                  </div>
                </div>
                <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-[3px] bg-tv-chip">
                  {ps
                    .filter((p) => p.startDate)
                    .map((p) => (
                      <span
                        key={p.id}
                        style={{ width: `${((diffD(p.startDate, p.endDate) + 1) / total) * 100}%`, background: p.c.dot }}
                      />
                    ))}
                </div>
                <div className="flex flex-wrap gap-x-3.5 gap-y-1.5">
                  {ps.map((p) => (
                    <span key={p.id} className="flex items-center gap-1.5 text-[12.5px] text-tv-2">
                      <span className="size-[7px] rounded-full" style={{ background: p.c.dot }} />
                      {p.name}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-tv-6">{itemCount(d)} items planned</div>
              </div>
            );
          })}
        <button
          type="button"
          onClick={() => openSmall("trip")}
          className="flex min-h-[170px] cursor-pointer items-center justify-center rounded-[14px] border-[1.5px] border-dashed border-tv-line-3 font-medium text-tv-5 hover:border-tv-8 hover:text-tv-1"
        >
          + New trip
        </button>
      </div>
    </>
  );

  // --- Trip ---

  const itemStack = (items: Item[], col: string, row: number, h: number, pad: string, key: string) => (
    <div key={key} className={`flex flex-col gap-[5px] overflow-hidden ${pad}`} style={{ gridColumn: col, gridRow: row, height: h }}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          title={it.title}
          onClick={() => setDrawerKey(it.key)}
          className="flex h-16 shrink-0 cursor-pointer flex-col gap-[3px] overflow-hidden rounded-lg border px-[9px] py-[7px] text-left hover:brightness-95 dark:hover:brightness-[1.2]"
          style={{ background: it.bg, borderColor: it.bd }}
        >
          <span className="w-full truncate text-[11.5px] font-semibold tabular-nums text-tv-3">{it.time}</span>
          <span className="line-clamp-2 text-[12.5px] font-semibold leading-[1.3] text-tv-0">{it.title}</span>
        </button>
      ))}
    </div>
  );

  const renderCalendar = (t: TravelTripDetail) => (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        {buildWeeks(t.trip.start_date, t.trip.end_date, entries, places).map((w) => (
          <Fragment key={w.ws}>
            {w.monthHeader && <div className="px-0.5 pb-2.5 pt-[22px] font-tv-serif text-xl font-bold">{w.monthHeader}</div>}
            <div
              className="grid grid-cols-[repeat(14,minmax(0,1fr))] content-start gap-y-[5px] border-b border-tv-line pb-3"
              style={{
                minHeight: w.minH,
                backgroundImage: "linear-gradient(to right, var(--tv-grid) 1px, transparent 1px)",
                backgroundSize: "calc(100% / 7) 100%",
              }}
            >
              {w.cells.map((c) => (
                <div
                  key={c.iso}
                  className="flex items-baseline gap-1.5 px-2.5 pb-1 pt-2.5"
                  style={{ gridColumn: c.col, gridRow: 1, opacity: c.opacity }}
                >
                  <span className="text-lg font-semibold tabular-nums text-tv-1">{c.num}</span>
                  <span className="text-[10.5px] font-semibold tracking-[.08em] text-tv-6">{c.wd}</span>
                </div>
              ))}
              {w.bands.map((b, i) => (
                <div
                  key={`band-${i}`}
                  className="flex h-[22px] items-center overflow-hidden whitespace-nowrap px-2.5 text-[11.5px] font-semibold"
                  style={{ gridColumn: b.col, gridRow: b.row, margin: b.margin, borderRadius: b.radius, background: b.bg, color: b.fg }}
                >
                  <span className="min-w-0 truncate">{b.label}</span>
                </div>
              ))}
              {w.spans.map((sp) => (
                <button
                  key={sp.e.key}
                  type="button"
                  title={titleOf(sp.e, false)}
                  onClick={() => setDrawerKey(sp.e.key)}
                  className="flex h-10 cursor-pointer items-center gap-2 overflow-hidden whitespace-nowrap px-2.5 text-left text-[12.5px] hover:brightness-95 dark:hover:brightness-[1.18]"
                  style={{
                    gridColumn: sp.col, gridRow: sp.row, margin: sp.margin, borderRadius: sp.radius,
                    background: tbg(sp.e.type), color: tfg(sp.e.type),
                  }}
                >
                  {sp.narrow ? (
                    <span className="flex min-w-0 flex-1 flex-col gap-px leading-[1.2]">
                      <span className="truncate text-[11.5px] font-semibold tabular-nums">{sp.line1}</span>
                      <span className="truncate text-[11px] font-semibold tabular-nums opacity-80">{sp.line2}</span>
                    </span>
                  ) : (
                    <>
                      <span className="shrink-0 text-[11.5px] tabular-nums opacity-75">{sp.startLabel}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{sp.title}</span>
                      <span className="shrink-0 text-[11.5px] tabular-nums opacity-75">{sp.endLabel}</span>
                    </>
                  )}
                </button>
              ))}
              {w.cells.map((c) => itemStack(c.before, c.col, w.beforeRow, w.beforeH, "px-1", `before-${c.iso}`))}
              {w.cells.map((c) => itemStack(c.after, c.col, w.itemRow, w.itemH, "px-1 pt-0.5", `after-${c.iso}`))}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );

  const renderAgenda = (t: TravelTripDetail) =>
    buildAgenda(t.trip.start_date, t.trip.end_date, entries, places).map((d) => (
      <div key={d.iso} className="grid grid-cols-[120px_minmax(0,1fr)] gap-6 border-t border-tv-line py-[18px]">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[26px] font-semibold leading-none tabular-nums">{d.num}</span>
            <span className="text-xs font-semibold tracking-[.06em] text-tv-5">{d.mon}</span>
          </div>
          <div className="mt-1 text-[12.5px] text-tv-6">{d.wd}</div>
          <div className="mt-2 flex flex-col items-start gap-1">
            {d.places.map((p) => (
              <span
                key={p.id}
                className="rounded-[10px] px-2 py-0.5 text-[11.5px] font-semibold"
                style={{ background: p.c.bg, color: p.c.fg }}
              >
                {p.name}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          {d.items.map((it) => (
            <button
              key={it.key}
              type="button"
              onClick={() => setDrawerKey(it.key)}
              className={`grid cursor-pointer grid-cols-[92px_8px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] border border-tv-line px-3.5 py-[11px] text-left hover:border-tv-line-4 ${it.mid ? "" : "bg-tv-card"}`}
            >
              <span className="text-[12.5px] tabular-nums text-tv-4">{it.time}</span>
              <span className="size-2 rounded-full" style={{ background: it.color }} />
              <span className="min-w-0">
                <span className={`block truncate text-sm font-medium ${it.mid ? "text-tv-5" : "text-tv-1"}`}>{it.title}</span>
                {it.sub && <span className="mt-0.5 block truncate text-[12.5px] text-tv-6">{it.sub}</span>}
              </span>
              <span className="text-[11px] font-semibold tracking-[.04em]" style={{ color: it.color }}>
                {it.tag}
              </span>
            </button>
          ))}
          {!d.items.length && <div className="py-2.5 text-[13px] text-tv-7">Free day</div>}
        </div>
      </div>
    ));

  const addOptions: { label: string; color: string; onClick: () => void }[] = [
    { label: "Flight", color: tc("flight"), onClick: () => openEntry("flight") },
    { label: "Stay", color: tc("stay"), onClick: () => openEntry("stay") },
    { label: "Activity", color: tc("activity"), onClick: () => openEntry("activity") },
    { label: "Train, bus or ferry", color: tc("train"), onClick: () => openEntry("transit") },
    { label: "Place", color: pcol(0).dot, onClick: () => openSmall("place") },
  ];

  const renderTrip = (t: TravelTripDetail) => (
    <>
      <button type="button" onClick={backToList} className="mb-[18px] cursor-pointer text-[13px] text-tv-5 hover:text-tv-1">
        ← All trips
      </button>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h2 className="font-tv-serif text-4xl font-bold leading-[1.1] tracking-[-.01em]">{t.trip.title}</h2>
          <div className="mt-2 text-sm text-tv-5">
            {rangeOf(t.trip.start_date, t.trip.end_date)} · {diffD(t.trip.start_date, t.trip.end_date) + 1} days · {itemCount(t)} items
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex rounded-[9px] border border-tv-line bg-tv-card p-[3px]">
            {(["calendar", "agenda"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-[12.5px] font-semibold capitalize ${mode === m ? "bg-tv-line-2 text-tv-1" : "text-tv-5"}`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="relative">
            <button type="button" aria-expanded={addMenu} onClick={() => setAddMenu((v) => !v)} className={`${ACCENT} px-3.5 py-2`}>
              + Add
            </button>
            {addMenu && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[180px] rounded-[10px] border border-tv-line-3 bg-tv-menu p-[5px] shadow-[0_12px_30px_rgba(0,0,0,.12)] dark:shadow-[0_12px_30px_rgba(0,0,0,.5)]">
                {addOptions.map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    onClick={o.onClick}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-left text-[13px] hover:bg-tv-line"
                  >
                    <span className="size-2 rounded-full" style={{ background: o.color }} />
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mb-3.5 mt-5 flex flex-wrap gap-2">
        {[...places]
          .sort((a, b) => (a.startDate || "~").localeCompare(b.startDate || "~") || a.endDate.localeCompare(b.endDate))
          .map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 whitespace-nowrap rounded-[20px] py-[5px] pl-3 pr-2 text-[12.5px]"
              style={{ background: p.c.bg, color: p.c.fg }}
            >
              <span className="font-semibold">{p.name}</span>
              {p.startDate && <span className="opacity-75">{placeRange(p.startDate, p.endDate)}</span>}
              <button
                type="button"
                title="Remove"
                aria-label={`Remove ${p.name}`}
                disabled={saving}
                onClick={() => removePlace(p.id)}
                className="flex size-[18px] cursor-pointer items-center justify-center rounded-full opacity-60 hover:bg-current/10 hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        <button
          type="button"
          onClick={() => openSmall("place")}
          className="cursor-pointer whitespace-nowrap rounded-[20px] border border-dashed border-tv-line-4 px-3 py-[5px] text-[12.5px] font-medium text-tv-4 hover:border-tv-7 hover:text-tv-1"
        >
          + Place
        </button>
      </div>

      <div className="mb-[26px] flex flex-wrap gap-[22px]">
        {KINDS.map((k) => (
          <span key={k} className="flex items-center gap-2 text-sm font-medium text-tv-2">
            <span className="size-3 rounded-full" style={{ background: tc(k) }} />
            {TYPES[k].label}
          </span>
        ))}
      </div>

      {mode === "calendar" ? renderCalendar(t) : renderAgenda(t)}
    </>
  );

  // --- Drawer ---

  const renderDrawer = (e: Entry) => {
    const fl = e.type === "flight";
    const route = isRoute(e.type);
    const stay = e.type === "stay";
    const fields = (
      [
        [fl ? "AIRLINE" : "OPERATOR", e.airline],
        [fl ? "FLIGHT NO." : "SERVICE NO.", e.ref],
        ["SEAT", e.seat],
        [fl ? "TERMINAL" : "CLASS", e.terminal],
        [fl ? "GATE" : "PLATFORM", e.gate],
        ["BAGGAGE", e.baggage],
        ["ROOM", e.room],
        ["GUESTS", e.guests],
        ["BOOKED VIA", e.bookedVia],
        ["PRICE", e.price],
        ["PHONE", e.phone],
        ["CONFIRMATION", e.conf],
      ] as const
    ).filter(([, v]) => v);
    const nights = stay && isMulti(e) ? diffD(e.startDate, e.endDate) : 0;
    const subtitle = nights ? `${nights} night${nights > 1 ? "s" : ""}` : e.title && route ? `${e.from} → ${e.to}` : null;
    const notes = [e.instructions, e.notes].filter(Boolean).join("\n\n");
    const mapUrl = mapsUrlFor(e.location, e.locationMapUrl);
    const edit = () => openEntry(formKindOf(e.type), e);
    const endpoint = (cap: string, time: string, date: string, place: string, right?: boolean) => (
      <div className={right ? "text-right" : ""}>
        <div className={CAP}>{cap}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{time || "—"}</div>
        <div className="mt-0.5 text-[12.5px] text-tv-4">{fmtDL(date)}</div>
        <div className="mt-2 text-[13px] leading-[1.35] text-tv-1">{route ? place : ""}</div>
      </div>
    );
    return (
      <>
        <div className="flex items-center justify-between border-b border-tv-line px-5 py-4">
          <span className="flex items-center gap-2 text-xs font-semibold tracking-[.06em]" style={{ color: tc(e.type) }}>
            <span className="size-2 rounded-full" style={{ background: tc(e.type) }} />
            {TYPES[e.type].label.toUpperCase()}
          </span>
          <button type="button" aria-label="Close" onClick={closeAll} className="size-[30px] cursor-pointer rounded-lg bg-tv-chip text-base text-tv-2">
            ×
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-[22px]">
          <div>
            <h2 id="tv-drawer-title" className="text-pretty text-[22px] font-semibold leading-[1.3]">
              {titleOf(e, false)}
            </h2>
            {subtitle && <div className="mt-1.5 text-[13px] text-tv-5">{subtitle}</div>}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3.5 rounded-xl border border-tv-line bg-tv-well p-4">
            {endpoint(route ? "DEPART" : stay ? "CHECK-IN" : "START", e.startTime, e.startDate, e.from)}
            <div className="pt-[22px] text-lg text-tv-8">→</div>
            {endpoint(route ? "ARRIVE" : stay ? "CHECK-OUT" : "END", e.endTime, endOf(e), e.to, true)}
          </div>
          {e.location && (
            <div>
              <div className={`${CAP} mb-1.5`}>LOCATION</div>
              <div className="text-sm">{e.location}</div>
              {mapUrl && (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-[13px] text-tv-link hover:text-tv-link-hover hover:underline"
                >
                  Open in Google Maps ↗
                </a>
              )}
            </div>
          )}
          {fields.length ? (
            <>
              <div className={`${CAP} -mb-2`}>{fl ? "FLIGHT DETAILS" : route ? "TRIP DETAILS" : stay ? "STAY DETAILS" : "BOOKING"}</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 rounded-xl border border-tv-line bg-tv-well p-4">
                {fields.map(([k, v]) => (
                  <div key={k}>
                    <div className={`${CAP} mb-1`}>{k}</div>
                    <div className="text-sm">{v}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={edit}
              className="cursor-pointer rounded-[10px] border border-dashed border-tv-line-3 px-3.5 py-3 text-left text-[13px] text-tv-5"
            >
              No booking details yet. Click to add them.
            </button>
          )}
          {notes && (
            <div>
              <div className={`${CAP} mb-1.5`}>NOTES</div>
              <div className="whitespace-pre-wrap text-sm leading-normal text-tv-2">{notes}</div>
            </div>
          )}
          {errorLine}
        </div>
        <div className="flex justify-between gap-2.5 border-t border-tv-line px-5 py-3.5">
          <button
            type="button"
            disabled={saving}
            onClick={() => deleteEntry(e)}
            className="cursor-pointer rounded-lg border border-tv-danger-line px-3.5 py-[9px] text-[13px] font-semibold text-tv-danger"
          >
            Delete
          </button>
          <button type="button" onClick={edit} className={`${ACCENT} px-[18px] py-[9px]`}>
            Edit
          </button>
        </div>
      </>
    );
  };

  // --- Modals ---

  const route = f.kind === "flight" || f.kind === "transit";
  const fl = f.kind === "flight";
  const startCap = route ? "Departure" : f.kind === "stay" ? "Check-in" : "Start";
  const endCap = route ? "Arrival" : f.kind === "stay" ? "Check-out" : "End";
  const buttons = (cta: string) => (
    <div className="mt-1 flex justify-end gap-2.5">
      <button type="button" onClick={closeAll} className={GHOST}>
        Cancel
      </button>
      <button type="submit" disabled={saving} className={`${ACCENT} px-[18px] py-[9px]`}>
        {saving ? "Saving…" : cta}
      </button>
    </div>
  );

  return (
    <div className={`travels-page ${serif.variable} mx-auto w-full max-w-[1280px] px-4 pb-20 pt-8 text-tv-1 sm:px-10`}>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-[22px] font-bold">Travels</h1>
          <p className="mt-1 max-w-[620px] text-pretty text-[13px] text-tv-5">
            Trips laid out day by day. Flights, stays, activities, and transit on one calendar per trip. Location links
            open in Google Maps.
          </p>
        </div>
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-tv-5">
          <Link href="/" className="hover:text-tv-1">
            Home
          </Link>
          <span className="text-tv-8">›</span>
          <button type="button" onClick={backToList} className="cursor-pointer text-tv-link">
            Travels
          </button>
        </nav>
      </div>

      {!modal && !detail && error && <div className="mb-4">{errorLine}</div>}
      {!loading && (trip ? renderTrip(trip) : renderList())}

      <Modal
        open={!!detail}
        onClose={closeAll}
        ariaLabelledBy="tv-drawer-title"
        backdropClassName="fixed inset-0 z-[70] bg-black/50"
        dialogClassName="fixed inset-y-0 right-0 flex w-[440px] max-w-[100vw] flex-col border-l border-tv-line-2 bg-tv-card"
      >
        {detail && renderDrawer(detail)}
      </Modal>

      <Modal
        open={modal === "entry"}
        onClose={closeAll}
        ariaLabelledBy="tv-entry-title"
        backdropClassName={BACKDROP}
        dialogClassName="max-h-[90vh] w-[480px] max-w-full overflow-y-auto rounded-[14px] border border-tv-line-2 bg-tv-card p-6"
      >
        <form
          className="flex flex-col gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void saveEntry();
          }}
        >
          <h2 id="tv-entry-title" className="text-lg font-semibold">
            {f.orig ? "Edit" : "Add"} {f.kind}
          </h2>
          {f.kind === "transit" && (
            <div className="flex gap-1.5">
              {(["train", "bus", "ferry"] as const).map((m) => {
                const a = f.type === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setF((x) => ({ ...x, type: m }))}
                    className="flex-1 cursor-pointer rounded-lg border p-2 text-[13px] font-semibold"
                    style={{
                      borderColor: a ? tc(m) : "var(--tv-line-3)",
                      background: a ? tbg(m) : "transparent",
                      color: a ? tfg(m) : "var(--tv-4)",
                    }}
                  >
                    {TYPES[m].label}
                  </button>
                );
              })}
            </div>
          )}
          {route && (
            <div className="grid grid-cols-2 gap-2.5">
              <FormField label="From">{txt("from", "e.g. Bangkok")}</FormField>
              <FormField label="To">{txt("to", "e.g. Chiang Mai")}</FormField>
            </div>
          )}
          <FormField label={route ? "Title (optional)" : "Name"}>
            {txt("title", route ? "Defaults to From → To" : f.kind === "stay" ? "e.g. Luk Hostel" : "e.g. Cooking class")}
          </FormField>
          {!route && <FormField label="Location">{txt("location", "Address or place name")}</FormField>}
          <div className="grid grid-cols-[1.3fr_1fr] gap-2.5">
            <FormField label={`${startCap} date`}>
              <DatePickerField
                value={f.startDate}
                className={`${INPUT} py-2`}
                popoverClassName={POPOVER}
                highlightDay={inTrip}
                highlightLabel="Trip dates"
                // An end date that no longer comes after the start is dropped.
                onChange={(iso) => setF((x) => ({ ...x, startDate: iso, endDate: x.endDate > iso ? x.endDate : "" }))}
              />
            </FormField>
            <FormField label="Time">{dateTime("startTime", "time")}</FormField>
            <FormField label={`${endCap} date`}>
              <DatePickerField
                value={f.endDate}
                className={`${INPUT} py-2`}
                popoverClassName={POPOVER}
                rangeFrom={f.startDate}
                placeholder="Same day"
                clearLabel="Same day"
                highlightDay={(iso) => inTrip(iso) && iso > f.startDate}
                highlightLabel={`Trip dates after ${startCap.toLowerCase()}`}
                onChange={(iso) => setF((x) => ({ ...x, endDate: iso }))}
              />
            </FormField>
            <FormField label="Time">{dateTime("endTime", "time")}</FormField>
          </div>
          <p className="-mt-1.5 text-[11.5px] text-tv-7">
            Leave the end date empty if it ends the same day. Multi-day items span across the calendar.
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {route && (
              <>
                <FormField wide label={fl ? "Airline" : "Operator"}>
                  {txt("airline", fl ? "e.g. Cebu Pacific" : "e.g. State Railway of Thailand")}
                </FormField>
                <FormField label={fl ? "Flight no." : "Train / service no."}>{txt("ref", "e.g. DL 234")}</FormField>
                <FormField label="Seat">{txt("seat", "e.g. 14C")}</FormField>
                <FormField label={fl ? "Terminal" : "Class"}>{txt("terminal", fl ? "e.g. T3" : "e.g. 2nd class sleeper")}</FormField>
                <FormField label={fl ? "Gate" : "Platform"}>{txt("gate", "e.g. 5")}</FormField>
              </>
            )}
            {fl && (
              <FormField wide label="Baggage">
                {txt("baggage", "e.g. 20 kg checked")}
              </FormField>
            )}
            {f.kind === "stay" && (
              <>
                <FormField label="Room">{txt("room", "e.g. Deluxe Double")}</FormField>
                <FormField label="Guests">{txt("guests", "e.g. 2 adults")}</FormField>
                <FormField wide label="Phone">
                  {txt("phone", "Property contact")}
                </FormField>
              </>
            )}
            {!route && (
              <>
                <FormField label="Booked via">{txt("bookedVia", "e.g. Agoda")}</FormField>
                <FormField label="Price">{txt("price", "e.g. THB 4,200 · paid")}</FormField>
              </>
            )}
            <FormField wide label="Confirmation #">
              {txt("conf", "Booking reference")}
            </FormField>
          </div>
          <FormField label="Notes">
            <textarea
              className={`${INPUT} min-h-16 resize-y py-[9px]`}
              value={f.notes}
              onChange={on("notes")}
              placeholder="Gate, tips, reminders"
            />
          </FormField>
          {errorLine}
          {buttons("Save")}
        </form>
      </Modal>

      <Modal
        open={modal === "trip" || modal === "place"}
        onClose={closeAll}
        ariaLabelledBy="tv-small-title"
        backdropClassName={BACKDROP}
        dialogClassName="w-[400px] max-w-full rounded-[14px] border border-tv-line-2 bg-tv-card p-6"
      >
        <form
          className="flex flex-col gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void saveSmall();
          }}
        >
          <h2 id="tv-small-title" className="text-lg font-semibold">
            {modal === "trip" ? "New trip" : "Add place"}
          </h2>
          <FormField label={modal === "trip" ? "Trip name" : "Place or country"}>
            {txt("name", modal === "trip" ? "e.g. Japan in spring" : "e.g. Kyoto, Japan")}
          </FormField>
          <div className="grid grid-cols-2 gap-2.5">
            <FormField label="From">{dateTime("startDate", "date")}</FormField>
            <FormField label="To">{dateTime("endDate", "date")}</FormField>
          </div>
          {errorLine}
          {buttons(modal === "trip" ? "Create trip" : "Add place")}
        </form>
      </Modal>
    </div>
  );
}
