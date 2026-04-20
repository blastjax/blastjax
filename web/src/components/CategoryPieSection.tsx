"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type SVGProps,
} from "react";
import {
  Cell,
  type PieLabelRenderProps,
  type PieSectorDataItem,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  type AnalyzeBody,
  type CurrencyConversionPayload,
  getCalendarMonthTransactions,
  getCalendarYearTransactions,
  getCategoryCatalog,
  type CategoryCatalogEntry,
  type CalendarCategoryBreakdownSlice,
  type CalendarCategoryBreakdownResponse,
} from "@/lib/api";
import { CalendarMonthTransactionsGrouped } from "@/components/CalendarMonthTransactionsGrouped";
import { useTransactionModal } from "@/components/TransactionModalProvider";
import { getTransactionRowId } from "@/lib/transactionRowId";
import {
  isColumnExcludedFromDataPreview,
  useDashboardColumnVisible,
} from "@/lib/columnVisibility";
import { filterDataPreviewRows } from "@/lib/transferRowAccounts";
import { renderTransferFlowAwareCell } from "@/lib/transferPreviewCells";
import { btnSecondary, modalBackdrop } from "@/lib/ui";
import { transactionCellToneClass } from "@/lib/transactionRowTone";
import {
  formatMainCurrencyTotal,
  loadCurrencySettings,
} from "@/lib/currencySettings";
import {
  hiddenExpensePieCategoryChipAccentClass,
  hiddenExpensePieCategoryChipClass,
  hiddenIncomePieCategoryChipAccentClass,
  hiddenIncomePieCategoryChipClass,
  incomeHeadlineTextClass,
} from "@/lib/incomeExpenseTheme";
import {
  toggleInstanceHidden,
  useHiddenInstancesMap,
} from "@/lib/valueInstanceVisibility";
import { categoryPieColorAtIndex } from "@/lib/categoryPieColors";
import { CategoryStatsDataPreview } from "@/components/CategoryStatsDataPreview";

/** Recharts polar angles: 90° = 12 o'clock; end angle below start gives clockwise sweep. */
const PIE_START_AT_12 = 90;
const PIE_END_FULL_CLOCKWISE = -270;

const PIE_LABEL_RAD = Math.PI / 180;

function piePolarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleInDegrees: number,
) {
  return {
    x: cx + Math.cos(-PIE_LABEL_RAD * angleInDegrees) * radius,
    y: cy + Math.sin(-PIE_LABEL_RAD * angleInDegrees) * radius,
  };
}

function pieLabelTextAnchor(labelX: number, cx: number) {
  if (labelX > cx) return "start";
  if (labelX < cx) return "end";
  return "middle";
}

/** Extra radius beyond pie outer edge; stagger rings reduce mild overlap (kept small for viewport). */
const PIE_LABEL_BASE_OFFSET = 14;
const PIE_LABEL_STAGGER_STEP = 8;
const PIE_LABEL_STAGGER_MOD = 3;

function pieNormalizeAngle360(angleDeg: number): number {
  let a = angleDeg % 360;
  if (a < 0) a += 360;
  return a;
}

/**
 * Radial distance for outside labels. Top/bottom slices use a shorter extension so
 * labels are not pushed off-screen; left/right can extend slightly more.
 */
function pieExtendedLabelRadius(
  outerRadius: number,
  sliceIndex: number,
  midAngle: number,
): number {
  const ring = sliceIndex % PIE_LABEL_STAGGER_MOD;
  let extra = PIE_LABEL_BASE_OFFSET + ring * PIE_LABEL_STAGGER_STEP;
  const a = pieNormalizeAngle360(midAngle);
  // Recharts: ~90° = top of pie (labels clip upward); ~270° = bottom.
  if (a >= 30 && a <= 150) {
    extra = Math.min(extra, 10 + ring * 4);
  } else if (a >= 210 && a <= 330) {
    extra = Math.min(extra, 12 + ring * 5);
  }
  return outerRadius + extra;
}

/** Split long category names onto two lines (SVG); keeps labels readable. */
function splitCategoryLabelForPie(raw: string): [string, string | null] {
  const t = raw.trim();
  if (t.length <= 24) return [t || "—", null];
  const mid = Math.floor(t.length / 2);
  const spaceBefore = t.lastIndexOf(" ", mid);
  const spaceAfter = t.indexOf(" ", mid + 1);
  let cut =
    spaceBefore > 6 ? spaceBefore : spaceAfter > 0 ? spaceAfter : mid;
  if (cut <= 0 || cut >= t.length) return [t, null];
  const a = t.slice(0, cut).trimEnd();
  const b = t.slice(cut).trimStart();
  if (!b) return [a, null];
  return [a, b];
}

type PieLabelLineDrawProps = {
  cx?: number;
  cy?: number;
  outerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  index?: number;
  stroke?: string;
};

function renderPieCategoryLabelLine(props: PieLabelLineDrawProps) {
  const cx = props.cx ?? 0;
  const cy = props.cy ?? 0;
  const outerRadius = props.outerRadius ?? 0;
  const startAngle = props.startAngle ?? 0;
  const endAngle = props.endAngle ?? 0;
  const index = props.index ?? 0;
  const stroke = props.stroke ?? "#71717a";
  const midAngle = (startAngle + endAngle) / 2;
  const rLabel = pieExtendedLabelRadius(outerRadius, index, midAngle);
  const p0 = piePolarToCartesian(cx, cy, outerRadius, midAngle);
  const p2 = piePolarToCartesian(cx, cy, rLabel, midAngle);
  const d = `M ${p0.x} ${p0.y} L ${p2.x} ${p2.y}`;
  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={1}
      className="recharts-pie-label-line"
    />
  );
}

function money(n: number) {
  return formatMainCurrencyTotal(n, loadCurrencySettings());
}

/** Expense pie slices: drop categories hidden in Settings (Which values) or on the Categories page. */
function filterPieSlicesByCategoryVisibility(
  slices: CalendarCategoryBreakdownSlice[],
  hiddenInstanceCategories: string[] | undefined,
  categoryCatalog: CategoryCatalogEntry[] | null,
): CalendarCategoryBreakdownSlice[] {
  const hid = new Set(hiddenInstanceCategories ?? []);
  return slices.filter((s) => {
    if (hid.has(s.name)) return false;
    if (!categoryCatalog?.length) return true;
    for (const c of categoryCatalog) {
      if (c.is_hidden !== true) continue;
      if (
        c.name === s.name ||
        c.name.localeCompare(s.name, undefined, { sensitivity: "accent" }) === 0
      ) {
        return false;
      }
    }
    return true;
  });
}

/** API `category` filter value; blank cells → `(Uncategorized)` (matches pie / backend). */
function categoryFilterParamFromRow(
  row: Record<string, unknown>,
  categoryColumn: string,
): string {
  const raw = row[categoryColumn];
  if (raw === null || raw === undefined) return "(Uncategorized)";
  const s = String(raw).trim();
  if (s === "") return "(Uncategorized)";
  return String(raw);
}

export function CategoryPieSection({
  title,
  variant,
  breakdown,
  loading,
  pieScope,
  calendarYear,
  calendarMonth,
  periodLabel,
  extraFilters,
  currencyConversion,
}: {
  title: string;
  variant: "expense" | "income";
  breakdown: CalendarCategoryBreakdownResponse | null;
  loading: boolean;
  pieScope: "month" | "year";
  calendarYear: number;
  /** Required when pieScope is "month". */
  calendarMonth?: number;
  periodLabel: string;
  extraFilters?: AnalyzeBody["filters"];
  currencyConversion?: CurrencyConversionPayload;
}) {
  const isColVisible = useDashboardColumnVisible();
  const { openTxEdit } = useTransactionModal();
  const hiddenInstancesMap = useHiddenInstancesMap();
  const hiddenPieCategories = useMemo(
    () =>
      [...(hiddenInstancesMap.Category ?? [])].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      ),
    [hiddenInstancesMap.Category],
  );

  const [categoryCatalog, setCategoryCatalog] = useState<
    CategoryCatalogEntry[] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void getCategoryCatalog()
      .then((r) => {
        if (!cancelled) setCategoryCatalog(r.categories);
      })
      .catch(() => {
        if (!cancelled) setCategoryCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rawBreakdownSlices = useMemo(() => {
    if (!breakdown) return [];
    return variant === "expense"
      ? breakdown.slices
      : (breakdown.income_slices ?? []);
  }, [breakdown, variant]);

  const pieSlices = useMemo(() => {
    const raw = rawBreakdownSlices;
    if (!raw?.length) return [];
    return filterPieSlicesByCategoryVisibility(
      raw,
      hiddenInstancesMap.Category,
      categoryCatalog,
    );
  }, [rawBreakdownSlices, hiddenInstancesMap.Category, categoryCatalog]);

  const pieTotal = useMemo(
    () => pieSlices.reduce((sum, s) => sum + s.value, 0),
    [pieSlices],
  );

  /**
   * Largest slice first (starts at 12 o'clock), then descending by value clockwise;
   * smallest slice sits last, adjacent to the largest before closing the circle.
   */
  const pieSlicesClockwise = useMemo(() => {
    if (!pieSlices.length) return [];
    return [...pieSlices].sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [pieSlices]);

  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [txColumns, setTxColumns] = useState<string[]>([]);
  const [txRows, setTxRows] = useState<Record<string, unknown>[]>([]);
  /** `null` = all categories; otherwise filter to this category label (matches pie slice). */
  const [txCategoryOnly, setTxCategoryOnly] = useState<string | null>(null);
  const [txSortCol, setTxSortCol] = useState("");
  const [txSortDir, setTxSortDir] = useState<"asc" | "desc">("desc");
  const [txModalPeriodColumn, setTxModalPeriodColumn] = useState<string | null>(
    null,
  );

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

  const modalActiveSortCol = useMemo(
    () =>
      txColumns.length > 0 && txColumns.includes(txSortCol) && txSortCol
        ? txSortCol
        : (txColumns[0] ?? ""),
    [txColumns, txSortCol],
  );

  const fetchModalTransactions = useCallback(
    async (
      args: {
        categoryOnly: string | null;
        sortCol: string;
        sortDir: "asc" | "desc";
      },
      opts?: { reset?: boolean },
    ) => {
      if (!breakdown?.category_column) return;
      setTxCategoryOnly(args.categoryOnly);
      if (opts?.reset) {
        setTxColumns([]);
        setTxRows([]);
      }
      setTxLoading(true);
      const sortOpts = {
        sortColumn: args.sortCol,
        sortDirection: args.sortDir,
        extraFilters,
        flowFilter: variant,
        currencyConversion,
        ...(args.categoryOnly != null ? { category: args.categoryOnly } : {}),
      };
      try {
        const res =
          pieScope === "month"
            ? await getCalendarMonthTransactions(
                calendarYear,
                calendarMonth ?? 1,
                sortOpts,
              )
            : await getCalendarYearTransactions(calendarYear, sortOpts);
        setTxColumns(res.columns);
        setTxRows(res.rows);
        setTxModalPeriodColumn(res.period_column ?? null);
        setTxSortCol(res.sort_column);
        setTxSortDir(res.sort_direction);
      } catch {
        setTxColumns([]);
        setTxRows([]);
        setTxModalPeriodColumn(null);
      } finally {
        setTxLoading(false);
      }
    },
    [
      breakdown?.category_column,
      pieScope,
      calendarYear,
      calendarMonth,
      extraFilters,
      variant,
      currencyConversion,
    ],
  );

  const loadTransactions = useCallback(
    async (categoryOnly: string | null) => {
      if (!breakdown?.category_column) return;
      setTxModalOpen(true);
      setTxSortCol("");
      setTxSortDir("desc");
      await fetchModalTransactions(
        {
          categoryOnly,
          sortCol: "",
          sortDir: "desc",
        },
        { reset: true },
      );
    },
    [breakdown?.category_column, fetchModalTransactions],
  );

  const handlePieSliceClick = useCallback(
    (data: PieSectorDataItem, _index: number, e: MouseEvent<SVGGraphicsElement>) => {
      e.stopPropagation();
      const raw = data.name ?? data.payload?.name;
      const name = raw != null ? String(raw) : "";
      if (!name) return;
      void loadTransactions(name);
    },
    [loadTransactions],
  );

  const handlePieChartBackgroundClick = useCallback(() => {
    void loadTransactions(null);
  }, [loadTransactions]);

  const handleModalTxSort = useCallback(
    (column: string) => {
      if (txLoading || !txColumns.includes(column)) return;
      const same = modalActiveSortCol === column;
      const nextDir = same
        ? txSortDir === "asc"
          ? "desc"
          : "asc"
        : txModalPeriodColumn != null && column === txModalPeriodColumn
          ? "desc"
          : "asc";
      void fetchModalTransactions(
        {
          categoryOnly: txCategoryOnly,
          sortCol: column,
          sortDir: nextDir,
        },
        { reset: false },
      );
    },
    [
      txLoading,
      txColumns,
      modalActiveSortCol,
      txSortDir,
      txCategoryOnly,
      txModalPeriodColumn,
      fetchModalTransactions,
    ],
  );

  useEffect(() => {
    if (!txModalOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setTxModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [txModalOpen]);

  if (loading) {
    return (
      <div className="flex min-h-[18rem] items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/40">
        <p className="text-sm text-zinc-800 dark:text-zinc-200">Loading…</p>
      </div>
    );
  }
  if (!breakdown) {
    return (
      <div className="flex min-h-[18rem] items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/40">
        <p className="text-sm text-zinc-800 dark:text-zinc-200">Could not load chart.</p>
      </div>
    );
  }
  if (breakdown.category_column === null) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h3>
      </div>
    );
  }
  if (!rawBreakdownSlices.length) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h3>
      </div>
    );
  }
  if (!pieSlices.length) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h3>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Every category in this period is hidden from charts — adjust{" "}
          <span className="font-medium">Settings → Which values</span> or unhide the
          category on the <span className="font-medium">Categories</span> page.
        </p>
      </div>
    );
  }
  const categoryColumnName = breakdown.category_column ?? "Category";
  const breakdownTotal =
    variant === "expense"
      ? breakdown.total_expense
      : (breakdown.total_income ?? 0);
  const pieShowsFilteredTotals = Math.abs(breakdownTotal - pieTotal) > 0.005;
  const totalMoneyClass =
    variant === "expense"
      ? "font-medium text-rose-600 tabular-nums dark:text-rose-400"
      : `font-medium tabular-nums ${incomeHeadlineTextClass}`;
  const totalLabel =
    variant === "expense"
      ? "Total expenses (visible categories):"
      : "Total income (visible categories):";
  const pieKindLabel = variant === "expense" ? "expense" : "income";

  function renderCategoryPieLabel(props: PieLabelRenderProps) {
    const idx = props.index ?? 0;
    const name = pieSlicesClockwise[idx]?.name ?? "";
    const color = props.fill ?? categoryPieColorAtIndex(idx);
    const pct = Math.round((props.percent ?? 0) * 100);
    const raw = name.trim() || "—";
    const [line1, line2] = splitCategoryLabelForPie(raw);
    const midAngle =
      ((props.startAngle ?? 0) + (props.endAngle ?? 0)) / 2;
    const outerR = props.outerRadius ?? 0;
    const cx = props.cx ?? 0;
    const cy = props.cy ?? 0;
    const labelR = pieExtendedLabelRadius(outerR, idx, midAngle);
    const { x, y } = piePolarToCartesian(cx, cy, labelR, midAngle);
    const anchor = pieLabelTextAnchor(
      x,
      cx,
    ) as SVGProps<SVGTextElement>["textAnchor"];
    const tightName =
      line1.length > 26 || (line2 != null && line2.length > 26);
    const nameFs = tightName ? 9 : 10;
    return (
      <text
        x={x}
        y={y}
        textAnchor={anchor}
        dominantBaseline="middle"
        fill={color}
      >
        <tspan
          x={x}
          dy={line2 != null ? "-0.95em" : "-0.5em"}
          style={{ fontSize: nameFs, fontWeight: 600 }}
        >
          {line1}
        </tspan>
        {line2 != null ? (
          <tspan
            x={x}
            dy="1.05em"
            style={{ fontSize: nameFs, fontWeight: 600 }}
          >
            {line2}
          </tspan>
        ) : null}
        <tspan
          x={x}
          dy={line2 != null ? "1.12em" : "1.15em"}
          style={{ fontSize: 10, fontWeight: 500, opacity: 0.95 }}
        >
          {pct}%
        </tspan>
      </text>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950/80">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
        <p className="mt-2 text-sm text-zinc-800 dark:text-zinc-200">
          {totalLabel}{" "}
          <span className={totalMoneyClass}>
            {money(pieTotal)}
          </span>
          {pieShowsFilteredTotals ? (
            <span className="ml-1.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
              (excludes hidden)
            </span>
          ) : null}
        </p>
        <div
          className="h-[min(20rem,45vh)] min-h-[220px] w-full cursor-pointer"
          role="presentation"
          onClick={handlePieChartBackgroundClick}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieSlicesClockwise}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius="74%"
                startAngle={PIE_START_AT_12}
                endAngle={PIE_END_FULL_CLOCKWISE}
                label={renderCategoryPieLabel}
                labelLine={(lineProps) =>
                  renderPieCategoryLabelLine(
                    lineProps as PieLabelLineDrawProps,
                  )
                }
                cursor="pointer"
                onClick={handlePieSliceClick}
              >
                {pieSlicesClockwise.map((slice, index) => (
                  <Cell
                    key={slice.name}
                    fill={categoryPieColorAtIndex(index)}
                  />
                ))}
              </Pie>
              <Tooltip
                wrapperStyle={{ pointerEvents: "none" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const item = payload[0];
                  const category = String(
                    item.name ?? (item.payload as { name?: string })?.name ?? "",
                  );
                  const raw = item.value;
                  const n = typeof raw === "number" ? raw : Number(raw);
                  return (
                    <div className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-950">
                      <p className="font-medium text-zinc-900 dark:text-zinc-50">
                        {category}
                      </p>
                      <p className="tabular-nums text-zinc-600 dark:text-zinc-400">
                        {Number.isFinite(n) ? money(n) : ""}
                      </p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <CategoryStatsDataPreview
          variant={variant}
          pieSlices={pieSlicesClockwise}
          pieTotal={pieTotal}
          pieScope={pieScope}
          calendarYear={calendarYear}
          calendarMonth={calendarMonth}
          amountColumn={breakdown.amount_column}
          extraFilters={extraFilters}
          currencyConversion={currencyConversion}
        />
      </div>

      {txModalOpen && (
        <div
          className={modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`pie-tx-modal-title-${pieScope}-${variant}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setTxModalOpen(false);
          }}
        >
          <div className="flex max-h-[min(85vh,720px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="min-w-0 flex-1">
                {txCategoryOnly !== null && (
                  <button
                    type="button"
                    className="mb-2 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                    onClick={() => {
                      void fetchModalTransactions(
                        {
                          categoryOnly: null,
                          sortCol: txColumns.includes(txSortCol)
                            ? txSortCol
                            : (txColumns[0] ?? txSortCol),
                          sortDir: txSortDir,
                        },
                        { reset: false },
                      );
                    }}
                  >
                    ← Back to all
                  </button>
                )}
                <h2
                  id={`pie-tx-modal-title-${pieScope}-${variant}`}
                  className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
                >
                  {txCategoryOnly === null ? (
                    `Transactions — ${periodLabel}`
                  ) : (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-2">
                      <span className="break-words">{txCategoryOnly}</span>
                      <span
                        className="font-normal text-zinc-500 dark:text-zinc-400"
                        aria-hidden
                      >
                        —
                      </span>
                      <span className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
                        {periodLabel}
                      </span>
                      <button
                        type="button"
                        className="inline-flex shrink-0 items-center rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        title={`Hide “${txCategoryOnly}” from ${pieKindLabel} pie charts (Settings → Which values → Category)`}
                        onClick={() => {
                          toggleInstanceHidden(
                            "Category",
                            txCategoryOnly,
                            true,
                          );
                          window.setTimeout(() => {
                            void fetchModalTransactions(
                              {
                                categoryOnly: txCategoryOnly,
                                sortCol: txColumns.includes(txSortCol)
                                  ? txSortCol
                                  : (txColumns[0] ?? ""),
                                sortDir: txSortDir,
                              },
                              { reset: false },
                            );
                          }, 0);
                        }}
                      >
                        Hide from pie
                      </button>
                    </span>
                  )}
                </h2>
                {hiddenPieCategories.length > 0 && (
                  <div className="mt-2 max-w-full">
                    <p className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Hidden from {pieKindLabel} pie charts — click a category to show it again
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {hiddenPieCategories.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className={
                            variant === "income"
                              ? hiddenIncomePieCategoryChipClass
                              : hiddenExpensePieCategoryChipClass
                          }
                          title={`Show “${name}” on ${pieKindLabel} pie charts again`}
                          onClick={() => {
                            toggleInstanceHidden("Category", name, false);
                            window.setTimeout(() => {
                              void fetchModalTransactions(
                                {
                                  categoryOnly: txCategoryOnly,
                                  sortCol: txColumns.includes(txSortCol)
                                    ? txSortCol
                                    : (txColumns[0] ?? ""),
                                  sortDir: txSortDir,
                                },
                                { reset: false },
                              );
                            }, 0);
                          }}
                        >
                          <span className="max-w-[14rem] truncate">{name}</span>
                          <span
                            className={
                              variant === "income"
                                ? hiddenIncomePieCategoryChipAccentClass
                                : hiddenExpensePieCategoryChipAccentClass
                            }
                          >
                            Show
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                className={btnSecondary}
                onClick={() => setTxModalOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {txLoading && (
                <p className="text-sm text-zinc-800 dark:text-zinc-200">Loading transactions…</p>
              )}
              {!txLoading && displayTxRows.length === 0 && (
                <p className="text-sm text-zinc-800 dark:text-zinc-200">No transactions in this period.</p>
              )}
              {!txLoading && displayTxRows.length > 0 && (
                txModalPeriodColumn ? (
                  <div className="px-1">
                    <CalendarMonthTransactionsGrouped
                      key={`pie-${txCategoryOnly ?? "all"}`}
                      rows={displayTxRows}
                      columns={txColumns}
                      periodColumn={txModalPeriodColumn}
                      monthScope={null}
                      resetDayExpansionWhenGroupIsosChange
                      onRowClick={(row) => {
                        setTxModalOpen(false);
                        openTxEdit(row);
                      }}
                    />
                  </div>
                ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] table-fixed border-collapse text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900/95 dark:text-zinc-400">
                      <tr>
                        {visibleTxColumns.map((c) => {
                            const active = modalActiveSortCol === c;
                            const ariaSort = active
                              ? txSortDir === "asc"
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
                                  disabled={txLoading}
                                  onClick={() => handleModalTxSort(c)}
                                  className="flex w-full min-w-0 items-start gap-1 rounded-md px-1 py-1 text-left hover:bg-zinc-200/90 dark:hover:bg-zinc-800/90"
                                  title={
                                    active
                                      ? txSortDir === "asc"
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
                                        active && txSortDir === "asc"
                                          ? "text-indigo-600 dark:text-indigo-400"
                                          : "text-zinc-300 dark:text-zinc-600"
                                      }
                                    >
                                      ▲
                                    </span>
                                    <span
                                      className={
                                        active && txSortDir === "desc"
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
                      {displayTxRows.map((row, i) => {
                        const txRowId = getTransactionRowId(row);
                        const rowOpensEdit = txRowId != null;
                        return (
                        <tr
                          key={row.id != null ? String(row.id) : i}
                          title={rowOpensEdit ? "Click to edit" : undefined}
                          onClick={
                            rowOpensEdit
                              ? () => {
                                  setTxModalOpen(false);
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
                          {visibleTxColumns.map((c) => {
                            const cellClass = `min-w-0 break-words px-2 py-2 align-top text-xs [overflow-wrap:anywhere] ${transactionCellToneClass(row, c)}`;
                            const drillCategory =
                              c === categoryColumnName &&
                              txCategoryOnly === null &&
                              !txLoading;
                            if (drillCategory) {
                              return (
                                <td
                                  key={c}
                                  role="button"
                                  tabIndex={0}
                                  title={`Show only this ${categoryColumnName}`}
                                  className={`${cellClass} cursor-pointer rounded-md ring-indigo-500/20 hover:bg-indigo-50/90 hover:ring-1 dark:hover:bg-indigo-950/50`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const v = categoryFilterParamFromRow(
                                      row,
                                      categoryColumnName,
                                    );
                                    void fetchModalTransactions(
                                      {
                                        categoryOnly: v,
                                        sortCol: txColumns.includes(txSortCol)
                                          ? txSortCol
                                          : (txColumns[0] ?? ""),
                                        sortDir: txSortDir,
                                      },
                                      { reset: false },
                                    );
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      const v = categoryFilterParamFromRow(
                                        row,
                                        categoryColumnName,
                                      );
                                      void fetchModalTransactions(
                                        {
                                          categoryOnly: v,
                                          sortCol: txColumns.includes(txSortCol)
                                            ? txSortCol
                                            : (txColumns[0] ?? ""),
                                          sortDir: txSortDir,
                                        },
                                        { reset: false },
                                      );
                                    }
                                  }}
                                >
                                  {renderTransferFlowAwareCell(row, c)}
                                </td>
                              );
                            }
                            return (
                              <td key={c} className={cellClass}>
                                {renderTransferFlowAwareCell(row, c)}
                              </td>
                            );
                          })}
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
