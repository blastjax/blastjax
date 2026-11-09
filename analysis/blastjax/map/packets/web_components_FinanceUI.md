# Node web:components:FinanceUI: components/FinanceUI.tsx
Kind: module
Language: typescript, 376 lines of code, location: web/src/components/FinanceUI.tsx

Source excerpt: web/src/components/FinanceUI.tsx (first 150 lines)
```
   1  import type { ReactNode, Ref } from "react";
   2  import {
   3    ChevronLeftIcon,
   4    ChevronRightIcon,
   5    CloseIcon,
   6    PencilIcon,
   7    TrashIcon,
   8  } from "@/components/Icons";
   9  import { formatMonthYear } from "@/lib/dateFormat";
  10  import { INPUT_CLASSES } from "@/lib/ui";
  11  
  12  type Tone = "neutral" | "brand" | "success" | "warning" | "danger";
  13  
  14  const TEXT_TONE: Record<Tone, string> = {
  15    neutral: "text-ink",
  16    brand: "text-brand-text",
  17    success: "text-success-text",
  18    warning: "text-warning-text",
  19    danger: "text-danger-text",
  20  };
  21  
  22  const BAR_TONE: Record<Tone, string> = {
  23    neutral: "bg-ink-4",
  24    brand: "bg-brand",
  25    success: "bg-success",
  26    warning: "bg-warning",
  27    danger: "bg-danger",
  28  };
  29  
  30  const PILL_TONE: Record<Tone, string> = {
  31    neutral: "bg-surface-2 text-ink-3 ring-line",
  32    brand: "bg-brand-soft text-brand-text ring-brand/20",
  33    success: "bg-success-soft text-success-text ring-success/20",
  34    warning: "bg-warning-soft text-warning-text ring-warning/25",
  35    danger: "bg-danger-soft text-danger-text ring-danger/20",
  36  };
  37  
  38  export function Panel({
  39    title,
  40    subtitle,
  41    actions,
  42    flush = false,
  43    className = "",
  44    ref,
  45    children,
  46  }: {
  47    title?: ReactNode;
  48    subtitle?: ReactNode;
  49    actions?: ReactNode;
  50    flush?: boolean;
  51    className?: string;
  52    ref?: Ref<HTMLElement>;
  53    children: ReactNode;
  54  }) {
  55    const head = title != null || actions != null;
  56    return (
  57      <section
  58        ref={ref}
  59        className={`min-w-0 rounded-2xl border border-line bg-surface shadow-xs ${className}`}
  60      >
  61        {head && (
  62          <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5 sm:px-6">
  63            <div className="min-w-0">
  64              <h2 className="text-base font-semibold text-ink">{title}</h2>
  65              {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
  66            </div>
  67            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  68          </header>
  69        )}
  70        <div className={flush ? (head ? "pt-3" : "") : head ? "px-5 pb-5 pt-4 sm:px-6 sm:pb-6" : "p-5 sm:p-6"}>
  71          {children}
  72        </div>
  73      </section>
  74    );
  75  }
  76  
  77  export function StatStrip({ className = "", children }: { className?: string; children: ReactNode }) {
  78    return (
  79      <div
  80        className={`grid gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-xs *:bg-surface *:p-4 sm:*:px-5 ${className}`}
  81      >
  82        {children}
  83      </div>
  84    );
  85  }
  86  
  87  export function Metric({
  88    label,
  89    value,
  90    hint,
  91    tone = "neutral",
  92    size = "md",
  93  }: {
  94    label: ReactNode;
  95    value: ReactNode;
  96    hint?: ReactNode;
  97    tone?: Tone;
  98    size?: "sm" | "md" | "lg";
  99  }) {
 100    const valueSize = size === "lg" ? "text-2xl sm:text-3xl" : size === "md" ? "text-xl" : "text-base";
 101    // Wrap rather than truncate: an ellipsis would hide digits of an amount.
 102    return (
 103      <div className="min-w-0">
 104        <p className="break-words text-xs font-medium text-ink-3">{label}</p>
 105        <p className={`mt-1 break-words font-semibold tabular-nums tracking-tight ${valueSize} ${TEXT_TONE[tone]}`}>
 106          {value}
 107        </p>
 108        {hint && <p className="mt-0.5 break-words text-xs text-ink-4">{hint}</p>}
 109      </div>
 110    );
 111  }
 112  
 113  export function Meter({
 114    value,
 115    tone = "brand",
 116    label,
 117    className = "",
 118  }: {
 119    value: number;
 120    tone?: Tone;
 121    label?: string;
 122    className?: string;
 123  }) {
 124    const pct = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) * 100 : 0;
 125    return (
 126      <div
 127        role="progressbar"
 128        aria-label={label}
 129        aria-valuemin={0}
 130        aria-valuemax={100}
 131        aria-valuenow={Math.round(pct)}
 132        className={`h-2 overflow-hidden rounded-full bg-line ${className}`}
 133      >
 134        <div
 135          className={`h-full rounded-full transition-[width] duration-500 ${BAR_TONE[tone]}`}
 136          style={{ width: `${pct}%` }}
 137        />
 138      </div>
 139    );
 140  }
 141  
 142  export function Segmented<T extends string | number>({
 143    label,
 144    options,
 145    value,
 146    onChange,
 147    fill = false,
 148    disabled = false,
 149    className = "",
 150  }: {
```

## Outgoing connections
- call -> components/Icons.tsx (web:components:Icons)
- call -> lib/dateFormat.ts (web:lib:dateFormat)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- /bills (web:bills) -> call
- /blood-pressure (web:blood-pressure) -> call
- /calendar (web:calendar) -> call
- /commission (web:commission) -> call
- components/CompanyRedirect.tsx (web:components:CompanyRedirect) -> call
- components/ConfirmDialog.tsx (web:components:ConfirmDialog) -> call
- components/HomeOverview.tsx (web:components:HomeOverview) -> call
- components/Modal.tsx (web:components:Modal) -> call
- /credit-card (web:credit-card) -> call
- /house-payments (web:house-payments) -> call
- /installments (web:installments) -> call
- /lotto (web:lotto) -> call
- /monthly-expenses (web:monthly-expenses) -> call
- /payslip (web:payslip) -> call
- /salary-stats (web:salary-stats) -> call
- /settings (web:settings) -> call
