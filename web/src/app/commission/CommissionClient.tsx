"use client";

import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartZoomControls } from "@/components/ChartZoomControls";
import { ToggleLegendList } from "@/components/ToggleLegendList";
import { useTheme } from "@/components/ThemeProvider";
import { getPayslips, type PayslipRow } from "@/lib/api";
import { chartScrollMinWidth, xAxisTickInterval } from "@/lib/chartAxis";
import { getChartTooltipStyle } from "@/lib/chartTooltipStyle";
import { fmtAmount, fmtAxisMoneyTick } from "@/lib/formatNumber";
import {
  MONTH_NAMES_FULL,
  MONTH_NAMES_SHORT,
  formatMonthYearShortFromKey,
} from "@/lib/dateFormat";
import {
  AMOUNT_NEGATIVE_CLASSES,
  AMOUNT_POSITIVE_CLASSES,
  CARD_CLASSES,
  DASHED_EMPTY_CLASSES,
  ERROR_ALERT_CLASSES,
  LOADING_TEXT_CLASSES,
  PAGE_CONTAINER_CLASSES,
  SEGMENTED_BUTTON_ACTIVE_CLASSES,
  SEGMENTED_BUTTON_CLASSES,
  SEGMENTED_BUTTON_INACTIVE_CLASSES,
  SEGMENTED_WRAPPER_CLASSES,
  TABLE_CELL_CLASSES,
  TABLE_HEAD_CELL_CLASSES,
  TABLE_HEAD_ROW_CLASSES,
  TABLE_ROW_CLASSES,
  TABLE_WRAPPER_CLASSES,
} from "@/lib/ui";
import { useChartZoom } from "@/lib/useChartZoom";
import { buildCommissionForecast, type CalculationSegment } from "./commissionForecast";

const ACTUAL_COLOR = { light: "#059669", dark: "#34d399" } as const;
const FORECAST_COLOR = { light: "#9ca3af", dark: "#9ca3af" } as const;

/** Fixed-order categorical palette for the "one line per year" chart — bold, highly
 * saturated hues (still validated for CVD-safe adjacent contrast); assign by
 * ascending year so an existing year keeps its color as later years are appended,
 * rather than cycling hues on every reassignment. Same hex in both modes (already
 * bold enough to hold up on both surfaces). */
const YEAR_LINE_COLORS = [
  { light: "#2563eb", dark: "#2563eb" },
  { light: "#ea580c", dark: "#ea580c" },
  { light: "#0d9488", dark: "#0d9488" },
  { light: "#d97706", dark: "#d97706" },
  { light: "#db2777", dark: "#db2777" },
  { light: "#15803d", dark: "#15803d" },
  { light: "#7c3aed", dark: "#7c3aed" },
  { light: "#dc2626", dark: "#dc2626" },
] as const;

const CALCULATION_SEGMENT_COLOR_CLASSES: Record<
  NonNullable<CalculationSegment["color"]>,
  string
> = {
  date: "text-orange-600 dark:text-orange-400",
  years: "text-purple-600 dark:text-purple-400",
  positive: AMOUNT_POSITIVE_CLASSES,
  negative: AMOUNT_NEGATIVE_CLASSES,
};

/** Compact per-row trend: same-month actuals across previous years (green, solid)
 * bridging into the forecasted month (gray, dashed) — a visual complement to the
 * "How it's calculated" text next to it. */
function ForecastTrendSparkline({
  samples,
  forecastValue,
  actualColor,
  forecastColor,
}: {
  samples: { yearsAgo: number; value: number }[];
  forecastValue: number;
  actualColor: string;
  forecastColor: string;
}) {
  const chronological = [...samples].reverse();
  const data: { key: string; actual: number | null; forecast: number | null }[] =
    chronological.map((s) => ({ key: `-${s.yearsAgo}y`, actual: s.value, forecast: null }));
  const bridge = data[data.length - 1];
  if (bridge) bridge.forecast = bridge.actual;
  data.push({ key: "forecast", actual: null, forecast: forecastValue });

  return (
    <div className="h-8 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="actual"
            stroke={actualColor}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            stroke={forecastColor}
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={{ r: 2 }}
            isAnimationActive={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const fmtMoney = fmtAmount;

const MONTHLY_BY_YEAR_TICK_STEP = 25000;

const MONTHLY_CHART_TYPE_OPTIONS = ["line", "bar", "area"] as const;
type MonthlyChartType = (typeof MONTHLY_CHART_TYPE_OPTIONS)[number];
const MONTHLY_CHART_TYPE_LABEL: Record<MonthlyChartType, string> = {
  line: "Line",
  bar: "Bar",
  area: "Area",
};

const HORIZON_OPTIONS = [3, 6, 12] as const;
type Horizon = (typeof HORIZON_OPTIONS)[number];

export default function CommissionClient({ company = "Sophos" }: { company?: string }) {
  const [rows, setRows] = useState<PayslipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<Horizon>(6);
  const [monthlyChartType, setMonthlyChartType] = useState<MonthlyChartType>("line");
  const [hiddenYears, setHiddenYears] = useState<Set<number>>(() => new Set());

  const toggleYear = useCallback((year: number) => {
    setHiddenYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }, []);

  const { theme } = useTheme();
  const actualColor = ACTUAL_COLOR[theme];
  const forecastColor = FORECAST_COLOR[theme];
  const axisTickFill = theme === "dark" ? "#a1a1aa" : "#71717a";

  const chartTooltipStyle = useMemo(() => getChartTooltipStyle(theme), [theme]);
  const trendZoom = useChartZoom();
  const monthlyByYearZoom = useChartZoom();

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await getPayslips(2000, company);
      setRows(r.payslips);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payslips");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    void load();
  }, [load]);

  const forecast = useMemo(() => buildCommissionForecast(rows, horizon), [rows, horizon]);

  const chartData = useMemo(() => {
    const points: Record<string, string | number | null>[] = forecast.historical.map((p) => ({
      monthKey: p.monthKey,
      label: p.label,
      commission: p.commission,
      commissionForecast: null,
    }));
    const bridge = points[points.length - 1];
    if (bridge) {
      bridge.commissionForecast = forecast.historical[forecast.historical.length - 1]!.commission;
    }
    for (const fp of forecast.forecastPoints) {
      points.push({
        monthKey: fp.monthKey,
        label: fp.label,
        commission: null,
        commissionForecast: fp.commissionForecast,
      });
    }
    return points;
  }, [forecast]);

  const lastActualMonthKey = forecast.historical[forecast.historical.length - 1]?.monthKey;

  function formatMonthKeyTick(monthKey: string): string {
    return formatMonthYearShortFromKey(monthKey);
  }

  const calendarByYear = useMemo(() => {
    const map = new Map<number, Map<number, number>>();
    for (const p of forecast.historical) {
      const m = /^(\d{4})-(\d{2})$/.exec(p.monthKey);
      if (!m) continue;
      const year = Number(m[1]);
      const month = Number(m[2]);
      if (!map.has(year)) map.set(year, new Map());
      map.get(year)!.set(month, p.commission);
    }
    return map;
  }, [forecast]);

  const calendarYears = useMemo(
    () => [...calendarByYear.keys()].sort((a, b) => b - a),
    [calendarByYear],
  );

  /** Ascending so an existing year keeps its color slot as later years are appended. */
  const calendarYearsAsc = useMemo(() => [...calendarYears].sort((a, b) => a - b), [calendarYears]);

  const yearColorForIndex = useCallback(
    (index: number) => YEAR_LINE_COLORS[index % YEAR_LINE_COLORS.length]![theme],
    [theme],
  );

  const monthlyByYearChartData = useMemo(
    () =>
      MONTH_NAMES_SHORT.map((name, idx) => {
        const month = idx + 1;
        const point: Record<string, string | number | null> = { month: name };
        for (const year of calendarYearsAsc) {
          point[String(year)] = calendarByYear.get(year)?.get(month) ?? null;
        }
        return point;
      }),
    [calendarByYear, calendarYearsAsc],
  );

  /** Fixed 25k-increment Y ticks, independent of chart height, so a taller chart
   * doesn't invite Recharts to pick a different (denser) auto tick count. */
  const monthlyByYearTicks = useMemo(() => {
    let max = 0;
    for (const point of monthlyByYearChartData) {
      for (const year of calendarYearsAsc) {
        const v = point[String(year)];
        if (typeof v === "number" && v > max) max = v;
      }
    }
    const top =
      Math.ceil(Math.max(max, MONTHLY_BY_YEAR_TICK_STEP) / MONTHLY_BY_YEAR_TICK_STEP) *
      MONTHLY_BY_YEAR_TICK_STEP;
    const ticks: number[] = [];
    for (let t = 0; t <= top; t += MONTHLY_BY_YEAR_TICK_STEP) ticks.push(t);
    return ticks;
  }, [monthlyByYearChartData, calendarYearsAsc]);

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title={`${company} Commission`}
        description={
          <>
            Track commission earned per month and forecast what&apos;s still to come.
          </>
        }
      />

      {error && (
        <div className={ERROR_ALERT_CLASSES} role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className={LOADING_TEXT_CLASSES}>Loading payslips…</p>
      ) : forecast.historical.length === 0 ? (
        <p className={DASHED_EMPTY_CLASSES}>
          No commission history yet — add payslip entries with a commission amount to see a
          forecast here.
        </p>
      ) : (
        <>
          <section className={CARD_CLASSES}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium text-ink">
                  Commission trend &amp; forecast
                </h2>
                <p className="mt-1 text-sm text-ink-2">
                  Monthly commission totals from payslip history (solid), with a projected
                  continuation (dashed). Each forecasted month is trended from that same
                  calendar month in previous years — e.g. next July is projected from prior
                  Julys — rather than nearby months, since commission tends to vary by month.
                </p>
              </div>
              <ChartZoomControls
                zoom={trendZoom.zoom}
                onZoomIn={trendZoom.zoomIn}
                onZoomOut={trendZoom.zoomOut}
                onReset={trendZoom.resetZoom}
                canZoomIn={trendZoom.canZoomIn}
                canZoomOut={trendZoom.canZoomOut}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm text-ink-2">Forecast</span>
              <div className={SEGMENTED_WRAPPER_CLASSES}>
                {HORIZON_OPTIONS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className={`${SEGMENTED_BUTTON_CLASSES} ${
                      horizon === h
                        ? SEGMENTED_BUTTON_ACTIVE_CLASSES
                        : SEGMENTED_BUTTON_INACTIVE_CLASSES
                    }`}
                    onClick={() => setHorizon(h)}
                  >
                    {h} mo
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 h-[min(24rem,55vh)] w-full min-h-[240px] overflow-x-auto">
              <div className="h-full" style={{ minWidth: chartScrollMinWidth(chartData.length, 56 * trendZoom.zoom) }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 20, bottom: 8, left: 8 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-zinc-200 dark:stroke-zinc-700"
                  />
                  <XAxis
                    dataKey="monthKey"
                    tick={{ fontSize: 11, fill: axisTickFill }}
                    tickFormatter={formatMonthKeyTick}
                    interval={xAxisTickInterval(chartData.length, 48)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: axisTickFill }}
                    tickFormatter={fmtAxisMoneyTick}
                  />
                  <Tooltip
                    formatter={(value) => fmtMoney(Number(value ?? 0))}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
                    contentStyle={chartTooltipStyle}
                  />
                  <Legend />
                  {lastActualMonthKey && (
                    <ReferenceLine
                      x={lastActualMonthKey}
                      stroke={axisTickFill}
                      strokeDasharray="4 4"
                      label={{ value: "Today", position: "insideTopRight", fill: axisTickFill, fontSize: 11 }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="commission"
                    name="Commission (actual)"
                    stroke={actualColor}
                    strokeWidth={2}
                    fill={actualColor}
                    fillOpacity={0.22}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="commissionForecast"
                    name="Commission (forecast)"
                    stroke={forecastColor}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    fill={forecastColor}
                    fillOpacity={0.18}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className={CARD_CLASSES}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium text-ink">
                  Commission by month
                </h2>
                <p className="mt-1 text-sm text-ink-2">
                  The same twelve calendar months, one line per year, so seasonal patterns
                  within a year are easy to compare across years. Click a year below the
                  chart to hide or show it.
                </p>
              </div>
              <ChartZoomControls
                zoom={monthlyByYearZoom.zoom}
                onZoomIn={monthlyByYearZoom.zoomIn}
                onZoomOut={monthlyByYearZoom.zoomOut}
                onReset={monthlyByYearZoom.resetZoom}
                canZoomIn={monthlyByYearZoom.canZoomIn}
                canZoomOut={monthlyByYearZoom.canZoomOut}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm text-ink-2">Chart type</span>
              <div className={SEGMENTED_WRAPPER_CLASSES}>
                {MONTHLY_CHART_TYPE_OPTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`${SEGMENTED_BUTTON_CLASSES} ${
                      monthlyChartType === t
                        ? SEGMENTED_BUTTON_ACTIVE_CLASSES
                        : SEGMENTED_BUTTON_INACTIVE_CLASSES
                    }`}
                    onClick={() => setMonthlyChartType(t)}
                  >
                    {MONTHLY_CHART_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 h-[min(36rem,75vh)] w-full min-h-[360px] overflow-x-auto">
              <div className="h-full" style={{ minWidth: chartScrollMinWidth(monthlyByYearChartData.length, 40 * monthlyByYearZoom.zoom) }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={monthlyByYearChartData}
                  margin={{ top: 8, right: 20, bottom: 8, left: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-zinc-200 dark:stroke-zinc-700"
                  />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: axisTickFill }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: axisTickFill }}
                    domain={[0, monthlyByYearTicks[monthlyByYearTicks.length - 1]]}
                    ticks={monthlyByYearTicks}
                    tickFormatter={fmtAxisMoneyTick}
                  />
                  <Tooltip
                    formatter={(value) => fmtMoney(Number(value ?? 0))}
                    itemSorter={(item) => -Number(item.dataKey)}
                    contentStyle={chartTooltipStyle}
                  />
                  <Legend
                    content={(props) => (
                      <ToggleLegendList
                        items={(props.payload ?? []).map((entry) => {
                          const year = Number(entry.value);
                          return {
                            key: String(entry.value),
                            label: String(entry.value),
                            color: entry.color ?? "",
                            hidden: hiddenYears.has(year),
                          };
                        })}
                        onToggle={(key) => toggleYear(Number(key))}
                      />
                    )}
                  />
                  {calendarYearsAsc.map((year, idx) => {
                    const color = yearColorForIndex(idx);
                    const hidden = hiddenYears.has(year);
                    const dataKey = String(year);
                    if (monthlyChartType === "bar") {
                      return (
                        <Bar
                          key={year}
                          dataKey={dataKey}
                          name={dataKey}
                          fill={color}
                          radius={[4, 4, 0, 0]}
                          hide={hidden}
                        />
                      );
                    }
                    if (monthlyChartType === "area") {
                      return (
                        <Area
                          key={year}
                          type="monotone"
                          dataKey={dataKey}
                          name={dataKey}
                          stroke={color}
                          strokeWidth={2}
                          fill={color}
                          fillOpacity={0.1}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                          connectNulls={false}
                          hide={hidden}
                        />
                      );
                    }
                    return (
                      <Line
                        key={year}
                        type="monotone"
                        dataKey={dataKey}
                        name={dataKey}
                        stroke={color}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        connectNulls={false}
                        hide={hidden}
                      />
                    );
                  })}
                </ComposedChart>
              </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className={CARD_CLASSES}>
            <h2 className="text-lg font-medium text-ink">
              Forecast summary
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              Each month below is projected from its own same-month history across{" "}
              {forecast.forecastPoints[0]?.yearsOfHistory ?? 0} previous year
              {forecast.forecastPoints[0]?.yearsOfHistory === 1 ? "" : "s"} of data.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-success-line bg-success-soft p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-success-text">
                  Next month predicted
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-success-text">
                  {forecast.nextMonthPredicted != null ? fmtMoney(forecast.nextMonthPredicted) : "–"}
                </p>
              </div>
              <div className="rounded-lg border border-line bg-surface-2 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  Predicted total ({horizon} mo)
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
                  {fmtMoney(forecast.horizonTotal)}
                </p>
              </div>
              <div className="rounded-lg border border-line bg-surface-2 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  Same month last year
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
                  {forecast.forecastPoints[0]?.sameMonthLastYear != null
                    ? fmtMoney(forecast.forecastPoints[0].sameMonthLastYear)
                    : "–"}
                </p>
              </div>
              <div className="rounded-lg border border-line bg-surface-2 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  All-time monthly average
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
                  {forecast.allTimeAverage != null ? fmtMoney(forecast.allTimeAverage) : "–"}
                </p>
              </div>
            </div>

            {forecast.forecastPoints.length > 0 && (
              <div className={`${TABLE_WRAPPER_CLASSES} mt-6 overflow-x-auto`}>
                <table className="w-full min-w-[42rem] text-left text-sm">
                  <thead>
                    <tr className={TABLE_HEAD_ROW_CLASSES}>
                      <th className={TABLE_HEAD_CELL_CLASSES}>Month</th>
                      <th className={TABLE_HEAD_CELL_CLASSES}>Predicted commission</th>
                      <th className={TABLE_HEAD_CELL_CLASSES}>Trend</th>
                      <th className={TABLE_HEAD_CELL_CLASSES}>How it&apos;s calculated</th>
                      <th className={TABLE_HEAD_CELL_CLASSES}>Years used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.forecastPoints.map((fp) => (
                      <tr key={fp.monthKey} className={TABLE_ROW_CLASSES}>
                        <td className={TABLE_CELL_CLASSES}>{fp.label}</td>
                        <td className={`${TABLE_CELL_CLASSES} ${AMOUNT_POSITIVE_CLASSES}`}>
                          {fmtMoney(fp.commissionForecast)}
                        </td>
                        <td className={TABLE_CELL_CLASSES}>
                          <ForecastTrendSparkline
                            samples={fp.sameMonthSamples}
                            forecastValue={fp.commissionForecast}
                            actualColor={actualColor}
                            forecastColor={forecastColor}
                          />
                        </td>
                        <td className={`${TABLE_CELL_CLASSES} text-xs`}>
                          {fp.calculationDetail.map((seg, i) => {
                            if (seg.break) return <br key={i} />;
                            const colorClass = seg.color
                              ? CALCULATION_SEGMENT_COLOR_CLASSES[seg.color]
                              : undefined;
                            return seg.bold ? (
                              <strong
                                key={i}
                                className={`font-semibold ${
                                  colorClass ?? "text-ink-2"
                                }`}
                              >
                                {seg.text}
                              </strong>
                            ) : (
                              <span key={i} className={colorClass}>
                                {seg.text}
                              </span>
                            );
                          })}
                        </td>
                        <td className={TABLE_CELL_CLASSES}>
                          {fp.yearsOfHistory}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={CARD_CLASSES}>
            <h2 className="text-lg font-medium text-ink">
              Historic commission entries
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              One commission total per month, most recent year first.
            </p>
            {calendarYears.length === 0 ? (
              <p className={`mt-4 ${DASHED_EMPTY_CLASSES}`}>No commission entries recorded yet.</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                {calendarYears.map((year) => {
                  const monthMap = calendarByYear.get(year)!;
                  const yearTotal = [...monthMap.values()].reduce((s, v) => s + v, 0);
                  return (
                    <div
                      key={year}
                      className="flex w-full min-w-0 flex-col rounded-lg border border-line bg-zinc-50/40 p-4 sm:p-5 dark:bg-zinc-900/30"
                    >
                      <h3 className="mb-4 flex items-center justify-between gap-2 border-b border-line pb-3 text-base font-semibold text-ink">
                        <span>{year}</span>
                        <span className="text-base font-normal tabular-nums text-success-text">
                          {fmtMoney(yearTotal)}
                        </span>
                      </h3>
                      <div className="grid w-full min-w-0 grid-cols-3 gap-2 sm:gap-3">
                        {MONTH_NAMES_FULL.map((monthName, idx) => {
                          const month = idx + 1;
                          const value = monthMap.get(month);
                          const hasValue = value != null && value > 0;
                          return (
                            <div
                              key={month}
                              className={`flex min-h-[3.75rem] min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-2 text-center ${
                                hasValue
                                  ? "border-success-line bg-success-soft"
                                  : "border-dashed border-line bg-zinc-50/50 dark:bg-zinc-900/40"
                              }`}
                            >
                              <span className="min-w-0 truncate text-[11px] font-medium leading-tight text-ink-2">
                                {monthName} {year}
                              </span>
                              <span
                                className={`min-w-0 truncate text-xs tabular-nums leading-tight ${
                                  hasValue
                                    ? "font-semibold text-success-text"
                                    : "text-ink-4"
                                }`}
                              >
                                {hasValue ? fmtMoney(value) : "–"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
