"use client";

import { useState } from "react";
import { CalendarMonth, type DayState } from "@/components/CalendarMonth";
import { PickerField } from "@/components/PickerField";
import { addMonths, formatDate, toIsoDateLocal } from "@/lib/dateFormat";
import { ACTION_BUTTON_CLASSES } from "@/lib/ui";

export type DateRangePickerFieldProps = {
  startValue: string;
  endValue: string;
  onChange: (start: string, end: string) => void;
  disabled?: boolean;
  placeholder?: string;
  clearLabel?: string;
};

const monthOf = (iso: string) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) });

export function DateRangePickerField({
  startValue,
  endValue,
  onChange,
  disabled,
  placeholder = "Select dates",
  clearLabel,
}: DateRangePickerFieldProps) {
  const today = toIsoDateLocal(new Date());
  const base = startValue || endValue || today;
  const [anchor, setAnchor] = useState(() => monthOf(base));

  const pickDay = (iso: string, close: () => void) => {
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

  const next = addMonths(anchor.y, anchor.m, 1);
  const label =
    startValue && endValue
      ? `${formatDate(startValue)} – ${formatDate(endValue)}`
      : startValue
        ? `${formatDate(startValue)} – …`
        : null;

  return (
    <PickerField
      label={label}
      placeholder={placeholder}
      popoverLabel="Choose a date range"
      width={680}
      estimatedHeight={420}
      disabled={disabled}
      clearLabel={clearLabel}
      onClear={() => onChange("", "")}
      onOpen={() => setAnchor(monthOf(base))}
    >
      {(close) => (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CalendarMonth
              year={anchor.y}
              month={anchor.m}
              onSelectDay={(iso) => pickDay(iso, close)}
              dayState={stateFor}
              arrows="prev"
              onNavigate={(y, m) => setAnchor({ y, m })}
            />
            <div className="hidden sm:block">
              <CalendarMonth
                year={next.y}
                month={next.m}
                onSelectDay={(iso) => pickDay(iso, close)}
                dayState={stateFor}
                arrows="next"
                onNavigate={(y, m) => setAnchor(addMonths(y, m, -1))}
              />
            </div>
          </div>
          <div className="mt-2 flex justify-end sm:hidden">
            <button
              type="button"
              className={`${ACTION_BUTTON_CLASSES} px-3.5 py-1.5 text-xs`}
              onClick={() => setAnchor(next)}
            >
              Next month ›
            </button>
          </div>
        </>
      )}
    </PickerField>
  );
}
