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
import { MONTH_NAMES_SHORT, formatMonthYear, parseDateOnlyLocal } from "@/lib/dateFormat";
import { fmtAmount, fmtCompactMoney } from "@/lib/formatNumber";
import {
  evaluateAmountExpression,
  formatAmountNumber,
  parseFormNumber,
} from "@/lib/parseFormNumber";
import {
  ERROR_ALERT_CLASSES,
  INPUT_CLASSES,
  PAGE_CONTAINER_CLASSES,
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

/** The period immediately following the given one — half-1 is followed by half-2 of the same
 *  month; half-2 is followed by half-1 of the next month. Periods stay contiguous, so setting
 *  a period's end date is the same as setting this adjacent period's start date to end + 1 day. */
function adjacentPeriodFor(
  year: number,
  month: number,
  half: PeriodHalf,
): { year: number; month: number; half: PeriodHalf } {
  if (half === 1) return { year, month, half: 2 };
  const next = addMonths(year, month, 1);
  return { year: next.year, month: next.month, half: 1 };
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

const fmtMoney = fmtAmount;

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
  /** The even-split default for this day's pay period, ignoring any stored override —
   *  what "auto-divide" resets active days back to. */
  defaultAmount: number | null;
  /** A previous-month day shown in the leading blanks (see leadingOverflowDays). */
  outside?: boolean;
};

type ExpenseForm = { amount: string; description: string };
const emptyExpenseForm = (): ExpenseForm => ({ amount: "", description: "" });

/** Both expense kinds for one calendar month, as cached per month. */
type MonthExpenses = { fixed: FixedExpenseRow[]; monthly: MonthlyExpenseRow[] };

/** Cache key for {@link MonthExpenses}; not padded — only ever compared to itself. */
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

/** One hue per pay period — summary cards, day cells and the legend all agree. */
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

/** "Sep 14" (or "Mon, Sep 14" with `long`) for a "YYYY-MM-DD" string, parsed as a local date. */
function fmtDay(iso: string, long = false): string {
  const d = parseDateOnlyLocal(iso);
  return d ? (long ? LONG_DAY : SHORT_DAY).format(d) : iso;
}

/**
 * One day in the month grid, memoized.
 *
 * Dragging a day fires `dragover`/`dragleave` continuously, and each one is a
 * state update on the parent. Rendering the cells inline meant every such
 * event rebuilt all ~42 of them — six template-string class computations each —
 * even though at most two cells actually change appearance. With this split,
 * the parent still re-renders but React skips every cell whose props are
 * unchanged, which is all of them but the drag source and the hovered target.
 *
 * All the callbacks are `useCallback`-stable in the parent, so the memo
 * comparison is meaningful; `cell` is a fresh object only when `dayCells`
 * genuinely recomputes.
 */
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
  /** The day no longer holds its even share — spend was logged or budget moved. */
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
            {/* Narrow cells only fit the rounded form; from `sm` up there is room
                for the exact amount, which is what the day is actually worth. */}
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
  /**
   * Two independent first-load flags rather than one `loading` toggle: the
   * shared (all-month) data and the viewed month's expenses arrive separately,
   * and neither should ever flip back to "loading" when the user pages months.
   */
  const [sharedLoaded, setSharedLoaded] = useState(false);
  const [monthLoaded, setMonthLoaded] = useState(false);
  const loading = !sharedLoaded || !monthLoaded;
  const [error, setError] = useState<string | null>(null);

  const [expenseModalHalf, setExpenseModalHalf] = useState<PeriodHalf | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(emptyExpenseForm());
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);

  const [payDateModalHalf, setPayDateModalHalf] = useState<PeriodHalf | null>(null);
  const [payDateForm, setPayDateForm] = useState("");
  const [payDateEndForm, setPayDateEndForm] = useState("");
  const [savingPayDate, setSavingPayDate] = useState(false);
  const [payDateError, setPayDateError] = useState<string | null>(null);

  const [dayOverrides, setDayOverrides] = useState<Map<string, number>>(new Map());
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

  /**
   * Per-month expense lists already fetched this session, keyed "YYYY-M".
   * Paging with ←/→ paints from here on the same tick and then revalidates in
   * the background, so a month that's already been seen never blanks out
   * waiting on the network. A ref (not state) because writing to it must not
   * itself trigger a render — the setState calls fed from it already do.
   */
  const monthExpenseCache = useRef<Map<string, MonthExpenses>>(new Map());

  const readMonthCache = useCallback(
    (y: number, m: number): MonthExpenses | undefined =>
      monthExpenseCache.current.get(monthCacheKey(y, m)),
    [],
  );

  /** Both expense lists for one month in one round trip pair; result is cached. */
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

  /**
   * Drop cached months after a write. Recurring monthly expenses show up in
   * every month's response, so a single edit can invalidate any cached month,
   * not just the one it was filed under — clearing everything is the only
   * correct scope.
   */
  const clearMonthCache = useCallback(() => {
    monthExpenseCache.current.clear();
  }, []);

  /** Viewed month + the next one (the grid can spill into next month's half-1). */
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

  /** Re-read the viewed month only (after adding/deleting one of its expenses). */
  const reloadViewedMonth = useCallback(async () => {
    clearMonthCache();
    await loadViewedMonths();
  }, [clearMonthCache, loadViewedMonths]);

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

  /**
   * Payslips and both override lists cover every month at once, so they load
   * exactly once per mount — they used to be bundled into the same callback as
   * the month-scoped expense lists, which meant every ←/→ press refetched all
   * seven endpoints and flipped `loading` back on, blanking the whole grid.
   */
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
      setDayOverrides(new Map());
    }
    if (payPeriodResult.status === "rejected") {
      const e = payPeriodResult.reason;
      firstError ??= e instanceof Error ? e.message : "Failed to load pay period overrides";
      setPayPeriodOverrides(new Map());
    }
    return firstError;
  }, [loadOverrides, loadPayPeriodOverrides]);

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

  /**
   * Month-scoped refresh, including the first one. Already-visited months paint
   * from `monthExpenseCache` on this same tick and then revalidate in the
   * background, so paging with ←/→ stays responsive instead of dropping to a
   * spinner — `monthLoaded` latches after the first fetch and never clears.
   */
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

  const anyModalOpen =
    expenseModalHalf != null || payDateModalHalf != null || transfer != null || spendDay != null;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (anyModalOpen) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPrevMonth();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToNextMonth();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [anyModalOpen, goToPrevMonth, goToNextMonth]);

  const isViewingCurrentMonth =
    viewedYear === today.getFullYear() && viewedMonth === today.getMonth() + 1;

  const daysInMonth = new Date(year, month, 0).getDate();
  /** Weekday (0=Sun) of this month's 1st — also the number of blank leading
   *  grid slots available to show spillover days from the previous month. */
  const firstWeekday = new Date(year, month - 1, 1).getDay();

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
        // No payslip recorded for the funding period yet means there's no
        // confirmed money for this day at all — never show a per-day amount
        // (even a stored override, which may be stale from before this day's
        // period assignment or funding payslip changed) until there is one.
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

  /**
   * When this month's 1st-half pay period start was pulled back by an
   * override into the previous month (e.g. payday landing on the 29th
   * instead of the 1st), those trailing previous-month days belong to this
   * month's period 1 but live outside `dayCells` (which only covers this
   * month's own 1..daysInMonth). Surface them so they're visible and
   * clickable — capped to the number of blank leading slots the grid
   * already has before day 1, so weekday columns stay aligned.
   */
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

  /** Sum of a half's still-active (today or later) days' current daily budget —
   *  what's left to spend for the rest of that pay period this month. */
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

  /**
   * Resets every still-active day in the viewed month back to its pay
   * period's even split — the fix for overrides (from a manual
   * drag/transfer, or a "log spend" redistribution) going stale once a
   * monthly expense is added, edited, moved between halves, or deleted.
   * Past days are left untouched so already-logged history doesn't move.
   * `scope: "future"` also excludes today, for resetting only the days
   * still ahead without touching what's already been logged today.
   */
  const autoDivideActiveDays = useCallback(
    async (scope: "activeToday" | "future" = "activeToday") => {
      const targets = dayCells.filter(
        (d) => !d.isPast && (scope === "activeToday" || !d.isToday) && d.defaultAmount != null,
      );
      if (targets.length === 0) return;
      setError(null);
      setAutoDividing(true);
      try {
        const overrides = targets.map((d) => ({
          day: d.iso,
          amount: roundCents(d.defaultAmount as number),
        }));
        const r = await bulkUpsertCalendarDayOverrides(overrides);
        setDayOverrides(new Map(r.overrides.map((o) => [o.day, o.amount])));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to auto-divide budget");
      } finally {
        setAutoDividing(false);
      }
    },
    [dayCells],
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
        await reloadViewedMonth();
      } catch (err) {
        setExpenseError(err instanceof Error ? err.message : "Failed to add expense");
      } finally {
        setSavingExpense(false);
      }
    },
    [expenseModalHalf, expenseForm, reloadViewedMonth, viewedYear, viewedMonth],
  );

  const onDeleteExpense = useCallback(
    async (id: number) => {
      if (!window.confirm("Delete this expense?")) return;
      setExpenseError(null);
      try {
        await deleteFixedExpense(id);
        await reloadViewedMonth();
      } catch (err) {
        setExpenseError(err instanceof Error ? err.message : "Failed to delete expense");
      }
    },
    [reloadViewedMonth],
  );

  const onDeleteMonthlyExpense = useCallback(
    async (id: number) => {
      if (!window.confirm("Delete this monthly expense?")) return;
      setExpenseError(null);
      try {
        await deleteMonthlyExpense(id);
        await reloadViewedMonth();
      } catch (err) {
        setExpenseError(err instanceof Error ? err.message : "Failed to delete expense");
      }
    },
    [reloadViewedMonth],
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

  /** Bounds for the optional end date — one day before whatever the adjacent period's own
   *  start bound is, since setting an end date pushes that adjacent period's start forward. */
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

  /** Still-open days (today or later) of a half in the viewed month — the days
   * `remainingForHalf` sums, so "left to spend ÷ this" is the real pace. */
  const activeDaysForHalf = (half: PeriodHalf) =>
    [...leadingOverflowDays, ...dayCells].filter(
      (d) =>
        d.periodHalf === half &&
        d.periodYear === year &&
        d.periodMonth === month &&
        !d.isPast &&
        d.dailyBudget != null,
    ).length;

  /** Live "what happens to the rest" line under the Log spending input. */
  const spendPreview = useMemo(() => {
    if (!spendDay || spendDay.dailyBudget == null) return null;
    const evaluated = evaluateAmountExpression(spendAmount);
    const spent = evaluated != null ? parseFormNumber(evaluated) : null;
    if (spent == null || spent < 0) return null;
    const days = periodDayCells(spendDay.periodYear, spendDay.periodMonth, spendDay.periodHalf).filter(
      (d) => d.iso !== spendDay.iso && !d.isPast && d.dailyBudget != null,
    ).length;
    return { delta: roundCents(spendDay.dailyBudget - roundCents(spent)), days };
  }, [spendDay, spendAmount, periodDayCells]);

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
        <div className={ERROR_ALERT_CLASSES} role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingBlocks label="Loading your budget…" />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            {([1, 2] as const).map((half) => {
              const style = HALF_STYLE[half];
              const netPay = netPayFor(half);
              const netAfter = half === 1 ? firstHalfNetAfter : secondHalfNetAfter;
              const perDay = half === 1 ? firstHalfBudget : secondHalfBudget;
              const remaining = (half === 1 ? remainingFirstHalf : remainingSecondHalf) ?? 0;
              const deductions = expensesTotal(half) + monthlyExpensesTotal(half);
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
                      <Metric size="sm" label="Net pay" value={netPay != null ? fmtMoney(netPay) : "–"} />
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
                    Expenses for this period →
                  </button>
                </section>
              );
            })}
          </div>

          <Panel
            title="Daily budget"
            subtitle="Tap a day to log what you spent. Drag a day onto another in the same period to move money."
            actions={
              <div className="flex items-center gap-0.5 rounded-xl border border-line p-1">
                <span className="px-2 text-xs font-medium text-ink-3">{autoDividing ? "Evening out…" : "Even out"}</span>
                <button
                  type="button"
                  disabled={autoDividing}
                  title="Reset today and every later day this month to an even split of its pay period"
                  onClick={() => void autoDivideActiveDays("activeToday")}
                  className={evenOutButton}
                >
                  From today
                </button>
                <button
                  type="button"
                  disabled={autoDividing}
                  title="Reset the days after today to an even split, leaving today as it is"
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
          title={`Expenses · ${modalRange}`}
          subtitle="Taken out of this period's net pay before it's split into daily budgets."
          onClose={closeExpenseModal}
        />
        <div className={`${DIALOG_BODY_CLASSES} space-y-6`}>
          <StatStrip className="grid-cols-2 sm:grid-cols-4">
            <Metric size="sm" label="Net pay" value={modalNetPay != null ? fmtMoney(modalNetPay) : "–"} />
            {(
              [
                ["Fixed", modalExpensesTotal],
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
            <Metric
              size="sm"
              label="Left to budget"
              value={modalNetAfter != null ? fmtMoney(modalNetAfter) : "–"}
              tone="success"
            />
          </StatStrip>

          <section>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">Fixed expenses</h3>
              <span className="text-xs text-ink-3">This pay period only</span>
            </div>
            <form onSubmit={submitExpense} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_10rem_auto]">
              <input
                type="text"
                aria-label="Description"
                placeholder="What's it for?"
                className={INPUT_CLASSES}
                value={expenseForm.description}
                onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))}
                disabled={savingExpense}
              />
              <AmountInput
                required
                aria-label="Amount"
                placeholder="0.00"
                value={expenseForm.amount}
                onChange={(v) => setExpenseForm((f) => ({ ...f, amount: v }))}
                disabled={savingExpense}
              />
              <button type="submit" disabled={savingExpense} className={PRIMARY_BUTTON_CLASSES}>
                <PlusIcon className="size-4" />
                {savingExpense ? "Adding…" : "Add"}
              </button>
            </form>
            {expenseError && (
              <div className={`mt-3 ${ERROR_ALERT_CLASSES}`} role="alert">
                {expenseError}
              </div>
            )}
            {modalExpenses.length === 0 ? (
              <p className="mt-3 text-sm text-ink-3">No fixed expenses for this period.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line-soft rounded-xl border border-line">
                {modalExpenses.map((exp) => (
                  <li key={exp.id} className="flex items-center gap-3 py-1.5 pl-4 pr-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{exp.description || "Untitled"}</span>
                    <span className="text-sm font-semibold tabular-nums text-ink">{fmtMoney(exp.amount)}</span>
                    <IconAction kind="delete" label="Delete expense" onClick={() => void onDeleteExpense(exp.id)} />
                  </li>
                ))}
              </ul>
            )}
          </section>

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
                      onClick={() => void onDeleteMonthlyExpense(exp.id)}
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
                  <div className={ERROR_ALERT_CLASSES} role="alert">
                    {transferError}
                  </div>
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
        {spendDay && spendDay.dailyBudget != null && (
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
                    {fmtMoney(spendDay.dailyBudget)}
                  </p>
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
                {spendPreview && (
                  <p
                    aria-live="polite"
                    className={`rounded-lg px-3 py-2 text-sm ${
                      spendPreview.days === 0
                        ? "bg-danger-soft text-danger-text"
                        : spendPreview.delta >= 0
                          ? "bg-success-soft text-success-text"
                          : "bg-warning-soft text-warning-text"
                    }`}
                  >
                    {spendPreview.days === 0
                      ? "No other open days in this pay period to spread the difference to."
                      : spendPreview.delta === 0
                        ? "Right on budget. Other days stay as they are."
                        : spendPreview.delta > 0
                          ? `${fmtMoney(spendPreview.delta)} left over, adding about ${fmtMoney(spendPreview.delta / spendPreview.days)} to each of the other ${spendPreview.days} days.`
                          : `${fmtMoney(-spendPreview.delta)} over, taking about ${fmtMoney(-spendPreview.delta / spendPreview.days)} from each of the other ${spendPreview.days} days.`}
                  </p>
                )}
                {spendError && (
                  <div className={ERROR_ALERT_CLASSES} role="alert">
                    {spendError}
                  </div>
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
                  <div className={ERROR_ALERT_CLASSES} role="alert">
                    {payDateError}
                  </div>
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
