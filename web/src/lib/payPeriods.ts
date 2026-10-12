import type { MonthlyExpenseRow } from "@/lib/api";
import { addMonths, parseDateOnlyLocal } from "@/lib/dateFormat";

export type PeriodHalf = 1 | 2;

export function dateIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const d2 = new Date(y, m - 1, d + delta);
  return dateIso(d2.getFullYear(), d2.getMonth() + 1, d2.getDate());
}

export function latestHalfStartIso(year: number, month: number, half: PeriodHalf): string {
  return half === 1 ? dateIso(year, month, 1) : dateIso(year, month, 16);
}

// Payday: the 1st half the day before the previous month's last day (30th, 31st, 28th/29th),
// the 2nd half the day before the 15th. When that day is a Sat/Sun/Mon, the Thursday before.
const DAYS_BACK_BY_WEEKDAY = [3, 4, 1, 1, 1, 1, 2];

export function defaultHalfStartIso(year: number, month: number, half: PeriodHalf): string {
  const ref = half === 1 ? new Date(year, month - 1, 0) : new Date(year, month - 1, 15);
  ref.setDate(ref.getDate() - DAYS_BACK_BY_WEEKDAY[ref.getDay()]);
  return dateIso(ref.getFullYear(), ref.getMonth() + 1, ref.getDate());
}

export function periodKey(year: number, month: number, half: PeriodHalf): string {
  return `${year}-${month}-${half}`;
}

export function effectiveHalfStartIso(
  overrides: Map<string, string>,
  year: number,
  month: number,
  half: PeriodHalf,
): string {
  return overrides.get(periodKey(year, month, half)) ?? defaultHalfStartIso(year, month, half);
}

export function periodEndIso(
  overrides: Map<string, string>,
  year: number,
  month: number,
  half: PeriodHalf,
): string {
  if (half === 1) return addDaysIso(effectiveHalfStartIso(overrides, year, month, 2), -1);
  const next = addMonths(year, month, 1);
  return addDaysIso(effectiveHalfStartIso(overrides, next.y, next.m, 1), -1);
}

export function periodForDate(
  overrides: Map<string, string>,
  iso: string,
): { year: number; month: number; half: PeriodHalf } {
  const [year, month] = iso.split("-").map(Number);
  const next = addMonths(year, month, 1);
  if (iso >= effectiveHalfStartIso(overrides, next.y, next.m, 1)) return { year: next.y, month: next.m, half: 1 };
  return { year, month, half: iso >= effectiveHalfStartIso(overrides, year, month, 2) ? 2 : 1 };
}

// The day a dated monthly expense falls on in a calendar month: its date when one-off,
// the same day of every month (clamped to short months) when recurring.
export function billDayIso(e: MonthlyExpenseRow, year: number, month: number): string | null {
  if (!e.expense_date) return null;
  if (!e.is_recurring) return e.expense_date;
  const day = Number(e.expense_date.slice(8, 10));
  return dateIso(year, month, Math.min(day, new Date(year, month, 0).getDate()));
}

// Earliest date first, undated bills last.
export function compareDue(a: string | null, b: string | null): number {
  return (a ?? "9999").localeCompare(b ?? "9999");
}

const SHORT_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function periodRangeLabel(
  overrides: Map<string, string>,
  year: number,
  month: number,
  half: PeriodHalf,
): string {
  const fmt = (iso: string) => {
    const d = parseDateOnlyLocal(iso);
    return d ? SHORT_DAY.format(d) : iso;
  };
  return `${fmt(effectiveHalfStartIso(overrides, year, month, half))} – ${fmt(periodEndIso(overrides, year, month, half))}`;
}
