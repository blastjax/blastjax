# Node web:lib:payPeriods: lib/payPeriods.ts
Kind: module
Language: typescript, 341 lines of code, location: web/src/lib/payPeriods.ts

Source excerpt: web/src/lib/payPeriods.ts (first 150 lines)
```
   1  import {
   2    bulkUpsertCalendarDayOverrides,
   3    getCalendarDayOverrides,
   4    type BillCategoryRow,
   5    type BillRow,
   6    type CalendarDayOverrideRow,
   7    type CreditCardRow,
   8    type FixedExpenseRow,
   9    type MonthlyExpenseRow,
  10    type PayslipRow,
  11    type TravelTripRow,
  12  } from "@/lib/api";
  13  import { addMonths, formatMonthDayShort, monthKey, toIsoDateLocal } from "@/lib/dateFormat";
  14  
  15  export type PeriodHalf = 1 | 2;
  16  
  17  export type OverrideWrite = { day: string; amount: number; saved?: number };
  18  
  19  type BudgetChange = { year: number; month: number; half: PeriodHalf; delta: number };
  20  
  21  type ChargedMonths = MonthlyExpenseRow["charged_months"];
  22  
  23  // The card an expense is on in a month: a choice holds from its own month until the next one.
  24  export function chargedCardIn(charged: ChargedMonths, month: string): string | null {
  25    const from = Object.keys(charged).filter((m) => m <= month).sort().pop();
  26    return from ? charged[from] : null;
  27  }
  28  
  29  // A card, or none, picked for a month decides that month and every later one, so later choices give way to it.
  30  export function chargeFrom(charged: ChargedMonths, month: string, cardId: string | null): ChargedMonths {
  31    const earlier = Object.fromEntries(Object.entries(charged).filter(([m]) => m < month));
  32    return chargedCardIn(earlier, month) === cardId ? earlier : { ...earlier, [month]: cardId };
  33  }
  34  
  35  // Months are pay-period months, as the Monthly Expenses page shows them.
  36  export function isOffBudget(e: MonthlyExpenseRow, month: string): boolean {
  37    return e.skipped_months.includes(month) || chargedCardIn(e.charged_months, month) != null;
  38  }
  39  
  40  // Fixed expenses are filed under the payslip half funding a pay period, not the pay period's own half.
  41  export function payslipHalfFor(calendarHalf: PeriodHalf): PeriodHalf {
  42    return calendarHalf === 1 ? 2 : 1;
  43  }
  44  
  45  export function dateIso(year: number, month: number, day: number): string {
  46    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  47  }
  48  
  49  export function addDaysIso(iso: string, delta: number): string {
  50    const [y, m, d] = iso.split("-").map(Number);
  51    const d2 = new Date(y, m - 1, d + delta);
  52    return dateIso(d2.getFullYear(), d2.getMonth() + 1, d2.getDate());
  53  }
  54  
  55  export function latestHalfStartIso(year: number, month: number, half: PeriodHalf): string {
  56    return half === 1 ? dateIso(year, month, 1) : dateIso(year, month, 16);
  57  }
  58  
  59  // Payday: the 1st half the day before the previous month's last day (30th, 31st, 28th/29th),
  60  // the 2nd half the day before the 15th. When that day is a Sat/Sun/Mon, the Thursday before.
  61  const DAYS_BACK_BY_WEEKDAY = [3, 4, 1, 1, 1, 1, 2];
  62  
  63  export function defaultHalfStartIso(year: number, month: number, half: PeriodHalf): string {
  64    const ref = half === 1 ? new Date(year, month - 1, 0) : new Date(year, month - 1, 15);
  65    ref.setDate(ref.getDate() - DAYS_BACK_BY_WEEKDAY[ref.getDay()]);
  66    return dateIso(ref.getFullYear(), ref.getMonth() + 1, ref.getDate());
  67  }
  68  
  69  export function periodKey(year: number, month: number, half: PeriodHalf): string {
  70    return `${year}-${month}-${half}`;
  71  }
  72  
  73  export function effectiveHalfStartIso(
  74    overrides: Map<string, string>,
  75    year: number,
  76    month: number,
  77    half: PeriodHalf,
  78  ): string {
  79    return overrides.get(periodKey(year, month, half)) ?? defaultHalfStartIso(year, month, half);
  80  }
  81  
  82  export function periodEndIso(
  83    overrides: Map<string, string>,
  84    year: number,
  85    month: number,
  86    half: PeriodHalf,
  87  ): string {
  88    if (half === 1) return addDaysIso(effectiveHalfStartIso(overrides, year, month, 2), -1);
  89    const next = addMonths(year, month, 1);
  90    return addDaysIso(effectiveHalfStartIso(overrides, next.y, next.m, 1), -1);
  91  }
  92  
  93  export function periodForDate(
  94    overrides: Map<string, string>,
  95    iso: string,
  96  ): { year: number; month: number; half: PeriodHalf } {
  97    const [year, month] = iso.split("-").map(Number);
  98    const next = addMonths(year, month, 1);
  99    if (iso >= effectiveHalfStartIso(overrides, next.y, next.m, 1)) return { year: next.y, month: next.m, half: 1 };
 100    return { year, month, half: iso >= effectiveHalfStartIso(overrides, year, month, 2) ? 2 : 1 };
 101  }
 102  
 103  // The day a dated monthly expense falls on in a calendar month: its date when one-off,
 104  // the same day of every month (clamped to short months) when recurring.
 105  export function billDayIso(e: MonthlyExpenseRow, year: number, month: number): string | null {
 106    if (!e.expense_date) return null;
 107    if (!e.is_recurring) return e.expense_date;
 108    const day = Number(e.expense_date.slice(8, 10));
 109    return dateIso(year, month, Math.min(day, new Date(year, month, 0).getDate()));
 110  }
 111  
 112  export type ExpenseDue = { half: PeriodHalf; due: string | null; amount: number; fromBill: boolean };
 113  
 114  // Where an expense's own schedule puts it in a pay-period month: dated ones by whichever of their dates falls in it,
 115  // undated ones in the half they were filed under.
 116  function plannedDuesIn(e: MonthlyExpenseRow, starts: Map<string, string>, year: number, month: number): ExpenseDue[] {
 117    const planned = (half: PeriodHalf, due: string | null) => ({ half, due, amount: e.amount, fromBill: false });
 118    if (!e.expense_date) {
 119      const applies = e.is_recurring || (e.period_year === year && e.period_month === month);
 120      return applies && (e.period_half === 1 || e.period_half === 2) ? [planned(e.period_half, null)] : [];
 121    }
 122    const prev = addMonths(year, month, -1);
 123    const days = e.is_recurring ? [billDayIso(e, prev.y, prev.m), billDayIso(e, year, month)] : [e.expense_date];
 124    return days.flatMap((due) => {
 125      const p = due ? periodForDate(starts, due) : null;
 126      return p && p.year === year && p.month === month ? [planned(p.half, due)] : [];
 127    });
 128  }
 129  
 130  // Where an expense lands in a pay-period month, and for how much: a real bill due that month replaces the estimate.
 131  export function expenseDuesIn(
 132    e: MonthlyExpenseRow,
 133    starts: Map<string, string>,
 134    year: number,
 135    month: number,
 136    bills: readonly BillRow[] = [],
 137  ): ExpenseDue[] {
 138    const planned = plannedDuesIn(e, starts, year, month);
 139    if (e.bill_category_id == null || (!e.is_recurring && planned.length === 0)) return planned;
 140    const billed = bills.flatMap((b): ExpenseDue[] => {
 141      if (b.category_id !== e.bill_category_id || b.amount == null) return [];
 142      const p = periodForDate(starts, b.due_date);
 143      return p.year === year && p.month === month
 144        ? [{ half: p.half, due: b.due_date, amount: b.amount, fromBill: true }]
 145        : [];
 146    });
 147    return billed.length > 0 ? billed : planned;
 148  }
 149  
 150  // Earliest date first, undated bills last.
```

## Outgoing connections
- dispatch -> routers/calendar_day_override.py (be:router:calendar_day_override)
- call -> lib/api.ts (web:lib:api)
- call -> lib/dateFormat.ts (web:lib:dateFormat)

## Incoming connections
- /bills (web:bills) -> call
- /calendar (web:calendar) -> call
- components/HomeOverview.tsx (web:components:HomeOverview) -> call
- /credit-card (web:credit-card) -> call
- /monthly-expenses (web:monthly-expenses) -> call
