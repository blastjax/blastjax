import { comparePeriodLatestFirst } from "@/lib/formatPeriod";
import { getTransactionRowId } from "@/lib/transactionRowId";

function compareIdLatestFirst(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): number {
  const ida = getTransactionRowId(a);
  const idb = getTransactionRowId(b);
  if (ida != null && idb != null && ida !== idb) return idb - ida;
  if (ida != null && idb == null) return -1;
  if (ida == null && idb != null) return 1;
  return 0;
}

/**
 * Sort in place: latest {@link comparePeriodLatestFirst} on `periodColumn`, then higher `id` first.
 * If `periodColumn` is missing, sorts by `id` only (stable when timestamps tie or are absent).
 */
export function sortTransactionRowsLatestPeriodFirst(
  rows: Record<string, unknown>[],
  periodColumn: string | null | undefined,
): void {
  if (!periodColumn?.trim()) {
    rows.sort(compareIdLatestFirst);
    return;
  }
  rows.sort((a, b) => {
    const cmp = comparePeriodLatestFirst(
      a[periodColumn],
      b[periodColumn],
    );
    if (cmp !== 0) return cmp;
    return compareIdLatestFirst(a, b);
  });
}
