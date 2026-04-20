"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCalendarBounds,
  getCalendarDay,
  getCalendarMonth,
  getCalendarMonthTransactions,
  getCalendarYear,
  getCalendarYearTransactions,
  getWorkbook,
  type CalendarDayResponse,
  type CalendarDaySummary,
  type CalendarMonthTotals,
} from "@/lib/api";
import { FloatingAddButton } from "@/components/FloatingAddButton";
import {
  TRANSACTIONS_CHANGED_EVENT,
  useTransactionModal,
} from "@/components/TransactionModalProvider";
import { getTransactionRowId } from "@/lib/transactionRowId";
import {
  isColumnExcludedFromDataPreview,
  useDashboardColumnVisible,
} from "@/lib/columnVisibility";
import { CalendarMonthTransactionsGrouped } from "@/components/CalendarMonthTransactionsGrouped";
import { filterDataPreviewRows } from "@/lib/transferRowAccounts";
import { renderTransferFlowAwareCell } from "@/lib/transferPreviewCells";
import { isReservedCategoryLabel } from "@/lib/reservedCategory";
import { fieldLabelText, inputClass } from "@/lib/ui";
import {
  transactionCellToneClass,
  transferMoneyTextClass,
} from "@/lib/transactionRowTone";
import { useDebouncedSearch } from "@/lib/useDebouncedSearch";
import {
  buildCurrencyConversionPayload,
  formatMainCurrencyTotal,
  loadCurrencySettings,
  useCurrencySettings,
} from "@/lib/currencySettings";
import { incomeHeadlineTextClass } from "@/lib/incomeExpenseTheme";
import { useValueVisibilityFilters } from "@/lib/valueInstanceVisibility";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Local calendar day of week; 0 = Sunday, 6 = Saturday. */
function dayOfWeekFromIso(iso: string): number {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d).getDay();
}

/** Compare/sort months using `year * 12 + month - 1` (from YYYY-MM-DD ISO). */
function ymIndexFromIso(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const mo = Number(iso.slice(5, 7));
  return y * 12 + mo - 1;
}

function yearMonthFromYmIndex(idx: number): { y: number; m: number } {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return { y, m };
}

type TxBoundsMeta = {
  minY: number;
  minM: number;
  maxY: number;
  maxM: number;
};

function clampMonthForYear(y: number, m: number, b: TxBoundsMeta): number {
  let low = 1;
  let high = 12;
  if (y === b.minY) low = b.minM;
  if (y === b.maxY) high = b.maxM;
  return Math.min(Math.max(m, low), high);
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function money(n: number) {
  return formatMainCurrencyTotal(n, loadCurrencySettings());
}

/** Matches `calendar_service._calendar_columns` HTTPException; empty state, no error banner. */
const NO_CALENDAR_DATETIME_DETAIL = "No date/time column found for calendar";

function calendarErrorMessage(
  err: unknown,
  fallback: string,
): string | null {
  const msg = err instanceof Error ? err.message : fallback;
  if (msg === NO_CALENDAR_DATETIME_DETAIL) return null;
  return msg;
}

type MonthGridCell = {
  iso: string;
  day: number;
  inCurrentMonth: boolean;
  spillMdLabel: string | null;
};

function buildMonthGridCells(y: number, month: number): MonthGridCell[] {
  const first = new Date(y, month - 1, 1);
  const lastDay = new Date(y, month, 0).getDate();
  const pad = first.getDay();
  const prevMonthEnd = new Date(y, month - 1, 0);
  const prevLast = prevMonthEnd.getDate();
  const pYear = prevMonthEnd.getFullYear();
  const pMonth = prevMonthEnd.getMonth() + 1;
  const cells: MonthGridCell[] = [];
  for (let i = 0; i < pad; i++) {
    const day = prevLast - pad + i + 1;
    const iso = `${pYear}-${pad2(pMonth)}-${pad2(day)}`;
    const spillMdLabel = i === 0 ? `${pMonth}/${day}` : null;
    cells.push({ iso, day, inCurrentMonth: false, spillMdLabel });
  }
  for (let d = 1; d <= lastDay; d++) {
    const iso = `${y}-${pad2(month)}-${pad2(d)}`;
    cells.push({ iso, day: d, inCurrentMonth: true, spillMdLabel: null });
  }
  const nextY = month === 12 ? y + 1 : y;
  const nextM = month === 12 ? 1 : month + 1;
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let j = 0; j < trailing; j++) {
    const day = j + 1;
    const iso = `${nextY}-${pad2(nextM)}-${pad2(day)}`;
    const spillMdLabel = j === 0 ? `${nextM}/1` : null;
    cells.push({ iso, day, inCurrentMonth: false, spillMdLabel });
  }
  return cells;
}

function MonthMiniCalendar({
  year: y,
  month,
  days,
  selected,
  onSelectDay,
  /** When the mini grid sits inside a larger clickable card (year view), stop day clicks from activating the card. */
  stopDayClickPropagation = false,
}: {
  year: number;
  month: number;
  days: CalendarDaySummary[];
  selected: string;
  onSelectDay: (iso: string) => void;
  stopDayClickPropagation?: boolean;
}) {
  const byDate = useMemo(() => {
    const m = new Map<string, CalendarDaySummary>();
    days.forEach((d) => m.set(d.date, d));
    return m;
  }, [days]);
  const miniGridCells = useMemo(
    () => buildMonthGridCells(y, month),
    [y, month],
  );
  return (
    <>
      <div className="grid grid-cols-7 gap-px text-center text-[9px] font-medium uppercase leading-tight text-zinc-500 dark:text-zinc-500">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={
              i === 0
                ? "text-red-600 dark:text-red-400"
                : i === 6
                  ? "text-blue-600 dark:text-blue-400"
                  : ""
            }
          >
            {w.slice(0, 1)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {miniGridCells.map((cell) => {
          const info = byDate.get(cell.iso);
          const isSel = selected === cell.iso;
          const spill = !cell.inCurrentMonth;
          const dow = dayOfWeekFromIso(cell.iso);
          const dayNumClass = spill
            ? "text-zinc-500 dark:text-zinc-500"
            : dow === 0
              ? "text-red-600 dark:text-red-400"
              : dow === 6
                ? "text-blue-600 dark:text-blue-400"
                : "text-zinc-900 dark:text-zinc-100";
          return (
            <button
              key={cell.iso}
              type="button"
              onClick={(e) => {
                if (stopDayClickPropagation) e.stopPropagation();
                onSelectDay(cell.iso);
              }}
              className={[
                "flex min-h-[2.5rem] flex-col items-stretch rounded border p-0.5 text-left text-[10px] transition",
                isSel
                  ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:border-indigo-500 dark:bg-indigo-950/40"
                  : spill
                    ? "border-zinc-200/70 bg-zinc-50/90 opacity-[0.72] dark:border-zinc-800/70 dark:bg-zinc-950/60"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
                !isSel && !spill && "hover:bg-zinc-50 dark:hover:bg-zinc-900/50",
                !isSel &&
                  spill &&
                  "hover:bg-zinc-100/90 hover:opacity-90 dark:hover:bg-zinc-900/55",
              ].filter(Boolean).join(" ")}
            >
              {cell.spillMdLabel != null && (
                <span className="mb-0.5 text-[8px] font-semibold tabular-nums leading-none text-zinc-500">
                  {cell.spillMdLabel}
                </span>
              )}
              <span className={`font-medium tabular-nums leading-none ${dayNumClass}`}>
                {cell.day}
              </span>
              {info && (info.income > 0 || info.expense > 0) && (
                <span className="mt-0.5 flex flex-col gap-px text-[9px] font-medium tabular-nums leading-tight">
                  {info.income > 0 && (
                    <span className={incomeHeadlineTextClass}>{money(info.income)}</span>
                  )}
                  {info.expense > 0 && (
                    <span className="text-rose-600 dark:text-rose-400">
                      {money(info.expense)}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

function CalendarPeriodTotals({
  title,
  totals,
}: {
  title: string;
  totals: CalendarMonthTotals;
}) {
  return (
    <div className="mb-4 rounded-lg border border-zinc-100 bg-zinc-50/90 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
        {title}
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950/80">
          <p className="text-xs font-medium uppercase text-zinc-700 dark:text-zinc-300">Income</p>
          <p
            className={`mt-1 text-lg font-semibold tabular-nums ${incomeHeadlineTextClass}`}
          >
            {money(totals.total_income)}
          </p>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950/80">
          <p className="text-xs font-medium uppercase text-zinc-700 dark:text-zinc-300">Expenses</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-rose-600 dark:text-rose-400">
            {money(totals.total_expense)}
          </p>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950/80">
          <p className="text-xs font-medium uppercase text-zinc-700 dark:text-zinc-300">Transfers</p>
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-sm tabular-nums">
              <span className="inline-flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                <span
                  className={`text-base font-medium ${transferMoneyTextClass}`}
                  aria-hidden
                >
                  ←
                </span>
                In
              </span>
              <span className={`font-semibold ${transferMoneyTextClass}`}>
                {money(totals.total_transfer_in)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm tabular-nums">
              <span className="inline-flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                <span
                  className={`text-base font-medium ${transferMoneyTextClass}`}
                  aria-hidden
                >
                  →
                </span>
                Out
              </span>
              <span className={`font-semibold ${transferMoneyTextClass}`}>
                {money(totals.total_transfer_out)}
              </span>
            </div>
          </div>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950/80">
          <p className="text-xs font-medium uppercase text-zinc-700 dark:text-zinc-300">
            Net (income − expenses)
          </p>
          <p
            className={`mt-1 text-lg font-semibold tabular-nums ${
              totals.net_income_minus_expense >= 0
                ? "text-zinc-900 dark:text-zinc-100"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {money(totals.net_income_minus_expense)}
          </p>
        </div>
      </div>
    </div>
  );
}


export default function CalendarClient() {
  const { openTxCreate, openTxEdit, txModalOpen } = useTransactionModal();
  const isColVisible = useDashboardColumnVisible();
  const valueVisibilityFilters = useValueVisibilityFilters();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState("");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [monthData, setMonthData] = useState<CalendarDaySummary[]>([]);
  const [monthTotals, setMonthTotals] = useState<CalendarMonthTotals | null>(
    null,
  );
  const [yearTotals, setYearTotals] = useState<CalendarMonthTotals | null>(
    null,
  );
  const [meta, setMeta] = useState<{
    period_column: string;
    amount_column: string;
    income_expense_column: string | null;
  } | null>(null);
  const [selected, setSelected] = useState<string>(() => toIsoDate(now));
  /** Min/max calendar days from Period (same rules as calendar API); drives month dropdown range. */
  const [txDateBounds, setTxDateBounds] = useState<{
    first_date: string | null;
    last_date: string | null;
  } | null>(null);
  const [dayModalOpen, setDayModalOpen] = useState(false);
  const [dayDetail, setDayDetail] = useState<CalendarDayResponse | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  /** First sheet from workbook (API paths). */
  const [workbookSheet, setWorkbookSheet] = useState("");

  /** Full-month table (all columns incl. Note); server-side sort */
  const [monthTxColumns, setMonthTxColumns] = useState<string[]>([]);
  const [monthTxRows, setMonthTxRows] = useState<Record<string, unknown>[]>([]);
  const [monthTxLoading, setMonthTxLoading] = useState(false);
  const [txPeriodColumn, setTxPeriodColumn] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<"month" | "year">("month");
  const [yearMonthBlocks, setYearMonthBlocks] = useState<
    {
      month: number;
      days: CalendarDaySummary[];
      monthTotals: CalendarMonthTotals;
    }[]
  | null>(null);
  const [yearGridLoading, setYearGridLoading] = useState(false);
  const {
    input: monthTxSearchInput,
    setInput: setMonthTxSearchInput,
    debounced: monthTxSearchDebounced,
  } = useDebouncedSearch([year, month, calendarView]);

  const currencySettings = useCurrencySettings();
  const currencyConversion = useMemo(
    () => buildCurrencyConversionPayload(currencySettings),
    [currencySettings],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const w = await getWorkbook();
        if (cancelled) return;
        setPath(w.path);
        setWorkbookSheet(w.sheets[0]?.name ?? "");
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error
              ? e.message
              : "Could not reach the API. Start the FastAPI server on port 8000.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMonth = useCallback(async () => {
    setError(null);
    try {
      const res = await getCalendarMonth(
        year,
        month,
        undefined,
        valueVisibilityFilters,
        currencyConversion ?? undefined,
      );
      setMonthData(res.days);
      setMonthTotals(res.month_totals);
      setMeta({
        period_column: res.period_column,
        amount_column: res.amount_column,
        income_expense_column: res.income_expense_column,
      });
    } catch (e) {
      setError(calendarErrorMessage(e, "Failed to load calendar"));
      setMonthData([]);
      setMonthTotals(null);
      setMeta(null);
    }
  }, [year, month, valueVisibilityFilters, currencyConversion]);

  useEffect(() => {
    if (calendarView === "year") return;
    void loadMonth();
  }, [loadMonth, calendarView]);

  const fetchYearMonthBlocks = useCallback(async () => {
    setYearGridLoading(true);
    try {
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          getCalendarMonth(
            year,
            i + 1,
            undefined,
            valueVisibilityFilters,
            currencyConversion ?? undefined,
          ),
        ),
      );
      setYearMonthBlocks(
        results.map((res, i) => ({
          month: i + 1,
          days: res.days,
          monthTotals: res.month_totals,
        })),
      );
      setMeta({
        period_column: results[0].period_column,
        amount_column: results[0].amount_column,
        income_expense_column: results[0].income_expense_column,
      });
    } catch (e) {
      setError(calendarErrorMessage(e, "Failed to load calendar"));
      setYearMonthBlocks(null);
    } finally {
      setYearGridLoading(false);
    }
  }, [year, valueVisibilityFilters, currencyConversion]);

  useEffect(() => {
    if (calendarView !== "year") return;
    void fetchYearMonthBlocks();
  }, [calendarView, fetchYearMonthBlocks]);

  const loadBounds = useCallback(async () => {
    try {
      const r = await getCalendarBounds(
        undefined,
        valueVisibilityFilters,
        currencyConversion ?? undefined,
      );
      setTxDateBounds({
        first_date: r.first_date,
        last_date: r.last_date,
      });
    } catch {
      setTxDateBounds(null);
    }
  }, [valueVisibilityFilters, currencyConversion]);

  useEffect(() => {
    void loadBounds();
  }, [loadBounds]);

  const loadYear = useCallback(async () => {
    try {
      const res = await getCalendarYear(
        year,
        undefined,
        valueVisibilityFilters,
        currencyConversion ?? undefined,
      );
      setYearTotals(res.year_totals);
    } catch {
      setYearTotals(null);
    }
  }, [year, valueVisibilityFilters, currencyConversion]);

  useEffect(() => {
    void loadYear();
  }, [loadYear]);

  const loadPeriodTransactions = useCallback(async () => {
    setMonthTxLoading(true);
    try {
      const q = monthTxSearchDebounced.trim();
      if (calendarView === "month") {
        const res = await getCalendarMonthTransactions(year, month, {
          extraFilters: valueVisibilityFilters,
          searchAll: q.length > 0 ? q : undefined,
          currencyConversion: currencyConversion ?? undefined,
        });
        setMonthTxColumns(res.columns);
        setMonthTxRows(res.rows);
        setTxPeriodColumn(res.period_column);
      } else {
        const res = await getCalendarYearTransactions(year, {
          extraFilters: valueVisibilityFilters,
          searchAll: q.length > 0 ? q : undefined,
          currencyConversion: currencyConversion ?? undefined,
        });
        setMonthTxColumns(res.columns);
        setMonthTxRows(res.rows);
        setTxPeriodColumn(res.period_column);
      }
    } catch {
      setMonthTxColumns([]);
      setMonthTxRows([]);
    } finally {
      setMonthTxLoading(false);
    }
  }, [
    calendarView,
    year,
    month,
    valueVisibilityFilters,
    monthTxSearchDebounced,
    currencyConversion,
  ]);

  useEffect(() => {
    void loadPeriodTransactions();
  }, [loadPeriodTransactions]);

  const visibleDayColumns = useMemo(
    () =>
      (dayDetail?.columns ?? []).filter(
        (c) => isColVisible(c) && !isColumnExcludedFromDataPreview(c),
      ),
    [dayDetail?.columns, isColVisible],
  );

  const displayMonthTxRows = useMemo(
    () => filterDataPreviewRows(monthTxRows),
    [monthTxRows],
  );

  const displayDayRows = useMemo(
    () => filterDataPreviewRows(dayDetail?.rows ?? []),
    [dayDetail?.rows],
  );

  useEffect(() => {
    const t = new Date();
    if (t.getFullYear() === year && t.getMonth() + 1 === month) {
      setSelected(toIsoDate(t));
    } else {
      setSelected(`${year}-${pad2(month)}-01`);
    }
  }, [year, month]);

  const loadDay = useCallback(async () => {
    if (!selected || !dayModalOpen) return;
    setDayLoading(true);
    setDayDetail(null);
    setDayError(null);
    try {
      const d = await getCalendarDay(
        selected,
        undefined,
        valueVisibilityFilters,
        currencyConversion ?? undefined,
      );
      setDayDetail(d);
    } catch (e) {
      setDayError(calendarErrorMessage(e, "Failed to load day"));
      setDayDetail(null);
    } finally {
      setDayLoading(false);
    }
  }, [selected, dayModalOpen, valueVisibilityFilters, currencyConversion]);

  useEffect(() => {
    const onTxChanged = () => {
      void loadMonth();
      void loadYear();
      void loadPeriodTransactions();
      void loadBounds();
      if (calendarView === "year") void fetchYearMonthBlocks();
      if (dayModalOpen && selected) void loadDay();
    };
    window.addEventListener(TRANSACTIONS_CHANGED_EVENT, onTxChanged);
    return () =>
      window.removeEventListener(TRANSACTIONS_CHANGED_EVENT, onTxChanged);
  }, [
    loadMonth,
    loadYear,
    loadPeriodTransactions,
    loadBounds,
    fetchYearMonthBlocks,
    calendarView,
    loadDay,
    dayModalOpen,
    selected,
  ]);

  useEffect(() => {
    if (!dayModalOpen) {
      setDayDetail(null);
      setDayError(null);
      return;
    }
    if (!selected) return;
    void loadDay();
  }, [dayModalOpen, selected, loadDay]);

  useEffect(() => {
    if (!dayModalOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setDayModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dayModalOpen]);

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarDaySummary>();
    monthData.forEach((d) => m.set(d.date, d));
    return m;
  }, [monthData]);

  const gridCells = useMemo(
    () => buildMonthGridCells(year, month),
    [year, month],
  );

  const monthLabel = new Date(year, month - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  const transactionsPeriodLabel =
    calendarView === "year" ? String(year) : monthLabel;

  const txBoundsMeta = useMemo((): TxBoundsMeta | null => {
    if (!txDateBounds?.first_date || !txDateBounds?.last_date) return null;
    return {
      minY: Number(txDateBounds.first_date.slice(0, 4)),
      minM: Number(txDateBounds.first_date.slice(5, 7)),
      maxY: Number(txDateBounds.last_date.slice(0, 4)),
      maxM: Number(txDateBounds.last_date.slice(5, 7)),
    };
  }, [txDateBounds]);

  const yearDropdownOptions = useMemo(() => {
    if (txBoundsMeta) {
      const ys: number[] = [];
      for (let y = txBoundsMeta.minY; y <= txBoundsMeta.maxY; y += 1) {
        ys.push(y);
      }
      return ys;
    }
    return [year];
  }, [txBoundsMeta, year]);

  const monthDropdownOptions = useMemo(() => {
    if (txBoundsMeta) {
      let low = 1;
      let high = 12;
      if (year === txBoundsMeta.minY) low = txBoundsMeta.minM;
      if (year === txBoundsMeta.maxY) high = txBoundsMeta.maxM;
      const ms: number[] = [];
      for (let m = low; m <= high; m += 1) ms.push(m);
      return ms;
    }
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, [txBoundsMeta, year]);

  useEffect(() => {
    if (!txDateBounds?.first_date || !txDateBounds?.last_date) return;
    const cur = year * 12 + month - 1;
    const lo = ymIndexFromIso(txDateBounds.first_date);
    const hi = ymIndexFromIso(txDateBounds.last_date);
    if (cur >= lo && cur <= hi) return;
    const target = cur < lo ? lo : hi;
    const { y, m } = yearMonthFromYmIndex(target);
    setYear(y);
    setMonth(m);
  }, [txDateBounds, year, month]);

  const onMonthSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const m = Number(e.target.value);
    if (m < 1 || m > 12) return;
    setMonth(m);
  };

  const onYearSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const y = Number(e.target.value);
    setYear(y);
    if (txBoundsMeta) {
      setMonth((prev) => clampMonthForYear(y, prev, txBoundsMeta));
    }
  };

  const prevMonth = () => {
    const cur = year * 12 + month - 1;
    if (txDateBounds?.first_date) {
      const lo = ymIndexFromIso(txDateBounds.first_date);
      if (cur <= lo) return;
    }
    if (month <= 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  };

  const nextMonth = () => {
    const cur = year * 12 + month - 1;
    if (txDateBounds?.last_date) {
      const hi = ymIndexFromIso(txDateBounds.last_date);
      if (cur >= hi) return;
    }
    if (month >= 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  };

  const goToToday = () => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth() + 1);
    setSelected(toIsoDate(t));
  };

  const prevYear = () => {
    if (txDateBounds?.first_date) {
      const minY = Number(txDateBounds.first_date.slice(0, 4));
      if (year <= minY) return;
    }
    setYear((y) => y - 1);
  };

  const nextYear = () => {
    if (txDateBounds?.last_date) {
      const maxY = Number(txDateBounds.last_date.slice(0, 4));
      if (year >= maxY) return;
    }
    setYear((y) => y + 1);
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-zinc-800 dark:text-zinc-200">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-full flex-col gap-8 px-4 pb-28 py-8 sm:px-6">
      <header className="flex flex-col gap-2 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Calendar
        </h1>
      </header>

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </div>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div
          className="mb-4 flex flex-wrap items-center gap-3"
          role="tablist"
          aria-label="Calendar by month or year"
        >
          <button
            type="button"
            role="tab"
            aria-selected={calendarView === "month"}
            className={`min-h-[2.75rem] rounded-full border-2 px-5 py-2.5 text-sm font-semibold shadow-sm transition sm:min-h-[3rem] sm:px-6 sm:text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
              calendarView === "month"
                ? "border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-600"
                : "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100 dark:hover:bg-rose-950/70"
            }`}
            onClick={() => setCalendarView("month")}
          >
            This month
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={calendarView === "year"}
            className={`min-h-[2.75rem] rounded-full border-2 px-5 py-2.5 text-sm font-semibold shadow-sm transition sm:min-h-[3rem] sm:px-6 sm:text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
              calendarView === "year"
                ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-600"
                : "border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100 dark:hover:bg-blue-950/70"
            }`}
            onClick={() => setCalendarView("year")}
          >
            This year
          </button>
        </div>

        {calendarView === "month" ? (
          <div className="mb-4 flex w-full min-w-0 flex-wrap items-center justify-center gap-2">
            <div className="flex min-w-0 max-w-full items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={prevMonth}
                disabled={
                  txDateBounds?.first_date != null &&
                  year * 12 + month - 1 <=
                    ymIndexFromIso(txDateBounds.first_date)
                }
                className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900 sm:px-3"
              >
                ← Prev
              </button>
              <div
                className="inline-flex min-w-0 max-w-full items-stretch gap-px rounded-lg border border-zinc-200/90 bg-zinc-50 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70"
                title="Month and year"
              >
                <select
                  aria-label="Month"
                  value={month}
                  onChange={onMonthSelect}
                  className="min-w-0 w-[min(100%,11.5rem)] cursor-pointer appearance-none rounded-l-[calc(0.5rem-1px)] border-0 bg-transparent px-3 py-1.5 text-center text-sm font-semibold text-zinc-900 hover:bg-zinc-100/80 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500/35 dark:text-zinc-50 dark:hover:bg-zinc-800/80 dark:focus:ring-indigo-400/30 sm:w-[12.5rem] sm:text-base"
                >
                  {monthDropdownOptions.map((m) => (
                    <option key={m} value={m}>
                      {new Date(2000, m - 1, 1).toLocaleString(undefined, {
                        month: "long",
                      })}
                    </option>
                  ))}
                </select>
                <div
                  className="w-px shrink-0 self-stretch bg-zinc-200 dark:bg-zinc-600"
                  aria-hidden
                />
                <select
                  aria-label="Year"
                  value={year}
                  onChange={onYearSelect}
                  className="w-[4.5rem] shrink-0 cursor-pointer appearance-none rounded-r-[calc(0.5rem-1px)] border-0 bg-transparent px-2 py-1.5 text-center text-sm font-semibold tabular-nums tracking-tight text-zinc-900 hover:bg-zinc-100/80 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500/35 dark:text-zinc-50 dark:hover:bg-zinc-800/80 dark:focus:ring-indigo-400/30 sm:w-[5.25rem] sm:text-base"
                >
                  {yearDropdownOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={nextMonth}
                disabled={
                  txDateBounds?.last_date != null &&
                  year * 12 + month - 1 >=
                    ymIndexFromIso(txDateBounds.last_date)
                }
                className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900 sm:px-3"
              >
                Next →
              </button>
            </div>
            <button
              type="button"
              onClick={goToToday}
              className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 dark:bg-indigo-600 dark:hover:bg-indigo-500"
            >
              Today
            </button>
          </div>
        ) : (
          <div className="mb-4 flex w-full min-w-0 flex-wrap items-center justify-center gap-2">
            <div className="flex min-w-0 max-w-full items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={prevYear}
                disabled={
                  txDateBounds?.first_date != null &&
                  year <= Number(txDateBounds.first_date.slice(0, 4))
                }
                className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900 sm:px-3"
              >
                ← Prev
              </button>
              <div
                className="inline-flex min-w-0 max-w-full items-stretch rounded-lg border border-zinc-200/90 bg-zinc-50 px-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70"
                title="Year"
              >
                <select
                  aria-label="Year"
                  value={year}
                  onChange={onYearSelect}
                  className="min-w-0 cursor-pointer appearance-none border-0 bg-transparent px-4 py-1.5 text-center text-sm font-semibold tabular-nums tracking-tight text-zinc-900 hover:bg-zinc-100/80 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500/35 dark:text-zinc-50 dark:hover:bg-zinc-800/80 dark:focus:ring-indigo-400/30 sm:text-base"
                >
                  {yearDropdownOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={nextYear}
                disabled={
                  txDateBounds?.last_date != null &&
                  year >= Number(txDateBounds.last_date.slice(0, 4))
                }
                className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900 sm:px-3"
              >
                Next →
              </button>
            </div>
            <button
              type="button"
              onClick={goToToday}
              className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 dark:bg-indigo-600 dark:hover:bg-indigo-500"
            >
              Today
            </button>
          </div>
        )}

        {yearTotals && (
          <CalendarPeriodTotals
            title={`Year totals (${year})`}
            totals={yearTotals}
          />
        )}

        {calendarView === "month" && monthTotals && (
          <CalendarPeriodTotals
            title={`Month totals (${monthLabel})`}
            totals={monthTotals}
          />
        )}

        {calendarView === "month" ? (
          <>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase text-zinc-700 dark:text-zinc-300">
              {WEEKDAYS.map((w, i) => (
                <div
                  key={w}
                  className={
                    i === 0
                      ? "py-2 text-red-600 dark:text-red-400"
                      : i === 6
                        ? "py-2 text-blue-600 dark:text-blue-400"
                        : "py-2"
                  }
                >
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {gridCells.map((cell) => {
                const info = byDate.get(cell.iso);
                const isSel = selected === cell.iso;
                const spill = !cell.inCurrentMonth;
                const dow = dayOfWeekFromIso(cell.iso);
                const dayNumClass = spill
                  ? "font-medium text-zinc-600 dark:text-zinc-400"
                  : dow === 0
                    ? "font-medium text-red-600 dark:text-red-400"
                    : dow === 6
                      ? "font-medium text-blue-600 dark:text-blue-400"
                      : "font-medium text-zinc-900 dark:text-zinc-100";
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => {
                      setSelected(cell.iso);
                      setDayModalOpen(true);
                    }}
                    className={[
                      "flex min-h-[6.25rem] flex-col items-stretch rounded-lg border p-1.5 text-left text-sm transition",
                      isSel
                        ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:border-indigo-500 dark:bg-indigo-950/40"
                        : spill
                          ? "border-zinc-200/70 bg-zinc-50/90 opacity-[0.72] dark:border-zinc-800/70 dark:bg-zinc-950/60 dark:opacity-[0.78]"
                          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
                      !isSel && !spill && "hover:bg-zinc-50 dark:hover:bg-zinc-900/50",
                      !isSel &&
                        spill &&
                        "hover:bg-zinc-100/90 hover:opacity-90 dark:hover:bg-zinc-900/55 dark:hover:opacity-90",
                    ].filter(Boolean).join(" ")}
                  >
                    {cell.spillMdLabel != null && (
                      <span className="mb-0.5 text-[10px] font-semibold tabular-nums leading-none text-zinc-500 dark:text-zinc-500">
                        {cell.spillMdLabel}
                      </span>
                    )}
                    <span className={dayNumClass}>{cell.day}</span>
                    {info && (info.income > 0 || info.expense > 0) && (
                      <span className="mt-1 flex flex-col gap-0.5 text-sm font-medium tabular-nums leading-snug">
                        {info.income > 0 && (
                          <span className={incomeHeadlineTextClass}>
                            {money(info.income)}
                          </span>
                        )}
                        {info.expense > 0 && (
                          <span className="text-rose-600 dark:text-rose-400">
                            {money(info.expense)}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="min-w-0">
            {yearGridLoading && (
              <p className="py-6 text-sm text-zinc-600 dark:text-zinc-400">
                Loading months…
              </p>
            )}
            {!yearGridLoading && yearMonthBlocks && (
              <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {yearMonthBlocks.map((block) => {
                  const labelShort = new Date(
                    2000,
                    block.month - 1,
                    1,
                  ).toLocaleString(undefined, { month: "short" });
                  const mt = block.monthTotals;
                  const openMonthLabel = `Open ${labelShort} ${year} in month view`;
                  const goToThisMonth = () => {
                    setMonth(
                      txBoundsMeta
                        ? clampMonthForYear(year, block.month, txBoundsMeta)
                        : block.month,
                    );
                    setCalendarView("month");
                  };
                  return (
                    <div
                      key={block.month}
                      title={openMonthLabel}
                      onClick={goToThisMonth}
                      className="flex min-w-0 cursor-pointer flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-2.5 transition hover:border-zinc-300 hover:bg-zinc-100/60 dark:border-zinc-600 dark:bg-zinc-950/50 dark:hover:border-zinc-500 dark:hover:bg-zinc-900/55"
                    >
                      <div className="flex min-w-0 items-baseline justify-between gap-2 border-b border-zinc-100 pb-1.5 dark:border-zinc-800">
                        <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          {labelShort}
                        </span>
                        <div className="min-w-0 flex flex-col items-end gap-0.5 text-[10px] font-medium tabular-nums leading-tight">
                          <span className={incomeHeadlineTextClass}>
                            {money(mt.total_income)}
                          </span>
                          <span className="text-rose-600 dark:text-rose-400">
                            {money(mt.total_expense)}
                          </span>
                        </div>
                      </div>
                      <MonthMiniCalendar
                        year={year}
                        month={block.month}
                        days={block.days}
                        selected={selected}
                        stopDayClickPropagation
                        onSelectDay={(iso) => {
                          setSelected(iso);
                          setDayModalOpen(true);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="w-full min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
            All transactions — {transactionsPeriodLabel}
          </h2>
        </div>
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <label
            htmlFor="calendar-month-tx-search-all"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Search all columns
          </label>
          <div className="mt-2">
            <input
              id="calendar-month-tx-search-all"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              className={`min-w-[min(100%,18rem)] w-full ${inputClass}`}
              placeholder="Type to search every column…"
              value={monthTxSearchInput}
              onChange={(e) => setMonthTxSearchInput(e.target.value)}
            />
          </div>
        </div>
        {monthTxLoading && (
          <p className="px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200">
            {calendarView === "year"
              ? "Loading year transactions…"
              : "Loading month transactions…"}
          </p>
        )}
        {!monthTxLoading && displayMonthTxRows.length === 0 && (
          <p className="px-4 py-6 text-sm text-zinc-800 dark:text-zinc-200">
            {monthTxSearchDebounced.trim() !== ""
              ? "No transactions match your search."
              : calendarView === "year"
                ? "No transactions dated in this year."
                : "No transactions dated in this month."}
          </p>
        )}
        {!monthTxLoading && displayMonthTxRows.length > 0 && (
          <div className="max-h-[min(60vh,560px)] w-full min-w-0 overflow-y-auto overflow-x-hidden px-3 pb-3">
            <CalendarMonthTransactionsGrouped
              rows={displayMonthTxRows}
              columns={monthTxColumns}
              periodColumn={txPeriodColumn}
              monthScope={
                calendarView === "year"
                  ? null
                  : { year, month }
              }
              dateLabelStyle={calendarView === "year" ? "withMonth" : "day"}
              onRowClick={openTxEdit}
            />
          </div>
        )}
      </section>

      {dayModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-day-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDayModalOpen(false);
          }}
        >
          <div
            className="flex max-h-[min(90vh,880px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="min-w-0 flex-1">
                <h2
                  id="calendar-day-modal-title"
                  className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
                >
                  {selected
                    ? parseIsoDate(selected).toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "Day"}
                </h2>
                {dayDetail && !dayLoading && (
                  <div
                    className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-zinc-700 dark:text-zinc-300"
                    aria-label="Day totals"
                  >
                    <span>
                      Income{" "}
                      <span
                        className={`font-semibold tabular-nums ${incomeHeadlineTextClass}`}
                      >
                        {money(dayDetail.total_income)}
                      </span>
                    </span>
                    <span>
                      Expenses{" "}
                      <span className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                        {money(dayDetail.total_expense)}
                      </span>
                    </span>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-xl font-semibold leading-none text-white shadow-md ring-1 ring-black/10 transition hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 dark:bg-red-600 dark:ring-white/10 dark:hover:bg-red-500 dark:focus:ring-offset-zinc-950"
                  aria-label="Add transaction for this day"
                  title="Add transaction for this day"
                  onClick={() =>
                    openTxCreate({ date: selected })
                  }
                >
                  +
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  onClick={() => setDayModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {dayLoading && (
                <p className="text-sm text-zinc-800 dark:text-zinc-200">
                  Loading transactions…
                </p>
              )}
              {dayError && (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {dayError}
                </p>
              )}
              {dayDetail && !dayLoading && (
                <>
                  {displayDayRows.length === 0 ? (
                    <p className="text-sm text-zinc-800 dark:text-zinc-200">
                      No transactions this day.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                          <tr>
                            {visibleDayColumns.map((c) => (
                              <th
                                key={c}
                                className="whitespace-nowrap px-2 py-2 font-medium"
                              >
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {displayDayRows.map((row, i) => {
                            const rawId = row.id;
                            const rowIdNum =
                              typeof rawId === "number"
                                ? rawId
                                : typeof rawId === "string"
                                  ? parseInt(rawId, 10)
                                  : NaN;
                            const canEdit = Number.isFinite(rowIdNum);
                            return (
                            <tr
                              key={row.id != null ? String(row.id) : i}
                              className={`border-t border-zinc-100 dark:border-zinc-800 ${
                                canEdit
                                  ? "cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900/60"
                                  : ""
                              }`}
                              onClick={
                                canEdit
                                  ? () => {
                                      setDayModalOpen(false);
                                      openTxEdit(row);
                                    }
                                  : undefined
                              }
                              title={canEdit ? "Edit transaction" : undefined}
                            >
                              {visibleDayColumns.map((c) => (
                                <td
                                  key={c}
                                  className={`max-w-[12rem] min-w-0 break-words px-2 py-1.5 align-top [overflow-wrap:anywhere] ${transactionCellToneClass(row, c)}`}
                                >
                                  {renderTransferFlowAwareCell(row, c)}
                                </td>
                              ))}
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <FloatingAddButton
        hidden={txModalOpen}
        onClick={() => openTxCreate({ date: selected })}
        ariaLabel="Add transaction"
      />
    </div>
  );
}
