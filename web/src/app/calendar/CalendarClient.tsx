"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { useTransactionModal } from "@/components/TransactionModalProvider";
import { subscribeTransactionsChangedDebounced } from "@/lib/transactionsChanged";
import { CalendarMonthTransactionsGrouped } from "@/components/CalendarMonthTransactionsGrouped";
import { filterDataPreviewRows } from "@/lib/transferRowAccounts";
import { isReservedCategoryLabel } from "@/lib/reservedCategory";
import {
  calendarDayHover,
  calendarDayHoverSpill,
  calendarYearMonthCardHover,
  inputClass,
  interactiveHoverSurface,
  modalBackdrop,
  modalPanel,
} from "@/lib/ui";
import { transferMoneyTextClass } from "@/lib/transactionRowTone";
import { useDebouncedSearch } from "@/lib/useDebouncedSearch";
import {
  buildCurrencyConversionPayload,
  formatMainCurrencyTotal,
  loadCurrencySettings,
  useCurrencySettings,
} from "@/lib/currencySettings";
import { incomeHeadlineTextClass } from "@/lib/incomeExpenseTheme";
import { useCategoryCatalogDataPreviewFilters } from "@/lib/useCategoryCatalogDataPreviewFilters";
import { useValueVisibilityFilters } from "@/lib/valueInstanceVisibility";
import { comparePeriodLatestFirst } from "@/lib/formatPeriod";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_SHORT_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function calendarMonthTotalsHasTransactions(t: CalendarMonthTotals): boolean {
  const e = 1e-9;
  return (
    Math.abs(t.total_income) > e ||
    Math.abs(t.total_expense) > e ||
    Math.abs(t.total_transfer_in) > e ||
    Math.abs(t.total_transfer_out) > e
  );
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Local calendar day of week; 0 = Sunday, 6 = Saturday. */
function dayOfWeekFromIso(iso: string): number {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d).getDay();
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
                "flex min-h-[2.5rem] min-w-0 flex-col items-stretch rounded border p-0.5 text-left text-[10px] transition",
                isSel
                  ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:border-indigo-500 dark:bg-indigo-950/40"
                  : spill
                    ? "border-zinc-200/70 bg-zinc-50/90 opacity-[0.72] dark:border-zinc-800/70 dark:bg-zinc-950/60"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
                !isSel && !spill && calendarDayHover,
                !isSel && spill && calendarDayHoverSpill,
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
                <span className="mt-0.5 flex min-w-0 flex-col items-stretch gap-px text-[7px] font-medium tabular-nums leading-none sm:text-[9px]">
                  {info.income > 0 && (
                    <span
                      className={`min-w-0 truncate text-left ${incomeHeadlineTextClass}`}
                      title={money(info.income)}
                    >
                      {money(info.income)}
                    </span>
                  )}
                  {info.expense > 0 && (
                    <span
                      className="min-w-0 truncate text-left text-rose-600 dark:text-rose-400"
                      title={money(info.expense)}
                    >
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
  const valueVisibilityFilters = useValueVisibilityFilters();
  const categoryCatalogPreviewFilters = useCategoryCatalogDataPreviewFilters();
  const calendarExtraFilters = useMemo(
    () => [...(valueVisibilityFilters ?? []), ...categoryCatalogPreviewFilters],
    [valueVisibilityFilters, categoryCatalogPreviewFilters],
  );
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
  const [monthYearPickerOpen, setMonthYearPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(now.getFullYear());
  /** Per-month (1–12 index → boolean) whether that month in `pickerYear` has any calendar activity. */
  const [pickerYearMonthsWithTx, setPickerYearMonthsWithTx] = useState<
    boolean[] | null
  >(null);
  const [pickerMonthActivityNonce, setPickerMonthActivityNonce] = useState(0);
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
        calendarExtraFilters,
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
  }, [year, month, calendarExtraFilters, currencyConversion]);

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
            calendarExtraFilters,
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
  }, [year, calendarExtraFilters, currencyConversion]);

  useEffect(() => {
    if (calendarView !== "year") return;
    void fetchYearMonthBlocks();
  }, [calendarView, fetchYearMonthBlocks]);

  const loadYear = useCallback(async () => {
    try {
      const res = await getCalendarYear(
        year,
        undefined,
        calendarExtraFilters,
        currencyConversion ?? undefined,
      );
      setYearTotals(res.year_totals);
    } catch {
      setYearTotals(null);
    }
  }, [year, calendarExtraFilters, currencyConversion]);

  useEffect(() => {
    void loadYear();
  }, [loadYear]);

  const loadPeriodTransactions = useCallback(async () => {
    setMonthTxLoading(true);
    try {
      const q = monthTxSearchDebounced.trim();
      if (calendarView === "month") {
        const res = await getCalendarMonthTransactions(year, month, {
          extraFilters: calendarExtraFilters,
          searchAll: q.length > 0 ? q : undefined,
          currencyConversion: currencyConversion ?? undefined,
        });
        setMonthTxColumns(res.columns);
        setMonthTxRows(res.rows);
        setTxPeriodColumn(res.period_column);
      } else {
        const res = await getCalendarYearTransactions(year, {
          extraFilters: calendarExtraFilters,
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
    calendarExtraFilters,
    monthTxSearchDebounced,
    currencyConversion,
  ]);

  useEffect(() => {
    void loadPeriodTransactions();
  }, [loadPeriodTransactions]);

  const displayMonthTxRows = useMemo(
    () => filterDataPreviewRows(monthTxRows),
    [monthTxRows],
  );

  const displayDayRows = useMemo(() => {
    const raw = filterDataPreviewRows(dayDetail?.rows ?? []);
    const pc = dayDetail?.period_column;
    if (!pc || raw.length <= 1) return raw;
    return [...raw].sort((a, b) =>
      comparePeriodLatestFirst(a[pc], b[pc]),
    );
  }, [dayDetail?.rows, dayDetail?.period_column]);

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
        calendarExtraFilters,
        currencyConversion ?? undefined,
      );
      setDayDetail(d);
    } catch (e) {
      setDayError(calendarErrorMessage(e, "Failed to load day"));
      setDayDetail(null);
    } finally {
      setDayLoading(false);
    }
  }, [selected, dayModalOpen, calendarExtraFilters, currencyConversion]);

  const transactionsChangedRefreshRef = useRef<() => void>(() => {});
  transactionsChangedRefreshRef.current = () => {
    void loadMonth();
    void loadYear();
    void loadPeriodTransactions();
    if (calendarView === "year") void fetchYearMonthBlocks();
    if (dayModalOpen && selected) void loadDay();
    if (monthYearPickerOpen) setPickerMonthActivityNonce((n) => n + 1);
  };

  useEffect(() => {
    return subscribeTransactionsChangedDebounced(() => {
      transactionsChangedRefreshRef.current();
    });
  }, []);

  useEffect(() => {
    if (!monthYearPickerOpen) {
      setPickerYearMonthsWithTx(null);
      return;
    }
    let cancelled = false;
    setPickerYearMonthsWithTx(null);
    (async () => {
      try {
        const results = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            getCalendarMonth(
              pickerYear,
              i + 1,
              undefined,
              calendarExtraFilters,
              currencyConversion ?? undefined,
            ),
          ),
        );
        if (cancelled) return;
        setPickerYearMonthsWithTx(
          results.map((r) => calendarMonthTotalsHasTransactions(r.month_totals)),
        );
      } catch {
        if (!cancelled) setPickerYearMonthsWithTx(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    monthYearPickerOpen,
    pickerYear,
    pickerMonthActivityNonce,
    calendarExtraFilters,
    currencyConversion,
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

  const closeMonthYearPicker = useCallback(() => {
    setYear(pickerYear);
    setMonthYearPickerOpen(false);
  }, [pickerYear]);

  const openMonthYearPicker = useCallback(() => {
    setPickerYear(year);
    setMonthYearPickerOpen(true);
  }, [year]);

  const pickMonthFromPicker = useCallback(
    (m: number) => {
      setYear(pickerYear);
      setMonth(m);
      setMonthYearPickerOpen(false);
      if (calendarView === "year") setCalendarView("month");
    },
    [pickerYear, calendarView],
  );

  const goToTodayFromPicker = useCallback(() => {
    const t = new Date();
    const y = t.getFullYear();
    const m = t.getMonth() + 1;
    setYear(y);
    setMonth(m);
    setPickerYear(y);
    setSelected(toIsoDate(t));
    setMonthYearPickerOpen(false);
    if (calendarView === "year") setCalendarView("month");
  }, [calendarView]);

  useEffect(() => {
    if (!monthYearPickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      closeMonthYearPicker();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [monthYearPickerOpen, closeMonthYearPicker]);

  const prevMonth = () => {
    if (month <= 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  };

  const nextMonth = () => {
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
    setYear((y) => y - 1);
  };

  const nextYear = () => {
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
    <div className="mx-auto flex w-full min-w-0 max-w-full flex-col gap-6 px-3 pb-28 py-6 sm:gap-8 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-2 border-b border-zinc-200 pb-4 dark:border-zinc-800 sm:pb-6">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">
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
                aria-label="Previous month"
                className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm tabular-nums hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900 sm:px-3"
              >
                &lt;
              </button>
              <button
                type="button"
                onClick={openMonthYearPicker}
                aria-haspopup="dialog"
                aria-expanded={monthYearPickerOpen}
                aria-label="Choose month and year"
                className="inline-flex min-w-0 max-w-[min(100%,16rem)] shrink items-center justify-center rounded-lg border border-zinc-200/90 bg-zinc-50 px-4 py-1.5 text-center text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-50 dark:hover:bg-zinc-800/80 sm:min-w-[12rem] sm:text-base"
              >
                {monthLabel}
              </button>
              <button
                type="button"
                onClick={nextMonth}
                aria-label="Next month"
                className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm tabular-nums hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900 sm:px-3"
              >
                &gt;
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
                aria-label="Previous year"
                className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm tabular-nums hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900 sm:px-3"
              >
                &lt;
              </button>
              <button
                type="button"
                onClick={openMonthYearPicker}
                aria-haspopup="dialog"
                aria-expanded={monthYearPickerOpen}
                aria-label="Choose year or month"
                className="inline-flex min-w-[5.5rem] shrink items-center justify-center rounded-lg border border-zinc-200/90 bg-zinc-50 px-4 py-1.5 text-center text-sm font-semibold tabular-nums tracking-tight text-zinc-900 shadow-sm transition hover:bg-zinc-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-50 dark:hover:bg-zinc-800/80 sm:text-base"
              >
                {year}
              </button>
              <button
                type="button"
                onClick={nextYear}
                aria-label="Next year"
                className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm tabular-nums hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900 sm:px-3"
              >
                &gt;
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
                      "flex min-h-[6.25rem] min-w-0 flex-col items-stretch rounded-lg border p-1 text-left text-sm transition sm:p-1.5",
                      isSel
                        ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:border-indigo-500 dark:bg-indigo-950/40"
                        : spill
                          ? "border-zinc-200/70 bg-zinc-50/90 opacity-[0.72] dark:border-zinc-800/70 dark:bg-zinc-950/60 dark:opacity-[0.78]"
                          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
                      !isSel && !spill && calendarDayHover,
                      !isSel && spill && calendarDayHoverSpill,
                    ].filter(Boolean).join(" ")}
                  >
                    {cell.spillMdLabel != null && (
                      <span className="mb-0.5 text-[10px] font-semibold tabular-nums leading-none text-zinc-500 dark:text-zinc-500">
                        {cell.spillMdLabel}
                      </span>
                    )}
                    <span className={dayNumClass}>{cell.day}</span>
                    {info && (info.income > 0 || info.expense > 0) && (
                      <span className="mt-1 flex min-w-0 flex-col items-stretch gap-0.5 text-[10px] font-medium tabular-nums leading-tight sm:text-sm sm:leading-snug">
                        {info.income > 0 && (
                          <span
                            className={`min-w-0 truncate ${incomeHeadlineTextClass}`}
                            title={money(info.income)}
                          >
                            {money(info.income)}
                          </span>
                        )}
                        {info.expense > 0 && (
                          <span
                            className="min-w-0 truncate text-rose-600 dark:text-rose-400"
                            title={money(info.expense)}
                          >
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
              <div className="grid w-full min-w-0 grid-cols-3 gap-2 sm:gap-4">
                {yearMonthBlocks.map((block) => {
                  const labelShort = new Date(
                    2000,
                    block.month - 1,
                    1,
                  ).toLocaleString(undefined, { month: "short" });
                  const mt = block.monthTotals;
                  const openMonthLabel = `Open ${labelShort} ${year} in month view`;
                  const goToThisMonth = () => {
                    setMonth(block.month);
                    setCalendarView("month");
                  };
                  return (
                    <div
                      key={block.month}
                      title={openMonthLabel}
                      onClick={goToThisMonth}
                      className={`flex min-w-0 cursor-pointer flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-2.5 dark:border-zinc-600 dark:bg-zinc-950/50 ${calendarYearMonthCardHover}`}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-2 border-b border-zinc-100 pb-1.5 dark:border-zinc-800">
                        <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          {labelShort}
                        </span>
                        <div className="flex min-w-0 max-w-[55%] flex-col items-end gap-px text-[8px] font-medium tabular-nums leading-tight sm:max-w-none sm:text-[10px]">
                          {mt.total_income > 1e-9 && (
                            <span
                              className={`max-w-full truncate ${incomeHeadlineTextClass}`}
                              title={money(mt.total_income)}
                            >
                              {money(mt.total_income)}
                            </span>
                          )}
                          {mt.total_expense > 1e-9 && (
                            <span
                              className="max-w-full truncate text-rose-600 dark:text-rose-400"
                              title={money(mt.total_expense)}
                            >
                              {money(mt.total_expense)}
                            </span>
                          )}
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
          <div className="max-h-[min(60vh,560px)] w-full min-w-0 overflow-y-auto overflow-x-auto px-3 pb-3 sm:overflow-x-hidden">
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
              defaultDayRowsExpanded
              showDateGroupControls
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
                    <div className="min-w-0">
                      <CalendarMonthTransactionsGrouped
                        key={dayDetail.date}
                        rows={displayDayRows}
                        columns={dayDetail.columns}
                        periodColumn={dayDetail.period_column}
                        monthScope={null}
                        dateLabelStyle="day"
                        defaultDayRowsExpanded
                        showDateGroupControls={false}
                        initialExpandedDayIso={selected}
                        onRowClick={(row) => {
                          setDayModalOpen(false);
                          openTxEdit(row);
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {monthYearPickerOpen && (
        <div
          className={modalBackdrop}
          role="presentation"
          onClick={closeMonthYearPicker}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-month-year-picker-title"
            className={`${modalPanel} !max-w-sm sm:p-5`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="calendar-month-year-picker-title"
              className="sr-only"
            >
              Choose month and year
            </h2>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  Date
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer select-none text-sm font-medium text-indigo-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:text-indigo-400 dark:focus-visible:ring-offset-zinc-950"
                  onClick={goToTodayFromPicker}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      goToTodayFromPicker();
                    }
                  }}
                >
                  This Month
                </span>
              </div>
              <div className="flex items-center justify-center gap-3">
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Previous year"
                  className={`cursor-pointer select-none rounded-md px-2.5 py-1.5 text-sm tabular-nums text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-300 ${interactiveHoverSurface}`}
                  onClick={() => setPickerYear((y) => y - 1)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPickerYear((y) => y - 1);
                    }
                  }}
                >
                  &lt;
                </span>
                <span className="min-w-[4.5rem] text-center text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {pickerYear}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Next year"
                  className={`cursor-pointer select-none rounded-md px-2.5 py-1.5 text-sm tabular-nums text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-300 ${interactiveHoverSurface}`}
                  onClick={() => setPickerYear((y) => y + 1)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPickerYear((y) => y + 1);
                    }
                  }}
                >
                  &gt;
                </span>
              </div>
              <div className="grid w-full grid-cols-[repeat(4,minmax(0,1fr))] gap-2">
                {MONTH_SHORT_LABELS.map((label, i) => {
                  const m = i + 1;
                  const isActive = m === month && pickerYear === year;
                  const hasTx = pickerYearMonthsWithTx?.[i] === true;
                  return (
                    <span
                      key={label}
                      role="button"
                      tabIndex={0}
                      aria-label={
                        hasTx ? `${label}, has transactions` : `${label}`
                      }
                      className={[
                        "relative min-w-0 cursor-pointer select-none rounded-lg px-1 py-2.5 text-center text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950",
                        isActive
                          ? "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/55 dark:text-indigo-100"
                          : `text-zinc-800 dark:text-zinc-100 ${interactiveHoverSurface}`,
                      ].join(" ")}
                      onClick={() => pickMonthFromPicker(m)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          pickMonthFromPicker(m);
                        }
                      }}
                    >
                      {label}
                      {hasTx && (
                        <span
                          className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-white dark:bg-emerald-400 dark:ring-zinc-950"
                          aria-hidden
                        />
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <FloatingAddButton
        hidden={txModalOpen || monthYearPickerOpen}
        onClick={() => openTxCreate({ date: selected })}
        ariaLabel="Add transaction"
      />
    </div>
  );
}
