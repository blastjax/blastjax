"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "@/components/ThemeProvider";
import { getPayslips, type PayslipRow } from "@/lib/api";
import { buildCommissionForecast } from "./commissionForecast";

const ACTUAL_COLOR = { light: "#059669", dark: "#34d399" } as const;
const FORECAST_COLOR = { light: "#9ca3af", dark: "#9ca3af" } as const;

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const HORIZON_OPTIONS = [3, 6, 12] as const;
type Horizon = (typeof HORIZON_OPTIONS)[number];

const MONTH_FULL_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleString(undefined, { month: "long" }),
);

export default function CommissionClient() {
  const [rows, setRows] = useState<PayslipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<Horizon>(6);

  const { theme } = useTheme();
  const actualColor = ACTUAL_COLOR[theme];
  const forecastColor = FORECAST_COLOR[theme];
  const axisTickFill = theme === "dark" ? "#a1a1aa" : "#71717a";

  const chartTooltipStyle = useMemo(
    () =>
      theme === "dark"
        ? {
            backgroundColor: "rgba(24, 24, 27, 0.92)",
            border: "1px solid rgb(63 63 70)",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#fafafa",
          }
        : {
            backgroundColor: "rgba(255, 255, 255, 0.96)",
            border: "1px solid rgb(228 228 231)",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#18181b",
          },
    [theme],
  );

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
    const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
    return m ? `${m[2]}-${m[1].slice(2)}` : monthKey;
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

  return (
    <div className="box-border flex w-full min-w-0 flex-col gap-10 px-4 pb-28 pt-10 sm:px-6 lg:px-8">
      <header className="border-b border-zinc-200 pb-8 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Commission
        </h1>
      </header>

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading payslips…</p>
      ) : forecast.historical.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
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
              <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
                {HORIZON_OPTIONS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      horizon === h
                        ? "bg-indigo-600 text-white"
                        : "text-zinc-700 dark:text-zinc-300"
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
                <table className="w-full min-w-[24rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-800">
                      <th className="pb-2 pr-2">Month</th>
                      <th className="pb-2 pr-2">Predicted commission</th>
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
              <p className="mt-4 text-sm text-zinc-500">No commission entries recorded yet.</p>
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
                        {MONTH_FULL_NAMES.map((monthName, idx) => {
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
