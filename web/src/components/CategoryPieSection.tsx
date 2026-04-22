"use client";

import { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  type AnalyzeBody,
  type CurrencyConversionPayload,
  getCategoryCatalog,
  type CategoryCatalogEntry,
  type CalendarCategoryBreakdownResponse,
} from "@/lib/api";
import {
  formatMainCurrencyTotal,
  loadCurrencySettings,
} from "@/lib/currencySettings";
import { incomeHeadlineTextClass } from "@/lib/incomeExpenseTheme";
import { useHiddenInstancesMap } from "@/lib/valueInstanceVisibility";
import { categoryPieColorAtIndex } from "@/lib/categoryPieColors";
import { isCategoryHiddenFromPieCharts } from "@/lib/categoryPieVisibility";
import { CategoryStatsDataPreview } from "@/components/CategoryStatsDataPreview";

/** Recharts polar angles: 90° = 12 o'clock; end angle below start gives clockwise sweep. */
const PIE_START_AT_12 = 90;
const PIE_END_FULL_CLOCKWISE = -270;

function money(n: number) {
  return formatMainCurrencyTotal(n, loadCurrencySettings());
}

export function CategoryPieSection({
  title,
  variant,
  breakdown,
  loading,
  pieScope,
  calendarYear,
  calendarMonth,
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
  extraFilters?: AnalyzeBody["filters"];
  currencyConversion?: CurrencyConversionPayload;
}) {
  const hiddenInstancesMap = useHiddenInstancesMap();

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

  /**
   * All categories (including hidden from charts), largest slice first at 12 o'clock,
   * then descending by value clockwise.
   */
  const pieSlicesClockwise = useMemo(() => {
    if (!rawBreakdownSlices.length) return [];
    return [...rawBreakdownSlices].sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [rawBreakdownSlices]);

  /** Sum of all slice values (matches API period total when breakdown is consistent). */
  const pieTotalAll = useMemo(
    () => pieSlicesClockwise.reduce((sum, s) => sum + s.value, 0),
    [pieSlicesClockwise],
  );

  /** Slices drawn in the pie only — hidden categories appear in “By category”, not here. */
  const pieSlicesVisibleOnly = useMemo(() => {
    return pieSlicesClockwise.filter(
      (s) =>
        !isCategoryHiddenFromPieCharts(
          s.name,
          hiddenInstancesMap.Category,
          categoryCatalog,
        ),
    );
  }, [pieSlicesClockwise, hiddenInstancesMap.Category, categoryCatalog]);

  /** Pie headline + arc sizes: only categories shown on the chart (excludes hidden). */
  const pieTotalVisible = useMemo(
    () => pieSlicesVisibleOnly.reduce((sum, s) => sum + s.value, 0),
    [pieSlicesVisibleOnly],
  );

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
  /** Hidden categories still contribute to API totals / “By category” amounts but not the pie. */
  const pieExcludesHiddenAmounts =
    Math.abs(pieTotalAll - pieTotalVisible) > 0.005;
  const totalMoneyClass =
    variant === "expense"
      ? "font-medium text-rose-600 tabular-nums dark:text-rose-400"
      : `font-medium tabular-nums ${incomeHeadlineTextClass}`;
  const totalLabel =
    variant === "expense" ? "Total expenses:" : "Total income:";
  const pieKindLabel = variant === "expense" ? "expense" : "income";

  return (
    <>
      <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950/80">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
        <p className="mt-2 text-sm text-zinc-800 dark:text-zinc-200">
          {totalLabel}{" "}
          <span className={totalMoneyClass}>
            {money(pieTotalVisible)}
          </span>
          {pieExcludesHiddenAmounts ? (
            <span className="ml-1.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
              (excludes hidden)
            </span>
          ) : null}
        </p>
        <div
          className="h-[min(20rem,45vh)] min-h-[220px] w-full"
          role="presentation"
        >
          {pieSlicesVisibleOnly.length === 0 ? (
            <div className="flex h-full min-h-[220px] items-center justify-center px-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No slices in the chart — every category is hidden from the pie. See
              &quot;By category&quot; below.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieSlicesVisibleOnly}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius="74%"
                  startAngle={PIE_START_AT_12}
                  endAngle={PIE_END_FULL_CLOCKWISE}
                  label={false}
                  cursor="default"
                  isAnimationActive={false}
                >
                  {pieSlicesVisibleOnly.map((slice, index) => (
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
                      item.name ??
                        (item.payload as { name?: string })?.name ??
                        "",
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
          )}
        </div>
        <CategoryStatsDataPreview
          variant={variant}
          pieKindLabel={pieKindLabel}
          pieSlices={pieSlicesClockwise}
          pieTotalVisible={pieTotalVisible}
          pieScope={pieScope}
          calendarYear={calendarYear}
          calendarMonth={calendarMonth}
          amountColumn={breakdown.amount_column}
          extraFilters={extraFilters}
          currencyConversion={currencyConversion}
        />
      </div>
    </>
  );
}
