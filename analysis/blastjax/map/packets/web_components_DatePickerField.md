# Node web:components:DatePickerField: components/DatePickerField.tsx
Kind: module
Language: typescript, 99 lines of code, location: web/src/components/DatePickerField.tsx

Source excerpt: web/src/components/DatePickerField.tsx (first 107 lines)
```
   1  "use client";
   2  
   3  import { useState } from "react";
   4  import { CalendarMonth, type DayState } from "@/components/CalendarMonth";
   5  import { PickerField } from "@/components/PickerField";
   6  import { parseDateOnlyLocal, toIsoDateLocal } from "@/lib/dateFormat";
   7  
   8  export type DatePickerFieldProps = {
   9    value: string;
  10    onChange: (iso: string) => void;
  11    disabled?: boolean;
  12    placeholder?: string;
  13    id?: string;
  14    minDate?: string;
  15    maxDate?: string;
  16    anchorDate?: string;
  17    highlightDay?: (iso: string) => boolean;
  18    highlightLabel?: string;
  19    rangeFrom?: string;
  20    clearLabel?: string;
  21    className?: string;
  22    popoverClassName?: string;
  23  };
  24  
  25  const DAY_LABEL = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  26  
  27  const monthOf = (iso: string) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) });
  28  
  29  export function DatePickerField({
  30    value,
  31    onChange,
  32    disabled,
  33    placeholder = "Select date",
  34    id,
  35    minDate,
  36    maxDate,
  37    anchorDate,
  38    highlightDay,
  39    highlightLabel,
  40    rangeFrom,
  41    clearLabel,
  42    className,
  43    popoverClassName,
  44  }: DatePickerFieldProps) {
  45    const today = anchorDate || toIsoDateLocal(new Date());
  46    const base = value || rangeFrom || today;
  47    const [view, setView] = useState(() => monthOf(base));
  48    const [hover, setHover] = useState<string | null>(null);
  49  
  50    const stateFor = (iso: string): DayState => {
  51      if (rangeFrom) {
  52        const end = hover && hover > rangeFrom ? hover : value > rangeFrom ? value : "";
  53        if (iso === rangeFrom) return end ? "range-start" : "anchor";
  54        if (iso === end) return "range-end";
  55        if (end && iso > rangeFrom && iso < end) return "range-middle";
  56      } else if (iso === value) {
  57        return "selected";
  58      }
  59      return iso === today ? "today" : "none";
  60    };
  61  
  62    const lo = rangeFrom && (!minDate || rangeFrom > minDate) ? rangeFrom : minDate;
  63    const shown = value ? parseDateOnlyLocal(value) : null;
  64  
  65    return (
  66      <PickerField
  67        id={id}
  68        label={shown ? DAY_LABEL.format(shown) : null}
  69        placeholder={placeholder}
  70        popoverLabel="Choose a date"
  71        width={320}
  72        disabled={disabled}
  73        className={className}
  74        popoverClassName={popoverClassName}
  75        clearLabel={clearLabel}
  76        onClear={() => onChange("")}
  77        note={
  78          highlightLabel && (
  79            <span className="flex items-center gap-2 text-ink-3">
  80              <span className="h-2.5 w-5 rounded-full bg-indigo-500/15 dark:bg-indigo-400/15" />
  81              {highlightLabel}
  82            </span>
  83          )
  84        }
  85        onOpen={() => {
  86          setView(monthOf(base));
  87          setHover(null);
  88        }}
  89      >
  90        {(close) => (
  91          <CalendarMonth
  92            year={view.y}
  93            month={view.m}
  94            onSelectDay={(iso) => {
  95              onChange(rangeFrom && iso <= rangeFrom ? "" : iso);
  96              close();
  97            }}
  98            dayState={stateFor}
  99            highlightDay={highlightDay}
 100            onHoverDay={rangeFrom ? setHover : undefined}
 101            disabledDay={(iso) => (!!lo && iso < lo) || (!!maxDate && iso > maxDate)}
 102            onNavigate={(y, m) => setView({ y, m })}
 103          />
 104        )}
 105      </PickerField>
 106    );
 107  }
```

## Outgoing connections
- call -> components/CalendarMonth.tsx (web:components:CalendarMonth)
- call -> components/PickerField.tsx (web:components:PickerField)
- call -> lib/dateFormat.ts (web:lib:dateFormat)

## Incoming connections
- /bills (web:bills) -> call
- /calendar (web:calendar) -> call
- /credit-card (web:credit-card) -> call
- /house-payments (web:house-payments) -> call
- /lotto (web:lotto) -> call
- /monthly-expenses (web:monthly-expenses) -> call
- /travels (web:travels) -> call
