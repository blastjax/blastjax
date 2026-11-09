# Node web:components:PickerField: components/PickerField.tsx
Kind: module
Language: typescript, 117 lines of code, location: web/src/components/PickerField.tsx

Source excerpt: web/src/components/PickerField.tsx (first 125 lines)
```
   1  "use client";
   2  
   3  import { useEffect, useRef, useState, type ReactNode } from "react";
   4  import { CalendarIcon } from "@/components/Icons";
   5  import { usePopoverPosition } from "@/lib/usePopoverPosition";
   6  import { INPUT_CLASSES } from "@/lib/ui";
   7  
   8  export type PickerFieldProps = {
   9    label: string | null; // the value as shown, or null for the placeholder
  10    placeholder: string;
  11    popoverLabel: string;
  12    width: number; // narrowed to fit small screens
  13    estimatedHeight?: number;
  14    onOpen?: () => void;
  15    clearLabel?: string;
  16    onClear?: () => void;
  17    note?: ReactNode;
  18    disabled?: boolean;
  19    id?: string;
  20    className?: string;
  21    popoverClassName?: string;
  22    children: (close: () => void) => ReactNode;
  23  };
  24  
  25  // The trigger and popover every date, date range, month and year picker shares.
  26  export function PickerField({
  27    label,
  28    placeholder,
  29    popoverLabel,
  30    width,
  31    estimatedHeight = 400,
  32    onOpen,
  33    clearLabel,
  34    onClear,
  35    note,
  36    disabled,
  37    id,
  38    className,
  39    popoverClassName,
  40    children,
  41  }: PickerFieldProps) {
  42    const { triggerRef, open, position, openAt, close } = usePopoverPosition<HTMLButtonElement>(estimatedHeight);
  43    const popoverRef = useRef<HTMLDivElement>(null);
  44    const [shownWidth, setShownWidth] = useState(width);
  45  
  46    useEffect(() => {
  47      if (!open) return;
  48      const onDocMouseDown = (e: MouseEvent) => {
  49        const target = e.target as Node;
  50        if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) close();
  51      };
  52      const onKey = (e: KeyboardEvent) => {
  53        if (e.key === "Escape") {
  54          e.stopPropagation();
  55          close();
  56        }
  57      };
  58      document.addEventListener("mousedown", onDocMouseDown, true);
  59      window.addEventListener("keydown", onKey, true);
  60      return () => {
  61        document.removeEventListener("mousedown", onDocMouseDown, true);
  62        window.removeEventListener("keydown", onKey, true);
  63      };
  64    }, [open, close, triggerRef]);
  65  
  66    const openPicker = () => {
  67      if (disabled) return;
  68      onOpen?.();
  69      const w = Math.min(width, window.innerWidth - 16);
  70      setShownWidth(w);
  71      openAt(w);
  72    };
  73  
  74    const canClear = !!clearLabel && !!onClear && label != null;
  75  
  76    return (
  77      <div className="relative">
  78        <button
  79          ref={triggerRef}
  80          id={id}
  81          type="button"
  82          disabled={disabled}
  83          onClick={openPicker}
  84          aria-haspopup="dialog"
  85          aria-expanded={open}
  86          className={`${className ?? INPUT_CLASSES} flex w-full items-center gap-2 text-left disabled:opacity-50`}
  87        >
  88          <CalendarIcon className="size-4 shrink-0 opacity-60" />
  89          {label != null ? (
  90            <span className="truncate">{label}</span>
  91          ) : (
  92            <span className="truncate opacity-60">{placeholder}</span>
  93          )}
  94        </button>
  95        {open && position && (
  96          <div
  97            ref={popoverRef}
  98            role="dialog"
  99            aria-label={popoverLabel}
 100            style={{ position: "fixed", top: position.top, left: position.left, width: shownWidth }}
 101            className={`z-50 rounded-xl border p-4 ${popoverClassName ?? "border-line bg-surface shadow-pop"}`}
 102          >
 103            {children(close)}
 104            {(note || canClear) && (
 105              <div className="mt-3 flex min-h-8 items-center justify-between gap-3 border-t border-line pt-3 text-xs">
 106                {note ?? <span />}
 107                {canClear && (
 108                  <button
 109                    type="button"
 110                    onClick={() => {
 111                      onClear?.();
 112                      close();
 113                    }}
 114                    className="rounded-md px-2 py-1 font-semibold text-indigo-600 transition-colors hover:bg-indigo-500/10 dark:text-indigo-400"
 115                  >
 116                    {clearLabel}
 117                  </button>
 118                )}
 119              </div>
 120            )}
 121          </div>
 122        )}
 123      </div>
 124    );
 125  }
```

## Outgoing connections
- call -> components/Icons.tsx (web:components:Icons)
- call -> lib/ui.ts (web:lib:ui)
- call -> lib/usePopoverPosition.ts (web:lib:usePopoverPosition)

## Incoming connections
- components/DatePickerField.tsx (web:components:DatePickerField) -> call
- components/DateRangePickerField.tsx (web:components:DateRangePickerField) -> call
- components/MonthPickerField.tsx (web:components:MonthPickerField) -> call
- components/YearPickerField.tsx (web:components:YearPickerField) -> call
