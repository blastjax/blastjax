"use client";

import { YearGrid } from "@/components/CalendarMonth";
import { PickerField } from "@/components/PickerField";

export type YearPickerFieldProps = {
  value: string;
  onChange: (year: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  clearLabel?: string;
};

export function YearPickerField({
  value,
  onChange,
  disabled,
  placeholder = "Select year",
  id,
  clearLabel,
}: YearPickerFieldProps) {
  const selected = /^\d{4}$/.test(value) ? Number(value) : null;
  return (
    <PickerField
      id={id}
      label={selected == null ? null : value}
      placeholder={placeholder}
      popoverLabel="Choose a year"
      width={320}
      estimatedHeight={360}
      disabled={disabled}
      clearLabel={clearLabel}
      onClear={() => onChange("")}
    >
      {(close) => (
        <YearGrid
          year={selected ?? new Date().getFullYear()}
          selected={selected}
          onSelect={(y) => {
            onChange(String(y));
            close();
          }}
        />
      )}
    </PickerField>
  );
}
