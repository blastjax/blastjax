"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCalendarBounds,
  getCalendarCategoryBreakdown,
  type CalendarCategoryBreakdownResponse,
} from "@/lib/api";
import { CategoryPieSection } from "@/components/CategoryPieSection";
import { FloatingAddButton } from "@/components/FloatingAddButton";
import {
  TRANSACTIONS_CHANGED_EVENT,
  useTransactionModal,
} from "@/components/TransactionModalProvider";
import {
  buildCurrencyConversionPayload,
  useCurrencySettings,
} from "@/lib/currencySettings";
import { useValueVisibilityFilters } from "@/lib/valueInstanceVisibility";

function pad2(n: number) {
  return String(n).padStart(2, "0");
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

export default function StatsClient() {
  const { openTxCreate, txModalOpen } = useTransactionModal();
  const valueVisibilityFilters = useValueVisibilityFilters();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [monthBreakdown, setMonthBreakdown] =
    useState<CalendarCategoryBreakdownResponse | null>(null);
  const [yearBreakdown, setYearBreakdown] =
    useState<CalendarCategoryBreakdownResponse | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [categoryPiePeriodTab, setCategoryPiePeriodTab] = useState<
    "month" | "year"
  >("month");
  const [txDateBounds, setTxDateBounds] = useState<{
    first_date: string | null;
    last_date: string | null;
  } | null>(null);
  /** Incremented on transaction changes so breakdown refetches match the calendar. */
  const [breakdownRefresh, setBreakdownRefresh] = useState(0);

  const currencySettings = useCurrencySettings();
  const currencyConversion = useMemo(
    () => buildCurrencyConversionPayload(currencySettings),
    [currencySettings],
  );

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

  useEffect(() => {
    let cancelled = false;
    setBreakdownLoading(true);
    (async () => {
      try {
        const [m, y] = await Promise.all([
          getCalendarCategoryBreakdown(year, {
            month,
            extraFilters: valueVisibilityFilters,
            currencyConversion: currencyConversion ?? undefined,
          }),
          getCalendarCategoryBreakdown(year, {
            extraFilters: valueVisibilityFilters,
            currencyConversion: currencyConversion ?? undefined,
          }),
        ]);
        if (!cancelled) {
          setMonthBreakdown(m);
          setYearBreakdown(y);
        }
      } catch {
        if (!cancelled) {
          setMonthBreakdown(null);
          setYearBreakdown(null);
        }
      } finally {
        if (!cancelled) setBreakdownLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    year,
    month,
    valueVisibilityFilters,
    currencyConversion,
    breakdownRefresh,
  ]);

  useEffect(() => {
    const onTxChanged = () => {
      void loadBounds();
      setBreakdownRefresh((x) => x + 1);
    };
    window.addEventListener(TRANSACTIONS_CHANGED_EVENT, onTxChanged);
    return () =>
      window.removeEventListener(TRANSACTIONS_CHANGED_EVENT, onTxChanged);
  }, [loadBounds]);

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

  const monthLabel = new Date(year, month - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-full flex-col gap-8 px-4 pb-28 py-8 sm:px-6">
      <header className="flex flex-col gap-2 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Stats
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Category expense and income pie charts for the selected period. Same data as the
          calendar view, scoped by month or year.
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div
          className="mb-4 flex flex-wrap items-center gap-3"
          role="tablist"
          aria-label="Monthly or yearly category breakdown"
        >
          <button
            type="button"
            role="tab"
            aria-selected={categoryPiePeriodTab === "month"}
            className={`min-h-[2.75rem] rounded-full border-2 px-5 py-2.5 text-sm font-semibold shadow-sm transition sm:min-h-[3rem] sm:px-6 sm:text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
              categoryPiePeriodTab === "month"
                ? "border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-600"
                : "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100 dark:hover:bg-rose-950/70"
            }`}
            onClick={() => setCategoryPiePeriodTab("month")}
          >
            This month
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={categoryPiePeriodTab === "year"}
            className={`min-h-[2.75rem] rounded-full border-2 px-5 py-2.5 text-sm font-semibold shadow-sm transition sm:min-h-[3rem] sm:px-6 sm:text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
              categoryPiePeriodTab === "year"
                ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-600"
                : "border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100 dark:hover:bg-blue-950/70"
            }`}
            onClick={() => setCategoryPiePeriodTab("year")}
          >
            This year
          </button>
        </div>

        {categoryPiePeriodTab === "month" ? (
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

        <div className="mb-6 flex flex-col gap-4">
          <div>
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
              Categories
            </h2>
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              Expense and income totals by category — expenses in rose, income in blue
              (aligned with Expense / Income on Categories).
            </p>
          </div>
          {categoryPiePeriodTab === "month" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <CategoryPieSection
                title="Expenses by category (this month)"
                variant="expense"
                breakdown={monthBreakdown}
                loading={breakdownLoading}
                pieScope="month"
                calendarYear={year}
                calendarMonth={month}
                periodLabel={monthLabel}
                extraFilters={valueVisibilityFilters}
                currencyConversion={currencyConversion ?? undefined}
              />
              <CategoryPieSection
                title="Income by category (this month)"
                variant="income"
                breakdown={monthBreakdown}
                loading={breakdownLoading}
                pieScope="month"
                calendarYear={year}
                calendarMonth={month}
                periodLabel={monthLabel}
                extraFilters={valueVisibilityFilters}
                currencyConversion={currencyConversion ?? undefined}
              />
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <CategoryPieSection
                title="Expenses by category (this year)"
                variant="expense"
                breakdown={yearBreakdown}
                loading={breakdownLoading}
                pieScope="year"
                calendarYear={year}
                periodLabel={String(year)}
                extraFilters={valueVisibilityFilters}
                currencyConversion={currencyConversion ?? undefined}
              />
              <CategoryPieSection
                title="Income by category (this year)"
                variant="income"
                breakdown={yearBreakdown}
                loading={breakdownLoading}
                pieScope="year"
                calendarYear={year}
                periodLabel={String(year)}
                extraFilters={valueVisibilityFilters}
                currencyConversion={currencyConversion ?? undefined}
              />
            </div>
          )}
        </div>
      </section>

      <FloatingAddButton
        hidden={txModalOpen}
        onClick={() => openTxCreate({ date: toIsoDate(new Date()) })}
        ariaLabel="Add transaction"
      />
    </div>
  );
}
