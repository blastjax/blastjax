import type { DeletedAccountEntry } from "@/lib/deletedAccounts";
import { isAccountInDeletedList } from "@/lib/deletedAccounts";

/**
 * Same account ordering and membership as the Accounts page: server distinct labels,
 * then manual-only accounts, sorted, minus deleted (soft-deleted) accounts.
 */
export function computeDisplayAccountNames(
  serverAccounts: readonly string[],
  manualAccounts: readonly string[],
  deletedAccounts: readonly DeletedAccountEntry[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of serverAccounts) {
    const k = a.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(a);
    }
  }
  for (const m of manualAccounts) {
    const k = m.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(m);
    }
  }
  out.sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
  return out.filter((a) => !isAccountInDeletedList(a, deletedAccounts));
}
