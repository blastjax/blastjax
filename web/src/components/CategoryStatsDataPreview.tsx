"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import {
  type AnalyzeBody,
  type CurrencyConversionPayload,
  getCalendarMonthTransactions,
  getCalendarYearTransactions,
  getCategoryCatalog,
  updateCategoryCatalog,
  type CategoryCatalogEntry,
  type CalendarCategoryBreakdownSlice,
} from "@/lib/api";
import { dispatchCategoryCatalogChanged } from "@/lib/categoryCatalogEvents";
import { isCategoryHiddenFromPieCharts } from "@/lib/categoryPieVisibility";
import {
  DATA_PREVIEW_TIME_COLUMN,
  tableColumnsWithLeadingTime,
} from "@/lib/dataPreviewTimeColumn";
import { formatPeriodTimeOnly } from "@/lib/formatPeriod";
import { categoryPieColorAtIndex } from "@/lib/categoryPieColors";
import { useTransactionModal } from "@/components/TransactionModalProvider";
import { getTransactionRowId } from "@/lib/transactionRowId";
import {
  isColumnExcludedFromDataPreview,
  useDashboardColumnVisible,
} from "@/lib/columnVisibility";
import { CalendarMonthTransactionsGrouped } from "@/components/CalendarMonthTransactionsGrouped";
import { filterDataPreviewRows } from "@/lib/transferRowAccounts";
import { renderTransferFlowAwareCell } from "@/lib/transferPreviewCells";
import { transactionCellToneClass } from "@/lib/transactionRowTone";
import {
  btnSecondary,
  btnSmallSecondary,
  interactiveHoverSurface,
  modalBackdrop,
  readonlyHoverSurface,
} from "@/lib/ui";
import {
  toggleInstanceHidden,
  useHiddenInstancesMap,
} from "@/lib/valueInstanceVisibility";
import {
  formatMainCurrencyTotal,
  useCurrencySettings,
} from "@/lib/currencySettings";
function findCatalogCategory(
  categories: CategoryCatalogEntry[] | null,
  name: string,
): CategoryCatalogEntry | undefined {
  if (!categories?.length) return undefined;
  return categories.find(
    (c) =>
      c.name === name ||
      c.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0,
  );
}

function rowAmount(
  row: Record<string, unknown>,
  amountColumn: string,
): number {
  const v = row[amountColumn];
  if (typeof v === "number" && Number.isFinite(v)) return Math.abs(v);
  const n = Number(v);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function aggregateBySubcategory(
  rows: Record<string, unknown>[],
  amountColumn: string,
  subCol: string,
): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const raw = row[subCol];
    const key =
      raw == null || String(raw).trim() === ""
        ? "(Uncategorized)"
        : String(raw);
    map.set(key, (map.get(key) ?? 0) + rowAmount(row, amountColumn));
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) =>
      b.value !== a.value
        ? b.value - a.value
        : a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
}

function shouldShowSubcategoryList(
  catalogEntry: CategoryCatalogEntry | undefined,
  agg: { name: string; value: number }[],
  hasSubcolumn: boolean,
): boolean {
  if (!hasSubcolumn) return false;
  if (catalogEntry && catalogEntry.subcategories.length === 0) return false;
  if (agg.length === 0) return false;
  if (agg.length === 1 && agg[0].name === "(Uncategorized)") return false;
  return true;
}

type Props = {
  variant: "expense" | "income";
  /** Same order as the pie (largest first). */
  pieSlices: CalendarCategoryBreakdownSlice[];
  /** Sum of non-hidden slice values — denominator for % on visible categories. */
  pieTotalVisible: number;
  /** For hide/show button titles, e.g. `"expense"` or `"income"`. */
  pieKindLabel: string;
  pieScope: "month" | "year";
  calendarYear: number;
  calendarMonth?: number;
  amountColumn: string;
  extraFilters?: AnalyzeBody["filters"];
  currencyConversion?: CurrencyConversionPayload;
};

export function CategoryStatsDataPreview({
  variant,
  pieSlices,
  pieTotalVisible,
  pieKindLabel,
  pieScope,
  calendarYear,
  calendarMonth,
  amountColumn,
  extraFilters,
  currencyConversion,
}: Props) {
  const subTxModalTitleId = useId();
  const { openTxEdit } = useTransactionModal();
  const hiddenInstancesMap = useHiddenInstancesMap();
  const isColVisible = useDashboardColumnVisible();
  const currencySettings = useCurrencySettings();
  const fmt = useCallback(
    (n: number) => formatMainCurrencyTotal(n, currencySettings),
    [currencySettings],
  );

  const [catalog, setCatalog] = useState<CategoryCatalogEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getCategoryCatalog()
      .then((r) => {
        if (!cancelled) setCatalog(r.categories);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<"subs" | null>(null);
  const [loading, setLoading] = useState(false);
  /** Category drill rows (used for category-only modal when there is no subcategory list). */
  const [txColumns, setTxColumns] = useState<string[]>([]);
  const [txRows, setTxRows] = useState<Record<string, unknown>[]>([]);
  const [txPeriodColumn, setTxPeriodColumn] = useState<string | null>(null);
  const [subSlices, setSubSlices] = useState<{ name: string; value: number }[]>(
    [],
  );

  /** Category-only (no subs) or subcategory drill → transactions in a modal. */
  const [txDrillModal, setTxDrillModal] = useState<
    | { mode: "category"; category: string }
    | { mode: "subcategory"; category: string; subcategory: string }
    | null
  >(null);
  const [subModalLoading, setSubModalLoading] = useState(false);
  const [subModalColumns, setSubModalColumns] = useState<string[]>([]);
  const [subModalRows, setSubModalRows] = useState<Record<string, unknown>[]>(
    [],
  );
  const [subModalPeriodColumn, setSubModalPeriodColumn] = useState<
    string | null
  >(null);

  const flowFilter = variant === "expense" ? "expense" : "income";

  const loadCategoryDrill = useCallback(
    async (categoryName: string) => {
      setLoading(true);
      try {
        const catEntry = findCatalogCategory(catalog, categoryName);
        const opts = {
          extraFilters,
          flowFilter: flowFilter as "income" | "expense",
          currencyConversion,
          category: categoryName,
        };
        const res =
          pieScope === "month"
            ? await getCalendarMonthTransactions(
                calendarYear,
                calendarMonth ?? 1,
                opts,
              )
            : await getCalendarYearTransactions(calendarYear, opts);
        setTxColumns(res.columns);
        setTxRows(res.rows);
        setTxPeriodColumn(res.period_column ?? null);
        const subCol = res.columns.includes("Subcategory")
          ? "Subcategory"
          : null;
        const amtCol = res.columns.includes(amountColumn)
          ? amountColumn
          : res.columns.find((c) => c.toLowerCase().includes("amount")) ??
            amountColumn;
        const agg = subCol
          ? aggregateBySubcategory(res.rows, amtCol, subCol)
          : [];
        const showSubs = shouldShowSubcategoryList(catEntry, agg, !!subCol);
        if (showSubs) {
          setSubSlices(agg);
          setPanelMode("subs");
          setTxDrillModal(null);
        } else {
          setSubSlices([]);
          setPanelMode(null);
          setTxDrillModal({ mode: "category", category: categoryName });
        }
      } catch {
        setTxColumns([]);
        setTxRows([]);
        setTxPeriodColumn(null);
        setPanelMode(null);
        setTxDrillModal(null);
        setSubSlices([]);
      } finally {
        setLoading(false);
      }
    },
    [
      catalog,
      amountColumn,
      pieScope,
      calendarYear,
      calendarMonth,
      extraFilters,
      flowFilter,
      currencyConversion,
    ],
  );

  /** Re-run drill when catalog finishes loading (first click may have used empty catalog). */
  useEffect(() => {
    if (catalog === null || !openCategory) return;
    void loadCategoryDrill(openCategory);
  }, [catalog]);

  const fetchTransactionsForSubModal = useCallback(
    async (category: string, subcategory: string) => {
      setTxDrillModal({ mode: "subcategory", category, subcategory });
      setSubModalLoading(true);
      try {
        const opts = {
          extraFilters,
          flowFilter: flowFilter as "income" | "expense",
          currencyConversion,
          category,
          subcategory,
        };
        const res =
          pieScope === "month"
            ? await getCalendarMonthTransactions(
                calendarYear,
                calendarMonth ?? 1,
                opts,
              )
            : await getCalendarYearTransactions(calendarYear, opts);
        setSubModalColumns(res.columns);
        setSubModalRows(res.rows);
        setSubModalPeriodColumn(res.period_column ?? null);
      } catch {
        setSubModalColumns([]);
        setSubModalRows([]);
        setSubModalPeriodColumn(null);
      } finally {
        setSubModalLoading(false);
      }
    },
    [
      pieScope,
      calendarYear,
      calendarMonth,
      extraFilters,
      flowFilter,
      currencyConversion,
    ],
  );

  const onCategoryClick = (name: string) => {
    if (openCategory === name) {
      setOpenCategory(null);
      setPanelMode(null);
      setTxRows([]);
      setTxPeriodColumn(null);
      setSubSlices([]);
      setTxDrillModal(null);
      return;
    }
    setOpenCategory(name);
    setSubSlices([]);
    setTxRows([]);
    setTxDrillModal(null);
    void loadCategoryDrill(name);
  };

  const onSubcategoryClick = (categoryName: string, subName: string) => {
    void fetchTransactionsForSubModal(categoryName, subName);
  };

  const handlePieVisibilityClick = useCallback(
    async (e: MouseEvent, categoryName: string) => {
      e.stopPropagation();
      const settingsHidden = (hiddenInstancesMap.Category ?? []).includes(
        categoryName,
      );
      const entry = findCatalogCategory(catalog, categoryName);
      const hidden = isCategoryHiddenFromPieCharts(
        categoryName,
        hiddenInstancesMap.Category,
        catalog,
      );
      if (hidden) {
        if (settingsHidden) {
          toggleInstanceHidden("Category", categoryName, false);
          return;
        }
        if (entry?.is_hidden === true && entry.id != null) {
          try {
            await updateCategoryCatalog(entry.id, { is_hidden: false });
            dispatchCategoryCatalogChanged();
          } catch {
            /* ignore */
          }
        }
        return;
      }
      toggleInstanceHidden("Category", categoryName, true);
    },
    [catalog, hiddenInstancesMap.Category],
  );

  const closeTxDrillModal = useCallback(() => {
    setTxDrillModal(null);
    setSubModalColumns([]);
    setSubModalRows([]);
    setSubModalPeriodColumn(null);
  }, []);

  const visibleTxColumns = useMemo(
    () =>
      txColumns.filter(
        (c) => isColVisible(c) && !isColumnExcludedFromDataPreview(c),
      ),
    [txColumns, isColVisible],
  );

  const displayTxRows = useMemo(
    () => filterDataPreviewRows(txRows),
    [txRows],
  );

  const displaySubModalRows = useMemo(
    () => filterDataPreviewRows(subModalRows),
    [subModalRows],
  );

  const visibleSubModalColumns = useMemo(
    () =>
      subModalColumns.filter(
        (c) => isColVisible(c) && !isColumnExcludedFromDataPreview(c),
      ),
    [subModalColumns, isColVisible],
  );

  const txTableWithTime = useMemo(
    () => tableColumnsWithLeadingTime(visibleTxColumns, txPeriodColumn),
    [visibleTxColumns, txPeriodColumn],
  );

  const subModalTableWithTime = useMemo(
    () =>
      tableColumnsWithLeadingTime(visibleSubModalColumns, subModalPeriodColumn),
    [visibleSubModalColumns, subModalPeriodColumn],
  );

  useEffect(() => {
    if (!txDrillModal) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeTxDrillModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [txDrillModal, closeTxDrillModal]);

  const categoryValue = useCallback(
    (name: string) => pieSlices.find((s) => s.name === name)?.value ?? 0,
    [pieSlices],
  );

  /** Visible categories first (same value order as the pie), then hidden at the bottom. */
  const pieSlicesForList = useMemo(() => {
    if (!pieSlices.length) return [];
    const vis: CalendarCategoryBreakdownSlice[] = [];
    const hid: CalendarCategoryBreakdownSlice[] = [];
    for (const s of pieSlices) {
      if (
        isCategoryHiddenFromPieCharts(
          s.name,
          hiddenInstancesMap.Category,
          catalog,
        )
      ) {
        hid.push(s);
      } else {
        vis.push(s);
      }
    }
    return [...vis, ...hid];
  }, [pieSlices, hiddenInstancesMap.Category, catalog]);

  if (pieSlices.length === 0) return null;

  return (
    <>
    <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700">
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        By category
      </h4>
      <ul className="mt-2 space-y-1">
        {pieSlicesForList.map((slice, idx) => {
          const hidden = isCategoryHiddenFromPieCharts(
            slice.name,
            hiddenInstancesMap.Category,
            catalog,
          );
          const pct =
            !hidden && pieTotalVisible > 0
              ? Math.round((slice.value / pieTotalVisible) * 1000) / 10
              : null;
          const color = hidden
            ? "#a1a1aa"
            : categoryPieColorAtIndex(idx);
          const isOpen = openCategory === slice.name;
          return (
            <li key={slice.name || "__empty__"} className="rounded-lg">
              <div className="flex w-full min-w-0 items-stretch gap-1.5">
                <button
                  type="button"
                  onClick={() => onCategoryClick(slice.name)}
                  className={`flex min-w-0 flex-1 items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                    isOpen ? "bg-zinc-100 dark:bg-zinc-800/60" : ""
                  } ${interactiveHoverSurface}`}
                >
                  <span className="min-w-0 flex flex-1 items-baseline gap-2">
                    <span
                      className="shrink-0 text-sm font-semibold tabular-nums"
                      style={{ color }}
                      title={
                        hidden
                          ? "Excluded from pie chart — amount shown for reference"
                          : "% of visible pie (hidden categories excluded from total)"
                      }
                    >
                      {pct == null ? "—" : `${pct}%`}
                    </span>
                    <span
                      className="min-w-0 truncate font-medium"
                      style={{ color }}
                    >
                      {slice.name || "—"}
                    </span>
                  </span>
                  <span
                    className="shrink-0 tabular-nums font-semibold"
                    style={{ color }}
                  >
                    {fmt(slice.value)}
                  </span>
                </button>
                <button
                  type="button"
                  className={`${btnSmallSecondary} shrink-0 self-center px-2 py-1 text-[11px]`}
                  title={
                    hidden
                      ? `Show “${slice.name}” on ${pieKindLabel} pie charts`
                      : `Hide “${slice.name}” from ${pieKindLabel} pie charts (Settings → Which values → Category)`
                  }
                  onClick={(e) =>
                    void handlePieVisibilityClick(e, slice.name)
                  }
                >
                  {hidden ? "Show" : "Hide"}
                </button>
              </div>
              {isOpen && (
                <div className="border-l-2 border-zinc-200 pl-3 ml-2 mt-1 dark:border-zinc-600">
                  {loading && (
                    <p className="py-2 text-xs text-zinc-500">Loading…</p>
                  )}
                  {!loading && panelMode === "subs" && (
                    <ul className="space-y-1">
                      {subSlices.map((sub, sidx) => {
                        const catTot = categoryValue(slice.name);
                        const subPct =
                          catTot > 0
                            ? Math.round((sub.value / catTot) * 1000) / 10
                            : 0;
                        const sc = categoryPieColorAtIndex(sidx);
                        return (
                          <li key={sub.name}>
                            <button
                              type="button"
                              onClick={() =>
                                onSubcategoryClick(slice.name, sub.name)
                              }
                              className={`flex w-full min-w-0 items-baseline justify-between gap-2 rounded-md px-2 py-1 text-left text-xs ${interactiveHoverSurface}`}
                            >
                              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                                <span
                                  className="shrink-0 font-semibold tabular-nums"
                                  style={{ color: sc }}
                                >
                                  {subPct}%
                                </span>
                                <span
                                  className="min-w-0 truncate font-medium"
                                  style={{ color: sc }}
                                >
                                  {sub.name}
                                </span>
                              </span>
                              <span
                                className="shrink-0 tabular-nums font-medium text-zinc-700 dark:text-zinc-300"
                                style={{ color: sc }}
                              >
                                {fmt(sub.value)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>

    {txDrillModal != null && (
      <div
        className={modalBackdrop}
        role="dialog"
        aria-modal="true"
        aria-labelledby={subTxModalTitleId}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeTxDrillModal();
        }}
      >
        <div className="flex max-h-[min(85vh,720px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2
              id={subTxModalTitleId}
              className="min-w-0 text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              {txDrillModal.mode === "category" ? (
                <span className="break-words">{txDrillModal.category}</span>
              ) : (
                <>
                  <span className="break-words">{txDrillModal.subcategory}</span>
                  <span className="font-normal text-zinc-500 dark:text-zinc-400">
                    {" "}
                    —{" "}
                  </span>
                  <span className="break-words text-zinc-700 dark:text-zinc-300">
                    {txDrillModal.category}
                  </span>
                </>
              )}
            </h2>
            <button
              type="button"
              className={btnSecondary}
              onClick={closeTxDrillModal}
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {txDrillModal.mode === "category" ? (
              <>
                {displayTxRows.length === 0 ? (
                  <p className="text-sm text-zinc-800 dark:text-zinc-200">
                    No transactions in this period.
                  </p>
                ) : txPeriodColumn ? (
                  <div className="px-1">
                    <CalendarMonthTransactionsGrouped
                      key={`cat-${txDrillModal.category}`}
                      rows={displayTxRows}
                      columns={txColumns}
                      periodColumn={txPeriodColumn}
                      monthScope={null}
                      resetDayExpansionWhenGroupIsosChange
                      onRowClick={(row) => {
                        closeTxDrillModal();
                        openTxEdit(row);
                      }}
                    />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[32rem] table-fixed border-collapse text-left text-sm">
                      <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/95 dark:text-zinc-400">
                        <tr>
                          {txTableWithTime.displayColumns.map((c) => (
                            <th key={c} className="min-w-0 px-2 py-2 align-top font-medium">
                              {c === DATA_PREVIEW_TIME_COLUMN ? "Time" : c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {displayTxRows.map((row, i) => {
                          const id = getTransactionRowId(row);
                          const canEdit = id != null;
                          return (
                            <tr
                              key={row.id != null ? String(row.id) : i}
                              title={canEdit ? "Click to edit" : undefined}
                              onClick={
                                canEdit
                                  ? () => {
                                      closeTxDrillModal();
                                      openTxEdit(row);
                                    }
                                  : undefined
                              }
                              className={[
                                "border-t border-zinc-100 odd:bg-white even:bg-zinc-50/80 dark:border-zinc-800 dark:odd:bg-zinc-950 dark:even:bg-zinc-900/40",
                                canEdit
                                  ? `cursor-pointer ${interactiveHoverSurface}`
                                  : readonlyHoverSurface,
                              ].join(" ")}
                            >
                              {txTableWithTime.displayColumns.map((c) => (
                                <td
                                  key={c}
                                  className={`min-w-0 break-words px-2 py-2 align-top text-xs [overflow-wrap:anywhere] ${
                                    c === DATA_PREVIEW_TIME_COLUMN
                                      ? "tabular-nums text-zinc-600 dark:text-zinc-400"
                                      : transactionCellToneClass(row, c)
                                  }`}
                                >
                                  {c === DATA_PREVIEW_TIME_COLUMN
                                    ? formatPeriodTimeOnly(
                                        txTableWithTime.timeValueColumn
                                          ? row[txTableWithTime.timeValueColumn]
                                          : null,
                                      )
                                    : renderTransferFlowAwareCell(row, c, {
                                        periodColumnName:
                                          txTableWithTime.timeValueColumn,
                                      })}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <>
                {subModalLoading && (
                  <p className="text-sm text-zinc-800 dark:text-zinc-200">
                    Loading transactions…
                  </p>
                )}
                {!subModalLoading && displaySubModalRows.length === 0 && (
                  <p className="text-sm text-zinc-800 dark:text-zinc-200">
                    No transactions in this period.
                  </p>
                )}
                {!subModalLoading && displaySubModalRows.length > 0 && (
                  subModalPeriodColumn ? (
                    <div className="px-1">
                      <CalendarMonthTransactionsGrouped
                        key={`sub-${txDrillModal.category}-${txDrillModal.subcategory}`}
                        rows={displaySubModalRows}
                        columns={subModalColumns}
                        periodColumn={subModalPeriodColumn}
                        monthScope={null}
                        resetDayExpansionWhenGroupIsosChange
                        onRowClick={(row) => {
                          closeTxDrillModal();
                          openTxEdit(row);
                        }}
                      />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[32rem] table-fixed border-collapse text-left text-sm">
                        <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/95 dark:text-zinc-400">
                          <tr>
                            {subModalTableWithTime.displayColumns.map((c) => (
                              <th key={c} className="min-w-0 px-2 py-2 align-top font-medium">
                                {c === DATA_PREVIEW_TIME_COLUMN ? "Time" : c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {displaySubModalRows.map((row, i) => {
                            const id = getTransactionRowId(row);
                            const canEdit = id != null;
                            return (
                              <tr
                                key={row.id != null ? String(row.id) : i}
                                title={canEdit ? "Click to edit" : undefined}
                                onClick={
                                  canEdit
                                    ? () => {
                                        closeTxDrillModal();
                                        openTxEdit(row);
                                      }
                                    : undefined
                                }
                                className={[
                                  "border-t border-zinc-100 odd:bg-white even:bg-zinc-50/80 dark:border-zinc-800 dark:odd:bg-zinc-950 dark:even:bg-zinc-900/40",
                                  canEdit
                                    ? `cursor-pointer ${interactiveHoverSurface}`
                                    : readonlyHoverSurface,
                                ].join(" ")}
                              >
                                {subModalTableWithTime.displayColumns.map((c) => (
                                  <td
                                    key={c}
                                    className={`min-w-0 break-words px-2 py-2 align-top text-xs [overflow-wrap:anywhere] ${
                                      c === DATA_PREVIEW_TIME_COLUMN
                                        ? "tabular-nums text-zinc-600 dark:text-zinc-400"
                                        : transactionCellToneClass(row, c)
                                    }`}
                                  >
                                    {c === DATA_PREVIEW_TIME_COLUMN
                                      ? formatPeriodTimeOnly(
                                          subModalTableWithTime.timeValueColumn
                                            ? row[subModalTableWithTime.timeValueColumn]
                                            : null,
                                        )
                                      : renderTransferFlowAwareCell(row, c, {
                                          periodColumnName:
                                            subModalTableWithTime.timeValueColumn,
                                        })}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
