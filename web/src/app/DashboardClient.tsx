"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  analyze,
  getColumns,
  getWorkbook,
  type AnalyzeBody,
  type AnalyzeResponse,
  type ColumnMeta,
  uploadXlsx,
} from "@/lib/api";
import { FloatingAddButton } from "@/components/FloatingAddButton";
import {
  TRANSACTIONS_CHANGED_EVENT,
  useTransactionModal,
} from "@/components/TransactionModalProvider";
import { useAccountExplore } from "@/lib/accountExploreContext";
import { useWorkbookActiveSheet } from "@/lib/workbookActiveSheetContext";
import {
  isColumnExcludedFromDataPreview,
  useDashboardColumnVisible,
} from "@/lib/columnVisibility";
import { localToTimestamp } from "@/lib/datetimeLocal";
import { parseFormNumber } from "@/lib/parseFormNumber";
import { CalendarMonthTransactionsGrouped } from "@/components/CalendarMonthTransactionsGrouped";
import { resolvePeriodColumnName } from "@/lib/periodColumn";
import { filterDataPreviewRows } from "@/lib/transferRowAccounts";
import { renderTransferFlowAwareCell } from "@/lib/transferPreviewCells";
import { incomeHeadlineTextClass } from "@/lib/incomeExpenseTheme";
import {
  transactionCellToneClass,
  transferMoneyTextClass,
} from "@/lib/transactionRowTone";
import {
  useValueVisibilityFilters,
  valueVisibilityFiltersForAccountDrill,
} from "@/lib/valueInstanceVisibility";
import { SEARCH_DEBOUNCE_MS } from "@/lib/useDebouncedSearch";
import {
  buildCurrencyConversionPayload,
  formatMainCurrencyTotal,
  useCurrencySettings,
} from "@/lib/currencySettings";
import {
  btnCompactEmerald,
  btnCompactIndigoOutline,
  btnPrimary,
  fileInputClass,
  inputClass,
  sectionCard,
} from "@/lib/ui";

export type DashboardClientProps = {
  /** Always applied after user filters (AND). Use for scoped views (e.g. one currency). */
  lockedFilters?: AnalyzeBody["filters"];
  pageTitle?: string;
  /** Replaces the default subtitle under the title. */
  pageSubtitle?: string;
  hideUpload?: boolean;
};

const NO_LOCKED_FILTERS: AnalyzeBody["filters"] = [];

/** Rows per request for the data table (infinite scroll loads more). */
const TABLE_PAGE_SIZE = 80;

type FilterState = {
  dates: Record<string, { start: string; end: string }>;
  picks: Record<string, string[]>;
  numbers: Record<string, { min: string; max: string }>;
  /** Search text applied across all columns (server-side). */
  searchAll: string;
};

function emptyFilterState(): FilterState {
  return { dates: {}, picks: {}, numbers: {}, searchAll: "" };
}

function buildApiFilters(f: FilterState): AnalyzeBody["filters"] {
  const out: AnalyzeBody["filters"] = [];
  for (const col of Object.keys(f.dates)) {
    const r = f.dates[col];
    if (r?.start)
      out.push({ column: col, op: "gte", value: localToTimestamp(r.start) });
    if (r?.end)
      out.push({ column: col, op: "lte", value: localToTimestamp(r.end) });
  }
  for (const col of Object.keys(f.picks)) {
    const vals = f.picks[col];
    if (vals?.length) out.push({ column: col, op: "in", value: vals });
  }
  for (const col of Object.keys(f.numbers)) {
    const r = f.numbers[col];
    if (r?.min !== undefined && r.min !== "") {
      const n = parseFormNumber(r.min);
      if (n != null) out.push({ column: col, op: "gte", value: n });
    }
    if (r?.max !== undefined && r.max !== "") {
      const n = parseFormNumber(r.max);
      if (n != null) out.push({ column: col, op: "lte", value: n });
    }
  }
  return out;
}

function cloneFilterState(f: FilterState): FilterState {
  return JSON.parse(JSON.stringify(f)) as FilterState;
}

export default function DashboardClient({
  lockedFilters = NO_LOCKED_FILTERS,
  pageTitle = "",
  pageSubtitle,
  hideUpload = false,
}: DashboardClientProps = {}) {
  const isDashboardVisibleColumn = useDashboardColumnVisible();
  const valueVisibilityFilters = useValueVisibilityFilters();
  const accountExplore = useAccountExplore();
  const { setActiveSheet } = useWorkbookActiveSheet();
  const accountDrillFilters = useMemo((): AnalyzeBody["filters"] => {
    const d = accountExplore?.accountDrillDown;
    if (d == null) return [];
    return [{ column: "Accounts", op: "eq", value: d }];
  }, [accountExplore?.accountDrillDown]);

  /** When drilling an account from the balance sidebar, still show Corrections even if hidden from pies. */
  const visibilityFiltersForAnalyze = useMemo(() => {
    if (accountExplore?.accountDrillDown != null) {
      return valueVisibilityFiltersForAccountDrill(valueVisibilityFilters);
    }
    return valueVisibilityFilters;
  }, [accountExplore?.accountDrillDown, valueVisibilityFilters]);

  useEffect(() => {
    const d = accountExplore?.accountDrillDown;
    if (d == null) return;
    setFilterDraft((prev) => ({
      ...prev,
      picks: { ...prev.picks, Accounts: [] },
    }));
    const c = committedRef.current;
    committedRef.current = {
      ...c,
      picks: { ...c.picks, Accounts: [] },
    };
  }, [accountExplore?.accountDrillDown]);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState<string>("");
  /** Resolved default sheet from PostgreSQL (used for API paths only). */
  const [sheet, setSheet] = useState<string>("");

  useEffect(() => {
    if (sheet) setActiveSheet(sheet);
  }, [sheet, setActiveSheet]);

  const [workbookSheets, setWorkbookSheets] = useState<
    { name: string; rows: number }[]
  >([]);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [filterDraft, setFilterDraft] = useState<FilterState>(emptyFilterState());
  const committedRef = useRef<FilterState>(emptyFilterState());
  const searchDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [sortCol, setSortCol] = useState<string>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  /** Accumulated table rows (server pages appended as user scrolls). */
  const [tableRows, setTableRows] = useState<Record<string, unknown>[]>([]);
  /** Narrow analyze results by Income/Expense flow (expense / income / transfers are disjoint). */
  const [dataPreviewKind, setDataPreviewKind] = useState<
    "all" | "expense" | "income" | "transfer"
  >("all");
  const [tableLoadingMore, setTableLoadingMore] = useState(false);
  /** Next page index to fetch for infinite scroll (0 = nothing more to load). */
  const nextTablePageRef = useRef(0);
  const tableRequestGenRef = useRef(0);
  const tableLoadingMoreRef = useRef(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const tableSentinelRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { txModalOpen, openTxCreate, openTxEdit } = useTransactionModal();
  const currencySettings = useCurrencySettings();
  const fmtMain = useCallback(
    (n: number | null | undefined) => formatMainCurrencyTotal(n, currencySettings),
    [currencySettings],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const w = await getWorkbook();
        if (cancelled) return;
        setPath(w.path);
        setWorkbookSheets(w.sheets ?? []);
        const first = w.sheets[0];
        setSheet((prev) => prev || first?.name || "");
        setRowCount(first?.rows ?? null);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error
              ? e.message
              : "Could not reach the Python API on port 8000. Start the FastAPI server first.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sheet) return;
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
      searchDebounceTimerRef.current = null;
    }
    const empty = emptyFilterState();
    setFilterDraft(empty);
    committedRef.current = empty;
    setDataPreviewKind("all");
  }, [sheet]);

  const dataPreviewExtraFilters = useMemo((): AnalyzeBody["filters"] => {
    if (dataPreviewKind === "all") return [];
    if (!columns.some((c) => c.name === "Income/Expense")) return [];
    /**
     * Backend `ie_segment`: expense-like / income / transfer-in|out (same string rules as row tone).
     */
    if (dataPreviewKind === "expense") {
      return [
        { column: "Income/Expense", op: "ie_segment", value: "expense" },
      ];
    }
    if (dataPreviewKind === "income") {
      return [{ column: "Income/Expense", op: "ie_segment", value: "income" }];
    }
    return [{ column: "Income/Expense", op: "ie_segment", value: "transfer" }];
  }, [dataPreviewKind, columns]);

  const previewColumns = useMemo(() => {
    if (!result?.columns) return [];
    return result.columns.filter(
      (c) =>
        isDashboardVisibleColumn(c) && !isColumnExcludedFromDataPreview(c),
    );
  }, [result, isDashboardVisibleColumn]);

  const previewTableRows = useMemo(
    () => filterDataPreviewRows(tableRows),
    [tableRows],
  );

  const dataPreviewGroupedByDate = pageTitle !== "Summary";
  const previewPeriodColumn = useMemo(
    () => resolvePeriodColumnName(result?.columns ?? [], columns),
    [result?.columns, columns],
  );

  const buildAnalyzePayload = useCallback(
    (page: number, pageSize: number): AnalyzeBody => {
      const committed = committedRef.current;
      const q = (committed.searchAll ?? "").trim();
      const cc = buildCurrencyConversionPayload(currencySettings);
      return {
        sheet: sheet || undefined,
        filters: [
          ...buildApiFilters(committed),
          ...lockedFilters,
          ...accountDrillFilters,
          ...visibilityFiltersForAnalyze,
          ...dataPreviewExtraFilters,
        ],
        search_all: q.length > 0 ? q : undefined,
        sort: sortCol ? { column: sortCol, direction: sortDir } : undefined,
        page,
        page_size: pageSize,
        currency_conversion: cc ?? undefined,
      };
    },
    [
      sheet,
      sortCol,
      sortDir,
      lockedFilters,
      accountDrillFilters,
      visibilityFiltersForAnalyze,
      dataPreviewExtraFilters,
      currencySettings,
    ],
  );

  const load = useCallback(async () => {
    if (!sheet) return;
    tableRequestGenRef.current += 1;
    const gen = tableRequestGenRef.current;
    nextTablePageRef.current = 0;
    setError(null);
    setTableLoadingMore(false);
    tableLoadingMoreRef.current = false;
    try {
      const payload = buildAnalyzePayload(0, TABLE_PAGE_SIZE);
      const res = await analyze(payload);
      if (gen !== tableRequestGenRef.current) return;
      setResult(res);
      setTableRows(res.rows);
      nextTablePageRef.current =
        res.rows.length < res.total_filtered_rows ? 1 : 0;
    } catch (e) {
      if (gen !== tableRequestGenRef.current) return;
      setError(e instanceof Error ? e.message : "Analyze failed");
    }
  }, [sheet, buildAnalyzePayload]);

  const loadMoreTable = useCallback(async () => {
    if (!sheet) return;
    const page = nextTablePageRef.current;
    if (page === 0 || tableLoadingMoreRef.current) return;
    const gen = tableRequestGenRef.current;
    tableLoadingMoreRef.current = true;
    setTableLoadingMore(true);
    try {
      const payload = buildAnalyzePayload(page, TABLE_PAGE_SIZE);
      const res = await analyze(payload);
      if (gen !== tableRequestGenRef.current) return;
      setResult(res);
      setTableRows((prev) => {
        const merged = [...prev, ...res.rows];
        nextTablePageRef.current =
          merged.length < res.total_filtered_rows ? page + 1 : 0;
        return merged;
      });
    } catch (e) {
      if (gen !== tableRequestGenRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load more rows");
    } finally {
      if (gen === tableRequestGenRef.current) {
        tableLoadingMoreRef.current = false;
        setTableLoadingMore(false);
      }
    }
  }, [sheet, buildAnalyzePayload]);

  useEffect(() => {
    const root = tableScrollRef.current;
    const sentinel = tableSentinelRef.current;
    if (!root || !sentinel) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        void loadMoreTable();
      },
      { root, rootMargin: "200px", threshold: 0 },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [loadMoreTable, result?.total_filtered_rows, tableRows.length]);

  /**
   * If the preview table is shorter than its scroll area (no scrollbar), the
   * intersection sentinel may never fire — keep loading pages until we scroll or
   * have all rows.
   */
  useEffect(() => {
    if (!result || !sheet) return;
    if (tableRows.length === 0) return;
    if (tableRows.length >= result.total_filtered_rows) return;
    if (tableLoadingMoreRef.current) return;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      if (tableLoadingMoreRef.current) return;
      const root = tableScrollRef.current;
      if (!root) return;
      if (tableRows.length >= result.total_filtered_rows) return;
      if (root.scrollHeight > root.clientHeight + 12) return;
      void loadMoreTable();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [result?.total_filtered_rows, sheet, tableRows.length, loadMoreTable]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const onChanged = () => {
      void loadRef.current?.();
    };
    window.addEventListener(TRANSACTIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(TRANSACTIONS_CHANGED_EVENT, onChanged);
  }, []);

  useEffect(() => {
    if (loading || !sheet) return;
    void load();
  }, [loading, sheet, load]);

  useEffect(() => {
    if (!sheet) return;
    let cancelled = false;
    (async () => {
      try {
        const c = await getColumns(sheet);
        if (cancelled) return;
        setColumns(c.columns);
        const numsVisible = c.columns.filter(
          (x) => x.kind === "number" && isDashboardVisibleColumn(x.name),
        );
        const dtsVisible = c.columns.filter(
          (x) => x.kind === "datetime" && isDashboardVisibleColumn(x.name),
        );
        const defaultSortCol =
          dtsVisible.find((x) => x.name === "Period")?.name ??
          dtsVisible[0]?.name ??
          numsVisible[0]?.name ??
          "";
        setSortCol(defaultSortCol);
        setSortDir("desc");
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load columns");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when sheet changes; visibility handled below
  }, [sheet]);

  useEffect(() => {
    if (sortCol && !isDashboardVisibleColumn(sortCol)) {
      const dts = columns.filter(
        (c) => c.kind === "datetime" && isDashboardVisibleColumn(c.name),
      );
      const fallback =
        dts.find((c) => c.name === "Period")?.name ??
        dts[0]?.name ??
        columns.filter(
          (c) => c.kind === "number" && isDashboardVisibleColumn(c.name),
        )[0]?.name ??
        "";
      setSortCol(fallback);
      setSortDir("desc");
    }
  }, [columns, sortCol, isDashboardVisibleColumn]);

  const applyFilters = () => {
    committedRef.current = cloneFilterState(filterDraft);
    void load();
  };

  const onSearchAllChange = (value: string) => {
    setFilterDraft((d) => ({ ...d, searchAll: value }));
    if (SEARCH_DEBOUNCE_MS <= 0) {
      committedRef.current = { ...committedRef.current, searchAll: value };
      void load();
      return;
    }
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
      searchDebounceTimerRef.current = null;
    }
    searchDebounceTimerRef.current = setTimeout(() => {
      searchDebounceTimerRef.current = null;
      committedRef.current = { ...committedRef.current, searchAll: value };
      void load();
    }, SEARCH_DEBOUNCE_MS);
  };

  const onPreviewColumnSort = (column: string) => {
    if (sortCol === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(column);
      const meta = columns.find((c) => c.name === column);
      setSortDir(meta?.kind === "datetime" ? "desc" : "asc");
    }
  };

  const performSpreadsheetUpload = async () => {
    if (!pendingUploadFile) return;
    setUploading(true);
    setError(null);
    try {
      await uploadXlsx(pendingUploadFile);
      const w = await getWorkbook();
      setPath(w.path);
      setWorkbookSheets(w.sheets ?? []);
      const next = w.sheets[0]?.name ?? "";
      setSheet(next);
      setRowCount(w.sheets[0]?.rows ?? null);
      setPendingUploadFile(null);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const getPreviewRowTransactionId = (
    row: Record<string, unknown>,
  ): number | null => {
    const rawId = row.id;
    const numId =
      typeof rawId === "number"
        ? rawId
        : typeof rawId === "string"
          ? parseInt(rawId, 10)
          : NaN;
    return Number.isFinite(numId) ? numId : null;
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-zinc-800 dark:text-zinc-200">
        Loading workbook…
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-full flex-col gap-8 px-4 pb-28 py-8 sm:px-6">
      <header className="flex flex-col gap-2 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {pageTitle}
          </h1>
        </div>
        {pageSubtitle != null && pageSubtitle !== "" && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{pageSubtitle}</p>
        )}
      </header>

      {accountExplore != null &&
        accountExplore.accountDrillDown != null && (
        <section
          className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50/90 px-4 py-3 text-sm text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-100 sm:flex-row sm:items-center sm:justify-between"
          aria-live="polite"
        >
          <p>
            <span className="font-medium">Account:</span>{" "}
            {accountExplore.accountDrillDown === ""
              ? "(empty)"
              : accountExplore.accountDrillDown}
            <span className="text-indigo-700/90 dark:text-indigo-300">
              {" "}
              — the table below shows only rows for this account.
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnCompactEmerald}
              onClick={() => openTxCreate()}
            >
              Add transaction for this account
            </button>
            <button
              type="button"
              className={btnCompactIndigoOutline}
              onClick={() => accountExplore.setAccountDrillDown(null)}
            >
              Clear account filter
            </button>
          </div>
        </section>
      )}

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </div>
      )}

      <section className={sectionCard}>
        <label
          htmlFor="global-search-all"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Search all columns
        </label>
        <div className="mt-3">
          <input
            id="global-search-all"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            className={`min-w-[min(100%,20rem)] w-full ${inputClass}`}
            placeholder="Type to search every column…"
            value={filterDraft.searchAll}
            onChange={(e) => onSearchAllChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilters();
            }}
          />
        </div>
      </section>

      {!hideUpload && (
        <section className={sectionCard}>
          <div className="flex flex-col gap-3 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Upload spreadsheet
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={uploadInputRef}
                type="file"
                accept=".xlsx,.xlsm"
                className={fileInputClass}
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setPendingUploadFile(f);
                }}
              />
              <button
                type="button"
                className={`${btnPrimary} disabled:cursor-not-allowed`}
                disabled={!pendingUploadFile || uploading}
                onClick={() => void performSpreadsheetUpload()}
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        </section>
      )}

      {result && (
        <>
          <section className={sectionCard}>
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Budget totals
            </h2>
            {result.budget_totals.available ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <BudgetTotalCard
                  label="Income"
                  value={result.budget_totals.total_income}
                  className={incomeHeadlineTextClass}
                  formatMoney={fmtMain}
                />
                <BudgetTotalCard
                  label="Expenses"
                  value={result.budget_totals.total_expense}
                  className="text-rose-600 dark:text-rose-400"
                  formatMoney={fmtMain}
                />
                <BudgetTransfersCard
                  transferIn={result.budget_totals.total_transfer_in}
                  transferOut={result.budget_totals.total_transfer_out}
                  formatMoney={fmtMain}
                />
                <BudgetTotalCard
                  label="Net (income − expenses)"
                  value={result.budget_totals.net_income_minus_expense}
                  className={
                    (result.budget_totals.net_income_minus_expense ?? 0) >= 0
                      ? "text-zinc-900 dark:text-zinc-100"
                      : "text-rose-600 dark:text-rose-400"
                  }
                  formatMoney={fmtMain}
                />
              </div>
            ) : null}
          </section>
        </>
      )}

      {result && (
        <section className="w-full min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
                  Data preview
                </h2>
                {result.columns?.includes("id") && (
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Click a row to edit.
                  </p>
                )}
              </div>
              {columns.some((c) => c.name === "Income/Expense") && (
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="group"
                  aria-label="Filter by flow: all, expenses, incomes, or transfers"
                >
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Show
                  </span>
                  {(
                    [
                      ["all", "All"],
                      ["expense", "Expenses"],
                      ["income", "Incomes"],
                      ["transfer", "Transfers"],
                    ] as const
                  ).map(([key, label]) => {
                    const selected = dataPreviewKind === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDataPreviewKind(key)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                          selected
                            ? "border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-600"
                            : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div
            ref={tableScrollRef}
            className="max-h-[min(70vh,720px)] w-full min-w-0 overflow-y-auto overflow-x-hidden"
          >
            {dataPreviewGroupedByDate &&
            previewPeriodColumn &&
            result?.columns ? (
              <div className="px-3 pb-3 pt-1">
                {previewTableRows.length === 0 ? (
                  <p className="px-1 py-8 text-center text-sm text-zinc-800 dark:text-zinc-200">
                    No rows match the current filters.
                  </p>
                ) : (
                  <CalendarMonthTransactionsGrouped
                    rows={previewTableRows}
                    columns={result.columns}
                    periodColumn={previewPeriodColumn}
                    monthScope={null}
                    onRowClick={openTxEdit}
                  />
                )}
              </div>
            ) : (
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/80 dark:text-zinc-400">
                <tr>
                  {previewColumns.map((c) => {
                    const active = sortCol === c;
                    const ariaSort = active
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none";
                    return (
                      <th
                        key={c}
                        className="min-w-0 px-1 py-1 align-top font-medium"
                        aria-sort={ariaSort}
                      >
                        <button
                          type="button"
                          onClick={() => onPreviewColumnSort(c)}
                          className="flex w-full min-w-0 items-start gap-1 rounded-md px-2 py-1.5 text-left hover:bg-zinc-200/90 dark:hover:bg-zinc-800/90"
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
                            className="inline-flex shrink-0 flex-col items-center leading-none text-[11px]"
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
                {previewTableRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(1, previewColumns.length)}
                      className="px-3 py-8 text-center text-sm text-zinc-800 dark:text-zinc-200"
                    >
                      No rows match the current filters.
                    </td>
                  </tr>
                ) : (
                  previewTableRows.map((row, i) => {
                    const txRowId = getPreviewRowTransactionId(row);
                    const rowOpensEdit = txRowId != null;
                    return (
                      <tr
                        key={row.id != null ? String(row.id) : i}
                        title={rowOpensEdit ? "Click to edit" : undefined}
                        onClick={
                          rowOpensEdit
                            ? () => openTxEdit(row)
                            : undefined
                        }
                        className={[
                          "border-t border-zinc-100 odd:bg-white even:bg-zinc-50/80 dark:border-zinc-800 dark:odd:bg-zinc-950 dark:even:bg-zinc-900/40",
                          rowOpensEdit
                            ? "cursor-pointer hover:bg-zinc-100/90 dark:hover:bg-zinc-800/50"
                            : "",
                        ].join(" ")}
                      >
                        {previewColumns.map((c) => (
                          <td
                            key={c}
                            className={[
                              "min-w-0 break-words px-2 py-2 align-top [overflow-wrap:anywhere]",
                              transactionCellToneClass(row, c),
                            ].join(" ")}
                          >
                            {renderTransferFlowAwareCell(row, c)}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            )}
            {tableRows.length > 0 &&
              tableRows.length < result.total_filtered_rows && (
                <div
                  ref={tableSentinelRef}
                  className="flex min-h-14 items-center justify-center border-t border-zinc-100 text-xs text-zinc-700 dark:border-zinc-300 dark:border-zinc-800"
                >
                  {tableLoadingMore
                    ? "Loading more rows…"
                    : "Scroll for more rows"}
                </div>
              )}
          </div>
        </section>
      )}

      <FloatingAddButton
        hidden={txModalOpen}
        onClick={() => openTxCreate()}
        ariaLabel="Add transaction"
      />
    </div>
  );
}

function BudgetTotalCard({
  label,
  value,
  className,
  formatMoney,
}: {
  label: string;
  value: number | null;
  className: string;
  formatMoney: (n: number | null | undefined) => string;
}) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${className}`}>
        {formatMoney(value)}
      </p>
    </div>
  );
}

function BudgetTransfersCard({
  transferIn,
  transferOut,
  formatMoney,
}: {
  transferIn: number | null;
  transferOut: number | null;
  formatMoney: (n: number | null | undefined) => string;
}) {
  const tone = transferMoneyTextClass;
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Transfers
      </p>
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-sm tabular-nums">
          <span className="inline-flex items-center gap-1.5 text-zinc-500">
            <span
              className={`text-base font-medium ${tone}`}
              aria-hidden
            >
              ←
            </span>
            In
          </span>
          <span className={`font-semibold ${tone}`}>{formatMoney(transferIn)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm tabular-nums">
          <span className="inline-flex items-center gap-1.5 text-zinc-500">
            <span
              className={`text-base font-medium ${tone}`}
              aria-hidden
            >
              →
            </span>
            Out
          </span>
          <span className={`font-semibold ${tone}`}>{formatMoney(transferOut)}</span>
        </div>
      </div>
    </div>
  );
}
