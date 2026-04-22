import { Fragment, type ReactNode } from "react";
import { formatPeriodDisplay, formatPeriodTimeOnly } from "@/lib/formatPeriod";
import { parseTransferAccountsFromRow } from "@/lib/transferRowAccounts";
import {
  formatCellForTone,
  transferMoneyTextClass,
  transferPreviewKind,
  TRANSFER_FLOW_COLUMN,
} from "@/lib/transactionRowTone";

export type RenderTransferFlowAwareCellOptions = {
  /** When the surrounding UI already shows the calendar date (e.g. day modal). */
  periodStyle?: "full" | "timeOnly";
  /** Sheet column name for the period (defaults to `"Period"`). */
  periodColumnName?: string | null;
};

/** Data preview: transfers show Accounts → … → Category → Subcategory in Accounts; Category/Subcategory cells blank (same info). */
export function renderTransferFlowAwareCell(
  row: Record<string, unknown>,
  column: string,
  options?: RenderTransferFlowAwareCellOptions,
): ReactNode {
  if (column.trim().toLowerCase() === "currency") return "";
  const v = row[column];
  const flow = transferPreviewKind(row);

  if (column === TRANSFER_FLOW_COLUMN) return "";

  if (column === "Accounts" && flow) {
    const { fromAccount, toAccount } = parseTransferAccountsFromRow(row);
    const parts = [
      fromAccount.trim(),
      toAccount.trim(),
      String(row["Category"] ?? "").trim(),
      String(row["Subcategory"] ?? "").trim(),
    ].filter((s) => s.length > 0);
    if (parts.length === 0) return "";
    return (
      <span
        className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${transferMoneyTextClass}`}
        title="Transfer"
      >
        {parts.map((p, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <span className="shrink-0 font-semibold" aria-hidden>
                →
              </span>
            )}
            <span className="break-words">{p}</span>
          </Fragment>
        ))}
      </span>
    );
  }

  if (flow && (column === "Category" || column === "Subcategory")) {
    return "";
  }

  const periodCol = options?.periodColumnName ?? "Period";
  if (column === periodCol) {
    return options?.periodStyle === "timeOnly"
      ? formatPeriodTimeOnly(v)
      : formatPeriodDisplay(v);
  }

  if (column === "Income/Expense" && flow) {
    return "";
  }

  return formatCellForTone(v, column, row);
}
