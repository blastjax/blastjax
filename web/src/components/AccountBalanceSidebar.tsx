"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AccountDrillModal } from "@/components/AccountDrillModal";
import { getAccountBalances, getBudgetLabels, getWorkbook } from "@/lib/api";
import {
  buildCurrencyConversionPayload,
  formatMainCurrencyTotal,
  useCurrencySettings,
} from "@/lib/currencySettings";
import { computeDisplayAccountNames } from "@/lib/accountsDisplayList";
import { incomeFlowTextClass } from "@/lib/incomeExpenseTheme";
import {
  applyAccountOrder,
  getAccountOrder,
  mergeOrderAfterVisibleReorder,
  setAccountOrder,
  useAccountOrder,
} from "@/lib/accountOrder";
import { useAccountBalancesRefreshGeneration } from "@/lib/accountBalancesRefreshContext";
import {
  isAccountShownInBalanceSidebar,
  useBalanceSidebarHidden,
} from "@/lib/accountBalanceSidebarVisibility";
import {
  isAccountExcludedFromBalanceTotal,
  isAccountIncludedInBalanceTotal,
  useBalanceSidebarTotalExcluded,
} from "@/lib/accountBalanceTotalExclusion";
import { useDeletedAccounts } from "@/lib/deletedAccounts";
import { useManualAccounts } from "@/lib/manualAccounts";
import { RAIL_WIDTH, useShellLayout } from "@/lib/shellLayoutContext";
import { useWorkbookActiveSheetOptional } from "@/lib/workbookActiveSheetContext";

function labelAccount(name: string) {
  return name === "" ? "(empty)" : name;
}

export function AccountBalanceSidebar() {
  const balancesRefreshGeneration = useAccountBalancesRefreshGeneration();
  const currencySettings = useCurrencySettings();
  const currencyConversion = useMemo(
    () => buildCurrencyConversionPayload(currencySettings),
    [currencySettings],
  );
  const fmtMoney = useCallback(
    (n: number) => formatMainCurrencyTotal(n, currencySettings),
    [currencySettings],
  );
  const accountOrder = useAccountOrder();
  const manualAccounts = useManualAccounts();
  const deletedAccounts = useDeletedAccounts();
  const { rightCollapsed, rightWidth, toggleRight } = useShellLayout();
  const sheetCtx = useWorkbookActiveSheetOptional();
  const sidebarOnlyHidden = useBalanceSidebarHidden();
  const totalExcluded = useBalanceSidebarTotalExcluded();
  /** First sheet from workbook (used until dashboard publishes the active tab). */
  const [fallbackSheet, setFallbackSheet] = useState<string | null>(null);
  const resolvedSheet = useMemo(
    () => sheetCtx?.activeSheet ?? fallbackSheet,
    [sheetCtx?.activeSheet, fallbackSheet],
  );
  const [bootDone, setBootDone] = useState(false);
  /** Distinct account labels from the DB (same source as the Accounts page). */
  const [serverAccountNames, setServerAccountNames] = useState<string[]>([]);
  /** Per-name balances from the active sheet (joined by name onto the display list). */
  const [balanceRows, setBalanceRows] = useState<
    { name: string; balance: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    accountsColumn: string | null;
    amountColumn: string | null;
  } | null>(null);
  const [drillModal, setDrillModal] = useState<{
    name: string;
    balance: number;
  } | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const mergedRows = useMemo(() => {
    const map = new Map(balanceRows.map((r) => [r.name, r.balance]));
    const names = computeDisplayAccountNames(
      serverAccountNames,
      manualAccounts,
      deletedAccounts,
    );
    return names.map((name) => ({
      name,
      balance: map.get(name) ?? 0,
    }));
  }, [serverAccountNames, manualAccounts, deletedAccounts, balanceRows]);

  /** Remove stale names when workbook or manual accounts change. */
  useEffect(() => {
    if (mergedRows.length === 0) return;
    const names = new Set(mergedRows.map((r) => r.name));
    const cur = getAccountOrder();
    const pruned = cur.filter((x) => names.has(x));
    if (pruned.length !== cur.length) {
      setAccountOrder(pruned);
    }
  }, [mergedRows]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const w = await getWorkbook();
        if (cancelled) return;
        setFallbackSheet(w.sheets[0]?.name ?? null);
      } catch {
        if (!cancelled) setFallbackSheet(null);
      } finally {
        if (!cancelled) setBootDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!resolvedSheet) {
      setLoading(false);
      setServerAccountNames([]);
      setBalanceRows([]);
      setMeta(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [labels, res] = await Promise.all([
          getBudgetLabels(),
          getAccountBalances(resolvedSheet, currencyConversion ?? undefined),
        ]);
        if (cancelled) return;
        setServerAccountNames(labels.accounts);
        setMeta({
          accountsColumn: res.accounts_column,
          amountColumn: res.amount_column,
        });
        setBalanceRows(res.accounts);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error
              ? e.message
              : "Failed to load accounts or balances",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedSheet, balancesRefreshGeneration, currencyConversion]);

  /** Match Accounts page: only “Hide” on this page (not dashboard value filters). */
  const visible = mergedRows.filter((a) =>
    isAccountShownInBalanceSidebar(sidebarOnlyHidden, a.name),
  );

  const visibleOrdered = useMemo(() => {
    const names = visible.map((a) => a.name);
    const orderedNames = applyAccountOrder(names, accountOrder);
    const byName = new Map(visible.map((a) => [a.name, a]));
    return orderedNames
      .map((n) => byName.get(n))
      .filter((a): a is (typeof visible)[0] => a != null);
  }, [visible, accountOrder]);

  const sidebarTotalIncluded = useMemo(() => {
    return visibleOrdered
      .filter((a) => isAccountIncludedInBalanceTotal(totalExcluded, a.name))
      .reduce((sum, a) => sum + a.balance, 0);
  }, [visibleOrdered, totalExcluded]);

  const reorderByDrag = useCallback(
    (from: number, to: number) => {
      const names = visibleOrdered.map((a) => a.name);
      if (
        from === to ||
        from < 0 ||
        to < 0 ||
        from >= names.length ||
        to >= names.length
      ) {
        return;
      }
      const next = [...names];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      mergeOrderAfterVisibleReorder(next, mergedRows.map((r) => r.name));
    },
    [visibleOrdered, mergedRows],
  );

  useEffect(() => {
    const onDragEnd = () => setDragOverIdx(null);
    window.addEventListener("dragend", onDragEnd);
    return () => window.removeEventListener("dragend", onDragEnd);
  }, []);

  const showEmptyState =
    bootDone && !resolvedSheet && !loading && !error;

  return (
    <aside
      style={{
        width: rightCollapsed ? RAIL_WIDTH : rightWidth,
        flexShrink: 0,
      }}
      className="sticky top-0 hidden h-screen max-h-[100dvh] overflow-hidden border-l border-zinc-200 bg-zinc-50/80 lg:flex lg:flex-col dark:border-zinc-800 dark:bg-zinc-950/80"
    >
      {rightCollapsed ? (
        <div className="flex h-full min-h-0 flex-1 flex-col items-center gap-2 py-3">
          <button
            type="button"
            className="rounded-lg border border-zinc-300 bg-white p-2 text-zinc-700 shadow-sm hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            aria-label="Expand account balances"
            title="Expand account balances"
            onClick={toggleRight}
          >
            <span className="text-lg leading-none" aria-hidden>
              ‹
            </span>
          </button>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3">
          <div className="flex shrink-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Account balances
              </h2>
              <p className="mt-0.5 text-[10px] leading-snug text-zinc-400 dark:text-zinc-500">
                Drag to reorder · rename from account transactions · same order in Add
                transaction
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 shadow-sm hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              aria-label="Collapse account balances to slim bar"
              title="Collapse panel (drag the edge to resize width)"
              onClick={toggleRight}
            >
              <span className="leading-none" aria-hidden>
                »
              </span>
            </button>
          </div>

          {showEmptyState && (
            <p className="text-xs text-zinc-500">No workbook loaded.</p>
          )}

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          {!meta?.accountsColumn && bootDone && resolvedSheet && !loading && !error && (
            <p className="text-xs text-zinc-500">No Accounts column in data.</p>
          )}

          {!meta?.amountColumn && bootDone && resolvedSheet && !loading && !error && meta?.accountsColumn && (
            <p className="text-xs text-zinc-500">No Amount column for balances.</p>
          )}

          {loading && resolvedSheet && (
            <p className="text-xs text-zinc-500">Loading…</p>
          )}

          {!loading && !error && visibleOrdered.length === 0 && meta?.accountsColumn && meta?.amountColumn && resolvedSheet && (
            <p className="text-xs text-zinc-500">No accounts to show (all hidden).</p>
          )}

          {!loading && visibleOrdered.length > 0 && (
            <>
              <div className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 dark:border-zinc-700 dark:bg-zinc-900/60">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Total
                </p>
                <p
                  className={`mt-0.5 text-sm font-semibold tabular-nums ${
                    sidebarTotalIncluded >= 0
                      ? incomeFlowTextClass
                      : "text-rose-700 dark:text-rose-400"
                  }`}
                >
                  {fmtMoney(sidebarTotalIncluded)}
                </p>
              </div>
            <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
              {visibleOrdered.map((a, index) => (
                <li
                  key={a.name === "" ? "__empty__" : a.name}
                  className={`rounded-lg ${
                    dragOverIdx === index
                      ? "ring-1 ring-indigo-400 ring-offset-1 ring-offset-zinc-50 dark:ring-offset-zinc-950"
                      : ""
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverIdx(index);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const raw =
                      e.dataTransfer.getData("application/account-idx") ||
                      e.dataTransfer.getData("text/plain");
                    const from = parseInt(raw, 10);
                    setDragOverIdx(null);
                    if (!Number.isFinite(from)) return;
                    reorderByDrag(from, index);
                  }}
                >
                  <div
                    className={`rounded-lg border transition-colors hover:border-indigo-300 dark:hover:border-indigo-700 ${
                      isAccountExcludedFromBalanceTotal(totalExcluded, a.name)
                        ? "border-zinc-200/80 bg-zinc-100/80 dark:border-zinc-700/80 dark:bg-zinc-900/40"
                        : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/60"
                    }`}
                  >
                    <button
                      type="button"
                      draggable
                      title="Drag to reorder · Click to open transactions"
                      aria-label={`${labelAccount(a.name)}, ${fmtMoney(a.balance)}. Drag to reorder or click to open.`}
                      onDragStart={(e) => {
                        const s = String(index);
                        e.dataTransfer.setData("application/account-idx", s);
                        e.dataTransfer.setData("text/plain", s);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDragOverIdx(null)}
                      onClick={() =>
                        setDrillModal({ name: a.name, balance: a.balance })
                      }
                      className="w-full min-w-0 cursor-grab rounded-lg px-2.5 py-1.5 text-left active:cursor-grabbing"
                    >
                      <p
                        className={`truncate text-xs font-medium ${
                          isAccountExcludedFromBalanceTotal(totalExcluded, a.name)
                            ? "text-zinc-400 dark:text-zinc-500"
                            : "text-zinc-700 dark:text-zinc-200"
                        }`}
                      >
                        {labelAccount(a.name)}
                      </p>
                      <p
                        className={`mt-0.5 text-sm font-semibold tabular-nums ${
                          isAccountExcludedFromBalanceTotal(totalExcluded, a.name)
                            ? "text-zinc-400 dark:text-zinc-500"
                            : a.balance >= 0
                              ? incomeFlowTextClass
                              : "text-rose-700 dark:text-rose-400"
                        }`}
                      >
                        {fmtMoney(a.balance)}
                      </p>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            </>
          )}
          {drillModal != null && resolvedSheet && (
            <AccountDrillModal
              open
              onClose={() => setDrillModal(null)}
              sheet={resolvedSheet}
              accountName={drillModal.name}
              balance={drillModal.balance}
              onRenamed={(newName) =>
                setDrillModal((d) => (d ? { ...d, name: newName } : null))
              }
            />
          )}
        </div>
      )}
    </aside>
  );
}
