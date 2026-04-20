/**
 * Income / expense / transfer styling for transaction rows (data preview, account drill modal).
 * Matches backend flow classification via Income/Expense labels.
 */

import {
  formatPreviewAmountDisplay,
  loadCurrencySettings,
} from "@/lib/currencySettings";
import { incomeFlowTextClass } from "@/lib/incomeExpenseTheme";
import { transferLegFromIncomeExpense } from "@/lib/transferRowAccounts";

/** Synthetic column: transfer direction between Accounts and Category (data preview, account drill). */
export const TRANSFER_FLOW_COLUMN = "__preview_transfer_flow__";

/**
 * Inserts {@link TRANSFER_FLOW_COLUMN} after `Accounts` when `Category` exists later (same layout as data preview).
 */
export function insertTransferFlowDisplayColumn(cols: string[]): string[] {
  const accIdx = cols.indexOf("Accounts");
  const catIdx = cols.indexOf("Category");
  if (accIdx === -1 || catIdx === -1 || catIdx <= accIdx) return cols;
  if (cols.includes(TRANSFER_FLOW_COLUMN)) return cols;
  const next = [...cols];
  next.splice(accIdx + 1, 0, TRANSFER_FLOW_COLUMN);
  return next;
}

/** Category/Subcategory text that only repeats the transfer type — hide when the flow arrow carries the meaning. */
export function isRedundantTransferCategoryLabel(s: string): boolean {
  const x = s.trim().toLowerCase().replace(/[\s_-]/g, "");
  return (
    x === "transfer" ||
    x === "transferin" ||
    x === "transferout" ||
    x === "transfers"
  );
}

/** Data preview money columns: two decimal places (avoid formatting ids/counts as 12.00). */
export function isPreviewMoneyColumn(column: string | undefined): boolean {
  if (!column) return false;
  const n = column.trim();
  return n === "Amount" || n === "PHP";
}

export function formatCellForTone(
  v: unknown,
  column?: string,
  row?: Record<string, unknown>,
): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    if (isPreviewMoneyColumn(column) && row) {
      return formatPreviewAmountDisplay(v, row, loadCurrencySettings());
    }
    if (isPreviewMoneyColumn(column)) return v.toFixed(2);
    return String(v);
  }
  return String(v);
}

export type TransactionRowKind = "income" | "expense" | "transfer" | null;

/** Transfer amounts: readable on light backgrounds; white text in dark mode. */
export const transferMoneyTextClass = "text-zinc-800 dark:text-white";

export function transactionRowKind(
  row: Record<string, unknown>,
): TransactionRowKind {
  if (transferLegFromIncomeExpense(row["Income/Expense"]) != null) return "transfer";
  const ie = formatCellForTone(row["Income/Expense"], "Income/Expense", row)
    .trim()
    .toLowerCase();
  if (ie === "income") return "income";
  if (ie.includes("exp") && !ie.includes("income")) return "expense";
  return null;
}

export function transferPreviewKind(
  row: Record<string, unknown>,
): "out" | "in" | null {
  return transferLegFromIncomeExpense(row["Income/Expense"]);
}

/**
 * Text color class for one cell. Pass `flowColumn` when that synthetic column should stay neutral.
 */
export function transactionCellToneClass(
  row: Record<string, unknown>,
  column: string,
  options?: { flowColumn?: string },
): string {
  if (options?.flowColumn && column === options.flowColumn) return "";
  const k = transactionRowKind(row);
  if (k === "income") return incomeFlowTextClass;
  if (k === "expense") return "text-rose-700 dark:text-rose-400";
  if (k === "transfer") return transferMoneyTextClass;
  return "text-zinc-900 dark:text-zinc-100";
}
