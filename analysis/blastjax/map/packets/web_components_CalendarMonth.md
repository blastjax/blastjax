# Node web:components:CalendarMonth: components/CalendarMonth.tsx
Kind: module
Language: typescript, 329 lines of code, location: web/src/components/CalendarMonth.tsx

Source excerpt: web/src/components/CalendarMonth.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import { useState, type ReactNode } from "react";
   4  import { ChevronLeftIcon, ChevronRightIcon } from "@/components/Icons";
   5  import { ICON_BUTTON_CLASSES } from "@/lib/ui";
   6  import { MONTH_NAMES_FULL, MONTH_NAMES_SHORT, addMonths, toIsoDateLocal } from "@/lib/dateFormat";
   7  
   8  export type DayState = "none" | "today" | "anchor" | "selected" | "range-start" | "range-end" | "range-middle";
   9  
  10  const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
  11  const YEARS_PER_PAGE = 12;
  12  
  13  const SELECTED_TONE = "bg-indigo-600 font-semibold text-white shadow-sm";
  14  const CURRENT_TONE = "font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-400 dark:text-indigo-400";
  15  const PLAIN_TONE = "text-ink-2 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60";
  16  const TITLE_BUTTON_CLASSES =
  17    "rounded-md px-1.5 py-0.5 font-semibold text-ink transition-colors duration-150 enabled:hover:bg-zinc-200/60 dark:enabled:hover:bg-zinc-700/60";
  18  
  19  function pad(n: number): string {
  20    return String(n).padStart(2, "0");
  21  }
  22  
  23  function shiftIso(iso: string, days: number): string {
  24    const [y, m, d] = iso.split("-").map(Number);
  25    return toIsoDateLocal(new Date(y, m - 1, d + days));
  26  }
  27  
  28  function PanelHeader({
  29    prevLabel,
  30    nextLabel,
  31    onPrev,
  32    onNext,
  33    fluid,
  34    children,
  35  }: {
  36    prevLabel: string;
  37    nextLabel: string;
  38    onPrev?: () => void;
  39    onNext?: () => void;
  40    fluid?: boolean;
  41    children: ReactNode;
  42  }) {
  43    return (
  44      <div className="mb-3 flex items-center justify-between">
  45        <button type="button" onClick={onPrev} disabled={!onPrev} aria-label={prevLabel} className={ICON_BUTTON_CLASSES}>
  46          <ChevronLeftIcon className="size-4" />
  47        </button>
  48        <div className={`flex items-center text-base font-semibold text-ink ${fluid ? "@lg:text-lg" : ""}`}>{children}</div>
  49        <button type="button" onClick={onNext} disabled={!onNext} aria-label={nextLabel} className={ICON_BUTTON_CLASSES}>
  50          <ChevronRightIcon className="size-4" />
  51        </button>
  52      </div>
  53    );
  54  }
  55  
  56  function ChoiceGrid({ fluid, children }: { fluid?: boolean; children: ReactNode }) {
  57    return (
  58      <div className={`grid auto-rows-fr grid-cols-3 gap-1 ${fluid ? "min-h-80 @lg:min-h-96" : "min-h-64"}`}>{children}</div>
  59    );
  60  }
  61  
  62  function Choice({
  63    selected,
  64    current,
  65    onClick,
  66    fluid,
  67    children,
  68  }: {
  69    selected: boolean;
  70    current: boolean;
  71    onClick: () => void;
  72    fluid?: boolean;
  73    children: ReactNode;
  74  }) {
  75    return (
  76      <button
  77        type="button"
  78        onClick={onClick}
  79        aria-pressed={selected}
  80        className={`rounded-lg font-medium tabular-nums transition-colors duration-150 ${fluid ? "text-base @lg:text-lg" : "text-sm"} ${selected ? SELECTED_TONE : current ? CURRENT_TONE : PLAIN_TONE}`}
  81      >
  82        {children}
  83      </button>
  84    );
  85  }
  86  
  87  // A page of twelve years, opening on the page around `year`.
  88  export function YearGrid({
  89    year,
  90    selected,
  91    onSelect,
  92    fluid,
  93  }: {
  94    year: number;
  95    selected: number | null;
  96    onSelect: (year: number) => void;
  97    fluid?: boolean;
  98  }) {
  99    const [start, setStart] = useState(year - 5);
 100    const thisYear = new Date().getFullYear();
 101    const years = Array.from({ length: YEARS_PER_PAGE }, (_, i) => start + i);
 102    return (
 103      <div>
 104        <PanelHeader
 105          fluid={fluid}
 106          prevLabel="Previous years"
 107          nextLabel="Next years"
 108          onPrev={() => setStart(start - YEARS_PER_PAGE)}
 109          onNext={() => setStart(start + YEARS_PER_PAGE)}
 110        >
 111          <span className="px-1.5 py-0.5">
 112            {years[0]} – {years[YEARS_PER_PAGE - 1]}
 113          </span>
 114        </PanelHeader>
 115        <ChoiceGrid fluid={fluid}>
 116          {years.map((y) => (
 117            <Choice key={y} fluid={fluid} selected={y === selected} current={y === thisYear} onClick={() => onSelect(y)}>
 118              {y}
 119            </Choice>
 120          ))}
 121        </ChoiceGrid>
 122      </div>
 123    );
 124  }
 125  
 126  // One year's months; the year in the header opens a page of years.
 127  export function MonthGrid({
 128    year,
 129    month,
 130    onSelect,
 131    fluid,
 132  }: {
 133    year: number;
 134    month: number | null;
 135    onSelect: (year: number, month: number) => void;
 136    fluid?: boolean;
 137  }) {
 138    const [shown, setShown] = useState(year);
 139    const [pickingYear, setPickingYear] = useState(false);
 140    if (pickingYear) {
 141      return (
 142        <YearGrid
 143          year={shown}
 144          selected={shown}
 145          fluid={fluid}
 146          onSelect={(y) => {
 147            setShown(y);
 148            setPickingYear(false);
 149          }}
 150        />
```

## Outgoing connections
- call -> components/Icons.tsx (web:components:Icons)
- call -> lib/dateFormat.ts (web:lib:dateFormat)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- components/DatePickerField.tsx (web:components:DatePickerField) -> call
- components/DateRangePickerField.tsx (web:components:DateRangePickerField) -> call
- components/MonthPickerField.tsx (web:components:MonthPickerField) -> call
- components/YearPickerField.tsx (web:components:YearPickerField) -> call
- /lotto (web:lotto) -> call
