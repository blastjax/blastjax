# Node web:components:MonthPickerField: components/MonthPickerField.tsx
Kind: module
Language: typescript, 46 lines of code, location: web/src/components/MonthPickerField.tsx

Source excerpt: web/src/components/MonthPickerField.tsx (first 49 lines)
```
   1  "use client";
   2  
   3  import { MonthGrid } from "@/components/CalendarMonth";
   4  import { PickerField } from "@/components/PickerField";
   5  import { formatMonthYear, monthKey, parseMonthKey } from "@/lib/dateFormat";
   6  
   7  export type MonthPickerFieldProps = {
   8    value: string; // YYYY-MM
   9    onChange: (month: string) => void;
  10    disabled?: boolean;
  11    placeholder?: string;
  12    id?: string;
  13    clearLabel?: string;
  14  };
  15  
  16  export function MonthPickerField({
  17    value,
  18    onChange,
  19    disabled,
  20    placeholder = "Select month",
  21    id,
  22    clearLabel,
  23  }: MonthPickerFieldProps) {
  24    const picked = parseMonthKey(value);
  25    return (
  26      <PickerField
  27        id={id}
  28        label={picked ? formatMonthYear(picked.y, picked.m) : null}
  29        placeholder={placeholder}
  30        popoverLabel="Choose a month"
  31        width={320}
  32        estimatedHeight={360}
  33        disabled={disabled}
  34        clearLabel={clearLabel}
  35        onClear={() => onChange("")}
  36      >
  37        {(close) => (
  38          <MonthGrid
  39            year={picked?.y ?? new Date().getFullYear()}
  40            month={picked?.m ?? null}
  41            onSelect={(y, m) => {
  42              onChange(monthKey(y, m));
  43              close();
  44            }}
  45          />
  46        )}
  47      </PickerField>
  48    );
  49  }
```

## Outgoing connections
- call -> components/CalendarMonth.tsx (web:components:CalendarMonth)
- call -> components/PickerField.tsx (web:components:PickerField)
- call -> lib/dateFormat.ts (web:lib:dateFormat)

## Incoming connections
- /installments (web:installments) -> call
- /monthly-expenses (web:monthly-expenses) -> call
