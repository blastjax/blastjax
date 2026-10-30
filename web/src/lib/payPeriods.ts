import {
  bulkUpsertCalendarDayOverrides,
  getCalendarDayOverrides,
  type CalendarDayOverrideRow,
  type MonthlyExpenseRow,
} from "@/lib/api";
import { addMonths, formatMonthDayShort, toIsoDateLocal } from "@/lib/dateFormat";

export type PeriodHalf = 1 | 2;

export type OverrideWrite = { day: string; amount: number; saved?: number };

// Fixed expenses are filed under the payslip half funding a pay period, not the pay period's own half.
export function payslipHalfFor(calendarHalf: PeriodHalf): PeriodHalf {
  return calendarHalf === 1 ? 2 : 1;
}

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

export function spreadCentsEvenly(
  order: string[],
  balances: Map<string, number>,
  deltaCents: number,
): Map<string, number> {
  const result = new Map(balances);
  if (deltaCents === 0 || order.length === 0) return result;
  if (deltaCents > 0) {
    const n = order.length;
    const base = Math.trunc(deltaCents / n);
    let leftover = deltaCents - base * n;
    for (const iso of order) {
      let share = base;
      if (leftover > 0) {
        share += 1;
        leftover -= 1;
      }
      result.set(iso, (result.get(iso) ?? 0) + share);
    }
    return result;
  }
  let remaining = -deltaCents;
  let pool = order.filter((iso) => (result.get(iso) ?? 0) > 0);
  while (remaining > 0 && pool.length > 0) {
    const share = Math.floor(remaining / pool.length);
    if (share === 0) {
      for (const iso of pool) {
        if (remaining <= 0) break;
        result.set(iso, (result.get(iso) ?? 0) - 1);
        remaining -= 1;
      }
      break;
    }
    const nextPool: string[] = [];
    for (const iso of pool) {
      const cur = result.get(iso) ?? 0;
      const take = Math.min(cur, share);
      result.set(iso, cur - take);
      remaining -= take;
      if (cur - take > 0) nextPool.push(iso);
    }
    pool = nextPool;
  }
  return result;
}

// A budget change made away from the calendar, like a card payment, reaching its days. Days never pinned follow the
// even split on their own, so pinned ones take only their share, over those still open; whatever they can't cover
// is banked on the first of them, as the calendar's own expense form does.
// ponytail: the next period's Carry over entry waits for the calendar's next edit to catch up with a banked amount.
function spreadOverPinnedDays(
  starts: Map<string, string>,
  rows: readonly CalendarDayOverrideRow[],
  period: { year: number; month: number; half: PeriodHalf },
  deltaNet: number,
  todayIso: string,
): OverrideWrite[] {
  const { year, month, half } = period;
  const end = periodEndIso(starts, year, month, half);
  const days: string[] = [];
  for (let iso = effectiveHalfStartIso(starts, year, month, half); iso <= end; iso = addDaysIso(iso, 1)) days.push(iso);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const pinned = days.filter((iso) => byDay.has(iso));
  if (pinned.length === 0 || deltaNet === 0) return [];

  const cents = (iso: string) => Math.round((byDay.get(iso)?.amount ?? 0) * 100);
  const open = pinned.filter((iso) => iso >= todayIso && !(iso === end && byDay.get(iso)?.saved != null));
  const deltaCents = Math.round((deltaNet * 100 * pinned.length) / days.length);
  const after = spreadCentsEvenly(open, new Map(open.map((iso) => [iso, cents(iso)])), deltaCents);
  const moved = open.reduce((s, iso) => s + (after.get(iso) ?? 0) - cents(iso), 0);

  const writes = new Map<string, OverrideWrite>(
    open.map((iso) => [iso, { day: iso, amount: (after.get(iso) ?? 0) / 100 }]),
  );
  if (moved !== deltaCents) {
    const bank = open[0] ?? pinned[pinned.length - 1];
    writes.set(bank, {
      day: bank,
      amount: (after.get(bank) ?? cents(bank)) / 100,
      saved: (Math.round((byDay.get(bank)?.saved ?? 0) * 100) - (moved - deltaCents)) / 100,
    });
  }
  return [...writes.values()];
}

// A used calendar's days are pinned, so they'd ignore these changes unless they're spread over them.
export async function spreadBudgetChanges(
  starts: Map<string, string>,
  changes: readonly { year: number; month: number; half: PeriodHalf; delta: number }[],
): Promise<void> {
  if (changes.length === 0) return;
  const { overrides } = await getCalendarDayOverrides();
  const today = toIsoDateLocal(new Date());
  const writes = changes.flatMap((c) => spreadOverPinnedDays(starts, overrides, c, c.delta, today));
  if (writes.length > 0) await bulkUpsertCalendarDayOverrides(writes);
}

export function periodRangeLabel(
  overrides: Map<string, string>,
  year: number,
  month: number,
  half: PeriodHalf,
): string {
  return `${formatMonthDayShort(effectiveHalfStartIso(overrides, year, month, half))} – ${formatMonthDayShort(periodEndIso(overrides, year, month, half))}`;
}
