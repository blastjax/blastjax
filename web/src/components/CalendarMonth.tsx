"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/Icons";
import { ICON_BUTTON_CLASSES } from "@/lib/ui";
import { MONTH_NAMES_FULL, toIsoDateLocal } from "@/lib/dateFormat";

export type DayState = "none" | "today" | "anchor" | "selected" | "range-start" | "range-end" | "range-middle";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toIsoDateLocal(new Date(y, m - 1, d + days));
}

export type CalendarMonthProps = {
  year: number;
  month: number;
  onSelectDay: (iso: string) => void;
  dayState: (iso: string) => DayState;
  onPrev?: () => void;
  onNext?: () => void;
  disabledDay?: (iso: string) => boolean;
  highlightDay?: (iso: string) => boolean;
  onHoverDay?: (iso: string | null) => void;
};

export function CalendarMonth({
  year,
  month,
  onSelectDay,
  dayState,
  onPrev,
  onNext,
  disabledDay,
  highlightDay,
  onHoverDay,
}: CalendarMonthProps) {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          disabled={!onPrev}
          aria-label="Previous month"
          className={ICON_BUTTON_CLASSES}
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <div className="text-base font-semibold text-ink">
          {MONTH_NAMES_FULL[month - 1]} {year}
        </div>
        <button
          type="button"
          onClick={onNext}
          disabled={!onNext}
          aria-label="Next month"
          className={ICON_BUTTON_CLASSES}
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7">
        {WEEKDAY_LABELS.map((w, i) => (
          <div
            key={i}
            className="pb-1 text-center text-xs font-medium text-ink-4"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7" onMouseLeave={() => onHoverDay?.(null)}>
        {cells.map((day, i) => {
          if (day == null) return <div key={i} className="h-11" />;
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
            <div key={i} className={`flex h-11 items-center justify-center ${bgClasses.filter(Boolean).join(" ")}`}>
              <button
                type="button"
                onClick={() => onSelectDay(iso)}
                onMouseEnter={() => onHoverDay?.(iso)}
                onFocus={() => onHoverDay?.(iso)}
                disabled={disabled}
                aria-pressed={isCap}
                className={[
                  "flex h-10 w-10 items-center justify-center rounded-full text-base font-medium tabular-nums transition-colors duration-150",
                  disabled
                    ? "cursor-not-allowed text-ink-4/40"
                    : isCap
                      ? "bg-indigo-600 font-semibold text-white shadow-sm"
                      : state === "today" || state === "anchor"
                        ? "font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-400 dark:text-indigo-400"
                        : hl || state === "range-middle"
                          ? "font-semibold text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-300"
                          : "text-ink-2 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60",
                ].join(" ")}
              >
                {day}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
