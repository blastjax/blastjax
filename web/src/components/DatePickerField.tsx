"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarMonth, type DayState } from "@/components/CalendarMonth";
import { CalendarIcon } from "@/components/Icons";
import { addMonths, parseDateOnlyLocal, toIsoDateLocal } from "@/lib/dateFormat";
import { usePopoverPosition } from "@/lib/usePopoverPosition";
import { INPUT_CLASSES } from "@/lib/ui";

export type DatePickerFieldProps = {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  minDate?: string;
  maxDate?: string;
  anchorDate?: string;
  highlightDay?: (iso: string) => boolean;
  highlightLabel?: string;
  rangeFrom?: string;
  clearLabel?: string;
  className?: string;
  popoverClassName?: string;
};

const POPOVER_WIDTH = 320;

const DAY_LABEL = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

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
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) close();
    };
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
