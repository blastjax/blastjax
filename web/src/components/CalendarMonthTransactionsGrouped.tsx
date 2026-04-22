"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  formatMainCurrencyTotal,
  useCurrencySettings,
} from "@/lib/currencySettings";
import { sortTransactionRowsLatestPeriodFirst } from "@/lib/sortTransactionRows";
import { incomeHeadlineTextClass } from "@/lib/incomeExpenseTheme";
import {
  amountColumnName,
  rowIncomeExpenseAmounts,
} from "@/lib/calendarTransactionAmounts";
import { btnSmallSecondary } from "@/lib/ui";
import {
  CALENDAR_DAY_TX_VIRTUALIZE_THRESHOLD,
  CalendarDayTxRow,
  VirtualizedDayTxList,
} from "@/components/calendarDayTxList";

export { amountColumnName, rowIncomeExpenseAmounts };

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

/**
 * Calendar day key for grouping: prefer `calendar_date` from calendar transaction APIs
 * (same bucketing as server `_d` + `tz_offset_minutes`); otherwise parse `Period`.
 */
export function rowCalendarIsoKey(
  row: Record<string, unknown>,
  periodColumn: string,
): string | null {
  const raw = row.calendar_date ?? row["calendar_date"];
  if (raw != null && String(raw).trim() !== "") {
    const s = String(raw).trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  return periodToIsoDate(row[periodColumn]);
}

function isoInCalendarMonth(iso: string, year: number, month: number): boolean {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return y === year && m === month;
}

type DayGroup = {
  iso: string;
  rows: Record<string, unknown>[];
  dayIncome: number;
  dayExpense: number;
};

/** Day header: flexible on narrow screens so totals don’t clip; fixed from `sm` up. */
const dayHeaderAmountColClass =
  "min-w-0 text-right text-xs tabular-nums sm:w-[7.5rem] sm:min-w-[7.5rem] sm:shrink-0 sm:text-sm";

/** Transaction row: income / expense — compact on mobile so 4-column layout fits. */
const txRowAmountColClass =
  "min-w-0 w-full text-right tabular-nums text-[11px] leading-tight break-all sm:w-[7.5rem] sm:min-w-[7.5rem] sm:text-sm sm:leading-normal";

/** Local time-of-day (Period); left of category / subcategory. */
const txRowTimeColClass =
  "w-[3.25rem] min-w-[3.25rem] max-w-[4.25rem] shrink-0 tabular-nums text-[11px] leading-tight text-zinc-600 dark:text-zinc-400 sm:w-[4.25rem] sm:min-w-[4.25rem] sm:max-w-[4.5rem] sm:text-xs sm:leading-snug";

/**
 * Time | Category | Note | Description | Income | Expense — subcategory and account on the
 * second line under Category and Note; description is a single muted column.
 */
const txRowGridClass =
  "grid w-full max-w-full grid-cols-[minmax(2.75rem,3.35rem)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.95fr)_minmax(2.85rem,4.25rem)_minmax(2.85rem,4.25rem)] items-start gap-x-1.5 gap-y-1 sm:grid-cols-[4.25rem_minmax(0,1.05fr)_minmax(0,0.95fr)_minmax(0,1.1fr)_7rem_7rem] sm:gap-x-2 sm:gap-y-2";

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
  /**
   * Show Expand/Collapse all toolbar (e.g. off for inline dashboard / calendar pages).
   * @default true
   */
  showDateGroupControls?: boolean;
  /**
   * When true, each day’s transaction list is shown until the user collapses it (or “Collapse all dates”).
   * When false (default), days start collapsed; use “Expand all dates” or the day header to open.
   */
  defaultDayRowsExpanded?: boolean;
  /**
   * Parent increments this (e.g. account drill “expand everything”) to open every day group.
   */
  expandAllNonce?: number;
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
  showDateGroupControls = true,
  defaultDayRowsExpanded = false,
  expandAllNonce,
}: CalendarMonthTransactionsGroupedProps) {
  const currencySettings = useCurrencySettings();
  const amountCol = useMemo(() => amountColumnName(columns), [columns]);
  const descriptionColumnKey = useMemo(
    () =>
      columns.find((c) => c.trim().toLowerCase() === "description") ?? null,
    [columns],
  );
  /**
   * When `defaultDayRowsExpanded` is false: `true` = expanded; missing / `false` = collapsed.
   * When true: missing / `true` = expanded; explicit `false` = collapsed.
   */
  const [dayExpanded, setDayExpanded] = useState<Record<string, boolean>>({});

  const isDayOpen = (iso: string) =>
    defaultDayRowsExpanded
      ? dayExpanded[iso] !== false
      : dayExpanded[iso] === true;

  const toggleDay = (iso: string) => {
    setDayExpanded((prev) => {
      if (defaultDayRowsExpanded) {
        const open = prev[iso] !== false;
        return { ...prev, [iso]: !open };
      }
      const wasOpen = prev[iso] === true;
      return { ...prev, [iso]: !wasOpen };
    });
  };

  const groups = useMemo((): DayGroup[] => {
    if (!periodColumn || rows.length === 0) return [];
    const map = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const iso = rowCalendarIsoKey(row, periodColumn);
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
      sortTransactionRowsLatestPeriodFirst(dayRows, periodColumn);
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

  const expandAllDates = useCallback(() => {
    setDayExpanded((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        next[g.iso] = true;
      }
      return next;
    });
  }, [groups]);

  const collapseAllDates = useCallback(() => {
    if (defaultDayRowsExpanded) {
      setDayExpanded(Object.fromEntries(groups.map((g) => [g.iso, false])));
    } else {
      setDayExpanded({});
    }
  }, [groups, defaultDayRowsExpanded]);

  const allDatesExpanded = useMemo(
    () =>
      groups.length > 0 &&
      groups.every((g) =>
        defaultDayRowsExpanded
          ? dayExpanded[g.iso] !== false
          : dayExpanded[g.iso] === true,
      ),
    [groups, dayExpanded, defaultDayRowsExpanded],
  );

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
    [monthScope],
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

  const lastParentExpandRef = useRef<{
    nonce: number;
    isoSig: string;
  } | null>(null);

  useLayoutEffect(() => {
    if (expandAllNonce == null || expandAllNonce < 1) return;
    if (groups.length === 0) return;
    const prev = lastParentExpandRef.current;
    if (
      prev != null &&
      prev.nonce === expandAllNonce &&
      prev.isoSig === groupIsoSig
    ) {
      return;
    }
    lastParentExpandRef.current = {
      nonce: expandAllNonce,
      isoSig: groupIsoSig,
    };
    setDayExpanded(Object.fromEntries(groups.map((g) => [g.iso, true])));
  }, [expandAllNonce, groupIsoSig, groups]);

  const groupFailureReason = useMemo((): "unparseable" | "outside-month" | null => {
    if (!periodColumn || rows.length === 0) return null;
    let parsedAny = false;
    let inScopeAny = false;
    for (const row of rows) {
      const iso = rowCalendarIsoKey(row, periodColumn);
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
      {showDateGroupControls ? (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className={btnSmallSecondary}
            aria-expanded={allDatesExpanded}
            aria-label={
              allDatesExpanded
                ? "Collapse all date sections"
                : "Expand all date sections"
            }
            onClick={allDatesExpanded ? collapseAllDates : expandAllDates}
          >
            {allDatesExpanded ? "Collapse all dates" : "Expand all dates"}
          </button>
        </div>
      ) : null}
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
            ? "hover:bg-red-100/90 dark:hover:bg-red-950/55 hover:ring-1 hover:ring-red-200/70 dark:hover:ring-red-900/45"
            : dow === 6
              ? "hover:bg-blue-100/90 dark:hover:bg-blue-950/55 hover:ring-1 hover:ring-blue-200/70 dark:hover:ring-blue-900/45"
              : "hover:bg-zinc-200/90 dark:hover:bg-zinc-800/70 hover:ring-1 hover:ring-zinc-300/60 dark:hover:ring-zinc-600/50";

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
              <div className="flex min-w-0 shrink flex-col items-end gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
                <div className={dayHeaderAmountColClass}>
                  <span
                    className={`block font-semibold break-all sm:inline ${incomeHeadlineTextClass}`}
                  >
                    {formatMainCurrencyTotal(g.dayIncome, currencySettings)}
                  </span>
                </div>
                <div className={dayHeaderAmountColClass}>
                  <span className="block font-semibold break-all text-rose-600 dark:text-rose-400 sm:inline">
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
              <div
                className={`${txRowGridClass} mb-1 border-b border-zinc-200/80 px-2 pb-2 pt-0.5 dark:border-zinc-700/80 sm:hidden`}
                aria-hidden
              >
                <div className={txRowTimeColClass}>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Time
                  </div>
                  <div className="text-[10px] leading-none text-zinc-400/0 dark:text-zinc-500/0">
                    &nbsp;
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Category
                  </div>
                  <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    Subcategory
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Note
                  </div>
                  <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    Account
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Description
                  </div>
                  <div className="text-[10px] leading-none text-zinc-400/0 dark:text-zinc-500/0">
                    &nbsp;
                  </div>
                </div>
                <div
                  className={`text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 ${txRowAmountColClass}`}
                >
                  Income
                </div>
                <div
                  className={`text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 ${txRowAmountColClass}`}
                >
                  Expense
                </div>
              </div>
              {g.rows.length >= CALENDAR_DAY_TX_VIRTUALIZE_THRESHOLD ? (
                <VirtualizedDayTxList
                  rows={g.rows}
                  periodColumn={periodColumn!}
                  amountCol={amountCol}
                  descriptionColumnKey={descriptionColumnKey}
                  currencySettings={currencySettings}
                  onRowClick={onRowClick}
                />
              ) : (
                g.rows.map((row, i) => (
                  <CalendarDayTxRow
                    key={row.id != null ? String(row.id) : i}
                    row={row}
                    periodColumn={periodColumn!}
                    amountCol={amountCol}
                    descriptionColumnKey={descriptionColumnKey}
                    currencySettings={currencySettings}
                    onRowClick={onRowClick}
                  />
                ))
              )}
            </div>
            ) : null}
          </div>
        );
      })}
      </div>
    </div>
  );
}
