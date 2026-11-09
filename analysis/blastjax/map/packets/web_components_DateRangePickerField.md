# Node web:components:DateRangePickerField: components/DateRangePickerField.tsx
Kind: module
Language: typescript, 101 lines of code, location: web/src/components/DateRangePickerField.tsx

Source excerpt: web/src/components/DateRangePickerField.tsx (first 109 lines)
```
   1  "use client";
   2  
   3  import { useState } from "react";
   4  import { CalendarMonth, type DayState } from "@/components/CalendarMonth";
   5  import { PickerField } from "@/components/PickerField";
   6  import { addMonths, formatDate, toIsoDateLocal } from "@/lib/dateFormat";
   7  import { ACTION_BUTTON_CLASSES } from "@/lib/ui";
   8  
   9  export type DateRangePickerFieldProps = {
  10    startValue: string;
  11    endValue: string;
  12    onChange: (start: string, end: string) => void;
  13    disabled?: boolean;
  14    placeholder?: string;
  15    clearLabel?: string;
  16  };
  17  
  18  const monthOf = (iso: string) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) });
  19  
  20  export function DateRangePickerField({
  21    startValue,
  22    endValue,
  23    onChange,
  24    disabled,
  25    placeholder = "Select dates",
  26    clearLabel,
  27  }: DateRangePickerFieldProps) {
  28    const today = toIsoDateLocal(new Date());
  29    const base = startValue || endValue || today;
  30    const [anchor, setAnchor] = useState(() => monthOf(base));
  31  
  32    const pickDay = (iso: string, close: () => void) => {
  33      if (!startValue || (startValue && endValue)) {
  34        onChange(iso, "");
  35        return;
  36      }
  37      if (iso < startValue) {
  38        onChange(iso, startValue);
  39      } else {
  40        onChange(startValue, iso);
  41      }
  42      close();
  43    };
  44  
  45    const stateFor = (iso: string): DayState => {
  46      if (startValue && startValue === endValue && iso === startValue) return "selected";
  47      if (startValue && iso === startValue) return endValue ? "range-start" : "selected";
  48      if (endValue && iso === endValue) return "range-end";
  49      if (startValue && endValue && iso > startValue && iso < endValue) return "range-middle";
  50      if (iso === today) return "today";
  51      return "none";
  52    };
  53  
  54    const next = addMonths(anchor.y, anchor.m, 1);
  55    const label =
  56      startValue && endValue
  57        ? `${formatDate(startValue)} – ${formatDate(endValue)}`
  58        : startValue
  59          ? `${formatDate(startValue)} – …`
  60          : null;
  61  
  62    return (
  63      <PickerField
  64        label={label}
  65        placeholder={placeholder}
  66        popoverLabel="Choose a date range"
  67        width={680}
  68        estimatedHeight={420}
  69        disabled={disabled}
  70        clearLabel={clearLabel}
  71        onClear={() => onChange("", "")}
  72        onOpen={() => setAnchor(monthOf(base))}
  73      >
  74        {(close) => (
  75          <>
  76            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
  77              <CalendarMonth
  78                year={anchor.y}
  79                month={anchor.m}
  80                onSelectDay={(iso) => pickDay(iso, close)}
  81                dayState={stateFor}
  82                arrows="prev"
  83                onNavigate={(y, m) => setAnchor({ y, m })}
  84              />
  85              <div className="hidden sm:block">
  86                <CalendarMonth
  87                  year={next.y}
  88                  month={next.m}
  89                  onSelectDay={(iso) => pickDay(iso, close)}
  90                  dayState={stateFor}
  91                  arrows="next"
  92                  onNavigate={(y, m) => setAnchor(addMonths(y, m, -1))}
  93                />
  94              </div>
  95            </div>
  96            <div className="mt-2 flex justify-end sm:hidden">
  97              <button
  98                type="button"
  99                className={`${ACTION_BUTTON_CLASSES} px-3.5 py-1.5 text-xs`}
 100                onClick={() => setAnchor(next)}
 101              >
 102                Next month ›
 103              </button>
 104            </div>
 105          </>
 106        )}
 107      </PickerField>
 108    );
 109  }
```

## Outgoing connections
- call -> components/CalendarMonth.tsx (web:components:CalendarMonth)
- call -> components/PickerField.tsx (web:components:PickerField)
- call -> lib/dateFormat.ts (web:lib:dateFormat)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- /bills (web:bills) -> call
