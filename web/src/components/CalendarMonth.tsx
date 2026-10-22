"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/Icons";
import { ICON_BUTTON_CLASSES } from "@/lib/ui";
import { MONTH_NAMES_FULL, MONTH_NAMES_SHORT, addMonths, toIsoDateLocal } from "@/lib/dateFormat";

export type DayState = "none" | "today" | "anchor" | "selected" | "range-start" | "range-end" | "range-middle";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const YEARS_PER_PAGE = 12;

const SELECTED_TONE = "bg-indigo-600 font-semibold text-white shadow-sm";
const CURRENT_TONE = "font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-400 dark:text-indigo-400";
const PLAIN_TONE = "text-ink-2 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60";
const TITLE_BUTTON_CLASSES =
  "rounded-md px-1.5 py-0.5 font-semibold text-ink transition-colors duration-150 enabled:hover:bg-zinc-200/60 dark:enabled:hover:bg-zinc-700/60";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toIsoDateLocal(new Date(y, m - 1, d + days));
}

function PanelHeader({
  prevLabel,
  nextLabel,
  onPrev,
  onNext,
  fluid,
  children,
}: {
  prevLabel: string;
  nextLabel: string;
  onPrev?: () => void;
  onNext?: () => void;
  fluid?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <button type="button" onClick={onPrev} disabled={!onPrev} aria-label={prevLabel} className={ICON_BUTTON_CLASSES}>
        <ChevronLeftIcon className="size-4" />
      </button>
      <div className={`flex items-center text-base font-semibold text-ink ${fluid ? "@lg:text-lg" : ""}`}>{children}</div>
      <button type="button" onClick={onNext} disabled={!onNext} aria-label={nextLabel} className={ICON_BUTTON_CLASSES}>
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  );
}

function ChoiceGrid({ fluid, children }: { fluid?: boolean; children: ReactNode }) {
  return (
    <div className={`grid auto-rows-fr grid-cols-3 gap-1 ${fluid ? "min-h-80 @lg:min-h-96" : "min-h-64"}`}>{children}</div>
  );
}

function Choice({
  selected,
  current,
  onClick,
  fluid,
  children,
}: {
  selected: boolean;
  current: boolean;
  onClick: () => void;
  fluid?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-lg font-medium tabular-nums transition-colors duration-150 ${fluid ? "text-base @lg:text-lg" : "text-sm"} ${selected ? SELECTED_TONE : current ? CURRENT_TONE : PLAIN_TONE}`}
    >
      {children}
    </button>
  );
}

// A page of twelve years, opening on the page around `year`.
export function YearGrid({
  year,
  selected,
  onSelect,
  fluid,
}: {
  year: number;
  selected: number | null;
  onSelect: (year: number) => void;
  fluid?: boolean;
}) {
  const [start, setStart] = useState(year - 5);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: YEARS_PER_PAGE }, (_, i) => start + i);
  return (
    <div>
      <PanelHeader
        fluid={fluid}
        prevLabel="Previous years"
        nextLabel="Next years"
        onPrev={() => setStart(start - YEARS_PER_PAGE)}
        onNext={() => setStart(start + YEARS_PER_PAGE)}
      >
        <span className="px-1.5 py-0.5">
          {years[0]} – {years[YEARS_PER_PAGE - 1]}
        </span>
      </PanelHeader>
      <ChoiceGrid fluid={fluid}>
        {years.map((y) => (
          <Choice key={y} fluid={fluid} selected={y === selected} current={y === thisYear} onClick={() => onSelect(y)}>
            {y}
          </Choice>
        ))}
      </ChoiceGrid>
    </div>
  );
}

// One year's months; the year in the header opens a page of years.
export function MonthGrid({
  year,
  month,
  onSelect,
  fluid,
}: {
  year: number;
  month: number | null;
  onSelect: (year: number, month: number) => void;
  fluid?: boolean;
}) {
  const [shown, setShown] = useState(year);
  const [pickingYear, setPickingYear] = useState(false);
  if (pickingYear) {
    return (
      <YearGrid
        year={shown}
        selected={shown}
        fluid={fluid}
        onSelect={(y) => {
          setShown(y);
          setPickingYear(false);
        }}
      />
    );
  }
  const now = new Date();
  return (
    <div>
      <PanelHeader
        fluid={fluid}
        prevLabel="Previous year"
        nextLabel="Next year"
        onPrev={() => setShown(shown - 1)}
        onNext={() => setShown(shown + 1)}
      >
        <button
          type="button"
          onClick={() => setPickingYear(true)}
          aria-label={`${shown}, choose year`}
          className={TITLE_BUTTON_CLASSES}
        >
          {shown}
        </button>
      </PanelHeader>
      <ChoiceGrid fluid={fluid}>
        {MONTH_NAMES_SHORT.map((name, i) => (
          <Choice
            key={name}
            fluid={fluid}
            selected={shown === year && i + 1 === month}
            current={shown === now.getFullYear() && i === now.getMonth()}
            onClick={() => onSelect(shown, i + 1)}
          >
            {name}
          </Choice>
        ))}
      </ChoiceGrid>
    </div>
  );
}

export type CalendarMonthProps = {
  year: number;
  month: number;
  onSelectDay?: (iso: string) => void;
  dayState: (iso: string) => DayState;
  // Moves the calendar, from its arrows or from the month and year picked in its title.
  onNavigate?: (year: number, month: number) => void;
  arrows?: "both" | "prev" | "next";
  disabledDay?: (iso: string) => boolean;
  highlightDay?: (iso: string) => boolean;
  onHoverDay?: (iso: string | null) => void;
  dayAdornment?: (iso: string) => ReactNode;
  fluid?: boolean;
};

export function CalendarMonth({
  year,
  month,
  onSelectDay,
  dayState,
  onNavigate,
  arrows = "both",
  disabledDay,
  highlightDay,
  onHoverDay,
  dayAdornment,
  fluid,
}: CalendarMonthProps) {
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const wrapper = fluid ? "@container w-full" : "w-full";

  const go = (y: number, m: number) => {
    onNavigate?.(y, m);
    setView("days");
  };

  if (view === "months") {
    return (
      <div className={wrapper}>
        <MonthGrid year={year} month={month} fluid={fluid} onSelect={go} />
      </div>
    );
  }
  if (view === "years") {
    return (
      <div className={wrapper}>
        <YearGrid year={year} selected={year} fluid={fluid} onSelect={(y) => go(y, month)} />
      </div>
    );
  }

  const step = (delta: number) => {
    const t = addMonths(year, month, delta);
    onNavigate?.(t.y, t.m);
  };
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const cellSize = fluid ? "p-0.5 @lg:p-1" : "h-11";
  const daySize = fluid
    ? "aspect-square w-full max-w-20 text-base @lg:text-lg @3xl:text-2xl"
    : "h-10 w-10 text-base";

  return (
    <div className={wrapper}>
      <PanelHeader
        fluid={fluid}
        prevLabel="Previous month"
        nextLabel="Next month"
        onPrev={onNavigate && arrows !== "next" ? () => step(-1) : undefined}
        onNext={onNavigate && arrows !== "prev" ? () => step(1) : undefined}
      >
        <button
          type="button"
          onClick={() => setView("months")}
          disabled={!onNavigate}
          aria-label={`${MONTH_NAMES_FULL[month - 1]}, choose month`}
          className={TITLE_BUTTON_CLASSES}
        >
          {MONTH_NAMES_FULL[month - 1]}
        </button>
        <button
          type="button"
          onClick={() => setView("years")}
          disabled={!onNavigate}
          aria-label={`${year}, choose year`}
          className={TITLE_BUTTON_CLASSES}
        >
          {year}
        </button>
      </PanelHeader>
      <div className="grid grid-cols-7">
        {WEEKDAY_LABELS.map((w, i) => (
          <div
            key={i}
            className={`pb-1 text-center text-xs font-medium text-ink-4 ${fluid ? "@lg:text-sm" : ""}`}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7" onMouseLeave={() => onHoverDay?.(null)}>
        {cells.map((day, i) => {
          if (day == null) return <div key={i} className={cellSize} />;
          const iso = `${year}-${pad(month)}-${pad(day)}`;
          const state = dayState(iso);
          const disabled = disabledDay?.(iso) ?? false;
          const col = i % 7;
          const isCap = state === "selected" || state === "range-start" || state === "range-end";
          const inRangeBg = state === "range-middle" || state === "range-start" || state === "range-end";
          const hl = !inRangeBg && !disabled && !!highlightDay?.(iso);
          const bgClasses = inRangeBg
            ? [
                "bg-indigo-100 dark:bg-indigo-800/60",
                (state === "range-start" || col === 0) && "rounded-l-full",
                (state === "range-end" || col === 6) && "rounded-r-full",
              ]
            : hl
              ? [
                  "bg-indigo-500/10 dark:bg-indigo-400/[0.07]",
                  (col === 0 || !highlightDay?.(shiftIso(iso, -1))) && "rounded-l-full",
                  (col === 6 || !highlightDay?.(shiftIso(iso, 1))) && "rounded-r-full",
                ]
              : [];
          return (
            <div key={i} className={`flex ${cellSize} items-center justify-center ${bgClasses.filter(Boolean).join(" ")}`}>
              <button
                type="button"
                onClick={() => onSelectDay?.(iso)}
                onMouseEnter={() => onHoverDay?.(iso)}
                onFocus={() => onHoverDay?.(iso)}
                disabled={disabled}
                tabIndex={onSelectDay ? undefined : -1}
                aria-pressed={isCap}
                className={[
                  `relative flex ${daySize} items-center justify-center rounded-full font-medium tabular-nums transition-colors duration-150`,
                  disabled
                    ? "cursor-not-allowed text-ink-4/40"
                    : isCap
                      ? SELECTED_TONE
                      : state === "today" || state === "anchor"
                        ? CURRENT_TONE
                        : hl || state === "range-middle"
                          ? "font-semibold text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-300"
                          : PLAIN_TONE,
                ].join(" ")}
              >
                {day}
                {dayAdornment?.(iso)}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
