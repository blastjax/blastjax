"use client";

import { MonthGrid } from "@/components/CalendarMonth";
import { PickerField } from "@/components/PickerField";
import { formatMonthYear, monthKey, parseMonthKey } from "@/lib/dateFormat";

export type MonthPickerFieldProps = {
  value: string; // YYYY-MM
  onChange: (month: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  clearLabel?: string;
};

export function MonthPickerField({
  value,
  onChange,
  disabled,
  placeholder = "Select month",
  id,
  clearLabel,
}: MonthPickerFieldProps) {
  const picked = parseMonthKey(value);
  return (
    <PickerField
      id={id}
      label={picked ? formatMonthYear(picked.y, picked.m) : null}
      placeholder={placeholder}
      popoverLabel="Choose a month"
      width={320}
      estimatedHeight={360}
      disabled={disabled}
      clearLabel={clearLabel}
      onClear={() => onChange("")}
    >
      {(close) => (
        <MonthGrid
          year={picked?.y ?? new Date().getFullYear()}
          month={picked?.m ?? null}
          onSelect={(y, m) => {
            onChange(monthKey(y, m));
            close();
          }}
        />
      )}
    </PickerField>
  );
}
