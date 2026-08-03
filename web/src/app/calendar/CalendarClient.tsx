"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import {
  bulkUpsertCalendarDayOverrides,
  createFixedExpense,
  deleteFixedExpense,
  deleteMonthlyExpense,
  deletePayPeriodStartOverride,
  getCalendarDayOverrides,
  getFixedExpenses,
  getMonthlyExpenses,
  getPayPeriodStartOverrides,
  getPayslips,
  upsertPayPeriodStartOverride,
  type FixedExpenseRow,
  type MonthlyExpenseRow,
  type PayslipRow,
} from "@/lib/api";
import { formatMonthDayShort, formatMonthYear } from "@/lib/dateFormat";
import { evaluateAmountExpression, parseFormNumber } from "@/lib/parseFormNumber";
import {
  ERROR_ALERT_CLASSES,
  INPUT_CLASSES,
  LOADING_TEXT_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
} from "@/lib/ui";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Custom drag-and-drop payload type carrying the source day-of-month. */
const DAY_DND_MIME = "text/x-calendar-day";

type PeriodHalf = 1 | 2;

/**
 * Payroll here is paid on a half-month lag: the payslip whose period_half is
 * 2 (16th–end) is the one that actually funds days 1–15 of the *next* month,
 * and the period_half 1 (1st–15th) payslip funds days 16–end. This maps a
 * calendar half (which days) to the payslip half (whose money) that funds it.
 */
function payslipHalfFor(calendarHalf: PeriodHalf): PeriodHalf {
  return calendarHalf === 1 ? 2 : 1;
}

/**
 * The specific payslip period (year/month) that funds a calendar half of the
 * viewed month — days 1–15 are funded by *last* month's 16th–end payslip;
 * days 16–end are funded by *this* month's 1st–15th payslip. Used to avoid
 * showing a stale payslip from a different month as if it funded this one.
 */
function fundingPeriodFor(
  calendarHalf: PeriodHalf,
  year: number,
  month: number,
): { year: number; month: number } {
  if (calendarHalf === 2) return { year, month };
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** Adds `delta` months to (year, month), wrapping the year as needed. */
function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroBased = month - 1 + delta;
  const y = year + Math.floor(zeroBased / 12);
  const m = (((zeroBased % 12) + 12) % 12) + 1;
  return { year: y, month: m };
}

/** Adds `delta` days to a "YYYY-MM-DD" string, returning a new "YYYY-MM-DD" string. */
function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const d2 = new Date(y, m - 1, d + delta);
  return dateIso(d2.getFullYear(), d2.getMonth() + 1, d2.getDate());
}

/** Inclusive day count between two "YYYY-MM-DD" strings (start <= end). */
function daysBetweenInclusive(startIso: string, endIso: string): number {
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ey, em, ed] = endIso.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd).getTime();
  const end = new Date(ey, em - 1, ed).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

/** The normal, un-overridden start of a pay period: the 1st, or the 16th. */
function defaultHalfStartIso(year: number, month: number, half: PeriodHalf): string {
  return half === 1 ? dateIso(year, month, 1) : dateIso(year, month, 16);
}

/** Key identifying one specific occurrence of a pay period, e.g. "2026-8-2". */
function periodKey(year: number, month: number, half: PeriodHalf): string {
  return `${year}-${month}-${half}`;
}

/** The start of a pay period, or its override (a payslip that landed earlier than normal). */
function effectiveHalfStartIso(
  overrides: Map<string, string>,
  year: number,
  month: number,
  half: PeriodHalf,
): string {
  return overrides.get(periodKey(year, month, half)) ?? defaultHalfStartIso(year, month, half);
}

/**
 * The end of a pay period is never stored — it's always the day before the
 * *next* period's start, so periods stay contiguous (no overlaps or gaps)
 * even as start dates move around. Half-1's end is bounded by the same
 * month's half-2 start; half-2's end is bounded by next month's half-1 start.
 */
function periodEndIso(
  overrides: Map<string, string>,
  year: number,
  month: number,
  half: PeriodHalf,
): string {
  if (half === 1) return addDaysIso(effectiveHalfStartIso(overrides, year, month, 2), -1);
  const next = addMonths(year, month, 1);
  return addDaysIso(effectiveHalfStartIso(overrides, next.year, next.month, 1), -1);
}

function periodDayCount(
  overrides: Map<string, string>,
  year: number,
  month: number,
  half: PeriodHalf,
): number {
  return daysBetweenInclusive(
    effectiveHalfStartIso(overrides, year, month, half),
    periodEndIso(overrides, year, month, half),
  );
}

/** Round to the nearest cent — avoids float noise (e.g. 1997.835625) mismatching displayed 2dp amounts. */
function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Spreads `deltaCents` evenly across the given day balances (in cents), returning the updated
 * balances. A positive delta adds evenly, with any leftover cent split one at a time. A negative
 * delta removes evenly without letting a balance drop below zero — if a day is exhausted before
 * absorbing its full share, the unclaimed remainder cascades to the days that still have room, so
 * an overspend is always pulled fully from the other days (short of every one of them hitting zero).
 */
function spreadCentsEvenly(
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

type DayCell = {
  day: number;
  iso: string;
  /** Which specific pay period funds this day — usually the viewed month's own half,
   *  but a tail day may spill into next month's half-1 if that period's start was
   *  pulled early enough to reach back into this month. */
  periodYear: number;
  periodMonth: number;
  periodHalf: PeriodHalf;
  isPast: boolean;
  isToday: boolean;
  dailyBudget: number | null;
};

type ExpenseForm = { amount: string; description: string };
const emptyExpenseForm = (): ExpenseForm => ({ amount: "", description: "" });

function dateIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

type TransferState = {
  fromDay: number;
  toDay: number;
  fromIso: string;
  toIso: string;
  fromAmount: number;
  toAmount: number;
};

export default function CalendarClient() {
  const [payslips, setPayslips] = useState<PayslipRow[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpenseRow[]>([]);
  const [nextFixedExpenses, setNextFixedExpenses] = useState<FixedExpenseRow[]>([]);
  const [monthlyExpenses, setMonthlyExpenses] = useState<MonthlyExpenseRow[]>([]);
  const [nextMonthlyExpenses, setNextMonthlyExpenses] = useState<MonthlyExpenseRow[]>([]);
  const [payPeriodOverrides, setPayPeriodOverrides] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expenseModalHalf, setExpenseModalHalf] = useState<PeriodHalf | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(emptyExpenseForm());
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);

  const [payDateModalHalf, setPayDateModalHalf] = useState<PeriodHalf | null>(null);
  const [payDateForm, setPayDateForm] = useState("");
  const [savingPayDate, setSavingPayDate] = useState(false);
  const [payDateError, setPayDateError] = useState<string | null>(null);

  const [dayOverrides, setDayOverrides] = useState<Map<string, number>>(new Map());
  const [dragSourceDay, setDragSourceDay] = useState<number | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const [transfer, setTransfer] = useState<TransferState | null>(null);
  const [transferSpent, setTransferSpent] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [savingTransfer, setSavingTransfer] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const [spendDay, setSpendDay] = useState<DayCell | null>(null);
  const [spendAmount, setSpendAmount] = useState("");
  const [savingSpend, setSavingSpend] = useState(false);
  const [spendError, setSpendError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(
    () => dateIso(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    [today],
  );

  const [viewedYear, setViewedYear] = useState(today.getFullYear());
  const [viewedMonth, setViewedMonth] = useState(today.getMonth() + 1);
  const year = viewedYear;
  const month = viewedMonth;

  const loadExpenses = useCallback(async () => {
    const r = await getFixedExpenses(undefined, viewedYear, viewedMonth);
    setFixedExpenses(r.expenses);
  }, [viewedYear, viewedMonth]);

  const loadNextExpenses = useCallback(async () => {
    const next = addMonths(viewedYear, viewedMonth, 1);
    const r = await getFixedExpenses(undefined, next.year, next.month);
    setNextFixedExpenses(r.expenses);
  }, [viewedYear, viewedMonth]);

  const loadMonthlyExpenses = useCallback(async () => {
    const r = await getMonthlyExpenses(undefined, viewedYear, viewedMonth);
    setMonthlyExpenses(r.expenses);
  }, [viewedYear, viewedMonth]);

  const loadNextMonthlyExpenses = useCallback(async () => {
    const next = addMonths(viewedYear, viewedMonth, 1);
    const r = await getMonthlyExpenses(undefined, next.year, next.month);
    setNextMonthlyExpenses(r.expenses);
  }, [viewedYear, viewedMonth]);

  const loadOverrides = useCallback(async () => {
    const r = await getCalendarDayOverrides();
    setDayOverrides(new Map(r.overrides.map((o) => [o.day, o.amount])));
  }, []);

  const loadPayPeriodOverrides = useCallback(async () => {
    const r = await getPayPeriodStartOverrides();
    setPayPeriodOverrides(
      new Map(
        r.overrides.map((o) => [periodKey(o.period_year, o.period_month, o.period_half), o.start_date]),
      ),
    );
  }, []);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    const [
      payslipResult,
      expensesResult,
      nextExpensesResult,
      monthlyExpensesResult,
      nextMonthlyExpensesResult,
      overridesResult,
      payPeriodResult,
    ] = await Promise.allSettled([
      getPayslips(12),
      loadExpenses(),
      loadNextExpenses(),
      loadMonthlyExpenses(),
      loadNextMonthlyExpenses(),
      loadOverrides(),
      loadPayPeriodOverrides(),
    ]);
    let firstError: string | null = null;
    if (payslipResult.status === "fulfilled") {
      setPayslips(payslipResult.value.payslips);
    } else {
      const e = payslipResult.reason;
      firstError = e instanceof Error ? e.message : "Failed to load last salary";
      setPayslips([]);
    }
    if (expensesResult.status === "rejected") {
      const e = expensesResult.reason;
      firstError ??= e instanceof Error ? e.message : "Failed to load fixed expenses";
      setFixedExpenses([]);
    }
    if (nextExpensesResult.status === "rejected") {
      const e = nextExpensesResult.reason;
      firstError ??= e instanceof Error ? e.message : "Failed to load next month's fixed expenses";
      setNextFixedExpenses([]);
    }
    if (monthlyExpensesResult.status === "rejected") {
      const e = monthlyExpensesResult.reason;
      firstError ??= e instanceof Error ? e.message : "Failed to load monthly expenses";
      setMonthlyExpenses([]);
    }
    if (nextMonthlyExpensesResult.status === "rejected") {
      const e = nextMonthlyExpensesResult.reason;
      firstError ??= e instanceof Error ? e.message : "Failed to load next month's monthly expenses";
      setNextMonthlyExpenses([]);
    }
    if (overridesResult.status === "rejected") {
      const e = overridesResult.reason;
      firstError ??= e instanceof Error ? e.message : "Failed to load day overrides";
      setDayOverrides(new Map());
    }
    if (payPeriodResult.status === "rejected") {
      const e = payPeriodResult.reason;
      firstError ??= e instanceof Error ? e.message : "Failed to load pay period overrides";
      setPayPeriodOverrides(new Map());
    }
    setError(firstError);
    setLoading(false);
  }, [
    loadExpenses,
    loadNextExpenses,
    loadMonthlyExpenses,
    loadNextMonthlyExpenses,
    loadOverrides,
    loadPayPeriodOverrides,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const goToPrevMonth = useCallback(() => {
    setViewedMonth((m) => {
      if (m === 1) {
        setViewedYear((y) => y - 1);
        return 12;
      }
      return m - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setViewedMonth((m) => {
      if (m === 12) {
        setViewedYear((y) => y + 1);
        return 1;
      }
      return m + 1;
    });
  }, []);

  const goToToday = useCallback(() => {
    setViewedYear(today.getFullYear());
    setViewedMonth(today.getMonth() + 1);
  }, [today]);

  const isViewingCurrentMonth =
    viewedYear === today.getFullYear() && viewedMonth === today.getMonth() + 1;

  const daysInMonth = new Date(year, month, 0).getDate();

  /**
   * Effective start/end of this month's two pay periods, plus next month's
   * half-1 start — needed because a tail day of this month can spill into
   * next month's half-1 if that period's start was pulled back far enough
   * (see periodEndIso). Ends are always derived, never stored, so periods
   * stay contiguous as start dates move.
   */
  const periodInfo = useMemo(() => {
    const next = addMonths(year, month, 1);
    const p1Start = effectiveHalfStartIso(payPeriodOverrides, year, month, 1);
    const p2Start = effectiveHalfStartIso(payPeriodOverrides, year, month, 2);
    const nextP1Start = effectiveHalfStartIso(payPeriodOverrides, next.year, next.month, 1);
    const p1End = addDaysIso(p2Start, -1);
    const p2End = addDaysIso(nextP1Start, -1);
    return {
      p1Start,
      p2Start,
      p1End,
      p2End,
      nextYear: next.year,
      nextMonth: next.month,
      nextP1Start,
      firstHalfDays: daysBetweenInclusive(p1Start, p1End),
      secondHalfDays: daysBetweenInclusive(p2Start, p2End),
    };
  }, [payPeriodOverrides, year, month]);

  /**
   * Fixed expenses are scoped to the single (period_year, period_month) they
   * were added for — no recurring flag, unlike monthly expenses — keyed by
   * the payslip half (see payslipHalfFor) that actually funds a calendar
   * half, since that's the half a fixed expense is recorded against.
   */
  const expensesByPeriod = useMemo(() => {
    const map = new Map<string, FixedExpenseRow[]>();
    const addRows = (rows: FixedExpenseRow[]) => {
      for (const e of rows) {
        if (e.period_half !== 1 && e.period_half !== 2) continue;
        const key = periodKey(e.period_year, e.period_month, e.period_half as PeriodHalf);
        const arr = map.get(key);
        if (arr) arr.push(e);
        else map.set(key, [e]);
      }
    };
    addRows(fixedExpenses);
    addRows(nextFixedExpenses);
    return map;
  }, [fixedExpenses, nextFixedExpenses]);

  const expensesForPeriod = useCallback(
    (periodYear: number, periodMonth: number, calendarHalf: PeriodHalf) =>
      expensesByPeriod.get(periodKey(periodYear, periodMonth, payslipHalfFor(calendarHalf))) ?? [],
    [expensesByPeriod],
  );

  const expensesTotalForPeriod = useCallback(
    (periodYear: number, periodMonth: number, calendarHalf: PeriodHalf) =>
      expensesForPeriod(periodYear, periodMonth, calendarHalf).reduce((s, e) => s + e.amount, 0),
    [expensesForPeriod],
  );

  const expensesTotal = useCallback(
    (calendarHalf: PeriodHalf) => expensesTotalForPeriod(viewedYear, viewedMonth, calendarHalf),
    [expensesTotalForPeriod, viewedYear, viewedMonth],
  );

  /**
   * Unlike fixed expenses (scoped to the payslip half that funds a calendar
   * half, see payslipHalfFor), monthly expenses are entered directly against
   * the calendar half they should reduce — no pay-lag conversion. Keyed by
   * the *queried* month, not each row's own stored period_month, since a
   * recurring row's stored period matches whichever month it was created in,
   * not every month it shows up in.
   */
  const monthlyExpensesByPeriod = useMemo(() => {
    const map = new Map<string, MonthlyExpenseRow[]>();
    const addRows = (y: number, m: number, rows: MonthlyExpenseRow[]) => {
      for (const e of rows) {
        if (e.period_half !== 1 && e.period_half !== 2) continue;
        const key = periodKey(y, m, e.period_half as PeriodHalf);
        const arr = map.get(key);
        if (arr) arr.push(e);
        else map.set(key, [e]);
      }
    };
    addRows(viewedYear, viewedMonth, monthlyExpenses);
    const next = addMonths(viewedYear, viewedMonth, 1);
    addRows(next.year, next.month, nextMonthlyExpenses);
    return map;
  }, [monthlyExpenses, nextMonthlyExpenses, viewedYear, viewedMonth]);

  const monthlyExpensesForPeriod = useCallback(
    (periodYear: number, periodMonth: number, periodHalf: PeriodHalf) =>
      monthlyExpensesByPeriod.get(periodKey(periodYear, periodMonth, periodHalf)) ?? [],
    [monthlyExpensesByPeriod],
  );

  const monthlyExpensesTotalForPeriod = useCallback(
    (periodYear: number, periodMonth: number, periodHalf: PeriodHalf) =>
      monthlyExpensesForPeriod(periodYear, periodMonth, periodHalf).reduce(
        (s, e) => s + e.amount,
        0,
      ),
    [monthlyExpensesForPeriod],
  );

  const monthlyExpensesTotal = useCallback(
    (calendarHalf: PeriodHalf) =>
      monthlyExpensesTotalForPeriod(viewedYear, viewedMonth, calendarHalf),
    [monthlyExpensesTotalForPeriod, viewedYear, viewedMonth],
  );

  const payslipFor = useCallback(
    (periodHalf: PeriodHalf, periodYear: number, periodMonth: number): PayslipRow | null =>
      payslips.find(
        (p) =>
          p.period_half === periodHalf &&
          p.period_year === periodYear &&
          p.period_month === periodMonth,
      ) ?? null,
    [payslips],
  );

  const fundingPayslipForPeriod = useCallback(
    (periodYear: number, periodMonth: number, periodHalf: PeriodHalf): PayslipRow | null => {
      const { year: fundingYear, month: fundingMonth } = fundingPeriodFor(
        periodHalf,
        periodYear,
        periodMonth,
      );
      return payslipFor(payslipHalfFor(periodHalf), fundingYear, fundingMonth);
    },
    [payslipFor],
  );

  const fundingPayslipFor = useCallback(
    (calendarHalf: PeriodHalf): PayslipRow | null =>
      fundingPayslipForPeriod(viewedYear, viewedMonth, calendarHalf),
    [fundingPayslipForPeriod, viewedYear, viewedMonth],
  );

  const netPayForPeriod = useCallback(
    (periodYear: number, periodMonth: number, periodHalf: PeriodHalf): number | null =>
      fundingPayslipForPeriod(periodYear, periodMonth, periodHalf)?.total ?? null,
    [fundingPayslipForPeriod],
  );

  const netPayFor = useCallback(
    (calendarHalf: PeriodHalf): number | null => netPayForPeriod(viewedYear, viewedMonth, calendarHalf),
    [netPayForPeriod, viewedYear, viewedMonth],
  );

  const netAfterExpensesForPeriod = useCallback(
    (periodYear: number, periodMonth: number, periodHalf: PeriodHalf): number | null => {
      const net = netPayForPeriod(periodYear, periodMonth, periodHalf);
      return net != null
        ? net -
            expensesTotalForPeriod(periodYear, periodMonth, periodHalf) -
            monthlyExpensesTotalForPeriod(periodYear, periodMonth, periodHalf)
        : null;
    },
    [netPayForPeriod, expensesTotalForPeriod, monthlyExpensesTotalForPeriod],
  );

  const netAfterExpenses = useCallback(
    (half: PeriodHalf): number | null => netAfterExpensesForPeriod(viewedYear, viewedMonth, half),
    [netAfterExpensesForPeriod, viewedYear, viewedMonth],
  );

  const firstHalfNetAfter = netAfterExpenses(1);
  const secondHalfNetAfter = netAfterExpenses(2);
  const firstHalfBudget =
    firstHalfNetAfter != null ? firstHalfNetAfter / periodInfo.firstHalfDays : null;
  const secondHalfBudget =
    secondHalfNetAfter != null ? secondHalfNetAfter / periodInfo.secondHalfDays : null;

  const nextHalf1NetAfter = netAfterExpensesForPeriod(periodInfo.nextYear, periodInfo.nextMonth, 1);
  const nextHalf1Days = periodDayCount(payPeriodOverrides, periodInfo.nextYear, periodInfo.nextMonth, 1);
  const nextHalf1Budget = nextHalf1NetAfter != null ? nextHalf1NetAfter / nextHalf1Days : null;

  const dayCells = useMemo(() => {
    const result: DayCell[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = dateIso(year, month, day);
      let periodYear = year;
      let periodMonth = month;
      let periodHalf: PeriodHalf;
      let defaultAmount: number | null;
      if (iso >= periodInfo.nextP1Start) {
        periodYear = periodInfo.nextYear;
        periodMonth = periodInfo.nextMonth;
        periodHalf = 1;
        defaultAmount = nextHalf1Budget;
      } else if (iso >= periodInfo.p2Start) {
        periodHalf = 2;
        defaultAmount = secondHalfBudget;
      } else {
        periodHalf = 1;
        defaultAmount = firstHalfBudget;
      }
      const overrideAmount = dayOverrides.get(iso);
      result.push({
        day,
        iso,
        periodYear,
        periodMonth,
        periodHalf,
        isPast: iso < todayIso,
        isToday: iso === todayIso,
        dailyBudget: overrideAmount ?? defaultAmount,
      });
    }
    return result;
  }, [
    year,
    month,
    daysInMonth,
    todayIso,
    periodInfo,
    firstHalfBudget,
    secondHalfBudget,
    nextHalf1Budget,
    dayOverrides,
  ]);

  const gridCells = useMemo(() => {
    const firstWeekday = new Date(year, month - 1, 1).getDay();
    const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    const result: (DayCell | null)[] = [];
    for (let i = 0; i < totalCells; i++) {
      const day = i - firstWeekday + 1;
      result.push(day >= 1 && day <= daysInMonth ? dayCells[day - 1] : null);
    }
    return result;
  }, [year, month, daysInMonth, dayCells]);

  /**
   * The full set of days belonging to one specific pay period, independent
   * of which month is currently being viewed — a period can span a month
   * boundary (see periodEndIso), so a day near the end of the viewed month
   * may need siblings that live in the *next* month's grid, which `dayCells`
   * never contains since it's scoped to the viewed month only. Used to let
   * "log spend" redistribute correctly even when logging a day whose period
   * spills into another month.
   */
  const periodDayCells = useCallback(
    (periodYear: number, periodMonth: number, periodHalf: PeriodHalf): DayCell[] => {
      const start = effectiveHalfStartIso(payPeriodOverrides, periodYear, periodMonth, periodHalf);
      const end = periodEndIso(payPeriodOverrides, periodYear, periodMonth, periodHalf);
      const net = netAfterExpensesForPeriod(periodYear, periodMonth, periodHalf);
      const dayCount = periodDayCount(payPeriodOverrides, periodYear, periodMonth, periodHalf);
      const defaultBudget = net != null ? net / dayCount : null;
      const result: DayCell[] = [];
      for (let iso = start; iso <= end; iso = addDaysIso(iso, 1)) {
        const day = Number(iso.slice(8, 10));
        result.push({
          day,
          iso,
          periodYear,
          periodMonth,
          periodHalf,
          isPast: iso < todayIso,
          isToday: iso === todayIso,
          dailyBudget: dayOverrides.get(iso) ?? defaultBudget,
        });
      }
      return result;
    },
    [payPeriodOverrides, netAfterExpensesForPeriod, dayOverrides, todayIso],
  );

  const handleDayDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, day: number) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(DAY_DND_MIME, String(day));
      setDragSourceDay(day);
    },
    [],
  );

  const handleDayDragOver = useCallback((e: DragEvent<HTMLDivElement>, day: number) => {
    e.preventDefault();
    setDragOverDay(day);
  }, []);

  const handleDayDragLeave = useCallback((day: number) => {
    setDragOverDay((prev) => (prev === day ? null : prev));
  }, []);

  const handleDayDragEnd = useCallback(() => {
    setDragSourceDay(null);
    setDragOverDay(null);
  }, []);

  const handleDayDrop = useCallback(
    (e: DragEvent<HTMLDivElement>, targetDay: number) => {
      e.preventDefault();
      setDragSourceDay(null);
      setDragOverDay(null);
      const raw = e.dataTransfer.getData(DAY_DND_MIME);
      const sourceDay = raw ? Number(raw) : NaN;
      if (!Number.isFinite(sourceDay) || sourceDay === targetDay) return;
      const source = dayCells[sourceDay - 1];
      const target = dayCells[targetDay - 1];
      if (!source || !target) return;
      if (
        periodKey(source.periodYear, source.periodMonth, source.periodHalf) !==
        periodKey(target.periodYear, target.periodMonth, target.periodHalf)
      ) {
        setError("You can only move budget between days within the same pay period.");
        return;
      }
      if (source.dailyBudget == null || target.dailyBudget == null) return;
      setTransferError(null);
      setTransferSpent("");
      setTransferAmount("");
      setTransfer({
        fromDay: source.day,
        toDay: target.day,
        fromIso: source.iso,
        toIso: target.iso,
        fromAmount: source.dailyBudget,
        toAmount: target.dailyBudget,
      });
    },
    [dayCells],
  );

  const closeTransferModal = useCallback(() => {
    setTransfer(null);
  }, []);

  const handleTransferSpentChange = useCallback(
    (value: string) => {
      setTransferSpent(value);
      if (!transfer) return;
      const spent = parseFormNumber(value);
      if (spent == null) {
        setTransferAmount("");
        return;
      }
      const remaining = roundCents(Math.max(0, Math.min(transfer.fromAmount, transfer.fromAmount - spent)));
      setTransferAmount(String(remaining));
    },
    [transfer],
  );

  const submitTransfer = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!transfer) return;
      const rawAmount = parseFormNumber(transferAmount);
      if (rawAmount == null || rawAmount <= 0) {
        setTransferError("Enter a valid amount greater than zero.");
        return;
      }
      const amount = roundCents(rawAmount);
      const maxAmount = roundCents(transfer.fromAmount);
      if (amount > maxAmount) {
        setTransferError(`Cannot move more than ${fmtMoney(maxAmount)}.`);
        return;
      }
      setTransferError(null);
      setSavingTransfer(true);
      try {
        const r = await bulkUpsertCalendarDayOverrides([
          { day: transfer.fromIso, amount: Math.max(0, roundCents(transfer.fromAmount - amount)) },
          { day: transfer.toIso, amount: roundCents(transfer.toAmount + amount) },
        ]);
        setDayOverrides(new Map(r.overrides.map((o) => [o.day, o.amount])));
        setTransfer(null);
      } catch (err) {
        setTransferError(err instanceof Error ? err.message : "Failed to move budget");
      } finally {
        setSavingTransfer(false);
      }
    },
    [transfer, transferAmount],
  );

  const openSpendModal = useCallback((cell: DayCell) => {
    setSpendError(null);
    setSpendAmount("");
    setSpendDay(cell);
  }, []);

  const closeSpendModal = useCallback(() => {
    setSpendDay(null);
  }, []);

  const submitSpend = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!spendDay || spendDay.dailyBudget == null) return;
      const evaluated = evaluateAmountExpression(spendAmount);
      const rawSpent = evaluated != null ? parseFormNumber(evaluated) : null;
      if (rawSpent == null || rawSpent < 0) {
        setSpendError("Enter a valid amount (zero or more). You can use + and - to do math.");
        return;
      }
      const spent = roundCents(rawSpent);
      /**
       * The remainder (or overspend) spreads across this period's other
       * *active* days — today or later, never a day that's already past —
       * regardless of whether they fall before or after the day being
       * logged. This lets logging a future day (e.g. the last day of the
       * period) redistribute to the still-open days leading up to it, not
       * just days after it (there may be none). Pulled from the full period
       * (via periodDayCells), not just the viewed month's dayCells, since a
       * period can spill into an adjacent month.
       */
      const otherDays = periodDayCells(
        spendDay.periodYear,
        spendDay.periodMonth,
        spendDay.periodHalf,
      ).filter((d) => d.iso !== spendDay.iso && !d.isPast && d.dailyBudget != null);
      if (otherDays.length === 0) {
        setSpendError("No active days in this pay period to spread the remainder to.");
        return;
      }
      setSpendError(null);
      setSavingSpend(true);
      try {
        const remainderCents = Math.round((spendDay.dailyBudget - spent) * 100);
        const order = otherDays.map((d) => d.iso);
        const balances = new Map(
          otherDays.map((d) => [d.iso, Math.round((d.dailyBudget ?? 0) * 100)]),
        );
        const updated = spreadCentsEvenly(order, balances, remainderCents);
        const overrides = otherDays.map((d) => ({
          day: d.iso,
          amount: (updated.get(d.iso) ?? 0) / 100,
        }));
        overrides.push({ day: spendDay.iso, amount: spent });
        const r = await bulkUpsertCalendarDayOverrides(overrides);
        setDayOverrides(new Map(r.overrides.map((o) => [o.day, o.amount])));
        setSpendDay(null);
      } catch (err) {
        setSpendError(err instanceof Error ? err.message : "Failed to record spend");
      } finally {
        setSavingSpend(false);
      }
    },
    [spendDay, spendAmount, periodDayCells],
  );

  const openExpenseModal = useCallback((half: PeriodHalf) => {
    setExpenseError(null);
    setExpenseForm(emptyExpenseForm());
    setExpenseModalHalf(half);
  }, []);

  const closeExpenseModal = useCallback(() => {
    setExpenseModalHalf(null);
  }, []);

  const submitExpense = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (expenseModalHalf == null) return;
      const amount = parseFormNumber(expenseForm.amount);
      if (amount == null || amount <= 0) {
        setExpenseError("Enter a valid amount greater than zero.");
        return;
      }
      setExpenseError(null);
      setSavingExpense(true);
      try {
        await createFixedExpense({
          period_half: payslipHalfFor(expenseModalHalf),
          amount,
          description: expenseForm.description.trim() || null,
          period_year: viewedYear,
          period_month: viewedMonth,
        });
        setExpenseForm(emptyExpenseForm());
        await loadExpenses();
      } catch (err) {
        setExpenseError(err instanceof Error ? err.message : "Failed to add expense");
      } finally {
        setSavingExpense(false);
      }
    },
    [expenseModalHalf, expenseForm, loadExpenses, viewedYear, viewedMonth],
  );

  const onDeleteExpense = useCallback(
    async (id: number) => {
      setExpenseError(null);
      try {
        await deleteFixedExpense(id);
        await loadExpenses();
      } catch (err) {
        setExpenseError(err instanceof Error ? err.message : "Failed to delete expense");
      }
    },
    [loadExpenses],
  );

  const onDeleteMonthlyExpense = useCallback(
    async (id: number) => {
      setExpenseError(null);
      try {
        await deleteMonthlyExpense(id);
        await loadMonthlyExpenses();
      } catch (err) {
        setExpenseError(err instanceof Error ? err.message : "Failed to delete expense");
      }
    },
    [loadMonthlyExpenses],
  );

  const modalExpenses =
    expenseModalHalf != null ? expensesForPeriod(viewedYear, viewedMonth, expenseModalHalf) : [];
  const modalMonthlyExpenses =
    expenseModalHalf != null
      ? monthlyExpensesForPeriod(viewedYear, viewedMonth, expenseModalHalf)
      : [];
  const modalNetPay = expenseModalHalf != null ? netPayFor(expenseModalHalf) : null;
  const modalExpensesTotal = expenseModalHalf != null ? expensesTotal(expenseModalHalf) : 0;
  const modalMonthlyExpensesTotal =
    expenseModalHalf != null ? monthlyExpensesTotal(expenseModalHalf) : 0;
  const modalNetAfter = expenseModalHalf != null ? netAfterExpenses(expenseModalHalf) : null;

  /** Bounds mirroring the backend's validation, so the date picker rejects obviously-invalid picks. */
  const payDateBounds = useMemo(() => {
    const prev = addMonths(year, month, -1);
    const prevHalf2Start = effectiveHalfStartIso(payPeriodOverrides, prev.year, prev.month, 2);
    return {
      1: { min: addDaysIso(prevHalf2Start, 1), max: defaultHalfStartIso(year, month, 1) },
      2: { min: dateIso(year, month, 2), max: defaultHalfStartIso(year, month, 2) },
    } as Record<PeriodHalf, { min: string; max: string }>;
  }, [payPeriodOverrides, year, month]);

  const openPayDateModal = useCallback(
    (half: PeriodHalf) => {
      setPayDateError(null);
      setPayDateForm(half === 1 ? periodInfo.p1Start : periodInfo.p2Start);
      setPayDateModalHalf(half);
    },
    [periodInfo],
  );

  const closePayDateModal = useCallback(() => {
    setPayDateModalHalf(null);
  }, []);

  const submitPayDate = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (payDateModalHalf == null) return;
      setPayDateError(null);
      setSavingPayDate(true);
      try {
        const r = await upsertPayPeriodStartOverride({
          period_year: year,
          period_month: month,
          period_half: payDateModalHalf,
          start_date: payDateForm,
        });
        setPayPeriodOverrides((prev) => {
          const next = new Map(prev);
          next.set(periodKey(year, month, payDateModalHalf), r.override.start_date);
          return next;
        });
        setPayDateModalHalf(null);
      } catch (err) {
        setPayDateError(err instanceof Error ? err.message : "Failed to save pay date");
      } finally {
        setSavingPayDate(false);
      }
    },
    [payDateModalHalf, payDateForm, year, month],
  );

  const resetPayDate = useCallback(async () => {
    if (payDateModalHalf == null) return;
    setPayDateError(null);
    setSavingPayDate(true);
    try {
      await deletePayPeriodStartOverride(year, month, payDateModalHalf);
      setPayPeriodOverrides((prev) => {
        const next = new Map(prev);
        next.delete(periodKey(year, month, payDateModalHalf));
        return next;
      });
      setPayDateModalHalf(null);
    } catch (err) {
      setPayDateError(err instanceof Error ? err.message : "Failed to reset pay date");
    } finally {
      setSavingPayDate(false);
    }
  }, [payDateModalHalf, year, month]);

  const formatDayRangeLabel = useCallback(
    (startIso: string, endIso: string) =>
      `${formatMonthDayShort(startIso)} – ${formatMonthDayShort(endIso)}`,
    [],
  );

  return (
    <div className="box-border flex w-full min-w-0 flex-col gap-10 px-4 pb-28 pt-10 sm:px-6 lg:px-8">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Calendar
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {formatMonthYear(year, month)} — approximate daily budget from your last net pay, minus
          fixed expenses, split across the semi-monthly pay periods.
        </p>
      </header>

      {error && (
        <div className={ERROR_ALERT_CLASSES} role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className={LOADING_TEXT_CLASSES}>Loading last salary…</p>
      ) : (
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Net pay — {formatMonthYear(year, month)}
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              The payslip that funds each pay period of this month, minus any fixed and monthly
              expenses. Click a card to view its expenses.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {([1, 2] as const).map((half) => {
                const payslip = fundingPayslipFor(half);
                const netAfter = half === 1 ? firstHalfNetAfter : secondHalfNetAfter;
                const total = expensesTotal(half);
                const monthlyTotal = monthlyExpensesTotal(half);
                const rangeLabel = formatDayRangeLabel(
                  half === 1 ? periodInfo.p1Start : periodInfo.p2Start,
                  half === 1 ? periodInfo.p1End : periodInfo.p2End,
                );
                return (
                  <div
                    key={half}
                    className="group relative rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-800 dark:bg-emerald-950/30"
                  >
                    <button
                      type="button"
                      onClick={() => openExpenseModal(half)}
                      className="block w-full rounded-md text-left transition hover:opacity-90"
                    >
                      <p className="pr-16 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                        {rangeLabel}
                      </p>
                      <p className="mt-2 text-sm font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
                        {payslip?.total != null ? fmtMoney(payslip.total) : "–"} net pay
                      </p>
                      <p className="text-2xl font-bold tabular-nums text-emerald-800 dark:text-emerald-200">
                        {netAfter != null ? fmtMoney(netAfter) : "–"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {payslip?.period_year != null && payslip?.period_month != null
                          ? `From ${formatMonthYear(payslip.period_year, payslip.period_month)}`
                          : "No payslip recorded yet"}
                      </p>
                      {total > 0 && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          −{fmtMoney(total)} fixed expenses
                        </p>
                      )}
                      {monthlyTotal > 0 && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          −{fmtMoney(monthlyTotal)} monthly expenses
                        </p>
                      )}
                      <p className="mt-2 text-[11px] font-medium text-emerald-700 group-hover:underline dark:text-emerald-400">
                        View expenses →
                      </p>
                    </button>
                    <button
                      type="button"
                      aria-label="Adjust pay date"
                      onClick={() => openPayDateModal(half)}
                      className="absolute right-3 top-3 rounded-md border border-emerald-300 bg-white/80 px-1.5 py-1 text-[11px] font-medium text-emerald-700 hover:bg-white dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    >
                      Edit date
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Semi-monthly daily budget
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Last net pay minus fixed expenses, divided evenly across each pay period&apos;s
              days.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/90 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {formatDayRangeLabel(periodInfo.p1Start, periodInfo.p1End)} ({periodInfo.firstHalfDays}{" "}
                  days)
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
                  {firstHalfBudget != null ? fmtMoney(firstHalfBudget) : "–"}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">per day</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/90 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {formatDayRangeLabel(periodInfo.p2Start, periodInfo.p2End)} ({periodInfo.secondHalfDays}{" "}
                  days)
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
                  {secondHalfBudget != null ? fmtMoney(secondHalfBudget) : "–"}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">per day</p>
              </div>
            </div>
          </section>

          <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
            <div className="relative flex items-center justify-center gap-3">
              <button
                type="button"
                aria-label="Previous month"
                onClick={goToPrevMonth}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-zinc-200 text-2xl leading-none text-zinc-600 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
              >
                ‹
              </button>
              <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
                {formatMonthYear(year, month)}
              </h2>
              <button
                type="button"
                aria-label="Next month"
                onClick={goToNextMonth}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-zinc-200 text-2xl leading-none text-zinc-600 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
              >
                ›
              </button>
              {!isViewingCurrentMonth && (
                <button
                  type="button"
                  onClick={goToToday}
                  className="absolute right-0 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
                >
                  Today
                </button>
              )}
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Past days are greyed out; today is highlighted. Click a day to log what you spent —
              the rest is spread across that pay period&apos;s other active days (today or
              later), never a day that&apos;s already past — or drag a day onto any other day in
              the same pay period, earlier or later, to move budget between them.
            </p>

            <div className="mt-5 grid grid-cols-7 gap-1.5 sm:gap-2">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="px-1 pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="mt-1.5 grid flex-1 grid-cols-7 gap-1.5 sm:gap-2">
              {gridCells.map((cell, idx) => {
                if (!cell) {
                  return <div key={`blank-${idx}`} />;
                }
                const { day, periodHalf, isPast, isToday, dailyBudget } = cell;
                const draggable = dailyBudget != null;
                const isDragSource = dragSourceDay === day;
                const isDragOverTarget = dragOverDay === day && dragSourceDay !== day;
                /** Orange for the 1st-half pay period, blue for the 2nd — always visible so the
                 *  boundary between periods reads at a glance, even on past/today cells. */
                const halfBorderClasses =
                  periodHalf === 1
                    ? "border-orange-400 dark:border-orange-600"
                    : "border-blue-400 dark:border-blue-600";
                const halfBgClasses =
                  periodHalf === 1
                    ? "bg-orange-50/50 dark:bg-orange-950/20"
                    : "bg-blue-50/50 dark:bg-blue-950/20";
                return (
                  <div
                    key={day}
                    role={draggable ? "button" : undefined}
                    tabIndex={draggable ? 0 : undefined}
                    draggable={draggable}
                    onClick={draggable ? () => openSpendModal(cell) : undefined}
                    onKeyDown={
                      draggable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openSpendModal(cell);
                            }
                          }
                        : undefined
                    }
                    onDragStart={draggable ? (e) => handleDayDragStart(e, day) : undefined}
                    onDragOver={draggable ? (e) => handleDayDragOver(e, day) : undefined}
                    onDragLeave={draggable ? () => handleDayDragLeave(day) : undefined}
                    onDrop={draggable ? (e) => handleDayDrop(e, day) : undefined}
                    onDragEnd={handleDayDragEnd}
                    className={`flex min-h-[5rem] min-w-0 flex-col items-center justify-center gap-1 rounded-lg border-2 px-1.5 py-2 text-center transition sm:min-h-[7rem] ${
                      draggable ? "cursor-grab active:cursor-grabbing" : ""
                    } ${
                      isDragOverTarget
                        ? "border-indigo-500 bg-indigo-100 ring-2 ring-indigo-500/60 dark:border-indigo-400 dark:bg-indigo-950/70"
                        : isToday
                          ? `${halfBorderClasses} bg-indigo-50 ring-2 ring-indigo-500/50 dark:bg-indigo-950/50`
                          : isPast
                            ? `border-dashed ${halfBorderClasses} bg-zinc-50/60 opacity-60 dark:bg-zinc-900/30`
                            : `${halfBorderClasses} ${halfBgClasses}`
                    } ${isDragSource ? "opacity-40" : ""}`}
                  >
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        isToday
                          ? "text-indigo-900 dark:text-indigo-100"
                          : isPast
                            ? "text-zinc-400 dark:text-zinc-600"
                            : "text-zinc-800 dark:text-zinc-100"
                      }`}
                    >
                      {day}
                    </span>
                    <span
                      className={`min-w-0 truncate text-xs tabular-nums leading-tight ${
                        isToday
                          ? "font-semibold text-indigo-700 dark:text-indigo-300"
                          : isPast
                            ? "text-zinc-400 dark:text-zinc-600"
                            : "text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {dailyBudget != null ? fmtMoney(dailyBudget) : "–"}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      <Modal
        open={expenseModalHalf != null}
        onClose={closeExpenseModal}
        ariaLabelledBy="fixed-expense-title"
        dialogClassName="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="min-w-0">
            <h2
              id="fixed-expense-title"
              className="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Expenses —{" "}
              {expenseModalHalf === 1
                ? formatDayRangeLabel(periodInfo.p1Start, periodInfo.p1End)
                : formatDayRangeLabel(periodInfo.p2Start, periodInfo.p2End)}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              Fixed and monthly expenses subtracted from this period&apos;s net pay and its
              calendar daily budget.
            </p>
          </div>
          <button
            type="button"
            className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
            onClick={closeExpenseModal}
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 p-3 text-sm sm:grid-cols-4 dark:border-zinc-800">
            <div>
              <p className="text-[11px] uppercase text-zinc-500 dark:text-zinc-400">Net pay</p>
              <p className="mt-1 font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
                {modalNetPay != null ? fmtMoney(modalNetPay) : "–"}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-zinc-500 dark:text-zinc-400">
                Fixed expenses
              </p>
              <p className="mt-1 font-semibold tabular-nums text-red-600 dark:text-red-400">
                −{fmtMoney(modalExpensesTotal)}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-zinc-500 dark:text-zinc-400">
                Monthly expenses
              </p>
              <p className="mt-1 font-semibold tabular-nums text-red-600 dark:text-red-400">
                −{fmtMoney(modalMonthlyExpensesTotal)}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-zinc-500 dark:text-zinc-400">Left</p>
              <p className="mt-1 font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                {modalNetAfter != null ? fmtMoney(modalNetAfter) : "–"}
              </p>
            </div>
          </div>

          <form
            onSubmit={submitExpense}
            className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end dark:border-zinc-800"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">Amount</span>
              <input
                required
                type="text"
                inputMode="decimal"
                className={INPUT_CLASSES}
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
                disabled={savingExpense}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">Description</span>
              <input
                type="text"
                className={INPUT_CLASSES}
                value={expenseForm.description}
                onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Rent"
                disabled={savingExpense}
              />
            </label>
            <button type="submit" disabled={savingExpense} className={PRIMARY_BUTTON_CLASSES}>
              {savingExpense ? "Saving…" : "Add"}
            </button>
          </form>

          {expenseError && (
            <div className={`mb-4 ${ERROR_ALERT_CLASSES}`} role="alert">
              {expenseError}
            </div>
          )}

          {modalExpenses.length === 0 ? (
            <p className="text-sm text-zinc-800 dark:text-zinc-200">
              No fixed expenses yet for this period.
            </p>
          ) : (
            <table className="w-full table-fixed text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-800">
                  <th className="w-1/2 pb-2 pr-2">Description</th>
                  <th className="w-1/4 pb-2 pr-2 text-right">Amount</th>
                  <th className="w-1/4 pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {modalExpenses.map((exp) => (
                  <tr key={exp.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 pr-2 text-zinc-800 dark:text-zinc-200">
                      <span className="block truncate">{exp.description || "—"}</span>
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums font-medium">
                      {fmtMoney(exp.amount)}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:text-red-300"
                        onClick={() => void onDeleteExpense(exp.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="mt-6 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Monthly expenses
            </h3>
            <Link
              href="/monthly-expenses"
              className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Manage monthly expenses →
            </Link>
          </div>

          {modalMonthlyExpenses.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-800 dark:text-zinc-200">
              No monthly expenses yet for this period.
            </p>
          ) : (
            <table className="mt-2 w-full table-fixed text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-800">
                  <th className="w-1/3 pb-2 pr-2">Name</th>
                  <th className="w-1/4 pb-2 pr-2">Description</th>
                  <th className="w-1/5 pb-2 pr-2 text-right">Amount</th>
                  <th className="w-1/5 pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {modalMonthlyExpenses.map((exp) => (
                  <tr key={exp.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 pr-2 text-zinc-800 dark:text-zinc-200">
                      <span className="block truncate">{exp.name}</span>
                    </td>
                    <td className="py-2 pr-2 text-zinc-800 dark:text-zinc-200">
                      <span className="block truncate">{exp.description || "—"}</span>
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums font-medium">
                      {fmtMoney(exp.amount)}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:text-red-300"
                        onClick={() => void onDeleteMonthlyExpense(exp.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>

      <Modal
        open={transfer != null}
        onClose={closeTransferModal}
        ariaLabelledBy="transfer-title"
        dialogClassName="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        {transfer && (
          <>
            <h2
              id="transfer-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Move budget
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              From day {transfer.fromDay} ({fmtMoney(transfer.fromAmount)}) to day{" "}
              {transfer.toDay} ({fmtMoney(transfer.toAmount)}).
            </p>
            <form onSubmit={submitTransfer} className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">
                  Amount spent on day {transfer.fromDay} today
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  className={INPUT_CLASSES}
                  value={transferSpent}
                  onChange={(e) => handleTransferSpentChange(e.target.value)}
                  disabled={savingTransfer}
                  placeholder="0.00"
                />
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Fills in the amount to move below: {fmtMoney(transfer.fromAmount)} budget − spent.
                </span>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">
                  Amount to move (max {fmtMoney(transfer.fromAmount)})
                </span>
                <div className="flex gap-2">
                  <input
                    required
                    type="text"
                    inputMode="decimal"
                    className={`flex-1 ${INPUT_CLASSES}`}
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    disabled={savingTransfer}
                  />
                  <button
                    type="button"
                    className={SECONDARY_BUTTON_CLASSES}
                    onClick={() => setTransferAmount(String(roundCents(transfer.fromAmount)))}
                    disabled={savingTransfer}
                  >
                    Max
                  </button>
                </div>
              </label>
              {transferError && (
                <div className={ERROR_ALERT_CLASSES} role="alert">
                  {transferError}
                </div>
              )}
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  className={SECONDARY_BUTTON_CLASSES}
                  onClick={closeTransferModal}
                  disabled={savingTransfer}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={PRIMARY_BUTTON_CLASSES}
                  disabled={savingTransfer}
                >
                  {savingTransfer ? "Moving…" : "Move"}
                </button>
              </div>
            </form>
          </>
        )}
      </Modal>

      <Modal
        open={spendDay != null}
        onClose={closeSpendModal}
        ariaLabelledBy="spend-title"
        dialogClassName="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        {spendDay && spendDay.dailyBudget != null && (
          <>
            <h2 id="spend-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Log spend — day {spendDay.day}
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Budget for this day is {fmtMoney(spendDay.dailyBudget)}. Whatever isn&apos;t spent
              (or any overspend) is spread evenly across this pay period&apos;s other active days
              — today or later, never a day that&apos;s already past.
            </p>
            <form onSubmit={submitSpend} className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">
                  Amount spent (e.g. 100-10 or 100+10)
                </span>
                <input
                  required
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  className={INPUT_CLASSES}
                  value={spendAmount}
                  onChange={(e) => setSpendAmount(e.target.value)}
                  onBlur={(e) => {
                    const evaluated = evaluateAmountExpression(e.target.value);
                    if (evaluated != null) setSpendAmount(evaluated);
                  }}
                  disabled={savingSpend}
                  placeholder="0.00"
                />
              </label>
              {spendError && (
                <div className={ERROR_ALERT_CLASSES} role="alert">
                  {spendError}
                </div>
              )}
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  className={SECONDARY_BUTTON_CLASSES}
                  onClick={closeSpendModal}
                  disabled={savingSpend}
                >
                  Cancel
                </button>
                <button type="submit" className={PRIMARY_BUTTON_CLASSES} disabled={savingSpend}>
                  {savingSpend ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </>
        )}
      </Modal>

      <Modal
        open={payDateModalHalf != null}
        onClose={closePayDateModal}
        ariaLabelledBy="pay-date-title"
        dialogClassName="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        {payDateModalHalf != null && (
          <>
            <h2 id="pay-date-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Adjust pay date —{" "}
              {payDateModalHalf === 1
                ? formatDayRangeLabel(periodInfo.p1Start, periodInfo.p1End)
                : formatDayRangeLabel(periodInfo.p2Start, periodInfo.p2End)}
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              If this paycheck actually lands earlier than the{" "}
              {payDateModalHalf === 1 ? "1st" : "16th"}, set the real date here. The covered budget
              period stretches to match, and the neighboring period shortens to keep the calendar
              contiguous.
            </p>
            <form onSubmit={submitPayDate} className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">Actual pay date</span>
                <input
                  required
                  type="date"
                  className={INPUT_CLASSES}
                  value={payDateForm}
                  min={payDateBounds[payDateModalHalf].min}
                  max={payDateBounds[payDateModalHalf].max}
                  onChange={(e) => setPayDateForm(e.target.value)}
                  disabled={savingPayDate}
                />
              </label>
              {payDateError && (
                <div className={ERROR_ALERT_CLASSES} role="alert">
                  {payDateError}
                </div>
              )}
              <div className="mt-1 flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-xs font-medium text-zinc-500 hover:underline dark:text-zinc-400"
                  onClick={() => void resetPayDate()}
                  disabled={savingPayDate}
                >
                  Reset to default
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={SECONDARY_BUTTON_CLASSES}
                    onClick={closePayDateModal}
                    disabled={savingPayDate}
                  >
                    Cancel
                  </button>
                  <button type="submit" className={PRIMARY_BUTTON_CLASSES} disabled={savingPayDate}>
                    {savingPayDate ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </form>
          </>
        )}
      </Modal>
    </div>
  );
}
