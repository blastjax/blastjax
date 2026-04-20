/**
 * Map transfer sheet rows to From / To accounts (matches `insert_budget_transfer` descriptions).
 */

/** Classify transfer rows from Income/Expense (hyphen or space forms). */
export function transferLegFromIncomeExpense(ieRaw: unknown): "out" | "in" | null {
  const raw = String(ieRaw ?? "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("transfer-out") || /\btransfer\s+out\b/i.test(raw)) return "out";
  if (lower.includes("transfer-in") || /\btransfer\s+in\b/i.test(raw)) return "in";
  return null;
}

/**
 * Transfer leg from Income/Expense, or from calendar `Flow` when I/E is missing.
 */
export function transferLegFromRow(row: Record<string, unknown>): "out" | "in" | null {
  const fromIe = transferLegFromIncomeExpense(row["Income/Expense"]);
  if (fromIe != null) return fromIe;
  const flow = String(row["Flow"] ?? "").trim();
  if (flow === "Transfer-In") return "in";
  if (flow === "Transfer-Out") return "out";
  return null;
}

/** Hide Transfer-In legs in data previews so each transfer appears once (Transfer-Out row). */
export function isTransferInRow(row: Record<string, unknown>): boolean {
  return transferLegFromRow(row) === "in";
}

export function filterDataPreviewRows<T extends Record<string, unknown>>(
  rows: readonly T[],
): T[] {
  return rows.filter((r) => !isTransferInRow(r));
}

function firstNonEmptyStringField(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v == null || v === "") continue;
    const s = String(v).trim();
    if (s !== "") return s;
  }
  return "";
}

/**
 * Destination account from Transfer-Out description. Backend default: `Transfer to {name}`.
 * Accepts colons, en-dash, leading noise, and flexible spacing.
 */
export function extractDestinationAfterTransferTo(desc: string): string {
  const d = desc.replace(/^\uFEFF/, "").trim();
  if (!d) return "";

  const anchored: RegExp[] = [
    /^transfer to\s+(.+)$/i,
    /^transfer to\s*:\s*(.+)$/i,
    /^transfer to\s*[-–—]\s*(.+)$/i,
  ];
  for (const re of anchored) {
    const m = d.match(re);
    const got = m?.[1]?.trim();
    if (got) return got;
  }

  const relaxed = d.match(/\btransfer\s+to\s*[:-]?\s*(.+)$/i);
  const r1 = relaxed?.[1]?.trim();
  if (r1) return r1;

  const lower = d.toLowerCase();
  const needle = "transfer to";
  const idx = lower.indexOf(needle);
  if (idx >= 0) {
    let rest = d.slice(idx + needle.length).trim();
    rest = rest.replace(/^[:\-–—]\s*/, "").trim();
    if (rest) return rest;
  }

  return "";
}

function extractSourceAfterTransferFrom(desc: string): string {
  const d = desc.replace(/^\uFEFF/, "").trim();
  if (!d) return "";

  const anchored: RegExp[] = [
    /^transfer from\s+(.+)$/i,
    /^transfer from\s*:\s*(.+)$/i,
    /^transfer from\s*[-–—]\s*(.+)$/i,
  ];
  for (const re of anchored) {
    const m = d.match(re);
    const got = m?.[1]?.trim();
    if (got) return got;
  }

  const relaxed = d.match(/\btransfer\s+from\s*[:-]?\s*(.+)$/i);
  const r1 = relaxed?.[1]?.trim();
  if (r1) return r1;

  const lower = d.toLowerCase();
  const needle = "transfer from";
  const idx = lower.indexOf(needle);
  if (idx >= 0) {
    let rest = d.slice(idx + needle.length).trim();
    rest = rest.replace(/^[:\-–—]\s*/, "").trim();
    if (rest) return rest;
  }

  return "";
}

export function parseTransferAccountsFromRow(row: Record<string, unknown>): {
  fromAccount: string;
  toAccount: string;
} {
  const accounts = String(row["Accounts"] ?? "").trim();
  const desc = firstNonEmptyStringField(row, [
    "Description",
    "description",
    "Note",
    "note",
  ]);

  const leg = transferLegFromRow(row);
  if (leg === "out") {
    const to = extractDestinationAfterTransferTo(desc);
    return { fromAccount: accounts, toAccount: to };
  }
  if (leg === "in") {
    const from = extractSourceAfterTransferFrom(desc);
    return { fromAccount: from, toAccount: accounts };
  }
  return { fromAccount: accounts, toAccount: "" };
}
