"use client";

import { AmountInput } from "@/components/AmountInput";
import { DatePickerField } from "@/components/DatePickerField";
import { PageHeader } from "@/components/PageHeader";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import {
  DIALOG_BODY_CLASSES,
  DIALOG_CLASSES,
  DIALOG_FOOTER_CLASSES,
  Field,
  IconAction,
  LoadingBlocks,
  Metric,
  Meter,
  ModalHeader,
  MonthStepper,
  Panel,
  Pill,
  StatStrip,
  TEXT_BUTTON_CLASSES,
} from "@/components/FinanceUI";
import { CalendarIcon, ChevronRightIcon, PlusIcon } from "@/components/Icons";
import {
  bulkUpsertCalendarDayOverrides,
  createFixedExpense,
  deleteFixedExpense,
  updateFixedExpense,
  deleteMonthlyExpense,
  deletePayPeriodStartOverride,
  getCalendarDayOverrides,
  getFixedExpenses,
  getMonthlyExpenses,
  getPayPeriodStartOverrides,
  getPayslips,
  upsertPayPeriodStartOverride,
  type CalendarDayOverrideRow,
  type FixedExpenseRow,
  type MonthlyExpenseRow,
  type PayslipRow,
} from "@/lib/api";
import { MONTH_NAMES_SHORT, formatMonthYear, parseDateOnlyLocal } from "@/lib/dateFormat";
import { fmtAmount, fmtCompactMoney } from "@/lib/formatNumber";
import {
  evaluateAmountExpression,
  formatAmountNumber,
  parseFormNumber,
} from "@/lib/parseFormNumber";
import { ErrorAlert } from "@/components/ErrorAlert";
import {
  INPUT_CLASSES,
  PAGE_CONTAINER_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
} from "@/lib/ui";
import { useWheelStep } from "@/lib/useWheelStep";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const DAY_DND_MIME = "text/x-calendar-day";

const NOTHING_TO_EVEN_OUT =
  "Nothing to even out: these pay periods have no days left, or no payslip yet";

type PeriodHalf = 1 | 2;

function payslipHalfFor(calendarHalf: PeriodHalf): PeriodHalf {
  return calendarHalf === 1 ? 2 : 1;
}

function fundingPeriodFor(
  calendarHalf: PeriodHalf,
  year: number,
  month: number,
): { year: number; month: number } {
  if (calendarHalf === 2) return { year, month };
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroBased = month - 1 + delta;
  const y = year + Math.floor(zeroBased / 12);
  const m = (((zeroBased % 12) + 12) % 12) + 1;
  return { year: y, month: m };
}

function adjacentPeriodFor(
  year: number,
  month: number,
  half: PeriodHalf,
): { year: number; month: number; half: PeriodHalf } {
  if (half === 1) return { year, month, half: 2 };
  const next = addMonths(year, month, 1);
  return { year: next.year, month: next.month, half: 1 };
}

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const d2 = new Date(y, m - 1, d + delta);
  return dateIso(d2.getFullYear(), d2.getMonth() + 1, d2.getDate());
}

function daysBetweenInclusive(startIso: string, endIso: string): number {
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ey, em, ed] = endIso.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd).getTime();
  const end = new Date(ey, em - 1, ed).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

function defaultHalfStartIso(year: number, month: number, half: PeriodHalf): string {
  return half === 1 ? dateIso(year, month, 1) : dateIso(year, month, 16);
}

function periodKey(year: number, month: number, half: PeriodHalf): string {
  return `${year}-${month}-${half}`;
}

function effectiveHalfStartIso(
  overrides: Map<string, string>,
  year: number,
  month: number,
  half: PeriodHalf,
): string {
  return overrides.get(periodKey(year, month, half)) ?? defaultHalfStartIso(year, month, half);
}

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

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

const fmtMoney = fmtAmount;

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

function spreadOverDays(days: DayCell[], deltaCents: number) {
  const before = new Map(days.map((d) => [d.iso, Math.round((d.dailyBudget ?? 0) * 100)]));
  const after = spreadCentsEvenly(days.map((d) => d.iso), before, deltaCents);
  const total = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);
  return { after, shortfallCents: total(after) - total(before) - deltaCents };
}

function splitEntries(rows: FixedExpenseRow[]) {
  const income = rows.filter((e) => e.amount < 0);
  const expenses = rows.filter((e) => e.amount > 0);
  const total = (list: FixedExpenseRow[]) => list.reduce((s, e) => s + Math.abs(e.amount), 0);
  return { income, expenses, incomeTotal: total(income), expenseTotal: total(expenses) };
}

type EntryKind = "income" | "expense";

const ENTRY_COPY: Record<
  EntryKind,
  { title: string; note: string; placeholder: string; empty: string; remove: string }
> = {
  income: {
    title: "Extra income",
    note: "Adds to this period's budget",
    placeholder: "Where's it from?",
    empty: "No extra income for this period.",
    remove: "Delete this income?",
  },
  expense: {
    title: "Fixed expenses",
    note: "This pay period only",
    placeholder: "What's it for?",
    empty: "No fixed expenses for this period.",
    remove: "Delete this expense?",
  },
};

type DayCell = {
  day: number;
  iso: string;
  periodYear: number;
  periodMonth: number;
  periodHalf: PeriodHalf;
  isPast: boolean;
  isToday: boolean;
  dailyBudget: number | null;
  defaultAmount: number | null;
  outside?: boolean;
};

type ExpenseForm = { amount: string; description: string };
const emptyExpenseForm = (): ExpenseForm => ({ amount: "", description: "" });

type MonthExpenses = { fixed: FixedExpenseRow[]; monthly: MonthlyExpenseRow[] };

function monthCacheKey(year: number, month: number): string {
  return `${year}-${month}`;
}

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

type DayGridCellProps = {
  cell: DayCell;
  isDragSource: boolean;
  isDragOverTarget: boolean;
  onOpenSpend: (cell: DayCell) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, iso: string) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, iso: string) => void;
  onDragLeave: (iso: string) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, iso: string) => void;
  onDragEnd: () => void;
};

const HALF_STYLE: Record<PeriodHalf, { label: string; dot: string; bar: string; tint: string }> = {
  1: {
    label: "1st pay period",
    dot: "bg-amber-500",
    bar: "bg-amber-400 dark:bg-amber-500/80",
    tint: "bg-amber-500/[0.05] dark:bg-amber-400/[0.05]",
  },
  2: {
    label: "2nd pay period",
    dot: "bg-sky-500",
    bar: "bg-sky-400 dark:bg-sky-500/80",
    tint: "bg-sky-500/[0.05] dark:bg-sky-400/[0.05]",
  },
};

const SHORT_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const LONG_DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });

function fmtDay(iso: string, long = false): string {
  const d = parseDateOnlyLocal(iso);
  return d ? (long ? LONG_DAY : SHORT_DAY).format(d) : iso;
}

const DayGridCell = memo(function DayGridCell({
  cell,
  isDragSource,
  isDragOverTarget,
  onOpenSpend,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: DayGridCellProps) {
  const { day, iso, periodHalf, isPast, isToday, dailyBudget, defaultAmount, outside } = cell;
  const draggable = dailyBudget != null;
  const half = HALF_STYLE[periodHalf];
  const adjusted =
    dailyBudget != null && defaultAmount != null && Math.abs(dailyBudget - defaultAmount) >= 0.005;
  return (
    <div
      role={draggable ? "button" : undefined}
      tabIndex={draggable ? 0 : undefined}
      aria-label={
        draggable ? `${fmtDay(iso, true)}, ${fmtMoney(dailyBudget)}${isToday ? ", today" : ""}` : undefined
      }
      draggable={draggable}
      onClick={draggable ? () => onOpenSpend(cell) : undefined}
      onKeyDown={
        draggable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenSpend(cell);
              }
            }
          : undefined
      }
      onDragStart={draggable ? (e) => onDragStart(e, iso) : undefined}
      onDragOver={draggable ? (e) => onDragOver(e, iso) : undefined}
      onDragLeave={draggable ? () => onDragLeave(iso) : undefined}
      onDrop={draggable ? (e) => onDrop(e, iso) : undefined}
      onDragEnd={onDragEnd}
      className={`relative flex min-h-[4rem] min-w-0 flex-col justify-between overflow-hidden rounded-xl border p-1.5 transition duration-150 sm:min-h-[6rem] sm:p-2.5 ${
        draggable ? "cursor-grab hover:-translate-y-px hover:shadow-md active:cursor-grabbing" : ""
      } ${
        isDragOverTarget
          ? "border-brand bg-brand-soft ring-2 ring-brand/40"
          : isToday
            ? "border-brand bg-surface ring-2 ring-brand/25"
            : isPast
              ? "border-line-soft bg-surface-2/40"
              : `border-line ${half.tint}`
      } ${isDragSource ? "opacity-40" : ""}`}
    >
      <span aria-hidden className={`absolute inset-x-0 top-0 h-[3px] ${half.bar} ${isPast ? "opacity-40" : ""}`} />
      <div className="flex items-start justify-between gap-1">
        <span
          className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums ${
            isToday ? "bg-brand text-brand-on" : isPast ? "text-ink-4" : "text-ink"
          }`}
        >
          {outside && (
            <span className="mr-1 hidden font-medium sm:inline">
              {MONTH_NAMES_SHORT[Number(iso.slice(5, 7)) - 1]}
            </span>
          )}
          {day}
        </span>
        {adjusted && (
          <span
            title="Changed from the even split"
            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-4"
          />
        )}
      </div>
      <span
        title={dailyBudget != null ? fmtMoney(dailyBudget) : undefined}
        className={`block w-full min-w-0 truncate text-right text-[11px] tabular-nums leading-tight sm:text-sm ${
          isToday ? "font-semibold text-brand-text" : isPast ? "text-ink-4" : "font-medium text-ink-2"
        }`}
      >
        {dailyBudget != null ? (
          <>
            <span className="sm:hidden">{fmtCompactMoney(dailyBudget)}</span>
            <span className="hidden sm:inline">{fmtMoney(dailyBudget)}</span>
          </>
        ) : (
          "–"
        )}
      </span>
    </div>
  );
});

export default function CalendarClient() {
  const [payslips, setPayslips] = useState<PayslipRow[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpenseRow[]>([]);
  const [nextFixedExpenses, setNextFixedExpenses] = useState<FixedExpenseRow[]>([]);
  const [monthlyExpenses, setMonthlyExpenses] = useState<MonthlyExpenseRow[]>([]);
  const [nextMonthlyExpenses, setNextMonthlyExpenses] = useState<MonthlyExpenseRow[]>([]);
  const [payPeriodOverrides, setPayPeriodOverrides] = useState<Map<string, string>>(new Map());
  const [sharedLoaded, setSharedLoaded] = useState(false);
  const [monthLoaded, setMonthLoaded] = useState(false);
  const loading = !sharedLoaded || !monthLoaded;
  const [error, setError] = useState<string | null>(null);

  const [expenseModalHalf, setExpenseModalHalf] = useState<PeriodHalf | null>(null);
  const [entryForms, setEntryForms] = useState<Record<EntryKind, ExpenseForm>>({
    income: emptyExpenseForm(),
    expense: emptyExpenseForm(),
  });
  const [savingEntry, setSavingEntry] = useState<EntryKind | null>(null);
  const [editingEntry, setEditingEntry] = useState<{ id: number; form: ExpenseForm } | null>(null);
  const [expenseError, setExpenseError] = useState<string | null>(null);

  const [payDateModalHalf, setPayDateModalHalf] = useState<PeriodHalf | null>(null);
  const [payDateForm, setPayDateForm] = useState("");
  const [payDateEndForm, setPayDateEndForm] = useState("");
  const [savingPayDate, setSavingPayDate] = useState(false);
  const [payDateError, setPayDateError] = useState<string | null>(null);

  const [dayOverrides, setDayOverrides] = useState<Map<string, number>>(new Map());
  const [daySavings, setDaySavings] = useState<Map<string, number>>(new Map());
  const applyOverrideRows = useCallback((rows: CalendarDayOverrideRow[]) => {
    setDayOverrides(new Map(rows.map((o) => [o.day, o.amount])));
    setDaySavings(new Map(rows.flatMap((o) => (o.saved != null ? [[o.day, o.saved] as const] : []))));
  }, []);
  const [dragSourceIso, setDragSourceIso] = useState<string | null>(null);
  const [dragOverIso, setDragOverIso] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<TransferState | null>(null);
  const [transferSpent, setTransferSpent] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [savingTransfer, setSavingTransfer] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const [spendDay, setSpendDay] = useState<DayCell | null>(null);
  const [spendAmount, setSpendAmount] = useState("");
  const [savingSpend, setSavingSpend] = useState(false);
  const [spendError, setSpendError] = useState<string | null>(null);

  const [autoDividing, setAutoDividing] = useState(false);

  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(
    () => dateIso(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    [today],
  );

  const [viewedYear, setViewedYear] = useState(today.getFullYear());
  const [viewedMonth, setViewedMonth] = useState(today.getMonth() + 1);
  const year = viewedYear;
  const month = viewedMonth;

  const monthExpenseCache = useRef<Map<string, MonthExpenses>>(new Map());

  const readMonthCache = useCallback(
    (y: number, m: number): MonthExpenses | undefined =>
      monthExpenseCache.current.get(monthCacheKey(y, m)),
    [],
  );

  const fetchMonthExpenses = useCallback(
    async (y: number, m: number): Promise<MonthExpenses> => {
      const [fixed, monthly] = await Promise.all([
        getFixedExpenses(undefined, y, m),
        getMonthlyExpenses(undefined, y, m),
      ]);
      const entry: MonthExpenses = { fixed: fixed.expenses, monthly: monthly.expenses };
      monthExpenseCache.current.set(monthCacheKey(y, m), entry);
      return entry;
    },
    [],
  );

  const clearMonthCache = useCallback(() => {
    monthExpenseCache.current.clear();
  }, []);

  const loadViewedMonths = useCallback(async () => {
    const next = addMonths(viewedYear, viewedMonth, 1);
    const [cur, nxt] = await Promise.all([
      fetchMonthExpenses(viewedYear, viewedMonth),
      fetchMonthExpenses(next.year, next.month),
    ]);
    setFixedExpenses(cur.fixed);
    setMonthlyExpenses(cur.monthly);
    setNextFixedExpenses(nxt.fixed);
    setNextMonthlyExpenses(nxt.monthly);
  }, [fetchMonthExpenses, viewedYear, viewedMonth]);

  const reloadViewedMonth = useCallback(async () => {
    clearMonthCache();
    await loadViewedMonths();
  }, [clearMonthCache, loadViewedMonths]);

  const loadOverrides = useCallback(async () => {
    const r = await getCalendarDayOverrides();
    applyOverrideRows(r.overrides);
  }, [applyOverrideRows]);

  const loadPayPeriodOverrides = useCallback(async () => {
    const r = await getPayPeriodStartOverrides();
    setPayPeriodOverrides(
      new Map(
        r.overrides.map((o) => [periodKey(o.period_year, o.period_month, o.period_half), o.start_date]),
      ),
    );
  }, []);

  const loadSharedData = useCallback(async () => {
    const [payslipResult, overridesResult, payPeriodResult] = await Promise.allSettled([
      getPayslips(12),
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
    if (overridesResult.status === "rejected") {
      const e = overridesResult.reason;
      firstError ??= e instanceof Error ? e.message : "Failed to load day overrides";
      applyOverrideRows([]);
    }
    if (payPeriodResult.status === "rejected") {
      const e = payPeriodResult.reason;
      firstError ??= e instanceof Error ? e.message : "Failed to load pay period overrides";
      setPayPeriodOverrides(new Map());
    }
    return firstError;
  }, [loadOverrides, loadPayPeriodOverrides, applyOverrideRows]);

  useEffect(() => {
    let cancelled = false;
    void loadSharedData().then((sharedError) => {
      if (cancelled) return;
      if (sharedError) setError(sharedError);
      setSharedLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadSharedData]);

  useEffect(() => {
    const next = addMonths(viewedYear, viewedMonth, 1);
    const cachedCur = readMonthCache(viewedYear, viewedMonth);
    const cachedNext = readMonthCache(next.year, next.month);
    if (cachedCur) {
      setFixedExpenses(cachedCur.fixed);
      setMonthlyExpenses(cachedCur.monthly);
    }
    if (cachedNext) {
      setNextFixedExpenses(cachedNext.fixed);
      setNextMonthlyExpenses(cachedNext.monthly);
    }
    let cancelled = false;
    void loadViewedMonths().then(
      () => {
        if (!cancelled) setMonthLoaded(true);
      },
      (e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load expenses");
        setMonthLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [viewedYear, viewedMonth, readMonthCache, loadViewedMonths]);

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

  const calendarWheelRef = useWheelStep((dir) => (dir < 0 ? goToPrevMonth() : goToNextMonth()));

  const isViewingCurrentMonth =
    viewedYear === today.getFullYear() && viewedMonth === today.getMonth() + 1;

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();

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
        dailyBudget: defaultAmount != null ? overrideAmount ?? defaultAmount : null,
        defaultAmount,
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

  const leadingOverflowDays = useMemo(() => {
    const [py, pm] = periodInfo.p1Start.split("-").map(Number);
    if (py === year && pm === month) return [];
    const result: DayCell[] = [];
    const prevMonthLastDay = new Date(py, pm, 0).getDate();
    for (let d = 1; d <= prevMonthLastDay; d++) {
      const iso = dateIso(py, pm, d);
      if (iso < periodInfo.p1Start) continue;
      const overrideAmount = dayOverrides.get(iso);
      result.push({
        day: d,
        iso,
        periodYear: year,
        periodMonth: month,
        periodHalf: 1,
        isPast: iso < todayIso,
        isToday: iso === todayIso,
        dailyBudget: firstHalfBudget != null ? overrideAmount ?? firstHalfBudget : null,
        defaultAmount: firstHalfBudget,
        outside: true,
      });
    }
    return result.slice(Math.max(0, result.length - firstWeekday));
  }, [periodInfo.p1Start, year, month, dayOverrides, firstHalfBudget, todayIso, firstWeekday]);

  const remainingForHalf = useCallback(
    (half: PeriodHalf) =>
      roundCents(
        [...leadingOverflowDays, ...dayCells]
          .filter(
            (d) =>
              d.periodHalf === half &&
              d.periodYear === year &&
              d.periodMonth === month &&
              !d.isPast &&
              d.dailyBudget != null,
          )
          .reduce((s, d) => s + (d.dailyBudget as number), 0),
      ),
    [dayCells, leadingOverflowDays, year, month],
  );

  const remainingFirstHalf = firstHalfBudget != null ? remainingForHalf(1) : null;
  const remainingSecondHalf = secondHalfBudget != null ? remainingForHalf(2) : null;

  const cellsByIso = useMemo(() => {
    const map = new Map<string, DayCell>();
    for (const d of leadingOverflowDays) map.set(d.iso, d);
    for (const d of dayCells) map.set(d.iso, d);
    return map;
  }, [leadingOverflowDays, dayCells]);

  const gridCells = useMemo(() => {
    const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    const result: (DayCell | null)[] = [];
    for (let i = 0; i < totalCells; i++) {
      const day = i - firstWeekday + 1;
      if (day >= 1 && day <= daysInMonth) {
        result.push(dayCells[day - 1]);
      } else if (day <= 0) {
        const overflowIdx = leadingOverflowDays.length + day - 1;
        result.push(overflowIdx >= 0 ? leadingOverflowDays[overflowIdx] : null);
      } else {
        result.push(null);
      }
    }
    return result;
  }, [firstWeekday, daysInMonth, dayCells, leadingOverflowDays]);

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
          dailyBudget: defaultBudget != null ? dayOverrides.get(iso) ?? defaultBudget : null,
          defaultAmount: defaultBudget,
        });
      }
      return result;
    },
    [payPeriodOverrides, netAfterExpensesForPeriod, dayOverrides, todayIso],
  );

  const handleDayDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, iso: string) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(DAY_DND_MIME, iso);
      setDragSourceIso(iso);
    },
    [],
  );

  const handleDayDragOver = useCallback((e: DragEvent<HTMLDivElement>, iso: string) => {
    e.preventDefault();
    setDragOverIso(iso);
  }, []);

  const handleDayDragLeave = useCallback((iso: string) => {
    setDragOverIso((prev) => (prev === iso ? null : prev));
  }, []);

  const handleDayDragEnd = useCallback(() => {
    setDragSourceIso(null);
    setDragOverIso(null);
  }, []);

  const handleDayDrop = useCallback(
    (e: DragEvent<HTMLDivElement>, targetIso: string) => {
      e.preventDefault();
      setDragSourceIso(null);
      setDragOverIso(null);
      const sourceIso = e.dataTransfer.getData(DAY_DND_MIME);
      if (!sourceIso || sourceIso === targetIso) return;
      const source = cellsByIso.get(sourceIso);
      const target = cellsByIso.get(targetIso);
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
    [cellsByIso],
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
      setTransferAmount(formatAmountNumber(remaining));
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
        applyOverrideRows(r.overrides);
        setTransfer(null);
      } catch (err) {
        setTransferError(err instanceof Error ? err.message : "Failed to move budget");
      } finally {
        setSavingTransfer(false);
      }
    },
    [transfer, transferAmount, applyOverrideRows],
  );

  const openSpendModal = useCallback((cell: DayCell) => {
    setSpendError(null);
    setSpendAmount("");
    setSpendDay(cell);
  }, []);

  const closeSpendModal = useCallback(() => {
    setSpendDay(null);
  }, []);

  const isPeriodLastDay = useCallback(
    (d: DayCell) => d.iso === periodEndIso(payPeriodOverrides, d.periodYear, d.periodMonth, d.periodHalf),
    [payPeriodOverrides],
  );

  const isClosedLastDay = useCallback(
    (d: DayCell) => daySavings.has(d.iso) && isPeriodLastDay(d),
    [daySavings, isPeriodLastDay],
  );

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
      const pot = spendDay.dailyBudget + (daySavings.get(spendDay.iso) ?? 0);
      const otherDays = periodDayCells(
        spendDay.periodYear,
        spendDay.periodMonth,
        spendDay.periodHalf,
      ).filter(
        (d) => d.iso !== spendDay.iso && !d.isPast && d.dailyBudget != null && !isClosedLastDay(d),
      );
      const banks =isPeriodLastDay(spendDay) || otherDays.length === 0;
      setSpendError(null);
      setSavingSpend(true);
      try {
        let overrides: { day: string; amount: number; saved?: number }[];
        if (banks) {
          overrides = [{ day: spendDay.iso, amount: spent, saved: roundCents(pot - spent) }];
        } else {
          const { after, shortfallCents } = spreadOverDays(otherDays, Math.round((pot - spent) * 100));
          overrides = otherDays.map((d) => ({ day: d.iso, amount: (after.get(d.iso) ?? 0) / 100 }));
          overrides.push({
            day: spendDay.iso,
            amount: spent,
            ...((shortfallCents > 0 || daySavings.has(spendDay.iso)) && { saved: -shortfallCents / 100 }),
          });
        }
        const r = await bulkUpsertCalendarDayOverrides(overrides);
        applyOverrideRows(r.overrides);
        setSpendDay(null);
      } catch (err) {
        setSpendError(err instanceof Error ? err.message : "Failed to record spend");
      } finally {
        setSavingSpend(false);
      }
    },
    [
      spendDay,
      spendAmount,
      daySavings,
      periodDayCells,
      isPeriodLastDay,
      isClosedLastDay,
      applyOverrideRows,
    ],
  );

  const evenOutPlan = useMemo(() => {
    const periods = new Map<string, DayCell>();
    for (const d of [...leadingOverflowDays, ...dayCells]) {
      periods.set(periodKey(d.periodYear, d.periodMonth, d.periodHalf), d);
    }
    const plan = (scope: "activeToday" | "future") => {
      const resets = (d: DayCell) =>
        !d.isPast && (scope === "activeToday" || !d.isToday) && !isClosedLastDay(d);
      const overrides: { day: string; amount: number }[] = [];
      for (const { periodYear, periodMonth, periodHalf } of periods.values()) {
        const net = netAfterExpensesForPeriod(periodYear, periodMonth, periodHalf);
        if (net == null) continue;
        const days = periodDayCells(periodYear, periodMonth, periodHalf);
        const targets = days.filter(resets);
        if (targets.length === 0) continue;
        const kept = days.filter((d) => !resets(d)).reduce((s, d) => s + (d.dailyBudget ?? 0), 0);
        const banked = days.reduce((s, d) => s + (daySavings.get(d.iso) ?? 0), 0);
        const amount = roundCents(Math.max(0, net - kept - banked) / targets.length);
        for (const d of targets) overrides.push({ day: d.iso, amount });
      }
      return overrides;
    };
    return { activeToday: plan("activeToday"), future: plan("future") };
  }, [leadingOverflowDays, dayCells, daySavings, netAfterExpensesForPeriod, periodDayCells, isClosedLastDay]);

  const autoDivideActiveDays = useCallback(
    async (scope: "activeToday" | "future") => {
      const overrides = evenOutPlan[scope];
      if (overrides.length === 0) return;
      setError(null);
      setAutoDividing(true);
      try {
        const r = await bulkUpsertCalendarDayOverrides(overrides);
        applyOverrideRows(r.overrides);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to even out budget");
      } finally {
        setAutoDividing(false);
      }
    },
    [evenOutPlan, applyOverrideRows],
  );

  const openExpenseModal = useCallback((half: PeriodHalf) => {
    setExpenseError(null);
    setEntryForms({ income: emptyExpenseForm(), expense: emptyExpenseForm() });
    setEditingEntry(null);
    setExpenseModalHalf(half);
  }, []);

  const closeExpenseModal = useCallback(() => {
    setExpenseModalHalf(null);
  }, []);

  const changeBudget = useCallback(
    async (deltaNet: number, write: () => Promise<unknown>) => {
      if (expenseModalHalf == null) return;
      const net = netAfterExpenses(expenseModalHalf);
      const overrides = new Map<string, { day: string; amount: number; saved?: number }>();
      if (net != null && net >= 0) {
        const days = periodDayCells(viewedYear, viewedMonth, expenseModalHalf);
        const open = days.filter((d) => !d.isPast && !isClosedLastDay(d));
        const { after, shortfallCents } = spreadOverDays(open, Math.round(deltaNet * 100));
        for (const d of days) {
          if (!dayOverrides.has(d.iso)) overrides.set(d.iso, { day: d.iso, amount: d.dailyBudget ?? 0 });
        }
        for (const d of open) overrides.set(d.iso, { day: d.iso, amount: (after.get(d.iso) ?? 0) / 100 });
        const bank = open[0] ?? days[days.length - 1];
        if (shortfallCents !== 0 && bank) {
          overrides.set(bank.iso, {
            day: bank.iso,
            amount: overrides.get(bank.iso)?.amount ?? bank.dailyBudget ?? 0,
            saved: roundCents((daySavings.get(bank.iso) ?? 0) - shortfallCents / 100),
          });
        }
      }
      await write();
      try {
        if (overrides.size > 0) {
          applyOverrideRows((await bulkUpsertCalendarDayOverrides([...overrides.values()])).overrides);
        }
      } finally {
        await reloadViewedMonth();
      }
    },
    [
      expenseModalHalf,
      netAfterExpenses,
      periodDayCells,
      viewedYear,
      viewedMonth,
      isClosedLastDay,
      dayOverrides,
      daySavings,
      applyOverrideRows,
      reloadViewedMonth,
    ],
  );

  const submitEntry = useCallback(
    async (e: FormEvent, kind: EntryKind) => {
      e.preventDefault();
      if (expenseModalHalf == null) return;
      const form = entryForms[kind];
      const amount = parseFormNumber(form.amount);
      if (amount == null || amount <= 0) {
        setExpenseError("Enter a valid amount greater than zero.");
        return;
      }
      const signed = kind === "income" ? -amount : amount;
      setExpenseError(null);
      setSavingEntry(kind);
      try {
        await changeBudget(-signed, () =>
          createFixedExpense({
            period_half: payslipHalfFor(expenseModalHalf),
            amount: signed,
            description: form.description.trim() || null,
            period_year: viewedYear,
            period_month: viewedMonth,
          }),
        );
        setEntryForms((f) => ({ ...f, [kind]: emptyExpenseForm() }));
      } catch (err) {
        setExpenseError(err instanceof Error ? err.message : `Failed to add ${kind}`);
      } finally {
        setSavingEntry(null);
      }
    },
    [expenseModalHalf, entryForms, changeBudget, viewedYear, viewedMonth],
  );

  const saveEditedEntry = useCallback(
    async (e: FormEvent, row: FixedExpenseRow) => {
      e.preventDefault();
      if (!editingEntry) return;
      const amount = parseFormNumber(editingEntry.form.amount);
      if (amount == null || amount <= 0) {
        setExpenseError("Enter a valid amount greater than zero.");
        return;
      }
      const signed = row.amount < 0 ? -amount : amount;
      setExpenseError(null);
      setSavingEntry(row.amount < 0 ? "income" : "expense");
      try {
        await changeBudget(row.amount - signed, () =>
          updateFixedExpense(row.id, { amount: signed, description: editingEntry.form.description.trim() || null }),
        );
        setEditingEntry(null);
      } catch (err) {
        setExpenseError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setSavingEntry(null);
      }
    },
    [editingEntry, changeBudget],
  );

  const onDeleteEntry = useCallback(
    async (amount: number, confirmText: string, remove: () => Promise<unknown>) => {
      if (!window.confirm(confirmText)) return;
      setExpenseError(null);
      try {
        await changeBudget(amount, remove);
      } catch (err) {
        setExpenseError(err instanceof Error ? err.message : "Failed to delete");
      }
    },
    [changeBudget],
  );

  const modalEntries = splitEntries(
    expenseModalHalf != null ? expensesForPeriod(viewedYear, viewedMonth, expenseModalHalf) : [],
  );
  const modalMonthlyExpenses =
    expenseModalHalf != null
      ? monthlyExpensesForPeriod(viewedYear, viewedMonth, expenseModalHalf)
      : [];
  const modalNetPay = expenseModalHalf != null ? netPayFor(expenseModalHalf) : null;
  const modalMonthlyExpensesTotal =
    expenseModalHalf != null ? monthlyExpensesTotal(expenseModalHalf) : 0;
  const modalNetAfter = expenseModalHalf != null ? netAfterExpenses(expenseModalHalf) : null;

  const payDateBounds = useMemo(() => {
    const prev = addMonths(year, month, -1);
    const prevHalf2Start = effectiveHalfStartIso(payPeriodOverrides, prev.year, prev.month, 2);
    return {
      1: { min: addDaysIso(prevHalf2Start, 1), max: defaultHalfStartIso(year, month, 1) },
      2: { min: dateIso(year, month, 2), max: defaultHalfStartIso(year, month, 2) },
    } as Record<PeriodHalf, { min: string; max: string }>;
  }, [payPeriodOverrides, year, month]);

  const payDateEndBounds = useMemo(() => {
    const next = addMonths(year, month, 1);
    return {
      1: { min: payDateForm, max: addDaysIso(defaultHalfStartIso(year, month, 2), -1) },
      2: { min: payDateForm, max: addDaysIso(defaultHalfStartIso(next.year, next.month, 1), -1) },
    } as Record<PeriodHalf, { min: string; max: string }>;
  }, [year, month, payDateForm]);

  const openPayDateModal = useCallback(
    (half: PeriodHalf) => {
      setPayDateError(null);
      setPayDateForm(half === 1 ? periodInfo.p1Start : periodInfo.p2Start);
      setPayDateEndForm("");
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
      if (payDateEndForm && payDateEndForm < payDateForm) {
        setPayDateError("End date can't be before the pay date.");
        return;
      }
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

        if (payDateEndForm) {
          const adjacent = adjacentPeriodFor(year, month, payDateModalHalf);
          const rAdjacent = await upsertPayPeriodStartOverride({
            period_year: adjacent.year,
            period_month: adjacent.month,
            period_half: adjacent.half,
            start_date: addDaysIso(payDateEndForm, 1),
          });
          setPayPeriodOverrides((prev) => {
            const next = new Map(prev);
            next.set(
              periodKey(adjacent.year, adjacent.month, adjacent.half),
              rAdjacent.override.start_date,
            );
            return next;
          });
        }

        setPayDateModalHalf(null);
      } catch (err) {
        setPayDateError(err instanceof Error ? err.message : "Failed to save pay date");
      } finally {
        setSavingPayDate(false);
      }
    },
    [payDateModalHalf, payDateForm, payDateEndForm, year, month],
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
    (startIso: string, endIso: string) => `${fmtDay(startIso)} – ${fmtDay(endIso)}`,
    [],
  );

  const activeDaysForHalf = (half: PeriodHalf) =>
    [...leadingOverflowDays, ...dayCells].filter(
      (d) =>
        d.periodHalf === half &&
        d.periodYear === year &&
        d.periodMonth === month &&
        !d.isPast &&
        d.dailyBudget != null,
    ).length;

  const spendPreview = useMemo(() => {
    if (!spendDay || spendDay.dailyBudget == null) return null;
    const others = periodDayCells(spendDay.periodYear, spendDay.periodMonth, spendDay.periodHalf).filter(
      (d) => d.iso !== spendDay.iso && !d.isPast && d.dailyBudget != null && !isClosedLastDay(d),
    );
    const days = others.length;
    const lastDay = isPeriodLastDay(spendDay);
    const banks = lastDay || days === 0;
    const pot = roundCents(spendDay.dailyBudget + (daySavings.get(spendDay.iso) ?? 0));
    const evaluated = evaluateAmountExpression(spendAmount);
    const spent = evaluated != null ? parseFormNumber(evaluated) : null;
    const delta = spent == null || spent < 0 ? null : roundCents(pot - roundCents(spent));
    const fromSavings =
      delta == null || banks ? 0 : spreadOverDays(others, Math.round(delta * 100)).shortfallCents / 100;
    return { pot, days, lastDay, banks, delta, fromSavings };
  }, [spendDay, spendAmount, daySavings, periodDayCells, isPeriodLastDay, isClosedLastDay]);

  const savingsTotal = roundCents([...daySavings.values()].reduce((s, v) => s + v, 0));
  const lastBanked = [...daySavings].pop();

  const transferMove = transfer ? parseFormNumber(transferAmount) : null;
  const payDateRange =
    payDateModalHalf === 1
      ? formatDayRangeLabel(periodInfo.p1Start, periodInfo.p1End)
      : formatDayRangeLabel(periodInfo.p2Start, periodInfo.p2End);
  const modalRange =
    expenseModalHalf === 1
      ? formatDayRangeLabel(periodInfo.p1Start, periodInfo.p1End)
      : formatDayRangeLabel(periodInfo.p2Start, periodInfo.p2End);

  const evenOutButton =
    "rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:opacity-50";

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="Calendar"
        description="Your daily spending budget: each paycheck, minus expenses, spread across its pay period."
        actions={
          <>
            {!isViewingCurrentMonth && (
              <button type="button" onClick={goToToday} className={SECONDARY_BUTTON_CLASSES}>
                Today
              </button>
            )}
            <MonthStepper year={year} month={month} onPrev={goToPrevMonth} onNext={goToNextMonth} />
          </>
        }
      />

      {error && (
        <ErrorAlert>
          {error}
        </ErrorAlert>
      )}

      {loading ? (
        <LoadingBlocks label="Loading your budget…" />
      ) : (
        <>
          <StatStrip className="sm:grid-cols-2">
            <Metric
              size="lg"
              label="Savings"
              value={savingsTotal < 0 ? `−${fmtMoney(-savingsTotal)}` : fmtMoney(savingsTotal)}
              tone={savingsTotal > 0 ? "success" : savingsTotal < 0 ? "danger" : "neutral"}
              hint="Last-day leftovers, minus overspending once a period runs dry"
            />
            <Metric
              label="Last added"
              value={
                lastBanked
                  ? `${lastBanked[1] < 0 ? "−" : "+"}${fmtMoney(Math.abs(lastBanked[1]))}`
                  : "–"
              }
              tone={lastBanked ? (lastBanked[1] < 0 ? "danger" : "success") : "neutral"}
              hint={
                lastBanked
                  ? fmtDay(lastBanked[0], true)
                  : "Log what you spent on a pay period's last day to start saving"
              }
            />
          </StatStrip>

          <div className="grid gap-5 lg:grid-cols-2">
            {([1, 2] as const).map((half) => {
              const style = HALF_STYLE[half];
              const netPay = netPayFor(half);
              const netAfter = half === 1 ? firstHalfNetAfter : secondHalfNetAfter;
              const perDay = half === 1 ? firstHalfBudget : secondHalfBudget;
              const remaining = (half === 1 ? remainingFirstHalf : remainingSecondHalf) ?? 0;
              const entries = splitEntries(expensesForPeriod(year, month, half));
              const deductions = entries.expenseTotal + monthlyExpensesTotal(half);
              const funding = fundingPeriodFor(half, year, month);
              const daysLeft = activeDaysForHalf(half);
              const ratio = netAfter != null && netAfter > 0 ? remaining / netAfter : 0;
              return (
                <section
                  key={half}
                  className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <span className={`size-2.5 shrink-0 rounded-full ${style.dot}`} />
                        {style.label}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-3">
                        {formatDayRangeLabel(
                          half === 1 ? periodInfo.p1Start : periodInfo.p2Start,
                          half === 1 ? periodInfo.p1End : periodInfo.p2End,
                        )}{" "}
                        · {half === 1 ? periodInfo.firstHalfDays : periodInfo.secondHalfDays} days
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openPayDateModal(half)}
                      title="Paid early? Set the real pay date"
                      className="-mr-1.5 inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
                    >
                      <CalendarIcon className="size-4" />
                      Pay date
                    </button>
                  </div>

                  {netAfter == null ? (
                    <p className="mt-5 flex-1 rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-3">
                      No payslip yet for {formatMonthYear(funding.year, funding.month)} (
                      {payslipHalfFor(half) === 1 ? "1st–15th" : "16th–end"}), so these days have no budget.
                    </p>
                  ) : daysLeft === 0 ? (
                    <div className="mt-5">
                      <p className="text-xs font-medium text-ink-3">Period budget</p>
                      <p className="mt-1 truncate text-3xl font-semibold tabular-nums tracking-tight text-ink-3">
                        {fmtMoney(netAfter)}
                      </p>
                      <p className="mt-2 text-xs text-ink-3">This pay period has ended.</p>
                    </div>
                  ) : (
                    <>
                      <div className="mt-5 flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-ink-3">Left to spend</p>
                          <p className="mt-1 truncate text-3xl font-semibold tabular-nums tracking-tight text-ink">
                            {fmtMoney(remaining)}
                          </p>
                        </div>
                        <p className="shrink-0 pb-1 text-right text-xs text-ink-3">
                          of <span className="font-medium tabular-nums text-ink-2">{fmtMoney(netAfter)}</span>
                        </p>
                      </div>
                      <Meter
                        className="mt-3"
                        value={ratio}
                        tone={netAfter < 0 ? "danger" : "brand"}
                        label={`${style.label} left to spend`}
                      />
                      <p className="mt-2 text-xs text-ink-3">
                        {daysLeft} day{daysLeft === 1 ? "" : "s"} left · about {fmtMoney(remaining / daysLeft)} a day
                      </p>
                    </>
                  )}
                  {netAfter != null && (
                    <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line-soft pt-4">
                      <Metric
                        size="sm"
                        label="Net pay"
                        value={netPay != null ? fmtMoney(netPay) : "–"}
                        hint={entries.incomeTotal > 0 ? `+${fmtMoney(entries.incomeTotal)} income` : undefined}
                      />
                      <Metric
                        size="sm"
                        label="Expenses"
                        value={deductions > 0 ? `−${fmtMoney(deductions)}` : "None"}
                        tone={deductions > 0 ? "danger" : "neutral"}
                      />
                      <Metric size="sm" label="Even split" value={perDay != null ? `${fmtMoney(perDay)}/day` : "–"} />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => openExpenseModal(half)}
                    className={`-ml-2 mt-4 self-start ${TEXT_BUTTON_CLASSES}`}
                  >
                    Income &amp; expenses →
                  </button>
                </section>
              );
            })}
          </div>

          <Panel
            ref={calendarWheelRef}
            title="Daily budget"
            subtitle="Tap a day to log what you spent. Drag a day onto another in the same period to move money."
            actions={
              <div className="flex items-center gap-0.5 rounded-xl border border-line p-1">
                <span className="px-2 text-xs font-medium text-ink-3">{autoDividing ? "Evening out…" : "Even out"}</span>
                <button
                  type="button"
                  disabled={autoDividing || evenOutPlan.activeToday.length === 0}
                  title={
                    evenOutPlan.activeToday.length === 0
                      ? NOTHING_TO_EVEN_OUT
                      : "Split what's left of each pay period evenly across today and every later day in it"
                  }
                  onClick={() => void autoDivideActiveDays("activeToday")}
                  className={evenOutButton}
                >
                  From today
                </button>
                <button
                  type="button"
                  disabled={autoDividing || evenOutPlan.future.length === 0}
                  title={
                    evenOutPlan.future.length === 0
                      ? NOTHING_TO_EVEN_OUT
                      : "Split what's left of each pay period evenly across the days after today, leaving today as it is"
                  }
                  onClick={() => void autoDivideActiveDays("future")}
                  className={evenOutButton}
                >
                  After today
                </button>
              </div>
            }
          >
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="pb-1 text-center text-[11px] font-medium uppercase tracking-wider text-ink-4"
                >
                  {label}
                </div>
              ))}
              {gridCells.map((cell, idx) =>
                cell ? (
                  <DayGridCell
                    key={cell.iso}
                    cell={cell}
                    isDragSource={dragSourceIso === cell.iso}
                    isDragOverTarget={dragOverIso === cell.iso && dragSourceIso !== cell.iso}
                    onOpenSpend={openSpendModal}
                    onDragStart={handleDayDragStart}
                    onDragOver={handleDayDragOver}
                    onDragLeave={handleDayDragLeave}
                    onDrop={handleDayDrop}
                    onDragEnd={handleDayDragEnd}
                  />
                ) : (
                  <div key={`blank-${idx}`} aria-hidden />
                ),
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-3">
              {([1, 2] as const).map((half) => (
                <span key={half} className="flex items-center gap-2">
                  <span className={`h-1.5 w-4 rounded-full ${HALF_STYLE[half].bar}`} />
                  {HALF_STYLE[half].label}
                </span>
              ))}
              <span className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-brand" />
                Today
              </span>
              <span className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-ink-4" />
                Changed from the even split
              </span>
            </div>
          </Panel>
        </>
      )}

      <Modal
        open={expenseModalHalf != null}
        onClose={closeExpenseModal}
        ariaLabelledBy="fixed-expense-title"
        dialogClassName={`${DIALOG_CLASSES} max-w-2xl`}
      >
        <ModalHeader
          id="fixed-expense-title"
          title={`Income & expenses · ${modalRange}`}
          subtitle="Extra income adds to this period's net pay, expenses come out of it, before it's split into daily budgets."
          onClose={closeExpenseModal}
        />
        <div className={`${DIALOG_BODY_CLASSES} space-y-6`}>
          <StatStrip className="grid-cols-2 sm:grid-cols-5">
            <Metric size="sm" label="Net pay" value={modalNetPay != null ? fmtMoney(modalNetPay) : "–"} />
            <Metric
              size="sm"
              label="Income"
              value={modalEntries.incomeTotal > 0 ? `+${fmtMoney(modalEntries.incomeTotal)}` : fmtMoney(0)}
              tone={modalEntries.incomeTotal > 0 ? "success" : "neutral"}
            />
            {(
              [
                ["Fixed", modalEntries.expenseTotal],
                ["Monthly", modalMonthlyExpensesTotal],
              ] as const
            ).map(([label, total]) => (
              <Metric
                key={label}
                size="sm"
                label={label}
                value={total > 0 ? `−${fmtMoney(total)}` : fmtMoney(0)}
                tone={total > 0 ? "danger" : "neutral"}
              />
            ))}
            <div className="col-span-2 sm:col-span-1">
              <Metric
                size="sm"
                label="Left to budget"
                value={modalNetAfter != null ? fmtMoney(modalNetAfter) : "–"}
                tone="success"
              />
            </div>
          </StatStrip>

          {expenseError && <ErrorAlert>{expenseError}</ErrorAlert>}

          {(
            [
              ["income", modalEntries.income],
              ["expense", modalEntries.expenses],
            ] as const
          ).map(([kind, rows]) => {
            const copy = ENTRY_COPY[kind];
            const form = entryForms[kind];
            const setForm = (patch: Partial<ExpenseForm>) =>
              setEntryForms((f) => ({ ...f, [kind]: { ...f[kind], ...patch } }));
            return (
              <section key={kind}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">{copy.title}</h3>
                  <span className="text-xs text-ink-3">{copy.note}</span>
                </div>
                <form
                  onSubmit={(e) => void submitEntry(e, kind)}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_10rem_auto]"
                >
                  <input
                    type="text"
                    aria-label={`${copy.title} description`}
                    placeholder={copy.placeholder}
                    className={INPUT_CLASSES}
                    value={form.description}
                    onChange={(e) => setForm({ description: e.target.value })}
                    disabled={savingEntry != null}
                  />
                  <AmountInput
                    required
                    aria-label={`${copy.title} amount`}
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(v) => setForm({ amount: v })}
                    disabled={savingEntry != null}
                  />
                  <button type="submit" disabled={savingEntry != null} className={PRIMARY_BUTTON_CLASSES}>
                    <PlusIcon className="size-4" />
                    {savingEntry === kind ? "Adding…" : "Add"}
                  </button>
                </form>
                {rows.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-3">{copy.empty}</p>
                ) : (
                  <ul className="mt-3 divide-y divide-line-soft rounded-xl border border-line">
                    {rows.map((exp) =>
                      editingEntry?.id === exp.id ? (
                        <li key={exp.id} className="p-2">
                          <form
                            onSubmit={(e) => void saveEditedEntry(e, exp)}
                            className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_8rem_auto_auto]"
                          >
                            <input
                              type="text"
                              aria-label={`${copy.title} description`}
                              className={INPUT_CLASSES}
                              value={editingEntry.form.description}
                              onChange={(e) =>
                                setEditingEntry({ id: exp.id, form: { ...editingEntry.form, description: e.target.value } })
                              }
                              disabled={savingEntry != null}
                            />
                            <AmountInput
                              autoFocus
                              required
                              aria-label={`${copy.title} amount`}
                              value={editingEntry.form.amount}
                              onChange={(v) => setEditingEntry({ id: exp.id, form: { ...editingEntry.form, amount: v } })}
                              disabled={savingEntry != null}
                            />
                            <button type="submit" disabled={savingEntry != null} className={PRIMARY_BUTTON_CLASSES}>
                              {savingEntry === kind ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              disabled={savingEntry != null}
                              onClick={() => setEditingEntry(null)}
                              className={SECONDARY_BUTTON_CLASSES}
                            >
                              Cancel
                            </button>
                          </form>
                        </li>
                      ) : (
                      <li key={exp.id} className="flex items-center gap-3 py-1.5 pl-4 pr-2">
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{exp.description || "Untitled"}</span>
                        <span
                          className={`text-sm font-semibold tabular-nums ${kind === "income" ? "text-success-text" : "text-ink"}`}
                        >
                          {kind === "income" ? "+" : ""}
                          {fmtMoney(Math.abs(exp.amount))}
                        </span>
                        <IconAction
                          kind="edit"
                          label={kind === "income" ? "Edit income" : "Edit expense"}
                          onClick={() =>
                            setEditingEntry({
                              id: exp.id,
                              form: { description: exp.description ?? "", amount: String(Math.abs(exp.amount)) },
                            })
                          }
                        />
                        <IconAction
                          kind="delete"
                          label={kind === "income" ? "Delete income" : "Delete expense"}
                          onClick={() => void onDeleteEntry(exp.amount, copy.remove, () => deleteFixedExpense(exp.id))}
                        />
                      </li>
                      ),
                    )}
                  </ul>
                )}
              </section>
            );
          })}

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">Monthly expenses</h3>
              <Link href="/monthly-expenses" className={`-mr-2 ${TEXT_BUTTON_CLASSES}`}>
                Manage →
              </Link>
            </div>
            {modalMonthlyExpenses.length === 0 ? (
              <p className="text-sm text-ink-3">No monthly expenses for this period.</p>
            ) : (
              <ul className="divide-y divide-line-soft rounded-xl border border-line">
                {modalMonthlyExpenses.map((exp) => (
                  <li key={exp.id} className="flex items-center gap-3 py-1.5 pl-4 pr-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm text-ink">{exp.name}</span>
                        {exp.is_recurring && <Pill tone="brand">Recurring</Pill>}
                      </div>
                      {exp.description && <p className="truncate text-xs text-ink-3">{exp.description}</p>}
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-ink">{fmtMoney(exp.amount)}</span>
                    <IconAction
                      kind="delete"
                      label={`Delete ${exp.name}`}
                      onClick={() =>
                        void onDeleteEntry(exp.amount, "Delete this monthly expense?", () =>
                          deleteMonthlyExpense(exp.id),
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Modal>

      <Modal
        open={transfer != null}
        onClose={closeTransferModal}
        ariaLabelledBy="transfer-title"
        dialogClassName={`${DIALOG_CLASSES} max-w-md`}
      >
        {transfer && (
          <>
            <ModalHeader
              id="transfer-title"
              title="Move budget"
              subtitle="Between two days in the same pay period."
              onClose={closeTransferModal}
            />
            <form onSubmit={submitTransfer} className="flex min-h-0 flex-1 flex-col">
              <div className={`${DIALOG_BODY_CLASSES} space-y-4`}>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  {(
                    [
                      ["From", transfer.fromIso, transfer.fromAmount, -1],
                      null,
                      ["To", transfer.toIso, transfer.toAmount, 1],
                    ] as const
                  ).map((side, i) =>
                    side == null ? (
                      <ChevronRightIcon key={i} className="size-5 text-ink-4" />
                    ) : (
                      <div key={i} className="min-w-0 rounded-xl border border-line px-3.5 py-3">
                        <p className="truncate text-xs text-ink-3">
                          {side[0]} {fmtDay(side[1], true)}
                        </p>
                        <p className="mt-0.5 truncate text-lg font-semibold tabular-nums text-ink">{fmtMoney(side[2])}</p>
                        {transferMove != null && transferMove > 0 && (
                          <p className="truncate text-xs tabular-nums text-ink-3">
                            becomes {fmtMoney(Math.max(0, side[2] + side[3] * transferMove))}
                          </p>
                        )}
                      </div>
                    ),
                  )}
                </div>
                <Field
                  label={`Already spent on ${fmtDay(transfer.fromIso)}`}
                  hint="Optional · fills in the amount to move with what's left"
                >
                  <AmountInput
                    autoFocus
                    placeholder="0.00"
                    value={transferSpent}
                    onChange={handleTransferSpentChange}
                    disabled={savingTransfer}
                  />
                </Field>
                <Field label="Amount to move" hint={`Up to ${fmtMoney(transfer.fromAmount)}`}>
                  <div className="flex gap-2">
                    <AmountInput
                      required
                      placeholder="0.00"
                      className="min-w-0 flex-1"
                      value={transferAmount}
                      onChange={setTransferAmount}
                      disabled={savingTransfer}
                    />
                    <button
                      type="button"
                      className={SECONDARY_BUTTON_CLASSES}
                      onClick={() => setTransferAmount(formatAmountNumber(roundCents(transfer.fromAmount)))}
                      disabled={savingTransfer}
                    >
                      Max
                    </button>
                  </div>
                </Field>
                {transferError && (
                  <ErrorAlert>
                    {transferError}
                  </ErrorAlert>
                )}
              </div>
              <div className={DIALOG_FOOTER_CLASSES}>
                <button
                  type="button"
                  className={SECONDARY_BUTTON_CLASSES}
                  onClick={closeTransferModal}
                  disabled={savingTransfer}
                >
                  Cancel
                </button>
                <button type="submit" className={PRIMARY_BUTTON_CLASSES} disabled={savingTransfer}>
                  {savingTransfer ? "Moving…" : "Move budget"}
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
        dialogClassName={`${DIALOG_CLASSES} max-w-sm`}
      >
        {spendDay && spendPreview && (
          <>
            <ModalHeader
              id="spend-title"
              title="Log spending"
              subtitle={fmtDay(spendDay.iso, true)}
              onClose={closeSpendModal}
            />
            <form onSubmit={submitSpend} className="flex min-h-0 flex-1 flex-col">
              <div className={`${DIALOG_BODY_CLASSES} space-y-4`}>
                <div className="rounded-xl bg-surface-2/70 px-4 py-3">
                  <p className="text-xs font-medium text-ink-3">Budget for this day</p>
                  <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-ink">
                    {fmtMoney(spendPreview.pot)}
                  </p>
                  {spendPreview.banks && (
                    <p className="mt-1 text-xs text-ink-3">
                      {spendPreview.lastDay
                        ? "Last day of this pay period: whatever you don't spend goes to Savings."
                        : "No open days left in this pay period: whatever you don't spend goes to Savings."}
                    </p>
                  )}
                </div>
                <Field label="Amount spent" hint="Math works too, e.g. 120+45.50">
                  <AmountInput
                    required
                    mode="expression"
                    autoFocus
                    placeholder="0.00"
                    value={spendAmount}
                    onChange={setSpendAmount}
                    disabled={savingSpend}
                  />
                </Field>
                {spendPreview.delta != null && (
                  <p
                    aria-live="polite"
                    className={`rounded-lg px-3 py-2 text-sm ${
                      spendPreview.delta >= 0
                        ? "bg-success-soft text-success-text"
                        : "bg-warning-soft text-warning-text"
                    }`}
                  >
                    {spendPreview.banks
                      ? spendPreview.delta === 0
                        ? "Right on budget. Nothing goes to Savings."
                        : spendPreview.delta > 0
                          ? `${fmtMoney(spendPreview.delta)} left over goes to Savings.`
                          : `${fmtMoney(-spendPreview.delta)} over, taken out of Savings.`
                      : spendPreview.delta === 0
                        ? "Right on budget. Other days stay as they are."
                        : spendPreview.delta > 0
                          ? `${fmtMoney(spendPreview.delta)} left over, adding about ${fmtMoney(spendPreview.delta / spendPreview.days)} to each of the other ${spendPreview.days} days.`
                          : spendPreview.fromSavings >= -spendPreview.delta
                            ? `${fmtMoney(-spendPreview.delta)} over. This pay period's budget has run dry, so it comes out of Savings.`
                            : spendPreview.fromSavings > 0
                              ? `${fmtMoney(-spendPreview.delta)} over: ${fmtMoney(-spendPreview.delta - spendPreview.fromSavings)} from the other ${spendPreview.days} days, ${fmtMoney(spendPreview.fromSavings)} from Savings.`
                              : `${fmtMoney(-spendPreview.delta)} over, taking about ${fmtMoney(-spendPreview.delta / spendPreview.days)} from each of the other ${spendPreview.days} days.`}
                  </p>
                )}
                {spendError && (
                  <ErrorAlert>
                    {spendError}
                  </ErrorAlert>
                )}
              </div>
              <div className={DIALOG_FOOTER_CLASSES}>
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
        dialogClassName={`${DIALOG_CLASSES} max-w-md`}
      >
        {payDateModalHalf != null && (
          <>
            <ModalHeader id="pay-date-title" title="Adjust pay date" subtitle={payDateRange} onClose={closePayDateModal} />
            <form onSubmit={submitPayDate} className="flex min-h-0 flex-1 flex-col">
              <div className={`${DIALOG_BODY_CLASSES} space-y-4`}>
                <p className="text-sm text-ink-3">
                  Paid before the {payDateModalHalf === 1 ? "1st" : "16th"}? Set the real date. This period
                  then starts that day and the one before it gets shorter, so the calendar has no gaps.
                </p>
                <Field label="Paid on">
                  <DatePickerField
                    value={payDateForm}
                    onChange={setPayDateForm}
                    minDate={payDateBounds[payDateModalHalf].min}
                    maxDate={payDateBounds[payDateModalHalf].max}
                    disabled={savingPayDate}
                  />
                </Field>
                <Field label="Period ends" hint="Optional · the next period then starts the day after">
                  <DatePickerField
                    value={payDateEndForm}
                    onChange={setPayDateEndForm}
                    minDate={payDateEndBounds[payDateModalHalf].min}
                    maxDate={payDateEndBounds[payDateModalHalf].max}
                    placeholder="Default end"
                    clearLabel="Use default"
                    disabled={savingPayDate}
                  />
                </Field>
                {payDateError && (
                  <ErrorAlert>
                    {payDateError}
                  </ErrorAlert>
                )}
              </div>
              <div className={DIALOG_FOOTER_CLASSES}>
                <button
                  type="button"
                  className="mr-auto rounded-lg px-2 py-1.5 text-sm font-medium text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                  onClick={() => void resetPayDate()}
                  disabled={savingPayDate}
                >
                  Reset to default
                </button>
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
            </form>
          </>
        )}
      </Modal>
    </div>
  );
}
