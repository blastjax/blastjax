# Node web:components:YearMonthGrid: components/YearMonthGrid.tsx
Kind: module
Language: typescript, 134 lines of code, location: web/src/components/YearMonthGrid.tsx

Source excerpt: web/src/components/YearMonthGrid.tsx (first 143 lines)
```
   1  import { Fragment, type ReactNode } from "react";
   2  import { PlusIcon } from "@/components/Icons";
   3  import { MONTH_NAMES_FULL } from "@/lib/dateFormat";
   4  
   5  // A year laid out as twelve month cards, shared by the payslip and bills pages.
   6  export function YearMonthGrid({
   7    year,
   8    summary,
   9    aside,
  10    renderMonth,
  11  }: {
  12    year: number;
  13    summary?: ReactNode;
  14    aside?: ReactNode;
  15    renderMonth: (month: number, name: string) => ReactNode;
  16  }) {
  17    return (
  18      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
  19        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3.5 gap-y-1 border-b border-line-soft pb-3.5">
  20          <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
  21            <h3 className="font-mono text-xl font-extrabold tabular-nums text-ink">{year}</h3>
  22            {summary && <span className="text-[13px] text-ink-3">{summary}</span>}
  23          </div>
  24          {aside && <span className="shrink-0 font-mono text-[13px] tabular-nums">{aside}</span>}
  25        </header>
  26        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
  27          {MONTH_NAMES_FULL.map((name, i) => (
  28            <Fragment key={name}>{renderMonth(i + 1, name)}</Fragment>
  29          ))}
  30        </div>
  31      </section>
  32    );
  33  }
  34  
  35  export function EmptyMonth({ name, children }: { name: string; children: ReactNode }) {
  36    return (
  37      <div className="rounded-lg border border-dashed border-line p-4">
  38        <div className="mb-3 text-sm text-ink-4">{name}</div>
  39        <div className="flex flex-col gap-2">{children}</div>
  40      </div>
  41    );
  42  }
  43  
  44  export function MonthCard({
  45    name,
  46    total,
  47    sub,
  48    children,
  49  }: {
  50    name: string;
  51    total: ReactNode;
  52    sub?: ReactNode;
  53    children: ReactNode;
  54  }) {
  55    return (
  56      <div className="rounded-lg border border-line bg-surface-2 p-4">
  57        <div className="flex items-baseline justify-between gap-2">
  58          <span className="text-sm font-bold text-ink">{name}</span>
  59          <span className="font-mono text-base font-semibold tabular-nums text-ink">{total}</span>
  60        </div>
  61        {sub && <div className="mt-1 flex justify-end gap-3.5 font-mono text-xs tabular-nums">{sub}</div>}
  62        <div className="mt-3.5 flex flex-col gap-2.5 border-t border-line-soft pt-3">{children}</div>
  63      </div>
  64    );
  65  }
  66  
  67  export function AddSlotButton({
  68    label,
  69    ariaLabel,
  70    onClick,
  71    disabled,
  72  }: {
  73    label: string;
  74    ariaLabel?: string;
  75    onClick: () => void;
  76    disabled?: boolean;
  77  }) {
  78    return (
  79      <button
  80        type="button"
  81        aria-label={ariaLabel}
  82        disabled={disabled}
  83        onClick={onClick}
  84        className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-line px-2.5 py-1.5 text-xs font-semibold text-ink-3 transition-colors duration-150 hover:border-line-strong hover:text-ink-2 disabled:opacity-50"
  85      >
  86        <PlusIcon className="size-3.5" />
  87        {label}
  88      </button>
  89    );
  90  }
  91  
  92  // One entry inside a month: opens on click, with an optional action strip below.
  93  export function MonthEntry({
  94    ariaLabel,
  95    onClick,
  96    footer,
  97    children,
  98  }: {
  99    ariaLabel: string;
 100    onClick: () => void;
 101    footer?: ReactNode;
 102    children: ReactNode;
 103  }) {
 104    return (
 105      <div className="rounded-lg bg-surface-inset">
 106        <button
 107          type="button"
 108          aria-label={ariaLabel}
 109          onClick={onClick}
 110          className="block w-full rounded-lg p-3 text-left transition-colors duration-150 hover:bg-surface-3"
 111        >
 112          {children}
 113        </button>
 114        {footer}
 115      </div>
 116    );
 117  }
 118  
 119  const LINE_TONE = {
 120    default: ["text-ink-3", "text-ink-2"],
 121    faint: ["text-ink-4", "text-ink-4"],
 122    danger: ["text-danger-text", "text-danger-text"],
 123  } as const;
 124  
 125  export function MonthLine({
 126    label,
 127    value,
 128    strong,
 129    tone = "default",
 130  }: {
 131    label: ReactNode;
 132    value: ReactNode;
 133    strong?: boolean;
 134    tone?: keyof typeof LINE_TONE;
 135  }) {
 136    const [labelTone, valueTone] = LINE_TONE[tone];
 137    return (
 138      <div className="flex justify-between gap-2 font-mono text-xs tabular-nums">
 139        <span className={labelTone}>{label}</span>
 140        <span className={strong ? "font-semibold text-ink" : valueTone}>{value}</span>
 141      </div>
 142    );
 143  }
```

## Outgoing connections
- call -> components/Icons.tsx (web:components:Icons)
- call -> lib/dateFormat.ts (web:lib:dateFormat)

## Incoming connections
- /bills (web:bills) -> call
- /payslip (web:payslip) -> call
