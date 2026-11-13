import {
  bulkUpsertCalendarDayOverrides,
  getCalendarDayOverrides,
  type BillCategoryRow,
  type BillRow,
  type CalendarDayOverrideRow,
  type CreditCardRow,
  type FixedExpenseRow,
  type MonthlyExpenseRow,
  type PayslipRow,
  type TravelTripRow,
} from "@/lib/api";
import { addMonths, formatMonthDayShort, monthKey, toIsoDateLocal } from "@/lib/dateFormat";

export type PeriodHalf = 1 | 2;

export type OverrideWrite = { day: string; amount: number; saved?: number };

type BudgetChange = { year: number; month: number; half: PeriodHalf; delta: number };

type ChargedMonths = MonthlyExpenseRow["charged_months"];

// The card an expense is on in a month: a choice holds from its own month until the next one.
export function chargedCardIn(charged: ChargedMonths, month: string): string | null {
  const from = Object.keys(charged).filter((m) => m <= month).sort().pop();
  return from ? charged[from] : null;
}

// A card, or none, picked for a month decides that month and every later one, so later choices give way to it.
export function chargeFrom(charged: ChargedMonths, month: string, cardId: string | null): ChargedMonths {
  const earlier = Object.fromEntries(Object.entries(charged).filter(([m]) => m < month));
  return chargedCardIn(earlier, month) === cardId ? earlier : { ...earlier, [month]: cardId };
}

// Months are pay-period months, as the Monthly Expenses page shows them.
export function isOffBudget(e: MonthlyExpenseRow, month: string): boolean {
  return e.skipped_months.includes(month) || chargedCardIn(e.charged_months, month) != null;
}

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

export type ExpenseDue = { half: PeriodHalf; due: string | null; amount: number; fromBill: boolean };

// Where an expense's own schedule puts it in a pay-period month: dated ones by whichever of their dates falls in it,
// undated ones in the half they were filed under.
function plannedDuesIn(e: MonthlyExpenseRow, starts: Map<string, string>, year: number, month: number): ExpenseDue[] {
  const planned = (half: PeriodHalf, due: string | null) => ({ half, due, amount: e.amount, fromBill: false });
  if (!e.expense_date) {
    const applies = e.is_recurring || (e.period_year === year && e.period_month === month);
    return applies && (e.period_half === 1 || e.period_half === 2) ? [planned(e.period_half, null)] : [];
  }
  const prev = addMonths(year, month, -1);
  const days = e.is_recurring ? [billDayIso(e, prev.y, prev.m), billDayIso(e, year, month)] : [e.expense_date];
  return days.flatMap((due) => {
    const p = due ? periodForDate(starts, due) : null;
    return p && p.year === year && p.month === month ? [planned(p.half, due)] : [];
  });
}

// Where an expense lands in a pay-period month, and for how much: a real bill due that month replaces the estimate.
export function expenseDuesIn(
  e: MonthlyExpenseRow,
  starts: Map<string, string>,
  year: number,
  month: number,
  bills: readonly BillRow[] = [],
): ExpenseDue[] {
  const planned = plannedDuesIn(e, starts, year, month);
  if (e.bill_category_id == null || (!e.is_recurring && planned.length === 0)) return planned;
  const billed = bills.flatMap((b): ExpenseDue[] => {
    if (b.category_id !== e.bill_category_id || b.amount == null) return [];
    const p = periodForDate(starts, b.due_date);
    return p.year === year && p.month === month
      ? [{ half: p.half, due: b.due_date, amount: b.amount, fromBill: true }]
      : [];
  });
  return billed.length > 0 ? billed : planned;
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

async function writeSpread(
  starts: Map<string, string>,
  rows: readonly CalendarDayOverrideRow[],
  changes: readonly BudgetChange[],
): Promise<void> {
  const today = toIsoDateLocal(new Date());
  const writes = changes.flatMap((c) => spreadOverPinnedDays(starts, rows, c, c.delta, today));
  if (writes.length > 0) await bulkUpsertCalendarDayOverrides(writes);
}

// A used calendar's days are pinned, so they'd ignore these changes unless they're spread over them.
export async function spreadBudgetChanges(starts: Map<string, string>, changes: readonly BudgetChange[]): Promise<void> {
  if (changes.length === 0) return;
  await writeSpread(starts, (await getCalendarDayOverrides()).overrides, changes);
}

// What an expense takes out of a month's pay periods.
function deductedIn(
  e: MonthlyExpenseRow | null,
  starts: Map<string, string>,
  bills: readonly BillRow[],
  year: number,
  month: number,
): Record<PeriodHalf, number> {
  const out: Record<PeriodHalf, number> = { 1: 0, 2: 0 };
  if (e && !isOffBudget(e, monthKey(year, month))) {
    for (const d of expenseDuesIn(e, starts, year, month, bills)) out[d.half] += d.amount;
  }
  return out;
}

// Spreads what changing expenses or bills did to the budget, from the pay period in progress as far as there are
// pinned days: past that, days follow the even split by themselves. Ended periods are left as the record they are.
export async function spreadExpenseChanges(
  starts: Map<string, string>,
  changes: readonly { before: MonthlyExpenseRow | null; after: MonthlyExpenseRow | null }[],
  billsBefore: readonly BillRow[],
  billsAfter: readonly BillRow[] = billsBefore,
): Promise<void> {
  if (changes.length === 0) return;
  const { overrides } = await getCalendarDayOverrides();
  const lastDay = overrides.reduce((last, o) => (o.day > last ? o.day : last), "");
  if (!lastDay) return;
  const today = toIsoDateLocal(new Date());
  const first = periodForDate(starts, today);
  const last = periodForDate(starts, lastDay);
  const moved: BudgetChange[] = [];
  for (let at = { y: first.year, m: first.month }; monthKey(at.y, at.m) <= monthKey(last.year, last.month); at = addMonths(at.y, at.m, 1)) {
    for (const half of [1, 2] as const) {
      if (periodEndIso(starts, at.y, at.m, half) < today) continue;
      const delta = changes.reduce(
        (sum, c) =>
          sum +
          deductedIn(c.before, starts, billsBefore, at.y, at.m)[half] -
          deductedIn(c.after, starts, billsAfter, at.y, at.m)[half],
        0,
      );
      if (Math.abs(delta) >= 0.005) moved.push({ year: at.y, month: at.m, half, delta });
    }
  }
  await writeSpread(starts, overrides, moved);
}

export function fundingPeriodFor(
  calendarHalf: PeriodHalf,
  year: number,
  month: number,
): { year: number; month: number } {
  if (calendarHalf === 2) return { year, month };
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export type BudgetData = {
  starts: Map<string, string>;
  payslips: readonly PayslipRow[];
  fixed: readonly FixedExpenseRow[];
  expenses: readonly MonthlyExpenseRow[];
  bills: readonly BillRow[];
  overrides: readonly CalendarDayOverrideRow[];
};

// Today's place in its pay period, as the calendar works it out. Null until that period has a payslip.
export function budgetToday(data: BudgetData, today: string) {
  const { starts, payslips, fixed, expenses, bills, overrides } = data;
  const { year, month, half } = periodForDate(starts, today);
  const funding = fundingPeriodFor(half, year, month);
  const filedAs = payslipHalfFor(half);
  const pay = payslips.find(
    (p) => p.period_half === filedAs && p.period_year === funding.year && p.period_month === funding.month,
  )?.total;
  if (pay == null) return null;

  const period = fixed.filter((e) => e.period_year === year && e.period_month === month && e.period_half === filedAs);
  const net =
    pay -
    period.reduce((s, e) => s + e.amount, 0) -
    expenses.reduce((s, e) => s + deductedIn(e, starts, bills, year, month)[half], 0);

  const days: string[] = [];
  const end = periodEndIso(starts, year, month, half);
  for (let iso = effectiveHalfStartIso(starts, year, month, half); iso <= end; iso = addDaysIso(iso, 1)) days.push(iso);
  const pinned = new Map(overrides.map((o) => [o.day, o.amount]));
  const amount = (iso: string) => pinned.get(iso) ?? net / days.length;
  const open = days.filter((iso) => iso >= today);
  return {
    today: amount(today),
    left: open.reduce((s, iso) => s + amount(iso), 0),
    daysLeft: open.length,
    net,
  };
}

export type Reminder = { day: string; name: string; amount: number | null; href: string };

// Due dates that aren't taken from the budget on the day: a card payment or the linked expense does that. A bill a
// monthly expense reads from shows as that expense, and a statement already paid has nothing left to remind about.
export function dueReminders(
  categories: readonly BillCategoryRow[],
  bills: readonly BillRow[],
  cards: readonly CreditCardRow[],
  expenses: readonly MonthlyExpenseRow[],
): Reminder[] {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const shownAsExpense = new Set(expenses.map((e) => e.bill_category_id));
  const paid = cards.filter((c) => c.statement_paid);
  return [
    ...bills
      .filter(
        (b) =>
          !shownAsExpense.has(b.category_id) &&
          !paid.some((c) => c.bill_category_id === b.category_id && c.due_date === b.due_date),
      )
      .map((b) => ({ day: b.due_date, name: names.get(b.category_id) ?? "Bill", amount: b.amount, href: "/bills" })),
    ...cards
      .filter((c) => c.bill_category_id == null && c.due_date != null && !c.statement_paid)
      .map((c) => ({
        day: c.due_date as string,
        name: c.name,
        amount: c.last_statement_balance,
        href: "/credit-card",
      })),
  ];
}

export function tripReminders(trips: readonly TravelTripRow[]): Reminder[] {
  return trips.flatMap((t) => {
    const trip = { amount: null, href: "/travels" };
    return t.start_date === t.end_date
      ? [{ ...trip, day: t.start_date, name: t.title }]
      : [
          { ...trip, day: t.start_date, name: `${t.title} starts` },
          { ...trip, day: t.end_date, name: `${t.title} ends` },
        ];
  });
}

export function periodRangeLabel(
  overrides: Map<string, string>,
  year: number,
  month: number,
  half: PeriodHalf,
): string {
  return `${formatMonthDayShort(effectiveHalfStartIso(overrides, year, month, half))} – ${formatMonthDayShort(periodEndIso(overrides, year, month, half))}`;
}
