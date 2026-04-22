"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  formatPreviewAmountDisplay,
  type CurrencySettingsState,
} from "@/lib/currencySettings";
import { rowIncomeExpenseAmounts } from "@/lib/calendarTransactionAmounts";
import { getTransactionRowId } from "@/lib/transactionRowId";
import {
  incomeFlowTextClass,
} from "@/lib/incomeExpenseTheme";
import {
  isRedundantTransferCategoryLabel,
  transferMoneyTextClass,
} from "@/lib/transactionRowTone";
import {
  parseTransferAccountsFromRow,
  transferLegFromRow,
} from "@/lib/transferRowAccounts";
import { formatPeriodTimeOnly } from "@/lib/formatPeriod";
import {
  interactiveHoverSurface,
  readonlyHoverSurface,
} from "@/lib/ui";

/** When a single calendar day has at least this many rows, scroll the list in a virtualized viewport. */
export const CALENDAR_DAY_TX_VIRTUALIZE_THRESHOLD = 90;

const txRowAmountColClass =
  "min-w-0 w-full text-right tabular-nums text-[11px] leading-tight break-all sm:w-[7.5rem] sm:min-w-[7.5rem] sm:text-sm sm:leading-normal";

const txRowTimeColClass =
  "w-[3.25rem] min-w-[3.25rem] max-w-[4.25rem] shrink-0 tabular-nums text-[11px] leading-tight text-zinc-600 dark:text-zinc-400 sm:w-[4.25rem] sm:min-w-[4.25rem] sm:max-w-[4.5rem] sm:text-xs sm:leading-snug";

const txRowGridClass =
  "grid w-full max-w-full grid-cols-[minmax(2.75rem,3.35rem)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.95fr)_minmax(2.85rem,4.25rem)_minmax(2.85rem,4.25rem)] items-start gap-x-1.5 gap-y-1 sm:grid-cols-[4.25rem_minmax(0,1.05fr)_minmax(0,0.95fr)_minmax(0,1.1fr)_7rem_7rem] sm:gap-x-2 sm:gap-y-2";

export type CalendarDayTxRowProps = {
  row: Record<string, unknown>;
  periodColumn: string;
  amountCol: string;
  descriptionColumnKey: string | null;
  currencySettings: CurrencySettingsState;
  onRowClick: (row: Record<string, unknown>) => void;
};

export function CalendarDayTxRow({
  row,
  periodColumn,
  amountCol,
  descriptionColumnKey,
  currencySettings,
  onRowClick,
}: CalendarDayTxRowProps) {
  const id = getTransactionRowId(row);
  const canEdit = id != null;
  const { income, expense } = rowIncomeExpenseAmounts(row, amountCol);
  const isTransfer = transferLegFromRow(row) != null;
  const catRaw = String(row["Category"] ?? "").trim();
  const categoryDisplay =
    isTransfer &&
    (!catRaw || catRaw === "—" || isRedundantTransferCategoryLabel(catRaw))
      ? "Other"
      : catRaw || "—";
  const sub = String(row["Subcategory"] ?? "").trim();
  const note = String(row["Note"] ?? "").trim();
  const acct = String(row["Accounts"] ?? "").trim();
  const descriptionRaw = (() => {
    if (!descriptionColumnKey) return "";
    const s = String(row[descriptionColumnKey] ?? "").trim();
    if (s === "" || s === "—") return "";
    return s;
  })();
  const { fromAccount, toAccount } = parseTransferAccountsFromRow(row);
  const fromAcc = fromAccount.trim();
  const toAcc = toAccount.trim();
  const hasTransferAccountFlow =
    isTransfer && fromAcc.length > 0 && toAcc.length > 0;

  return (
    <div
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
          ? `cursor-pointer ${interactiveHoverSurface}`
          : readonlyHoverSurface
      }`}
    >
      <div className={`self-start pt-0.5 ${txRowTimeColClass}`}>
        {formatPeriodTimeOnly(row[periodColumn])}
      </div>
      <div className="min-w-0">
        <div className="font-medium text-zinc-900 dark:text-zinc-100">
          {categoryDisplay}
        </div>
        {sub ? (
          <div className="text-xs text-zinc-500 dark:text-zinc-400">{sub}</div>
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
      <div className="min-w-0 self-start pt-0.5">
        {descriptionRaw ? (
          <div className="break-words text-sm leading-snug text-zinc-500 dark:text-zinc-400">
            {descriptionRaw}
          </div>
        ) : null}
      </div>
      <div className={`tabular-nums ${txRowAmountColClass}`}>
        {income != null ? (
          <span className={`font-medium ${incomeFlowTextClass}`}>
            {formatPreviewAmountDisplay(income, row, currencySettings)}
          </span>
        ) : null}
      </div>
      <div className={`tabular-nums ${txRowAmountColClass}`}>
        {expense != null ? (
          <span className="font-medium text-rose-600 dark:text-rose-400">
            {formatPreviewAmountDisplay(expense, row, currencySettings)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export type VirtualizedDayTxListProps = Omit<CalendarDayTxRowProps, "row"> & {
  rows: Record<string, unknown>[];
};

export function VirtualizedDayTxList({
  rows,
  periodColumn,
  amountCol,
  descriptionColumnKey,
  currencySettings,
  onRowClick,
}: VirtualizedDayTxListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 92,
    overscan: 8,
  });

  return (
    <div
      ref={scrollRef}
      className="max-h-[min(60vh,32rem)] overflow-y-auto overflow-x-hidden"
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const row = rows[vi.index]!;
          return (
            <div
              key={row.id != null ? String(row.id) : vi.index}
              className="absolute left-0 top-0 w-full px-0 py-0.5"
              style={{ transform: `translateY(${vi.start}px)` }}
              data-index={vi.index}
              ref={virtualizer.measureElement}
            >
              <CalendarDayTxRow
                row={row}
                periodColumn={periodColumn}
                amountCol={amountCol}
                descriptionColumnKey={descriptionColumnKey}
                currencySettings={currencySettings}
                onRowClick={onRowClick}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
