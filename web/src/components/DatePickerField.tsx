"use client";

import { useState } from "react";
import { CalendarMonth, type DayState } from "@/components/CalendarMonth";
import { PickerField } from "@/components/PickerField";
import { parseDateOnlyLocal, toIsoDateLocal } from "@/lib/dateFormat";

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

const DAY_LABEL = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

const monthOf = (iso: string) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) });

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
  const [view, setView] = useState(() => monthOf(base));
  const [hover, setHover] = useState<string | null>(null);

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
    <PickerField
      id={id}
      label={shown ? DAY_LABEL.format(shown) : null}
      placeholder={placeholder}
      popoverLabel="Choose a date"
      width={320}
      disabled={disabled}
      className={className}
      popoverClassName={popoverClassName}
      clearLabel={clearLabel}
      onClear={() => onChange("")}
      note={
        highlightLabel && (
          <span className="flex items-center gap-2 text-ink-3">
            <span className="h-2.5 w-5 rounded-full bg-indigo-500/15 dark:bg-indigo-400/15" />
            {highlightLabel}
          </span>
        )
      }
      onOpen={() => {
        setView(monthOf(base));
        setHover(null);
      }}
    >
      {(close) => (
        <CalendarMonth
          year={view.y}
          month={view.m}
          onSelectDay={(iso) => {
            onChange(rangeFrom && iso <= rangeFrom ? "" : iso);
            close();
          }}
          dayState={stateFor}
          highlightDay={highlightDay}
          onHoverDay={rangeFrom ? setHover : undefined}
          disabledDay={(iso) => (!!lo && iso < lo) || (!!maxDate && iso > maxDate)}
          onNavigate={(y, m) => setView({ y, m })}
        />
      )}
    </PickerField>
  );
}
