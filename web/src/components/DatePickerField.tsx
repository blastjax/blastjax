"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarMonth, type DayState } from "@/components/CalendarMonth";
import { CalendarIcon } from "@/components/Icons";
import { addMonths, parseDateOnlyLocal, toIsoDateLocal } from "@/lib/dateFormat";
import { usePopoverPosition } from "@/lib/usePopoverPosition";
import { INPUT_CLASSES } from "@/lib/ui";

export type DatePickerFieldProps = {
  /** "YYYY-MM-DD", or "" for no date picked. */
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  /** Dates outside [minDate, maxDate] (inclusive, either end optional)
   * render dimmed and can't be picked. */
  minDate?: string;
  maxDate?: string;
  /** Reference date used instead of the real "today" for the month the
   * popover opens on when `value` is blank, and for the ringed day. */
  anchorDate?: string;
  /** Days to tint as a band, e.g. a trip's own dates. */
  highlightDay?: (iso: string) => boolean;
  /** Legend for the tint, shown under the calendar. */
  highlightLabel?: string;
  /** Makes this an end-date field for the given start date: days before it
   * can't be picked, the span from it to the picked (or hovered) day is
   * drawn as a range, and picking the start day itself clears the field. */
  rangeFrom?: string;
  /** Adds a footer button with this label that clears the field. */
  clearLabel?: string;
  /** Replaces the trigger's default input styling. */
  className?: string;
  /** Replaces the popover's default surface styling. */
  popoverClassName?: string;
};

const POPOVER_WIDTH = 320;

const DAY_LABEL = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/** A button that opens a calendar popover to pick a single date, in place of
 * a native `<input type="date">`. The popover is fixed-positioned from the
 * trigger's screen rect (see `usePopoverPosition`) so a modal's scroll
 * container can't clip it. */
export function DatePickerField({
  value,
  onChange,
  disabled,
  placeholder = "Select date",
  id,
  minDate,
  maxDate,
  anchorDate,
  highlightDay,
  highlightLabel,
  rangeFrom,
  clearLabel,
  className,
  popoverClassName,
}: DatePickerFieldProps) {
  const today = anchorDate || toIsoDateLocal(new Date());
  const base = value || rangeFrom || today;
  const [viewYear, setViewYear] = useState(() => Number(base.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => Number(base.slice(5, 7)));
  const [hover, setHover] = useState<string | null>(null);
  const { triggerRef, open, position, openAt, close } = usePopoverPosition<HTMLButtonElement>(400);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Capture phase: a Modal's dialog stops mousedown from bubbling, which
    // would otherwise keep clicks elsewhere in the dialog from closing this.
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) close();
    };
    // Capture + stopPropagation so Escape closes only this popover, not the
    // surrounding Modal (which listens for Escape on `window` too).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("mousedown", onDocMouseDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, close, triggerRef]);

  const openPicker = () => {
    if (disabled) return;
    const b = value || rangeFrom || today;
    setViewYear(Number(b.slice(0, 4)));
    setViewMonth(Number(b.slice(5, 7)));
    setHover(null);
    openAt(POPOVER_WIDTH);
  };

  const pick = (iso: string) => {
    onChange(rangeFrom && iso <= rangeFrom ? "" : iso);
    close();
  };

  const stateFor = (iso: string): DayState => {
    if (rangeFrom) {
      const end = hover && hover > rangeFrom ? hover : value > rangeFrom ? value : "";
      if (iso === rangeFrom) return end ? "range-start" : "anchor";
      if (iso === end) return "range-end";
      if (end && iso > rangeFrom && iso < end) return "range-middle";
    } else if (iso === value) {
      return "selected";
    }
    return iso === today ? "today" : "none";
  };

  const lo = rangeFrom && (!minDate || rangeFrom > minDate) ? rangeFrom : minDate;
  const shown = value ? parseDateOnlyLocal(value) : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${className ?? INPUT_CLASSES} flex w-full items-center gap-2 text-left disabled:opacity-50`}
      >
        <CalendarIcon className="size-4 shrink-0 opacity-60" />
        {shown ? <span className="truncate">{DAY_LABEL.format(shown)}</span> : <span className="truncate opacity-60">{placeholder}</span>}
      </button>
      {open && position && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Choose a date"
          style={{ position: "fixed", top: position.top, left: position.left, width: POPOVER_WIDTH }}
          className={`z-50 rounded-xl border p-4 ${popoverClassName ?? "border-line bg-surface shadow-pop"}`}
        >
          <CalendarMonth
            year={viewYear}
            month={viewMonth}
            onSelectDay={pick}
            dayState={stateFor}
            highlightDay={highlightDay}
            onHoverDay={rangeFrom ? setHover : undefined}
            disabledDay={(iso) => (!!lo && iso < lo) || (!!maxDate && iso > maxDate)}
            onPrev={() => {
              const p = addMonths(viewYear, viewMonth, -1);
              setViewYear(p.y);
              setViewMonth(p.m);
            }}
            onNext={() => {
              const n = addMonths(viewYear, viewMonth, 1);
              setViewYear(n.y);
              setViewMonth(n.m);
            }}
          />
          {(highlightLabel || clearLabel) && (
            <div className="mt-3 flex min-h-8 items-center justify-between gap-3 border-t border-line pt-3 text-xs">
              {highlightLabel ? (
                <span className="flex items-center gap-2 text-ink-3">
                  <span className="h-2.5 w-5 rounded-full bg-indigo-500/15 dark:bg-indigo-400/15" />
                  {highlightLabel}
                </span>
              ) : (
                <span />
              )}
              {clearLabel && value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    close();
                  }}
                  className="rounded-md px-2 py-1 font-semibold text-indigo-600 transition-colors hover:bg-indigo-500/10 dark:text-indigo-400"
                >
                  {clearLabel}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
