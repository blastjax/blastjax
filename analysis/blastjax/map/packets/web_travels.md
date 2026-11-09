# Node web:travels: /travels
Kind: module
Language: typescript, 1300 lines of code, location: web/src/app/travels

Files in this directory (largest first):
- web/src/app/travels/TravelsClient.tsx
- web/src/app/travels/page.tsx

Source excerpt: web/src/app/travels/TravelsClient.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import { confirmDialog } from "@/components/ConfirmDialog";
   4  import Link from "next/link";
   5  import { Source_Serif_4 } from "next/font/google";
   6  import { Fragment, useEffect, useState, type ReactNode } from "react";
   7  import { DatePickerField } from "@/components/DatePickerField";
   8  import { Modal } from "@/components/Modal";
   9  import { SuggestInput } from "@/components/SuggestInput";
  10  import {
  11    createTravelAccommodation,
  12    createTravelCity,
  13    createTravelFlight,
  14    createTravelItinerary,
  15    createTravelTransport,
  16    createTravelTrip,
  17    deleteTravelAccommodation,
  18    deleteTravelCity,
  19    deleteTravelFlight,
  20    deleteTravelItinerary,
  21    deleteTravelTransport,
  22    getTravelTrips,
  23    resolveMapLink,
  24    updateTravelAccommodation,
  25    updateTravelCity,
  26    updateTravelFlight,
  27    updateTravelItinerary,
  28    updateTravelTransport,
  29    updateTravelTrip,
  30    type TravelTripDetail,
  31  } from "@/lib/api";
  32  import { formatMonthDayShort, formatMonthYear, formatWeekdayMonthDay, toIsoDateLocal } from "@/lib/dateFormat";
  33  import { mapsUrlFor } from "@/lib/maps";
  34  import { remainingPrice } from "@/lib/remainingPrice";
  35  
  36  const serif = Source_Serif_4({ subsets: ["latin"], weight: ["600", "700"], variable: "--tv-serif" });
  37  
  38  type Kind = "flight" | "train" | "bus" | "ferry" | "activity" | "stay";
  39  type FormKind = "flight" | "transit" | "stay" | "activity";
  40  type Table = "flights" | "transport" | "itinerary" | "accommodations";
  41  
  42  const TYPES: Record<Kind, { label: string; h: number }> = {
  43    flight: { label: "Flight", h: 250 },
  44    train: { label: "Train", h: 295 },
  45    bus: { label: "Bus", h: 340 },
  46    ferry: { label: "Ferry", h: 210 },
  47    activity: { label: "Activity", h: 75 },
  48    stay: { label: "Stay", h: 160 },
  49  };
  50  const KINDS = Object.keys(TYPES) as Kind[];
  51  const isRoute = (k: Kind) => k === "flight" || k === "train" || k === "bus" || k === "ferry";
  52  const formKindOf = (k: Kind): FormKind => (k === "flight" || k === "activity" || k === "stay" ? k : "transit");
  53  const tc = (k: Kind) => `oklch(var(--tv-type) ${TYPES[k].h})`;
  54  const tbg = (k: Kind) => `oklch(var(--tv-type-bg) ${TYPES[k].h})`;
  55  const tfg = (k: Kind) => `oklch(var(--tv-type-fg) ${TYPES[k].h})`;
  56  const PH = [185, 15, 255, 60, 135, 320, 95];
  57  const pcol = (i: number) => {
  58    const h = PH[i % PH.length];
  59    return { fg: `oklch(var(--tv-place-fg) ${h})`, bg: `oklch(var(--tv-place-bg) ${h})`, dot: `oklch(var(--tv-place-dot) ${h})` };
  60  };
  61  
  62  const pd = (s: string) => {
  63    const [y, m, d] = s.split("-").map(Number);
  64    return new Date(y, m - 1, d);
  65  };
  66  const addD = (s: string, n: number) => {
  67    const d = pd(s);
  68    d.setDate(d.getDate() + n);
  69    return toIsoDateLocal(d);
  70  };
  71  const diffD = (a: string, b: string) => Math.round((pd(b).getTime() - pd(a).getTime()) / 86_400_000);
  72  const fmtD = formatMonthDayShort;
  73  const fmtDL = formatWeekdayMonthDay;
  74  const rangeOf = (a: string, b: string) => `${fmtD(a)} – ${fmtD(b)}, ${pd(b).getFullYear()}`;
  75  const placeRange = (a: string, b: string) => (a === b ? fmtD(a) : `${fmtD(a)} – ${fmtD(b)}`);
  76  const short = (s: string) => s.split(",")[0].trim();
  77  
  78  type Entry = {
  79    key: string;
  80    table: Table;
  81    id: string;
  82    type: Kind;
  83    title: string;
  84    from: string;
  85    to: string;
  86    fromShort: string;
  87    toShort: string;
  88    location: string;
  89    startDate: string;
  90    startTime: string;
  91    endDate: string;
  92    endTime: string;
  93    ref: string;
  94    seat: string;
  95    conf: string;
  96    notes: string;
  97    airline: string;
  98    terminal: string;
  99    gate: string;
 100    baggage: string;
 101    room: string;
 102    guests: string;
 103    bookedVia: string;
 104    price: string;
 105    paid: string;
 106    phone: string;
 107    fromMapUrl: string;
 108    fromCity: string;
 109    fromCountry: string;
 110    toMapUrl: string;
 111    toCity: string;
 112    toCountry: string;
 113    locationMapUrl: string;
 114    instructions: string;
 115  };
 116  
 117  const s = (v: string | null | undefined) => v ?? "";
 118  const hm = (t: string | null) => (t ? t.slice(0, 5) : "");
 119  const after = (end: string | null, start: string) => (end && end > start ? end : "");
 120  
 121  const NO_DETAILS = {
 122    title: "", from: "", to: "", fromShort: "", toShort: "", location: "", endDate: "", ref: "", seat: "", conf: "",
 123    notes: "", airline: "", terminal: "", gate: "", baggage: "", room: "", guests: "", bookedVia: "", price: "",
 124    paid: "", phone: "", fromMapUrl: "", fromCity: "", fromCountry: "", toMapUrl: "", toCity: "", toCountry: "",
 125    locationMapUrl: "", instructions: "",
 126  };
 127  
 128  type RouteRow = {
 129    from_location: string | null;
 130    from_map_url: string | null;
 131    from_city: string | null;
 132    from_country: string | null;
 133    to_location: string | null;
 134    to_map_url: string | null;
 135    to_city: string | null;
 136    to_country: string | null;
 137  };
 138  const routeOf = (r: RouteRow) => ({
 139    from: s(r.from_location),
 140    to: s(r.to_location),
 141    fromShort: r.from_city || short(s(r.from_location)),
 142    toShort: r.to_city || short(s(r.to_location)),
 143    fromMapUrl: s(r.from_map_url),
 144    fromCity: s(r.from_city),
 145    fromCountry: s(r.from_country),
 146    toMapUrl: s(r.to_map_url),
 147    toCity: s(r.to_city),
 148    toCountry: s(r.to_country),
 149  });
 150  
```

## Outgoing connections
- dispatch -> routers/travel.py (be:router:travel)
- call -> components/ConfirmDialog.tsx (web:components:ConfirmDialog)
- call -> components/DatePickerField.tsx (web:components:DatePickerField)
- call -> components/Modal.tsx (web:components:Modal)
- call -> components/SuggestInput.tsx (web:components:SuggestInput)
- call -> lib/api.ts (web:lib:api)
- call -> lib/dateFormat.ts (web:lib:dateFormat)
- call -> lib/maps.ts (web:lib:maps)
- call -> lib/remainingPrice.ts (web:lib:remainingPrice)

## Incoming connections
- none
