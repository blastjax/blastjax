"use client";

import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/Icons";
import { MONTH_NAMES_SHORT as MN } from "@/lib/dateFormat";

/**
 * Shared chrome for the Salary Stats and Commission pages, ported 1:1 from the
 * Claude Design "Sophos Payslip" file. Colors are the `st-*` tokens scoped to
 * `.stats-page` in globals.css; charts are hand-rolled SVG like the design.
 */

const sans = Geist({ subsets: ["latin"], variable: "--st-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--st-mono" });

export const STATS_PAGE_CLASSES = `stats-page ${sans.variable} ${mono.variable} mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-5 px-4 pb-28 pt-6 text-[14px] text-st-2 sm:px-8 sm:pb-16 sm:pt-8`;

export const STATS_CARD_CLASSES =
  "rounded-2xl border border-st-line bg-st-card p-4 sm:p-6";
export const STATS_H2_CLASSES = "text-base font-semibold text-st-1";
export const STATS_SUB_CLASSES = "mt-1 text-[13px] text-st-3";
export const STATS_TICK_CLASSES = "fill-st-4 font-st-mono text-[11px]";
export const STATS_XLABEL_CLASSES = "fill-st-4 text-[11px]";
export const STATS_TIP_CLASSES =
  "pointer-events-none absolute top-1 flex flex-col rounded-[10px] border border-st-line-strong bg-st-well px-3.5 py-3 text-[12.5px] shadow-[0_12px_32px_rgba(0,0,0,.15)] dark:shadow-[0_12px_32px_rgba(0,0,0,.5)]";

/** `12.5k`, `1.25M`, `−3k` — compact axis / heatmap amounts. */
export function fk(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  if (a === 0) return "0";
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(".0", "")}k`;
  return `${s}${Math.round(a)}`;
}

/** Smallest 1/2/2.5/5/10 × 10ⁿ step ≥ `raw`, for round axis ticks. */
export function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].find((x) => x * p >= raw)! * p;
}

export const pctOf = (a: number, b: number) => (b ? (a / b) * 100 : 0);

/** X-axis month labels, thinned as the range grows: every month up to 14,
 * quarters up to 30, then Januaries only. `m` is 0-based. */
export function xLabels(
  list: readonly { y: number; m: number }[],
  xf: (i: number) => number,
  y: number,
) {
  const n = list.length;
  return list.flatMap((d, i) => {
    const show = n <= 14 || (n <= 30 ? d.m % 3 === 0 : d.m === 0);
    if (!show) return [];
    const withYear = d.m === 0 || (n <= 14 && i === 0);
    return [{ x: xf(i), y, label: withYear ? `${MN[d.m]} ’${String(d.y).slice(2)}` : MN[d.m] }];
  });
}

/** Live content width of an element, via a callback ref (0 until measured). */
export function useWidth(): [(el: HTMLElement | null) => void, number] {
  const [w, setW] = useState(0);
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    ro.current = new ResizeObserver(([e]) => setW(Math.round(e!.contentRect.width)));
    ro.current.observe(el);
  }, []);
  return [ref, w];
}

export function StatsHeader({
  company,
  title,
  description,
  children,
}: {
  company: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-1 flex flex-wrap items-end justify-between gap-5">
      <div className="flex flex-col gap-1.5">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1.5 whitespace-nowrap text-[12.5px] text-st-4"
        >
          <Link href="/" className="hover:text-st-2">Home</Link>
          <ChevronRightIcon className="size-3" />
          <Link href={`/payslip/${encodeURIComponent(company)}`} className="hover:text-st-2">
            {company} Payslip
          </Link>
          <ChevronRightIcon className="size-3" />
          <span className="text-st-teal" aria-current="page">{title}</span>
        </nav>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-st-1">{title}</h1>
        <p className="text-st-3">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-[9px] border border-st-line bg-st-well p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-[12.5px] font-medium ${
            o.value === value ? "bg-st-seg text-st-1 shadow-xs dark:shadow-none" : "text-st-3"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** ‹ year › control. `lg` is the page-header version with a sub-label. */
export function YearStepper({
  year,
  sub,
  canPrev,
  canNext,
  onPrev,
  onNext,
  lg = false,
}: {
  year: number;
  sub?: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  lg?: boolean;
}) {
  const btn = `grid place-items-center text-st-2 hover:bg-st-hover disabled:opacity-30 disabled:hover:bg-transparent ${
    lg ? "size-8 rounded-[7px]" : "size-7 rounded-md"
  }`;
  const icon = lg ? "size-4" : "size-[15px]";
  return (
    <div
      className={`flex items-center border border-st-line ${
        lg ? "gap-1 rounded-[10px] bg-st-cell p-1" : "gap-0.5 rounded-[9px] bg-st-well p-[3px]"
      }`}
    >
      <button type="button" className={btn} disabled={!canPrev} onClick={onPrev} aria-label="Previous year">
        <ChevronLeftIcon className={icon} />
      </button>
      {lg ? (
        <div className="flex min-w-24 flex-col text-center leading-[1.15]">
          <span className="text-[15px] font-semibold text-st-1">{year}</span>
          <span className="text-[11px] text-st-4">{sub}</span>
        </div>
      ) : (
        <span className="min-w-12 text-center text-[13.5px] font-semibold text-st-1">{year}</span>
      )}
      <button type="button" className={btn} disabled={!canNext} onClick={onNext} aria-label="Next year">
        <ChevronRightIcon className={icon} />
      </button>
    </div>
  );
}

/** Toggleable legend pill; the swatch empties when the series is hidden. */
export function Chip({
  label,
  color,
  on,
  round = false,
  onClick,
}: {
  label: string;
  color: string;
  on: boolean;
  round?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border border-st-line-strong px-2.5 py-1 text-xs ${
        on ? "bg-st-hover text-st-1" : "text-st-4"
      }`}
    >
      <span
        className={`size-2 ${round ? "rounded-full" : "rounded-[2px]"}`}
        style={{ background: on ? color : "transparent" }}
      />
      {label}
    </button>
  );
}
