"use client";

import { useMemo, useState } from "react";
import {
  CalendarMonthTransactionsGrouped,
  amountColumnName,
  rowCalendarIsoKey,
  rowIncomeExpenseAmounts,
} from "@/components/CalendarMonthTransactionsGrouped";
import {
  DATA_PREVIEW_TIME_COLUMN,
  tableColumnsWithLeadingTime,
} from "@/lib/dataPreviewTimeColumn";
import { formatPeriodTimeOnly } from "@/lib/formatPeriod";
import {
  formatMainCurrencyTotal,
  useCurrencySettings,
} from "@/lib/currencySettings";
import { incomeHeadlineTextClass } from "@/lib/incomeExpenseTheme";
import {
  isColumnExcludedFromDataPreview,
  useDashboardColumnVisible,
} from "@/lib/columnVisibility";
import { getTransactionRowId } from "@/lib/transactionRowId";
import { sortTransactionRowsLatestPeriodFirst } from "@/lib/sortTransactionRows";
import { filterDataPreviewRows } from "@/lib/transferRowAccounts";
import { renderTransferFlowAwareCell } from "@/lib/transferPreviewCells";
import { transactionCellToneClass } from "@/lib/transactionRowTone";
import {
  btnSmallSecondary,
  interactiveHoverSurface,
  readonlyHoverSurface,
} from "@/lib/ui";

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
}: {
  rows: Record<string, unknown>[];
  columns: string[];
  periodColumn: string;
  onRowClick: (row: Record<string, unknown>) => void;
}) {
  const currencySettings = useCurrencySettings();
  const isColVisible = useDashboardColumnVisible();
  const visibleColumns = useMemo(
    () =>
      columns.filter(
        (c) => isColVisible(c) && !isColumnExcludedFromDataPreview(c),
      ),
    [columns, isColVisible],
  );
  const amountCol = useMemo(() => amountColumnName(columns), [columns]);

  const undatedTableColumns = useMemo(
    () => tableColumnsWithLeadingTime(visibleColumns, periodColumn),
    [visibleColumns, periodColumn],
  );

  const { monthBuckets, undatedRows } = useMemo(() => {
    const byMonth = new Map<string, Record<string, unknown>[]>();
    const undated: Record<string, unknown>[] = [];
    for (const row of rows) {
      const iso = rowCalendarIsoKey(row, periodColumn);
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
      sortTransactionRowsLatestPeriodFirst(mr, periodColumn);
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

  const displayUndatedRows = useMemo(() => {
    const filtered = filterDataPreviewRows(undatedRows);
    if (filtered.length === 0) return filtered;
    const periodKey =
      undatedTableColumns.timeValueColumn ?? periodColumn ?? null;
    const next = [...filtered];
    sortTransactionRowsLatestPeriodFirst(next, periodKey);
    return next;
  }, [
    undatedRows,
    undatedTableColumns.timeValueColumn,
    periodColumn,
  ]);

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
  const [expandAllDaysNonce, setExpandAllDaysNonce] = useState(0);
  const isMonthOpen = (ym: string) => monthExpanded[ym] === true;
  const toggleMonth = (ym: string) => {
    setMonthExpanded((prev) => {
      const wasOpen = prev[ym] === true;
      return { ...prev, [ym]: !wasOpen };
    });
  };

  const expandAllNestedDates = () => {
    setYearExpanded(Object.fromEntries(yearGroups.map((yg) => [yg.year, true])));
    setMonthExpanded(
      Object.fromEntries(monthBuckets.map((b) => [b.ym, true])),
    );
    setExpandAllDaysNonce((n) => n + 1);
  };

  const collapseAllNestedDates = () => {
    setYearExpanded({});
    setMonthExpanded({});
  };

  const nestedTreeFullyExpanded =
    yearGroups.length > 0 &&
    yearGroups.every((yg) => yearExpanded[yg.year] === true) &&
    monthBuckets.length > 0 &&
    monthBuckets.every((b) => monthExpanded[b.ym] === true);

  const toggleNestedDates = () => {
    if (nestedTreeFullyExpanded) collapseAllNestedDates();
    else expandAllNestedDates();
  };

  return (
    <div className="space-y-3">
      {yearGroups.length > 0 ? (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className={btnSmallSecondary}
            aria-expanded={nestedTreeFullyExpanded}
            aria-label={
              nestedTreeFullyExpanded
                ? "Collapse all year, month, and date sections"
                : "Expand all year, month, and date sections"
            }
            onClick={toggleNestedDates}
          >
            {nestedTreeFullyExpanded
              ? "Collapse all dates"
              : "Expand all dates"}
          </button>
        </div>
      ) : null}
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
                            expandAllNonce={expandAllDaysNonce}
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
        <div className="rounded-xl border border-amber-200/90 bg-amber-50/70 px-3 py-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/25">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200/90">
            No parseable calendar date
          </p>
          <p className="mt-1 text-zinc-700 dark:text-zinc-300">
            {undatedRows.length} row{undatedRows.length === 1 ? "" : "s"} could
            not be grouped (check the Period column).
          </p>
          {displayUndatedRows.length > 0 ? (
            <div className="mt-3 overflow-x-auto rounded-lg border border-amber-200/80 bg-white/80 dark:border-amber-900/40 dark:bg-zinc-950/40">
              <table className="w-full min-w-[32rem] table-fixed border-collapse text-left text-sm">
                <thead className="bg-amber-50/90 text-xs uppercase text-amber-900/90 dark:bg-zinc-900/90 dark:text-amber-100/80">
                  <tr>
                    {undatedTableColumns.displayColumns.map((c) => (
                      <th
                        key={c}
                        className="min-w-0 px-2 py-2 align-top font-medium"
                      >
                        {c === DATA_PREVIEW_TIME_COLUMN ? "Time" : c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayUndatedRows.map((row, i) => {
                    const txRowId = getTransactionRowId(row);
                    const rowOpensEdit = txRowId != null;
                    return (
                      <tr
                        key={row.id != null ? String(row.id) : i}
                        title={rowOpensEdit ? "Click to edit" : undefined}
                        onClick={
                          rowOpensEdit
                            ? () => onRowClick(row)
                            : undefined
                        }
                        className={[
                          "border-t border-amber-100 odd:bg-white even:bg-amber-50/50 dark:border-zinc-800 dark:odd:bg-zinc-950 dark:even:bg-zinc-900/50",
                          rowOpensEdit
                            ? `cursor-pointer ${interactiveHoverSurface}`
                            : readonlyHoverSurface,
                        ].join(" ")}
                      >
                        {undatedTableColumns.displayColumns.map((c) => (
                          <td
                            key={c}
                            className={[
                              "min-w-0 break-words px-2 py-2 align-top text-xs [overflow-wrap:anywhere]",
                              c === DATA_PREVIEW_TIME_COLUMN
                                ? "tabular-nums text-zinc-600 dark:text-zinc-400"
                                : transactionCellToneClass(row, c),
                            ].join(" ")}
                          >
                            {c === DATA_PREVIEW_TIME_COLUMN
                              ? formatPeriodTimeOnly(
                                  undatedTableColumns.timeValueColumn
                                    ? row[undatedTableColumns.timeValueColumn]
                                    : null,
                                )
                              : renderTransferFlowAwareCell(row, c, {
                                  periodColumnName:
                                    undatedTableColumns.timeValueColumn,
                                })}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
              No rows to show here (transfer-in legs are hidden in this list).
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
