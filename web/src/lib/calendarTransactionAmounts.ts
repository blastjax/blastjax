import { transactionRowKind } from "@/lib/transactionRowTone";

export function amountColumnName(columns: string[]): string {
  if (columns.includes("Amount")) return "Amount";
  const x = columns.find((c) => c.toLowerCase() === "amount");
  return x ?? "Amount";
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
