"use client";

import { ICON_BUTTON_CLASSES } from "@/lib/ui";
import { MONTH_NAMES_FULL } from "@/lib/dateFormat";

export type DayState = "none" | "today" | "selected" | "range-start" | "range-end" | "range-middle";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export type CalendarMonthProps = {
  year: number;
  /** 1-12 */
  month: number;
  onSelectDay: (iso: string) => void;
  dayState: (iso: string) => DayState;
  /** Omit to hide that arrow (its slot stays reserved so the title stays centered) —
   * used to put a single prev/next pair on the outer edges of a multi-month picker. */
  onPrev?: () => void;
  onNext?: () => void;
  /** Days this returns `true` for render dimmed and can't be picked — e.g.
   * restricting a trip's day picker to dates within the trip's own range. */
  disabledDay?: (iso: string) => boolean;
};

/** One month's day grid: header (title + optional prev/next) and a 7-column grid of
 * day cells. Used standalone for a single-date picker, or side by side (each with
 * only one of the nav arrows) for a range picker. */
export function CalendarMonth({
  year,
  month,
  onSelectDay,
  dayState,
  onPrev,
  onNext,
  disabledDay,
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
          ‹
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
          ›
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
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day == null) return <div key={i} className="h-11" />;
          const iso = `${year}-${pad(month)}-${pad(day)}`;
          const state = dayState(iso);
          const disabled = disabledDay?.(iso) ?? false;
          const col = i % 7;
          const isCap = state === "selected" || state === "range-start" || state === "range-end";
          const inRangeBg = state === "range-middle" || state === "range-start" || state === "range-end";
          const bgClasses = inRangeBg
            ? [
                "bg-brand-soft",
                (state === "range-start" || col === 0) && "rounded-l-full",
                (state === "range-end" || col === 6) && "rounded-r-full",
              ]
                .filter(Boolean)
                .join(" ")
            : "";
          return (
            <div key={i} className={`flex h-11 items-center justify-center ${bgClasses}`}>
              <button
                type="button"
                onClick={() => onSelectDay(iso)}
                disabled={disabled}
                className={[
                  "flex h-10 w-10 items-center justify-center rounded-full text-base font-medium transition-colors duration-150",
                  disabled
                    ? "cursor-not-allowed text-ink-4/50"
                    : isCap
                      ? "bg-brand font-semibold text-white"
                      : state === "today"
                        ? "font-semibold text-brand-text ring-1 ring-inset ring-brand/40"
                        : "text-ink-2 hover:bg-surface-2",
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
