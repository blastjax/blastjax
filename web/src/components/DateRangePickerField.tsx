"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarMonth, type DayState } from "@/components/CalendarMonth";
import { addMonths, formatDate, toIsoDateLocal } from "@/lib/dateFormat";
import { usePopoverPosition } from "@/lib/usePopoverPosition";
import { ACTION_BUTTON_CLASSES, INPUT_CLASSES } from "@/lib/ui";

export type DateRangePickerFieldProps = {
  startValue: string;
  endValue: string;
  onChange: (start: string, end: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

const MAX_POPOVER_WIDTH = 680;

function responsiveWidth(): number {
  return Math.min(MAX_POPOVER_WIDTH, window.innerWidth - 16);
}

export function DateRangePickerField({
  startValue,
  endValue,
  onChange,
  disabled,
  placeholder = "Select dates",
}: DateRangePickerFieldProps) {
  const today = toIsoDateLocal(new Date());
  const base = startValue || endValue || today;
  const [anchorYear, setAnchorYear] = useState(() => Number(base.slice(0, 4)));
  const [anchorMonth, setAnchorMonth] = useState(() => Number(base.slice(5, 7)));
  const { triggerRef, open, position, openAt, close } = usePopoverPosition<HTMLButtonElement>(420);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverWidth, setPopoverWidth] = useState(MAX_POPOVER_WIDTH);

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
    const b = startValue || endValue || today;
    setAnchorYear(Number(b.slice(0, 4)));
    setAnchorMonth(Number(b.slice(5, 7)));
    const width = responsiveWidth();
    setPopoverWidth(width);
    openAt(width);
  };

  const pickDay = (iso: string) => {
    if (!startValue || (startValue && endValue)) {
      onChange(iso, "");
      return;
    }
    if (iso < startValue) {
      onChange(iso, startValue);
    } else {
      onChange(startValue, iso);
    }
    close();
  };

  const stateFor = (iso: string): DayState => {
    if (startValue && startValue === endValue && iso === startValue) return "selected";
    if (startValue && iso === startValue) return endValue ? "range-start" : "selected";
    if (endValue && iso === endValue) return "range-end";
    if (startValue && endValue && iso > startValue && iso < endValue) return "range-middle";
    if (iso === today) return "today";
    return "none";
  };

  const next = addMonths(anchorYear, anchorMonth, 1);
  const label =
    startValue && endValue
      ? `${formatDate(startValue)} – ${formatDate(endValue)}`
      : startValue
        ? `${formatDate(startValue)} – …`
        : "";

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${INPUT_CLASSES} w-full text-left disabled:opacity-50`}
      >
        {label || <span className="text-ink-4">{placeholder}</span>}
      </button>
      {open && position && (
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: position.top, left: position.left, width: popoverWidth }}
          className="z-50 rounded-xl border border-line bg-surface p-4 shadow-pop"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CalendarMonth
              year={anchorYear}
              month={anchorMonth}
              onSelectDay={pickDay}
              dayState={stateFor}
              onPrev={() => {
                const p = addMonths(anchorYear, anchorMonth, -1);
                setAnchorYear(p.y);
                setAnchorMonth(p.m);
              }}
            />
            <div className="hidden sm:block">
              <CalendarMonth
                year={next.y}
                month={next.m}
                onSelectDay={pickDay}
                dayState={stateFor}
                onNext={() => {
                  const n = addMonths(anchorYear, anchorMonth, 1);
                  setAnchorYear(n.y);
                  setAnchorMonth(n.m);
                }}
              />
            </div>
          </div>
          <div className="mt-2 flex justify-end sm:hidden">
            <button
              type="button"
              className={`${ACTION_BUTTON_CLASSES} px-3.5 py-1.5 text-xs`}
              onClick={() => {
                const n = addMonths(anchorYear, anchorMonth, 1);
                setAnchorYear(n.y);
                setAnchorMonth(n.m);
              }}
            >
              Next month ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
