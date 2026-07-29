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
  getCalendarDayOverrides,
  getFixedExpenses,
  getMonthlyExpenses,
  getPayslips,
  type FixedExpenseRow,
  type MonthlyExpenseRow,
  type PayslipRow,
} from "@/lib/api";
import { formatMonthYear } from "@/lib/dateFormat";
import { parseFormNumber } from "@/lib/parseFormNumber";
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

/** Semi-monthly payroll: 1st–15th, then 16th–end of month (13–16 days depending on the month). */
const FIRST_HALF_DAYS = 15;

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

type DayCell = {
  day: number;
  iso: string;
  half: PeriodHalf;
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
  const [lastFirstHalfPayslip, setLastFirstHalfPayslip] = useState<PayslipRow | null>(null);
  const [lastSecondHalfPayslip, setLastSecondHalfPayslip] = useState<PayslipRow | null>(null);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpenseRow[]>([]);
  const [monthlyExpenses, setMonthlyExpenses] = useState<MonthlyExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expenseModalHalf, setExpenseModalHalf] = useState<PeriodHalf | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(emptyExpenseForm());
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);

  const [dayOverrides, setDayOverrides] = useState<Map<string, number>>(new Map());
  const [dragSourceDay, setDragSourceDay] = useState<number | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const [transfer, setTransfer] = useState<TransferState | null>(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [savingTransfer, setSavingTransfer] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    const r = await getFixedExpenses();
    setFixedExpenses(r.expenses);
  }, []);

  const loadMonthlyExpenses = useCallback(async () => {
    const r = await getMonthlyExpenses();
    setMonthlyExpenses(r.expenses);
  }, []);

  const loadOverrides = useCallback(async () => {
    const r = await getCalendarDayOverrides();
    setDayOverrides(new Map(r.overrides.map((o) => [o.day, o.amount])));
  }, []);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    const [payslipResult, expensesResult, monthlyExpensesResult, overridesResult] =
      await Promise.allSettled([
        getPayslips(12),
        loadExpenses(),
        loadMonthlyExpenses(),
        loadOverrides(),
      ]);
    let firstError: string | null = null;
    if (payslipResult.status === "fulfilled") {
      const r = payslipResult.value;
      setLastFirstHalfPayslip(r.payslips.find((p) => p.period_half === 1) ?? null);
      setLastSecondHalfPayslip(r.payslips.find((p) => p.period_half === 2) ?? null);
    } else {
      const e = payslipResult.reason;
      firstError = e instanceof Error ? e.message : "Failed to load last salary";
      setLastFirstHalfPayslip(null);
      setLastSecondHalfPayslip(null);
    }
    if (expensesResult.status === "rejected") {
      const e = expensesResult.reason;
      firstError ??= e instanceof Error ? e.message : "Failed to load fixed expenses";
      setFixedExpenses([]);
    }
    if (monthlyExpensesResult.status === "rejected") {
      const e = monthlyExpensesResult.reason;
      firstError ??= e instanceof Error ? e.message : "Failed to load monthly expenses";
      setMonthlyExpenses([]);
    }
    if (overridesResult.status === "rejected") {
      const e = overridesResult.reason;
      firstError ??= e instanceof Error ? e.message : "Failed to load day overrides";
      setDayOverrides(new Map());
    }
    setError(firstError);
    setLoading(false);
  }, [loadExpenses, loadMonthlyExpenses, loadOverrides]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = useMemo(() => new Date(), []);
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const todayDate = today.getDate();

  const daysInMonth = new Date(year, month, 0).getDate();
  const secondHalfDays = daysInMonth - FIRST_HALF_DAYS;

  const expensesByHalf = useMemo(() => {
    const map: Record<PeriodHalf, FixedExpenseRow[]> = { 1: [], 2: [] };
    for (const e of fixedExpenses) {
      if (e.period_half === 1 || e.period_half === 2) map[e.period_half].push(e);
    }
    return map;
  }, [fixedExpenses]);

  const expensesTotal = useCallback(
    (calendarHalf: PeriodHalf) =>
      expensesByHalf[payslipHalfFor(calendarHalf)].reduce((s, e) => s + e.amount, 0),
    [expensesByHalf],
  );

  /**
   * Unlike fixed expenses (scoped to the payslip half that funds a calendar
   * half, see payslipHalfFor), monthly expenses are entered directly against
   * the calendar half they should reduce — no pay-lag conversion.
   */
  const monthlyExpensesByHalf = useMemo(() => {
    const map: Record<PeriodHalf, MonthlyExpenseRow[]> = { 1: [], 2: [] };
    for (const e of monthlyExpenses) {
      if (e.period_half === 1 || e.period_half === 2) map[e.period_half].push(e);
    }
    return map;
  }, [monthlyExpenses]);

  const monthlyExpensesTotal = useCallback(
    (calendarHalf: PeriodHalf) =>
      monthlyExpensesByHalf[calendarHalf].reduce((s, e) => s + e.amount, 0),
    [monthlyExpensesByHalf],
  );

  const netPayFor = useCallback(
    (calendarHalf: PeriodHalf): number | null =>
      (payslipHalfFor(calendarHalf) === 1 ? lastFirstHalfPayslip : lastSecondHalfPayslip)?.total ??
      null,
    [lastFirstHalfPayslip, lastSecondHalfPayslip],
  );

  const netAfterExpenses = useCallback(
    (half: PeriodHalf): number | null => {
      const net = netPayFor(half);
      return net != null ? net - expensesTotal(half) - monthlyExpensesTotal(half) : null;
    },
    [netPayFor, expensesTotal, monthlyExpensesTotal],
  );

  const firstHalfNetAfter = netAfterExpenses(1);
  const secondHalfNetAfter = netAfterExpenses(2);
  const firstHalfBudget = firstHalfNetAfter != null ? firstHalfNetAfter / FIRST_HALF_DAYS : null;
  const secondHalfBudget = secondHalfNetAfter != null ? secondHalfNetAfter / secondHalfDays : null;

  const dayCells = useMemo(() => {
    const result: DayCell[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const half: PeriodHalf = day <= FIRST_HALF_DAYS ? 1 : 2;
      const iso = dateIso(year, month, day);
      const defaultAmount = half === 1 ? firstHalfBudget : secondHalfBudget;
      const overrideAmount = dayOverrides.get(iso);
      result.push({
        day,
        iso,
        half,
        isPast: day < todayDate,
        isToday: day === todayDate,
        dailyBudget: overrideAmount ?? defaultAmount,
      });
    }
    return result;
  }, [year, month, daysInMonth, todayDate, firstHalfBudget, secondHalfBudget, dayOverrides]);

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
      if (source.half !== target.half) {
        setError("You can only move budget between days within the same pay period.");
        return;
      }
      if (source.dailyBudget == null || target.dailyBudget == null) return;
      setTransferError(null);
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
        });
        setExpenseForm(emptyExpenseForm());
        await loadExpenses();
      } catch (err) {
        setExpenseError(err instanceof Error ? err.message : "Failed to add expense");
      } finally {
        setSavingExpense(false);
      }
    },
    [expenseModalHalf, expenseForm, loadExpenses],
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
    expenseModalHalf != null ? expensesByHalf[payslipHalfFor(expenseModalHalf)] : [];
  const modalMonthlyExpenses =
    expenseModalHalf != null ? monthlyExpensesByHalf[expenseModalHalf] : [];
  const modalNetPay = expenseModalHalf != null ? netPayFor(expenseModalHalf) : null;
  const modalExpensesTotal = expenseModalHalf != null ? expensesTotal(expenseModalHalf) : 0;
  const modalMonthlyExpensesTotal =
    expenseModalHalf != null ? monthlyExpensesTotal(expenseModalHalf) : 0;
  const modalNetAfter = expenseModalHalf != null ? netAfterExpenses(expenseModalHalf) : null;

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
              Last net pay
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Most recent recorded payslip total for each pay period, minus any fixed and monthly
              expenses. Click a card to view its expenses.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {([1, 2] as const).map((half) => {
                const payslip =
                  payslipHalfFor(half) === 1 ? lastFirstHalfPayslip : lastSecondHalfPayslip;
                const netAfter = half === 1 ? firstHalfNetAfter : secondHalfNetAfter;
                const total = expensesTotal(half);
                const monthlyTotal = monthlyExpensesTotal(half);
                return (
                  <button
                    key={half}
                    type="button"
                    onClick={() => openExpenseModal(half)}
                    className="group rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 text-left transition hover:border-emerald-400 hover:shadow-md dark:border-emerald-800 dark:bg-emerald-950/30 dark:hover:border-emerald-600"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                      {half === 1 ? `1st–${FIRST_HALF_DAYS}th` : "16th–end of month"}
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
                  1st–{FIRST_HALF_DAYS}th ({FIRST_HALF_DAYS} days)
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
                  {firstHalfBudget != null ? fmtMoney(firstHalfBudget) : "–"}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">per day</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/90 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  16th–{daysInMonth} ({secondHalfDays} days)
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
                  {secondHalfBudget != null ? fmtMoney(secondHalfBudget) : "–"}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">per day</p>
              </div>
            </div>
          </section>

          <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              {formatMonthYear(year, month)}
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Past days are greyed out; today is highlighted. Drag a day onto another (same pay
              period) to move budget between them.
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
                const { day, isPast, isToday, dailyBudget } = cell;
                const draggable = dailyBudget != null;
                const isDragSource = dragSourceDay === day;
                const isDragOverTarget = dragOverDay === day && dragSourceDay !== day;
                return (
                  <div
                    key={day}
                    draggable={draggable}
                    onDragStart={draggable ? (e) => handleDayDragStart(e, day) : undefined}
                    onDragOver={draggable ? (e) => handleDayDragOver(e, day) : undefined}
                    onDragLeave={draggable ? () => handleDayDragLeave(day) : undefined}
                    onDrop={draggable ? (e) => handleDayDrop(e, day) : undefined}
                    onDragEnd={handleDayDragEnd}
                    className={`flex min-h-[5rem] min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-2 text-center transition sm:min-h-[7rem] ${
                      draggable ? "cursor-grab active:cursor-grabbing" : ""
                    } ${
                      isDragOverTarget
                        ? "border-indigo-500 bg-indigo-100 ring-2 ring-indigo-500/60 dark:border-indigo-400 dark:bg-indigo-950/70"
                        : isToday
                          ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/40 dark:border-indigo-400 dark:bg-indigo-950/50"
                          : isPast
                            ? "border-dashed border-zinc-200 bg-zinc-50/60 opacity-60 dark:border-zinc-800 dark:bg-zinc-900/30"
                            : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
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
              {expenseModalHalf === 1 ? `1st–${FIRST_HALF_DAYS}th` : "16th–end of month"}
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
                  Amount to move (max {fmtMoney(transfer.fromAmount)})
                </span>
                <div className="flex gap-2">
                  <input
                    required
                    type="text"
                    inputMode="decimal"
                    autoFocus
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
    </div>
  );
}
