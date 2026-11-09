# Node web:components:YearPickerField: components/YearPickerField.tsx
Kind: module
Language: typescript, 45 lines of code, location: web/src/components/YearPickerField.tsx

Source excerpt: web/src/components/YearPickerField.tsx (first 48 lines)
```
   1  "use client";
   2  
   3  import { YearGrid } from "@/components/CalendarMonth";
   4  import { PickerField } from "@/components/PickerField";
   5  
   6  export type YearPickerFieldProps = {
   7    value: string;
   8    onChange: (year: string) => void;
   9    disabled?: boolean;
  10    placeholder?: string;
  11    id?: string;
  12    clearLabel?: string;
  13  };
  14  
  15  export function YearPickerField({
  16    value,
  17    onChange,
  18    disabled,
  19    placeholder = "Select year",
  20    id,
  21    clearLabel,
  22  }: YearPickerFieldProps) {
  23    const selected = /^\d{4}$/.test(value) ? Number(value) : null;
  24    return (
  25      <PickerField
  26        id={id}
  27        label={selected == null ? null : value}
  28        placeholder={placeholder}
  29        popoverLabel="Choose a year"
  30        width={320}
  31        estimatedHeight={360}
  32        disabled={disabled}
  33        clearLabel={clearLabel}
  34        onClear={() => onChange("")}
  35      >
  36        {(close) => (
  37          <YearGrid
  38            year={selected ?? new Date().getFullYear()}
  39            selected={selected}
  40            onSelect={(y) => {
  41              onChange(String(y));
  42              close();
  43            }}
  44          />
  45        )}
  46      </PickerField>
  47    );
  48  }
```

## Outgoing connections
- call -> components/CalendarMonth.tsx (web:components:CalendarMonth)
- call -> components/PickerField.tsx (web:components:PickerField)

## Incoming connections
- /payslip (web:payslip) -> call
