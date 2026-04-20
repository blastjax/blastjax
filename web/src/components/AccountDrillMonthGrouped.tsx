"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarMonthTransactionsGrouped,
  amountColumnName,
  periodToIsoDate,
  rowIncomeExpenseAmounts,
} from "@/components/CalendarMonthTransactionsGrouped";
import {
  formatMainCurrencyTotal,
  useCurrencySettings,
} from "@/lib/currencySettings";
import { incomeHeadlineTextClass } from "@/lib/incomeExpenseTheme";

/** Match day header amount columns in CalendarMonthTransactionsGrouped. */
const amountColClass =
  "w-[7rem] min-w-[7rem] shrink-0 text-right sm:w-[7.5rem] sm:min-w-[7.5rem]";

type MonthBucket = {
  ym: string;
  year: number;
  month: number;
  rows: Record<string, unknown>[];
  monthIncome: number;
  monthExpense: number;
};

type YearGroup = {
  year: number;
  months: MonthBucket[];
  yearIncome: number;
  yearExpense: number;
};

/**
 * Account drill: **year** → **month** → **day** (calendar-style), all collapsible;
 * newest year first, then months inside each year.
 */
export function AccountDrillMonthGrouped({
  rows,
  columns,
  periodColumn,
  onRowClick,
  /** Stable id (e.g. account name) so auto-open latest tx resets when switching accounts. */
  drillKey,
}: {
  rows: Record<string, unknown>[];
  columns: string[];
  periodColumn: string;
  onRowClick: (row: Record<string, unknown>) => void;
  drillKey: string;
}) {
  const currencySettings = useCurrencySettings();
  const amountCol = useMemo(() => amountColumnName(columns), [columns]);

  const { monthBuckets, undatedRows } = useMemo(() => {
    const byMonth = new Map<string, Record<string, unknown>[]>();
    const undated: Record<string, unknown>[] = [];
    for (const row of rows) {
      const iso = periodToIsoDate(row[periodColumn]);
      if (!iso) {
        undated.push(row);
        continue;
      }
      const ym = iso.slice(0, 7);
      if (!byMonth.has(ym)) byMonth.set(ym, []);
      byMonth.get(ym)!.push(row);
    }
    const keys = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));
    const buckets: MonthBucket[] = keys.map((ym) => {
      const [y, m] = ym.split("-").map(Number);
      const mr = byMonth.get(ym)!;
      let monthIncome = 0;
      let monthExpense = 0;
      for (const row of mr) {
        const { income, expense } = rowIncomeExpenseAmounts(row, amountCol);
        if (income != null) monthIncome += income;
        if (expense != null) monthExpense += expense;
      }
      return {
        ym,
        year: y,
        month: m,
        rows: mr,
        monthIncome,
        monthExpense,
      };
    });
    return { monthBuckets: buckets, undatedRows: undated };
  }, [rows, periodColumn, amountCol]);

  const yearGroups = useMemo((): YearGroup[] => {
    const byYear = new Map<number, MonthBucket[]>();
    for (const b of monthBuckets) {
      if (!byYear.has(b.year)) byYear.set(b.year, []);
      byYear.get(b.year)!.push(b);
    }
    const years = [...byYear.keys()].sort((a, b) => b - a);
    return years.map((year) => {
      const months = byYear.get(year)!;
      let yearIncome = 0;
      let yearExpense = 0;
      for (const m of months) {
        yearIncome += m.monthIncome;
        yearExpense += m.monthExpense;
      }
      return { year, months, yearIncome, yearExpense };
    });
  }, [monthBuckets]);

  /** Most recent calendar day in the loaded row set (Period → ISO date). */
  const latestIso = useMemo(() => {
    let max: string | null = null;
    for (const row of rows) {
      const iso = periodToIsoDate(row[periodColumn]);
      if (!iso) continue;
      if (!max || iso.localeCompare(max) > 0) max = iso;
    }
    return max;
  }, [rows, periodColumn]);

  const [yearExpanded, setYearExpanded] = useState<Record<number, boolean>>({});
  const isYearOpen = (y: number) => yearExpanded[y] === true;
  const toggleYear = (y: number) => {
    setYearExpanded((prev) => {
      const wasOpen = prev[y] === true;
      return { ...prev, [y]: !wasOpen };
    });
  };

  const [monthExpanded, setMonthExpanded] = useState<Record<string, boolean>>(
    {},
  );
  const isMonthOpen = (ym: string) => monthExpanded[ym] === true;
  const toggleMonth = (ym: string) => {
    setMonthExpanded((prev) => {
      const wasOpen = prev[ym] === true;
      return { ...prev, [ym]: !wasOpen };
    });
  };

  const autoLatestRef = useRef<string | null>(null);
  useEffect(() => {
    autoLatestRef.current = null;
  }, [drillKey]);

  useEffect(() => {
    if (!latestIso || !drillKey) return;
    const sig = `${drillKey}\0${latestIso}`;
    if (autoLatestRef.current === sig) return;
    autoLatestRef.current = sig;
    const y = Number(latestIso.slice(0, 4));
    const ym = latestIso.slice(0, 7);
    setYearExpanded((prev) => ({ ...prev, [y]: true }));
    setMonthExpanded((prev) => ({ ...prev, [ym]: true }));
  }, [latestIso, drillKey]);

  useEffect(() => {
    if (!latestIso || !drillKey) return;
    const t = window.setTimeout(() => {
      document.getElementById(`day-hdr-${latestIso}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 480);
    return () => window.clearTimeout(t);
  }, [latestIso, drillKey]);

  return (
    <div className="space-y-3">
      {yearGroups.map((yg) => {
        const yearOpen = isYearOpen(yg.year);
        return (
          <div
            key={yg.year}
            className="overflow-hidden rounded-xl border border-slate-300/90 bg-slate-50/70 shadow-sm dark:border-slate-600/80 dark:bg-slate-900/45"
          >
            <button
              type="button"
              aria-expanded={yearOpen}
              aria-controls={`account-drill-year-${yg.year}`}
              id={`account-drill-year-hdr-${yg.year}`}
              onClick={() => toggleYear(yg.year)}
              className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-2 px-3 py-3 text-left transition-colors hover:bg-slate-100/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 dark:hover:bg-slate-800/60"
            >
              <span className="min-w-0 flex-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {yg.year}
              </span>
              <div className="flex shrink-0 items-baseline gap-3 sm:gap-4">
                <div className={`text-sm ${amountColClass}`}>
                  <span
                    className={`font-semibold tabular-nums ${incomeHeadlineTextClass}`}
                  >
                    {formatMainCurrencyTotal(yg.yearIncome, currencySettings)}
                  </span>
                </div>
                <div className={`text-sm ${amountColClass}`}>
                  <span className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                    {formatMainCurrencyTotal(yg.yearExpense, currencySettings)}
                  </span>
                </div>
              </div>
            </button>
            {yearOpen ? (
              <div
                id={`account-drill-year-${yg.year}`}
                role="region"
                aria-labelledby={`account-drill-year-hdr-${yg.year}`}
                className="space-y-2 border-t border-slate-200/90 bg-white/30 px-2 pb-3 pt-2 dark:border-slate-700/90 dark:bg-zinc-950/15"
              >
                {yg.months.map((b) => {
                  const open = isMonthOpen(b.ym);
                  const monthLabel = new Date(
                    b.year,
                    b.month - 1,
                    1,
                  ).toLocaleDateString(undefined, { month: "long" });
                  return (
                    <div
                      key={b.ym}
                      className="overflow-hidden rounded-lg border border-indigo-200/90 bg-indigo-50/50 shadow-sm dark:border-indigo-900/55 dark:bg-indigo-950/30"
                    >
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={`account-drill-month-${b.ym}`}
                        id={`account-drill-month-hdr-${b.ym}`}
                        onClick={() => toggleMonth(b.ym)}
                        className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-indigo-100/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:hover:bg-indigo-950/50"
                      >
                        <span className="min-w-0 flex-1 font-semibold text-zinc-900 dark:text-zinc-100">
                          {monthLabel}
                        </span>
                        <div className="flex shrink-0 items-baseline gap-3 sm:gap-4">
                          <div className={`text-sm ${amountColClass}`}>
                            <span
                              className={`font-semibold tabular-nums ${incomeHeadlineTextClass}`}
                            >
                              {formatMainCurrencyTotal(
                                b.monthIncome,
                                currencySettings,
                              )}
                            </span>
                          </div>
                          <div className={`text-sm ${amountColClass}`}>
                            <span className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                              {formatMainCurrencyTotal(
                                b.monthExpense,
                                currencySettings,
                              )}
                            </span>
                          </div>
                        </div>
                      </button>
                      {open ? (
                        <div
                          id={`account-drill-month-${b.ym}`}
                          role="region"
                          aria-labelledby={`account-drill-month-hdr-${b.ym}`}
                          className="border-t border-indigo-200/80 bg-white/40 px-2 pb-2 pt-2 dark:border-indigo-800/80 dark:bg-zinc-950/20"
                        >
                          <CalendarMonthTransactionsGrouped
                            rows={b.rows}
                            columns={columns}
                            periodColumn={periodColumn}
                            monthScope={{ year: b.year, month: b.month }}
                            dateLabelStyle="day"
                            initialExpandedDayIso={
                              latestIso &&
                              b.ym === latestIso.slice(0, 7)
                                ? latestIso
                                : null
                            }
                            onRowClick={onRowClick}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
      {undatedRows.length > 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-900/40">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            No parseable calendar date
          </p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-300">
            {undatedRows.length} row{undatedRows.length === 1 ? "" : "s"} could
            not be grouped (check the Period column).
          </p>
        </div>
      ) : null}
    </div>
  );
}
