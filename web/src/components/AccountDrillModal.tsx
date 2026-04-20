"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  analyze,
  getColumns,
  renameBudgetAccountLabel,
  type AnalyzeBody,
} from "@/lib/api";
import { applyAccountLabelRenameEverywhere } from "@/lib/accountLabelRename";
import { useBumpAccountBalancesRefresh } from "@/lib/accountBalancesRefreshContext";
import {
  isColumnExcludedFromDataPreview,
  useDashboardColumnVisible,
} from "@/lib/columnVisibility";
import { AccountDrillMonthGrouped } from "@/components/AccountDrillMonthGrouped";
import { resolvePeriodColumnNameFromKinds } from "@/lib/periodColumn";
import { filterDataPreviewRows } from "@/lib/transferRowAccounts";
import { renderTransferFlowAwareCell } from "@/lib/transferPreviewCells";
import { transactionCellToneClass } from "@/lib/transactionRowTone";
import {
  useValueVisibilityFilters,
  valueVisibilityFiltersForAccountDrill,
} from "@/lib/valueInstanceVisibility";
import {
  buildCurrencyConversionPayload,
  formatMainCurrencyTotal,
  useCurrencySettings,
} from "@/lib/currencySettings";
import { incomeFlowTextClass } from "@/lib/incomeExpenseTheme";
import { getTransactionRowId } from "@/lib/transactionRowId";
import { useDebouncedSearch } from "@/lib/useDebouncedSearch";
import { useTransactionModal } from "@/components/TransactionModalProvider";
import {
  btnPrimary,
  btnSecondary,
  fieldLabelText,
  inputClass,
  modalBackdropHigh,
} from "@/lib/ui";

const PAGE_SIZE = 80;

type Props = {
  open: boolean;
  onClose: () => void;
  sheet: string;
  accountName: string;
  balance: number;
  /** Called after a successful rename so the parent can update the open account key. */
  onRenamed?: (newName: string) => void;
};

export function AccountDrillModal({
  open,
  onClose,
  sheet,
  accountName,
  balance,
  onRenamed,
}: Props) {
  const bumpRefresh = useBumpAccountBalancesRefresh();
  const { openTxEdit } = useTransactionModal();
  const isColVisible = useDashboardColumnVisible();
  const valueVisibilityFilters = useValueVisibilityFilters();
  const drillVisibilityFilters = useMemo(
    () => valueVisibilityFiltersForAccountDrill(valueVisibilityFilters),
    [valueVisibilityFilters],
  );
  const currencySettings = useCurrencySettings();
  const currencyConversion = useMemo(
    () => buildCurrencyConversionPayload(currencySettings),
    [currencySettings],
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [sortCol, setSortCol] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [columnKindByName, setColumnKindByName] = useState<
    Record<string, string>
  >({});
  const nextPageRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const requestGenRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { input: searchInput, setInput: setSearchInput, debounced: searchDebounced } =
    useDebouncedSearch([open, sheet, accountName]);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameErr, setRenameErr] = useState<string | null>(null);

  const accountFilters = useMemo((): AnalyzeBody["filters"] => {
    return [{ column: "Accounts", op: "eq", value: accountName }];
  }, [accountName]);

  const visibleColumns = useMemo(
    () =>
      columns.filter(
        (c) => isColVisible(c) && !isColumnExcludedFromDataPreview(c),
      ),
    [columns, isColVisible],
  );

  const displayRows = useMemo(
    () => filterDataPreviewRows(rows),
    [rows],
  );

  const periodColumnForGrouping = useMemo(
    () => resolvePeriodColumnNameFromKinds(columns, columnKindByName),
    [columns, columnKindByName],
  );

  const activeSortCol = useMemo(
    () =>
      columns.length > 0 && columns.includes(sortCol) && sortCol
        ? sortCol
        : (columns[0] ?? ""),
    [columns, sortCol],
  );

  const buildPayload = useCallback(
    (page: number): AnalyzeBody => {
      const sort =
        activeSortCol && columns.includes(activeSortCol)
          ? { column: activeSortCol, direction: sortDir }
          : undefined;
      const q = searchDebounced.trim();
      return {
        sheet,
        filters: [...accountFilters, ...drillVisibilityFilters],
        search_all: q.length > 0 ? q : undefined,
        sort,
        page,
        page_size: PAGE_SIZE,
        currency_conversion: currencyConversion ?? undefined,
      };
    },
    [
      sheet,
      accountFilters,
      drillVisibilityFilters,
      activeSortCol,
      sortDir,
      columns,
      searchDebounced,
      currencyConversion,
    ],
  );

  const loadInitial = useCallback(async () => {
    if (!open || !sheet) return;
    requestGenRef.current += 1;
    const gen = requestGenRef.current;
    setLoading(true);
    setError(null);
    setRows([]);
    nextPageRef.current = 0;
    loadingMoreRef.current = false;
    try {
      const { columns: metas } = await getColumns(sheet);
      if (gen !== requestGenRef.current) return;
      const kinds: Record<string, string> = {};
      for (const m of metas) kinds[m.name] = m.kind;
      setColumnKindByName(kinds);
      const periodMeta = metas.find((m) => m.name === "Period");
      const dtFirst = metas.find((m) => m.kind === "datetime");
      let sc = "";
      let sd: "asc" | "desc" = "asc";
      if (periodMeta) {
        sc = "Period";
        sd = "desc";
      } else if (dtFirst) {
        sc = dtFirst.name;
        sd = "desc";
      } else if (metas[0]) {
        sc = metas[0].name;
        sd = "asc";
      }
      setSortCol(sc);
      setSortDir(sd);
      const q = searchDebounced.trim();
      const res = await analyze({
        sheet,
        filters: [...accountFilters, ...drillVisibilityFilters],
        search_all: q.length > 0 ? q : undefined,
        sort: sc ? { column: sc, direction: sd } : undefined,
        page: 0,
        page_size: PAGE_SIZE,
        currency_conversion: currencyConversion ?? undefined,
      });
      if (gen !== requestGenRef.current) return;
      setColumns(res.columns);
      setTotalFiltered(res.total_filtered_rows);
      setRows(res.rows);
      nextPageRef.current =
        res.rows.length < res.total_filtered_rows ? 1 : 0;
    } catch (e) {
      if (gen !== requestGenRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load");
      setColumns([]);
      setRows([]);
      setTotalFiltered(0);
    } finally {
      if (gen === requestGenRef.current) setLoading(false);
    }
  }, [
    open,
    sheet,
    accountFilters,
    drillVisibilityFilters,
    searchDebounced,
    currencyConversion,
  ]);

  const loadMore = useCallback(async () => {
    if (!open || !sheet) return;
    const page = nextPageRef.current;
    if (page === 0 || loadingMoreRef.current) return;
    const gen = requestGenRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await analyze(buildPayload(page));
      if (gen !== requestGenRef.current) return;
      setRows((prev) => {
        const merged = [...prev, ...res.rows];
        nextPageRef.current =
          merged.length < res.total_filtered_rows ? page + 1 : 0;
        return merged;
      });
      setTotalFiltered(res.total_filtered_rows);
    } catch (e) {
      if (gen !== requestGenRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      if (gen === requestGenRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [open, sheet, buildPayload]);

  useEffect(() => {
    if (!open) {
      setRows([]);
      setColumns([]);
      setTotalFiltered(0);
      setError(null);
      setSortCol("");
      setColumnKindByName({});
      nextPageRef.current = 0;
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void loadInitial();
  }, [open, sheet, accountName, loadInitial]);

  useEffect(() => {
    if (!open) return;
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { root, rootMargin: "120px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [open, loadMore, rows.length]);

  const handleHeaderSort = useCallback(
    (column: string) => {
      if (loading || !columns.includes(column)) return;
      const same = activeSortCol === column;
      const nextDir = same
        ? sortDir === "asc"
          ? "desc"
          : "asc"
        : columnKindByName[column] === "datetime"
          ? "desc"
          : "asc";
      requestGenRef.current += 1;
      const gen = requestGenRef.current;
      setSortCol(column);
      setSortDir(nextDir);
      setLoading(true);
      setError(null);
      setRows([]);
      nextPageRef.current = 0;
      loadingMoreRef.current = false;
      (async () => {
        try {
          const q = searchDebounced.trim();
          const res = await analyze({
            sheet,
            filters: [...accountFilters, ...drillVisibilityFilters],
            search_all: q.length > 0 ? q : undefined,
            sort: { column, direction: nextDir },
            page: 0,
            page_size: PAGE_SIZE,
            currency_conversion: currencyConversion ?? undefined,
          });
          if (gen !== requestGenRef.current) return;
          setColumns(res.columns);
          setTotalFiltered(res.total_filtered_rows);
          setRows(res.rows);
          nextPageRef.current =
            res.rows.length < res.total_filtered_rows ? 1 : 0;
        } catch (e) {
          if (gen !== requestGenRef.current) return;
          setError(e instanceof Error ? e.message : "Sort failed");
        } finally {
          if (gen === requestGenRef.current) setLoading(false);
        }
      })();
    },
    [
      loading,
      columns,
      activeSortCol,
      sortDir,
      sheet,
      accountFilters,
      drillVisibilityFilters,
      columnKindByName,
      searchDebounced,
      currencyConversion,
    ],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      if (renameOpen) {
        ev.preventDefault();
        setRenameOpen(false);
        setRenameErr(null);
        setRenameDraft(accountName);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, renameOpen, accountName]);

  useEffect(() => {
    if (!open) {
      setRenameOpen(false);
      setRenameErr(null);
      return;
    }
    setRenameDraft(accountName);
    setRenameOpen(false);
    setRenameErr(null);
  }, [open, accountName]);

  const commitRename = useCallback(async () => {
    const oldLabel = accountName;
    const newLabel = renameDraft.trim();
    if (!newLabel) {
      setRenameErr("Name is required");
      return;
    }
    if (newLabel === oldLabel) {
      setRenameOpen(false);
      setRenameErr(null);
      return;
    }
    setRenameBusy(true);
    setRenameErr(null);
    try {
      await renameBudgetAccountLabel(oldLabel, newLabel);
      applyAccountLabelRenameEverywhere(oldLabel, newLabel);
      bumpRefresh();
      onRenamed?.(newLabel);
      setRenameOpen(false);
    } catch (e) {
      setRenameErr(
        e instanceof Error ? e.message : "Could not rename account",
      );
    } finally {
      setRenameBusy(false);
    }
  }, [accountName, renameDraft, bumpRefresh, onRenamed]);

  const labelAccount =
    accountName === "" ? "(empty)" : accountName;
  const balFmt = formatMainCurrencyTotal(balance, currencySettings);
  const balClass =
    balance >= 0
      ? incomeFlowTextClass
      : "text-rose-700 dark:text-rose-400";

  if (!open) return null;

  return (
    <div
      className={modalBackdropHigh}
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-drill-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-[min(90vh,800px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="min-w-0 flex-1">
            <h2
              id="account-drill-modal-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              {labelAccount}
            </h2>
            <p className={`mt-1 text-base font-semibold tabular-nums ${balClass}`}>
              {balFmt}
            </p>
            {!renameOpen ? (
              <button
                type="button"
                className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                onClick={() => {
                  setRenameErr(null);
                  setRenameDraft(accountName);
                  setRenameOpen(true);
                }}
              >
                Rename account
              </button>
            ) : (
              <div className="mt-3 max-w-md">
                <label
                  className={`flex flex-col gap-1 ${fieldLabelText}`}
                  htmlFor="account-drill-rename-input"
                >
                  Account name
                  <input
                    id="account-drill-rename-input"
                    type="text"
                    className={inputClass}
                    value={renameDraft}
                    disabled={renameBusy}
                    autoComplete="off"
                    aria-label="New account name"
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitRename();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setRenameOpen(false);
                        setRenameErr(null);
                        setRenameDraft(accountName);
                      }
                    }}
                    placeholder={accountName === "" ? "(empty)" : undefined}
                  />
                </label>
                {renameErr ? (
                  <p
                    className="mt-2 text-sm text-red-600 dark:text-red-400"
                    role="alert"
                  >
                    {renameErr}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={renameBusy}
                    onClick={() => void commitRename()}
                  >
                    {renameBusy ? "Saving…" : "Save name"}
                  </button>
                  <button
                    type="button"
                    className={btnSecondary}
                    disabled={renameBusy}
                    onClick={() => {
                      setRenameOpen(false);
                      setRenameErr(null);
                      setRenameDraft(accountName);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Close
          </button>
        </div>

        <div className="shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <label
            htmlFor="account-drill-search-all"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Search all columns
          </label>
          <div className="mt-2">
            <input
              id="account-drill-search-all"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              className={`min-w-[min(100%,18rem)] w-full ${inputClass}`}
              placeholder="Type to search every column…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-auto px-4 py-3"
        >
          {loading && (
            <p className="text-sm text-zinc-800 dark:text-zinc-200">Loading transactions…</p>
          )}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && displayRows.length === 0 && (
            <p className="text-sm text-zinc-800 dark:text-zinc-200">No rows for this account.</p>
          )}
          {!loading && !error && displayRows.length > 0 && (
            <>
              {periodColumnForGrouping ? (
                <div className="px-0">
                  <AccountDrillMonthGrouped
                    drillKey={accountName}
                    rows={displayRows}
                    columns={columns}
                    periodColumn={periodColumnForGrouping}
                    onRowClick={(row) => {
                      onClose();
                      openTxEdit(row);
                    }}
                  />
                </div>
              ) : (
              <table className="w-full min-w-[32rem] table-fixed border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/95 dark:text-zinc-400">
                  <tr>
                    {visibleColumns.map((c) => {
                      const active = activeSortCol === c;
                      const ariaSort = active
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none";
                      return (
                        <th
                          key={c}
                          className="min-w-0 px-2 py-2 align-top font-medium"
                          aria-sort={ariaSort}
                        >
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleHeaderSort(c)}
                            className="flex w-full min-w-0 items-start gap-1 rounded-md px-1 py-1 text-left hover:bg-zinc-200/90 dark:hover:bg-zinc-800/90"
                            title={
                              active
                                ? sortDir === "asc"
                                  ? "Sorted ascending — click for descending"
                                  : "Sorted descending — click for ascending"
                                : "Sort by this column"
                            }
                          >
                            <span className="min-w-0 flex-1 break-words normal-case">
                              {c}
                            </span>
                            <span
                              className="inline-flex shrink-0 flex-col leading-none text-[10px]"
                              aria-hidden
                            >
                              <span
                                className={
                                  active && sortDir === "asc"
                                    ? "text-indigo-600 dark:text-indigo-400"
                                    : "text-zinc-300 dark:text-zinc-600"
                                }
                              >
                                ▲
                              </span>
                              <span
                                className={
                                  active && sortDir === "desc"
                                    ? "text-indigo-600 dark:text-indigo-400"
                                    : "text-zinc-300 dark:text-zinc-600"
                                }
                              >
                                ▼
                              </span>
                            </span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, i) => {
                    const txRowId = getTransactionRowId(row);
                    const rowOpensEdit = txRowId != null;
                    return (
                    <tr
                      key={row.id != null ? String(row.id) : i}
                      title={rowOpensEdit ? "Click to edit" : undefined}
                      onClick={
                        rowOpensEdit
                          ? () => {
                              onClose();
                              openTxEdit(row);
                            }
                          : undefined
                      }
                      className={[
                        "border-t border-zinc-100 odd:bg-white even:bg-zinc-50/80 dark:border-zinc-800 dark:odd:bg-zinc-950 dark:even:bg-zinc-900/40",
                        rowOpensEdit
                          ? "cursor-pointer hover:bg-zinc-100/90 dark:hover:bg-zinc-800/50"
                          : "",
                      ].join(" ")}
                    >
                      {visibleColumns.map((c) => (
                        <td
                          key={c}
                          className={[
                            "min-w-0 break-words px-2 py-2 align-top text-xs [overflow-wrap:anywhere]",
                            transactionCellToneClass(row, c),
                          ].join(" ")}
                        >
                          {renderTransferFlowAwareCell(row, c)}
                        </td>
                      ))}
                    </tr>
                  );
                  })}
                </tbody>
              </table>
              )}
              {rows.length > 0 && rows.length < totalFiltered && (
                <div
                  ref={sentinelRef}
                  className="flex min-h-14 items-center justify-center border-t border-zinc-100 text-xs text-zinc-700 dark:border-zinc-300 dark:border-zinc-800"
                >
                  {loadingMore
                    ? "Loading more rows…"
                    : "Scroll for more rows"}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
