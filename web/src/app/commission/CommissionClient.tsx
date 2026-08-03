"use client";

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
import { ToggleLegendList } from "@/components/ToggleLegendList";
import { useTheme } from "@/components/ThemeProvider";
import { getPayslips, type PayslipRow } from "@/lib/api";
import { getChartTooltipStyle } from "@/lib/chartTooltipStyle";
import {
  MONTH_NAMES_FULL,
  MONTH_NAMES_SHORT,
  formatMonthYearShortFromKey,
} from "@/lib/dateFormat";
import {
  DASHED_EMPTY_CLASSES,
  ERROR_ALERT_CLASSES,
  LOADING_TEXT_CLASSES,
  SEGMENTED_BUTTON_ACTIVE_CLASSES,
  SEGMENTED_BUTTON_CLASSES,
  SEGMENTED_BUTTON_INACTIVE_CLASSES,
  SEGMENTED_WRAPPER_CLASSES,
} from "@/lib/ui";
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
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
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

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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

export default function CommissionClient() {
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

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await getPayslips(2000);
      setRows(r.payslips);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payslips");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
    <div className="box-border flex w-full min-w-0 flex-col gap-10 px-4 pb-28 pt-10 sm:px-6 lg:px-8">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Commission
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Track commission earned per month and forecast what&apos;s still to come.
        </p>
      </header>

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
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Commission trend &amp; forecast
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Monthly commission totals from payslip history (solid), with a projected
              continuation (dashed). Each forecasted month is trended from that same
              calendar month in previous years — e.g. next July is projected from prior
              Julys — rather than nearby months, since commission tends to vary by month.
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Forecast</span>
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

            <div className="mt-6 h-[min(24rem,55vh)] w-full min-h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-zinc-200 dark:stroke-zinc-700"
                  />
                  <XAxis
                    dataKey="monthKey"
                    tick={{ fontSize: 11, fill: axisTickFill }}
                    tickFormatter={formatMonthKeyTick}
                    interval={1}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: axisTickFill }}
                    tickFormatter={(v) =>
                      Number(v) >= 1000
                        ? `${(Number(v) / 1000).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}k`
                        : Number(v).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                    }
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
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Commission by month
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              The same twelve calendar months, one line per year, so seasonal patterns
              within a year are easy to compare across years. Click a year below the
              chart to hide or show it.
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Chart type</span>
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

            <div className="mt-6 h-[min(36rem,75vh)] w-full min-h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={monthlyByYearChartData}
                  margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
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
                    tickFormatter={(v) =>
                      Number(v) >= 1000
                        ? `${(Number(v) / 1000).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}k`
                        : Number(v).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                    }
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
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Forecast summary
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Each month below is projected from its own same-month history across{" "}
              {forecast.forecastPoints[0]?.yearsOfHistory ?? 0} previous year
              {forecast.forecastPoints[0]?.yearsOfHistory === 1 ? "" : "s"} of data.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Next month predicted
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-800 dark:text-emerald-200">
                  {forecast.nextMonthPredicted != null ? fmtMoney(forecast.nextMonthPredicted) : "–"}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/90 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Predicted total ({horizon} mo)
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
                  {fmtMoney(forecast.horizonTotal)}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/90 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Same month last year
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
                  {forecast.forecastPoints[0]?.sameMonthLastYear != null
                    ? fmtMoney(forecast.forecastPoints[0].sameMonthLastYear)
                    : "–"}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/90 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  All-time monthly average
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
                  {forecast.allTimeAverage != null ? fmtMoney(forecast.allTimeAverage) : "–"}
                </p>
              </div>
            </div>

            {forecast.forecastPoints.length > 0 && (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[42rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-800">
                      <th className="pb-2 pr-2">Month</th>
                      <th className="pb-2 pr-2">Predicted commission</th>
                      <th className="pb-2 pr-2">Trend</th>
                      <th className="pb-2 pr-2">How it&apos;s calculated</th>
                      <th className="pb-2">Years used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.forecastPoints.map((fp) => (
                      <tr key={fp.monthKey} className="border-b border-zinc-100 dark:border-zinc-800/60">
                        <td className="py-2 pr-2 text-zinc-700 dark:text-zinc-300">{fp.label}</td>
                        <td className="py-2 pr-2 tabular-nums font-medium text-emerald-700 dark:text-emerald-300">
                          {fmtMoney(fp.commissionForecast)}
                        </td>
                        <td className="py-2 pr-2">
                          <ForecastTrendSparkline
                            samples={fp.sameMonthSamples}
                            forecastValue={fp.commissionForecast}
                            actualColor={actualColor}
                            forecastColor={forecastColor}
                          />
                        </td>
                        <td className="py-2 pr-2 text-xs text-zinc-500 dark:text-zinc-400">
                          {fp.calculationDetail.map((seg, i) => {
                            if (seg.break) return <br key={i} />;
                            const colorClass = seg.color
                              ? CALCULATION_SEGMENT_COLOR_CLASSES[seg.color]
                              : undefined;
                            return seg.bold ? (
                              <strong
                                key={i}
                                className={`font-semibold ${
                                  colorClass ?? "text-zinc-700 dark:text-zinc-300"
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
                        <td className="py-2 tabular-nums text-zinc-500 dark:text-zinc-400">
                          {fp.yearsOfHistory}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Historic commission entries
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
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
                      className="flex w-full min-w-0 flex-col rounded-xl border border-zinc-200 bg-zinc-50/40 p-4 shadow-sm sm:p-5 dark:border-zinc-700 dark:bg-zinc-900/30"
                    >
                      <h3 className="mb-4 flex items-center justify-between gap-2 border-b border-zinc-200 pb-3 text-base font-semibold text-zinc-800 dark:border-zinc-700 dark:text-zinc-100">
                        <span>{year}</span>
                        <span className="text-base font-normal tabular-nums text-emerald-700 dark:text-emerald-300">
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
                                  ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900 dark:bg-emerald-950/40"
                                  : "border-dashed border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-900/40"
                              }`}
                            >
                              <span className="min-w-0 truncate text-[11px] font-medium leading-tight text-zinc-700 dark:text-zinc-300">
                                {monthName} {year}
                              </span>
                              <span
                                className={`min-w-0 truncate text-xs tabular-nums leading-tight ${
                                  hasValue
                                    ? "font-semibold text-emerald-800 dark:text-emerald-200"
                                    : "text-zinc-400 dark:text-zinc-500"
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
