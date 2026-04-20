"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  formatMainCurrencyTotal,
  formatPreviewAmountDisplay,
  useCurrencySettings,
} from "@/lib/currencySettings";
import { getTransactionRowId } from "@/lib/transactionRowId";
import {
  incomeFlowTextClass,
  incomeHeadlineTextClass,
} from "@/lib/incomeExpenseTheme";
import {
  isRedundantTransferCategoryLabel,
  transactionRowKind,
  transferMoneyTextClass,
} from "@/lib/transactionRowTone";
import {
  parseTransferAccountsFromRow,
  transferLegFromRow,
} from "@/lib/transferRowAccounts";

export function periodToIsoDate(periodVal: unknown): string | null {
  if (periodVal == null) return null;
  const s = String(periodVal).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export function amountColumnName(columns: string[]): string {
  if (columns.includes("Amount")) return "Amount";
  const x = columns.find((c) => c.toLowerCase() === "amount");
  return x ?? "Amount";
}

function isoInCalendarMonth(iso: string, year: number, month: number): boolean {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return y === year && m === month;
}

/**
 * Split row amount into income vs expense columns using Flow (and Income/Expense fallback).
 */
export function rowIncomeExpenseAmounts(
  row: Record<string, unknown>,
  amountCol: string,
): { income: number | null; expense: number | null } {
  const raw = row[amountCol];
  const amt0 = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(amt0)) return { income: null, expense: null };
  const amt = Math.abs(amt0);
  const flow = String(row["Flow"] ?? "").trim();
  if (flow === "Income") return { income: amt, expense: null };
  if (flow === "Expense") return { income: null, expense: amt };
  if (flow === "Transfer-In") return { income: amt, expense: null };
  if (flow === "Transfer-Out") return { income: null, expense: amt };
  const k = transactionRowKind(row);
  if (k === "income") return { income: amt, expense: null };
  if (k === "expense") return { income: null, expense: amt };
  return { income: null, expense: null };
}

type DayGroup = {
  iso: string;
  rows: Record<string, unknown>[];
  dayIncome: number;
  dayExpense: number;
};

/** Fixed width so day totals and row amounts line up (no column headers). */
const amountColClass =
  "w-[7rem] min-w-[7rem] shrink-0 text-right sm:w-[7.5rem] sm:min-w-[7.5rem]";

/** Category | Notes (with accounts below) | amounts — separate columns from sm up. */
const txRowGridClass =
  "grid w-full max-w-full grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1.5fr)_7rem_7rem] sm:items-start";

export type CalendarMonthTransactionsGroupedProps = {
  rows: Record<string, unknown>[];
  columns: string[];
  periodColumn: string | null;
  /**
   * When set, only include ISO dates in this calendar month (stray rows excluded).
   * When `null`, group every row with a parseable date (e.g. API already scoped the set).
   */
  monthScope: { year: number; month: number } | null;
  onRowClick: (row: Record<string, unknown>) => void;
  /**
   * `day` — day number + weekday (same calendar month context).
   * `withMonth` — short month + day + weekday (e.g. account drill across months).
   */
  dateLabelStyle?: "day" | "withMonth";
  /**
   * When true (stats pie drills), collapse all day headers whenever the set of dates in view changes.
   */
  resetDayExpansionWhenGroupIsosChange?: boolean;
  /** Expand this calendar day once when it appears in `groups` (e.g. account drill → latest tx). */
  initialExpandedDayIso?: string | null;
};

export function CalendarMonthTransactionsGrouped({
  rows,
  columns,
  periodColumn,
  monthScope,
  onRowClick,
  dateLabelStyle = "day",
  resetDayExpansionWhenGroupIsosChange = false,
  initialExpandedDayIso = null,
}: CalendarMonthTransactionsGroupedProps) {
  const currencySettings = useCurrencySettings();
  const amountCol = useMemo(() => amountColumnName(columns), [columns]);
  /** `true` = expanded (transactions visible); `undefined` / `false` = collapsed (date row only) */
  const [dayExpanded, setDayExpanded] = useState<Record<string, boolean>>({});

  const isDayOpen = (iso: string) => dayExpanded[iso] === true;

  const toggleDay = (iso: string) => {
    setDayExpanded((prev) => {
      const wasOpen = prev[iso] === true;
      return { ...prev, [iso]: !wasOpen };
    });
  };

  const groups = useMemo((): DayGroup[] => {
    if (!periodColumn || rows.length === 0) return [];
    const map = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const iso = periodToIsoDate(row[periodColumn]);
      if (!iso) continue;
      if (
        monthScope != null &&
        !isoInCalendarMonth(iso, monthScope.year, monthScope.month)
      ) {
        continue;
      }
      if (!map.has(iso)) map.set(iso, []);
      map.get(iso)!.push(row);
    }
    const dates = [...map.keys()].sort((a, b) => b.localeCompare(a));
    return dates.map((iso) => {
      const dayRows = map.get(iso)!;
      let dayIncome = 0;
      let dayExpense = 0;
      for (const row of dayRows) {
        const { income, expense } = rowIncomeExpenseAmounts(row, amountCol);
        if (income != null) dayIncome += income;
        if (expense != null) dayExpense += expense;
      }
      return { iso, rows: dayRows, dayIncome, dayExpense };
    });
  }, [rows, periodColumn, amountCol, monthScope]);

  const groupIsoSig = useMemo(
    () => groups.map((g) => g.iso).sort().join("\0"),
    [groups],
  );

  useEffect(() => {
    if (!resetDayExpansionWhenGroupIsosChange) return;
    setDayExpanded({});
  }, [groupIsoSig, resetDayExpansionWhenGroupIsosChange]);

  const monthScopeKey = useMemo(
    () =>
      monthScope == null
        ? "all"
        : `${monthScope.year}-${monthScope.month}`,
    [monthScope?.year, monthScope?.month],
  );

  const appliedInitialDayRef = useRef<string | null>(null);

  /** Reset day toggles when the calendar month / period column changes (before paint). */
  useLayoutEffect(() => {
    appliedInitialDayRef.current = null;
    setDayExpanded({});
  }, [monthScopeKey, periodColumn]);

  /**
   * Open the requested day row (transactions visible) once `groups` contains it.
   * useLayoutEffect so the day is expanded in the same frame as year/month drill opens,
   * not after a paint (which looked like only the year/month opened).
   */
  useLayoutEffect(() => {
    if (!initialExpandedDayIso) return;
    if (!groups.some((g) => g.iso === initialExpandedDayIso)) return;
    if (appliedInitialDayRef.current === initialExpandedDayIso) return;
    appliedInitialDayRef.current = initialExpandedDayIso;
    setDayExpanded({ [initialExpandedDayIso]: true });
  }, [groups, initialExpandedDayIso, monthScopeKey, periodColumn]);

  const groupFailureReason = useMemo((): "unparseable" | "outside-month" | null => {
    if (!periodColumn || rows.length === 0) return null;
    let parsedAny = false;
    let inScopeAny = false;
    for (const row of rows) {
      const iso = periodToIsoDate(row[periodColumn]);
      if (!iso) continue;
      parsedAny = true;
      if (
        monthScope == null ||
        isoInCalendarMonth(iso, monthScope.year, monthScope.month)
      ) {
        inScopeAny = true;
      }
    }
    if (inScopeAny) return null;
    if (parsedAny && monthScope != null) return "outside-month";
    if (!parsedAny) return "unparseable";
    return null;
  }, [rows, periodColumn, monthScope]);

  if (!periodColumn) {
    return (
      <p className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
        No period column — cannot group by date.
      </p>
    );
  }

  if (groups.length === 0 && rows.length > 0) {
    return (
      <p className="px-2 py-2 text-sm text-zinc-600 dark:text-zinc-400">
        {groupFailureReason === "outside-month"
          ? "No transactions are dated in this month (Period values fall outside the selected month)."
          : "Could not group transactions by calendar day from the Period column."}
      </p>
    );
  }

  if (groups.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="space-y-3">
      {groups.map((g) => {
        const d = new Date(`${g.iso}T12:00:00`);
        const dow = d.getDay();
        const dayNum = d.getDate();
        const weekday = d.toLocaleDateString(undefined, { weekday: "long" });
        const monthAndDay = d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
        /** Tint the card for weekends; date text stays neutral. */
        const dowCardClass =
          dow === 0
            ? "border-red-200/90 bg-red-50/70 dark:border-red-900/55 dark:bg-red-950/35"
            : dow === 6
              ? "border-blue-200/90 bg-blue-50/70 dark:border-blue-900/55 dark:bg-blue-950/35"
              : "border-zinc-200 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-900/50";
        const dowHeaderHoverClass =
          dow === 0
            ? "hover:bg-red-100/80 dark:hover:bg-red-950/50"
            : dow === 6
              ? "hover:bg-blue-100/80 dark:hover:bg-blue-950/50"
              : "hover:bg-zinc-100/90 dark:hover:bg-zinc-800/60";

        const open = isDayOpen(g.iso);

        return (
          <div
            key={g.iso}
            className={`overflow-hidden rounded-xl border shadow-sm ${dowCardClass}`}
          >
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`day-tx-${g.iso}`}
              id={`day-hdr-${g.iso}`}
              onClick={() => toggleDay(g.iso)}
              className={`flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-2 px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${dowHeaderHoverClass}`}
            >
              <div className="flex min-w-0 flex-1 items-baseline gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {dateLabelStyle === "withMonth" ? (
                  <>
                    <span className="tabular-nums">{monthAndDay}</span>
                    <span>{weekday}</span>
                  </>
                ) : (
                  <>
                    <span className="tabular-nums">{dayNum}</span>
                    <span>{weekday}</span>
                  </>
                )}
              </div>
              <div className="flex shrink-0 items-baseline gap-3 sm:gap-4">
                <div className={`text-sm ${amountColClass}`}>
                  <span
                    className={`font-semibold tabular-nums ${incomeHeadlineTextClass}`}
                  >
                    {formatMainCurrencyTotal(g.dayIncome, currencySettings)}
                  </span>
                </div>
                <div className={`text-sm ${amountColClass}`}>
                  <span className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                    {formatMainCurrencyTotal(g.dayExpense, currencySettings)}
                  </span>
                </div>
              </div>
            </button>
            {open ? (
            <div
              id={`day-tx-${g.iso}`}
              role="region"
              aria-labelledby={`day-hdr-${g.iso}`}
              className="space-y-1 border-t border-zinc-200/90 bg-white/60 px-1 pb-2 pt-1 dark:border-zinc-700/90 dark:bg-zinc-950/30"
            >
              {g.rows.map((row, i) => {
                const id = getTransactionRowId(row);
                const canEdit = id != null;
                const { income, expense } = rowIncomeExpenseAmounts(row, amountCol);
                const isTransfer = transferLegFromRow(row) != null;
                const catRaw = String(row["Category"] ?? "").trim();
                const categoryDisplay =
                  isTransfer &&
                  (!catRaw ||
                    catRaw === "—" ||
                    isRedundantTransferCategoryLabel(catRaw))
                    ? "Other"
                    : catRaw || "—";
                const sub = String(row["Subcategory"] ?? "").trim();
                const note = String(row["Note"] ?? "").trim();
                const acct = String(row["Accounts"] ?? "").trim();
                const { fromAccount, toAccount } = parseTransferAccountsFromRow(row);
                const fromAcc = fromAccount.trim();
                const toAcc = toAccount.trim();
                const hasTransferAccountFlow =
                  isTransfer && fromAcc.length > 0 && toAcc.length > 0;

                return (
                  <div
                    key={row.id != null ? String(row.id) : i}
                    role={canEdit ? "button" : undefined}
                    tabIndex={canEdit ? 0 : undefined}
                    onClick={canEdit ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      canEdit
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onRowClick(row);
                            }
                          }
                        : undefined
                    }
                    className={`${txRowGridClass} rounded-lg px-2 py-2 text-sm ${
                      canEdit
                        ? "cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                        : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">
                        {categoryDisplay}
                      </div>
                      {sub ? (
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          {sub}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex min-w-0 flex-col gap-1 leading-snug">
                      {note ? (
                        <div className="break-words text-sm text-zinc-800 dark:text-zinc-200">
                          {note}
                        </div>
                      ) : null}
                      {hasTransferAccountFlow ? (
                        <div
                          className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs ${transferMoneyTextClass}`}
                          title="Transfer"
                        >
                          <span className="break-words">{fromAcc}</span>
                          <span className="shrink-0 font-semibold" aria-hidden>
                            →
                          </span>
                          <span className="break-words">{toAcc}</span>
                        </div>
                      ) : acct ? (
                        <div className="break-words text-xs text-zinc-500 dark:text-zinc-400">
                          {acct}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex justify-end gap-3 sm:contents sm:gap-0">
                      <div className={`tabular-nums ${amountColClass}`}>
                        {income != null ? (
                          <span className={`font-medium ${incomeFlowTextClass}`}>
                            {formatPreviewAmountDisplay(
                              income,
                              row,
                              currencySettings,
                            )}
                          </span>
                        ) : null}
                      </div>
                      <div className={`tabular-nums ${amountColClass}`}>
                        {expense != null ? (
                          <span className="font-medium text-rose-600 dark:text-rose-400">
                            {formatPreviewAmountDisplay(
                              expense,
                              row,
                              currencySettings,
                            )}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            ) : null}
          </div>
        );
      })}
      </div>
    </div>
  );
}
