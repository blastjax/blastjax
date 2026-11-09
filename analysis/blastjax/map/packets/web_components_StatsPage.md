# Node web:components:StatsPage: components/StatsPage.tsx
Kind: module
Language: typescript, 190 lines of code, location: web/src/components/StatsPage.tsx

Source excerpt: web/src/components/StatsPage.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import Link from "next/link";
   4  import { Geist, Geist_Mono } from "next/font/google";
   5  import { useCallback, useRef, useState, type ReactNode } from "react";
   6  import { ChevronLeftIcon, ChevronRightIcon } from "@/components/Icons";
   7  import { MONTH_NAMES_SHORT as MN } from "@/lib/dateFormat";
   8  
   9  const sans = Geist({ subsets: ["latin"], variable: "--st-sans" });
  10  const mono = Geist_Mono({ subsets: ["latin"], variable: "--st-mono" });
  11  
  12  export const STATS_PAGE_CLASSES = `stats-page ${sans.variable} ${mono.variable} mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-5 px-4 pb-28 pt-6 text-[14px] text-st-2 sm:px-8 sm:pb-16 sm:pt-8`;
  13  
  14  export const STATS_CARD_CLASSES =
  15    "rounded-2xl border border-st-line bg-st-card p-4 sm:p-6";
  16  export const STATS_H2_CLASSES = "text-base font-semibold text-st-1";
  17  export const STATS_SUB_CLASSES = "mt-1 text-[13px] text-st-3";
  18  export const STATS_TICK_CLASSES = "fill-st-4 font-st-mono text-[11px]";
  19  export const STATS_XLABEL_CLASSES = "fill-st-4 text-[11px]";
  20  export const STATS_TIP_CLASSES =
  21    "pointer-events-none absolute top-1 flex flex-col rounded-[10px] border border-st-line-strong bg-st-well px-3.5 py-3 text-[12.5px] shadow-[0_12px_32px_rgba(0,0,0,.15)] dark:shadow-[0_12px_32px_rgba(0,0,0,.5)]";
  22  
  23  export function fk(n: number): string {
  24    const a = Math.abs(n);
  25    const s = n < 0 ? "−" : "";
  26    if (a === 0) return "0";
  27    if (a >= 1e6) return `${s}${(a / 1e6).toFixed(2)}M`;
  28    if (a >= 1e3) return `${s}${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(".0", "")}k`;
  29    return `${s}${Math.round(a)}`;
  30  }
  31  
  32  export function niceStep(raw: number): number {
  33    const p = 10 ** Math.floor(Math.log10(raw || 1));
  34    return [1, 2, 2.5, 5, 10].find((x) => x * p >= raw)! * p;
  35  }
  36  
  37  export const pctOf = (a: number, b: number) => (b ? (a / b) * 100 : 0);
  38  
  39  export function xLabels(
  40    list: readonly { y: number; m: number }[],
  41    xf: (i: number) => number,
  42    y: number,
  43  ) {
  44    const n = list.length;
  45    const gap = n > 1 ? Math.abs(xf(1) - xf(0)) : Infinity;
  46    const base = n <= 14 ? 1 : n <= 30 ? 3 : 12;
  47    // ~44px keeps "Jan ’26" clear of its neighbour on narrow (phone) charts.
  48    const step = [1, 2, 3, 6, 12].find((s) => s >= base && s * gap >= 44) ?? 12;
  49    return list.flatMap((d, i) => {
  50      if (d.m % step !== 0) return [];
  51      const withYear = d.m === 0 || (n <= 14 && i === 0);
  52      return [{ x: xf(i), y, label: withYear ? `${MN[d.m]} ’${String(d.y).slice(2)}` : MN[d.m] }];
  53    });
  54  }
  55  
  56  export function useWidth(): [(el: HTMLElement | null) => void, number] {
  57    const [w, setW] = useState(0);
  58    const ro = useRef<ResizeObserver | null>(null);
  59    const ref = useCallback((el: HTMLElement | null) => {
  60      ro.current?.disconnect();
  61      if (!el) return;
  62      ro.current = new ResizeObserver(([e]) => setW(Math.round(e!.contentRect.width)));
  63      ro.current.observe(el);
  64    }, []);
  65    return [ref, w];
  66  }
  67  
  68  export function StatsHeader({
  69    company,
  70    title,
  71    description,
  72    children,
  73  }: {
  74    company: string;
  75    title: string;
  76    description: string;
  77    children?: ReactNode;
  78  }) {
  79    return (
  80      <div className="mb-1 flex flex-wrap items-end justify-between gap-5">
  81        <div className="flex flex-col gap-1.5">
  82          <nav
  83            aria-label="Breadcrumb"
  84            className="flex flex-wrap items-center gap-1.5 whitespace-nowrap text-[12.5px] text-st-4"
  85          >
  86            <Link href="/" className="hover:text-st-2">Home</Link>
  87            <ChevronRightIcon className="size-3" />
  88            <Link href={`/payslip/${encodeURIComponent(company)}`} className="hover:text-st-2">
  89              {company} Payslip
  90            </Link>
  91            <ChevronRightIcon className="size-3" />
  92            <span className="text-st-teal" aria-current="page">{title}</span>
  93          </nav>
  94          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-st-1">{title}</h1>
  95          <p className="text-st-3">{description}</p>
  96        </div>
  97        {children}
  98      </div>
  99    );
 100  }
 101  
 102  export function Segmented<T extends string | number>({
 103    options,
 104    value,
 105    onChange,
 106  }: {
 107    options: readonly { value: T; label: string }[];
 108    value: T;
 109    onChange: (v: T) => void;
 110  }) {
 111    return (
 112      <div className="flex gap-0.5 rounded-[9px] border border-st-line bg-st-well p-[3px]">
 113        {options.map((o) => (
 114          <button
 115            key={o.value}
 116            type="button"
 117            aria-pressed={o.value === value}
 118            onClick={() => onChange(o.value)}
 119            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-[12.5px] font-medium ${
 120              o.value === value ? "bg-st-seg text-st-1 shadow-xs dark:shadow-none" : "text-st-3"
 121            }`}
 122          >
 123            {o.label}
 124          </button>
 125        ))}
 126      </div>
 127    );
 128  }
 129  
 130  export function YearStepper({
 131    year,
 132    sub,
 133    canPrev,
 134    canNext,
 135    onPrev,
 136    onNext,
 137    lg = false,
 138  }: {
 139    year: number;
 140    sub?: string;
 141    canPrev: boolean;
 142    canNext: boolean;
 143    onPrev: () => void;
 144    onNext: () => void;
 145    lg?: boolean;
 146  }) {
 147    const btn = `grid place-items-center text-st-2 hover:bg-st-hover disabled:opacity-30 disabled:hover:bg-transparent ${
 148      lg ? "size-8 rounded-[7px]" : "size-7 rounded-md"
 149    }`;
 150    const icon = lg ? "size-4" : "size-[15px]";
```

## Outgoing connections
- call -> components/Icons.tsx (web:components:Icons)
- call -> lib/dateFormat.ts (web:lib:dateFormat)

## Incoming connections
- /commission (web:commission) -> call
- /salary-stats (web:salary-stats) -> call
