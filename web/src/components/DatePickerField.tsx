"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarMonth } from "@/components/CalendarMonth";
import { addMonths, formatDate, toIsoDateLocal } from "@/lib/dateFormat";
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
   * render dimmed and can't be picked — e.g. restricting to a trip's own
   * date range. */
  minDate?: string;
  maxDate?: string;
  /** Reference date used instead of the real "today" for the default view
   * month (when `value` is blank) and the ring-highlighted day — e.g. the
   * day being edited, so an unset arrival-date field opens on that day
   * instead of today's date. */
  anchorDate?: string;
};

const POPOVER_WIDTH = 320;

/** A button that opens a small calendar popover to pick a single date, in
 * place of a native `<input type="date">`. The popover is fixed-positioned
 * from the trigger's screen rect (see `usePopoverPosition`) rather than
 * anchored inside the form, so it can't be clipped by a modal's scroll
 * container and has room to be a comfortable size regardless of where the
 * field sits in the form. */
export function DatePickerField({
  value,
  onChange,
  disabled,
  placeholder = "Select date",
  id,
  minDate,
  maxDate,
  anchorDate,
}: DatePickerFieldProps) {
  const today = anchorDate || toIsoDateLocal(new Date());
  const base = value || today;
  const [viewYear, setViewYear] = useState(() => Number(base.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => Number(base.slice(5, 7)));
  const { triggerRef, open, position, openAt, close } = usePopoverPosition<HTMLButtonElement>();
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        close();
      }
    };
    // Capture phase + stopPropagation so Escape closes only this popover,
    // not the surrounding Modal (which listens for Escape on `window` too).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, close, triggerRef]);

  const openPicker = () => {
    if (disabled) return;
    const b = value || today;
    setViewYear(Number(b.slice(0, 4)));
    setViewMonth(Number(b.slice(5, 7)));
    openAt(POPOVER_WIDTH);
  };

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
        className={`${INPUT_CLASSES} w-full text-left disabled:opacity-50 ${value ? "pr-8" : ""}`}
      >
        {value ? formatDate(value) : <span className="text-ink-4">{placeholder}</span>}
      </button>
      {value && !disabled && (
        <button
          type="button"
          aria-label="Clear date"
          onClick={(e) => {
            e.stopPropagation();
            onChange("");
          }}
          className="absolute inset-y-0 right-2 flex items-center text-ink-4 transition-colors duration-150 hover:text-ink-2"
        >
          ×
        </button>
      )}
      {open && position && (
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: position.top, left: position.left, width: POPOVER_WIDTH }}
          className="z-50 rounded-xl border border-line bg-surface p-4 shadow-pop"
        >
          <CalendarMonth
            year={viewYear}
            month={viewMonth}
            onSelectDay={(iso) => {
              onChange(iso);
              close();
            }}
            dayState={(iso) => (iso === value ? "selected" : iso === today ? "today" : "none")}
            disabledDay={(iso) => (!!minDate && iso < minDate) || (!!maxDate && iso > maxDate)}
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
        </div>
      )}
    </div>
  );
}
