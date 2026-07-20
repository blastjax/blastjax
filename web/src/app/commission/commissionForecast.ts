import { formatMonthYearFromKey, monthKey as sharedMonthKey, parseMonthKey as sharedParseMonthKey } from "@/lib/dateFormat";
import type { PayslipRow } from "@/lib/api";

/** Calendar month { y, m } for aggregation (1-12); mirrors salary-stats bucketing. */
function calendarMonthForRow(r: PayslipRow): { y: number; m: number } | null {
  const py = r.period_year;
  const pm = r.period_month;
  if (
    py != null &&
    Number.isFinite(py) &&
    pm != null &&
    pm >= 1 &&
    pm <= 12 &&
    r.period_half != null &&
    r.period_half >= 1 &&
    r.period_half <= 2
  ) {
    return { y: Math.trunc(py), m: pm };
  }
  if (r.created_at) {
    const d = new Date(r.created_at);
    if (!Number.isNaN(d.getTime())) {
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    }
  }
  return null;
}

const monthKey = sharedMonthKey;
const parseMonthKey = sharedParseMonthKey;

/** Month key shifted by `delta` months (may be negative). */
function shiftMonthKey(key: string, delta: number): string {
  const p = parseMonthKey(key);
  if (!p) return key;
  const total = p.y * 12 + (p.m - 1) + delta;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return monthKey(y, m);
}

const monthLabel = formatMonthYearFromKey;

export interface MonthlyCommissionPoint {
  monthKey: string;
  label: string;
  commission: number;
}

/** Sum of `commission` per calendar month, zero-filled across every month from the
 * earliest to the latest payslip entry (so gaps don't skew the trend). */
export function buildMonthlyCommissionSeries(
  rows: PayslipRow[],
): MonthlyCommissionPoint[] {
  const sums = new Map<string, number>();
  for (const r of rows) {
    const cm = calendarMonthForRow(r);
    if (!cm) continue;
    const v = r.commission;
    if (v == null || !Number.isFinite(v)) continue;
    const k = monthKey(cm.y, cm.m);
    sums.set(k, (sums.get(k) ?? 0) + v);
  }
  if (sums.size === 0) return [];
  const keys = [...sums.keys()].sort();
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  const out: MonthlyCommissionPoint[] = [];
  let cur = first;
  while (true) {
    out.push({ monthKey: cur, label: monthLabel(cur), commission: sums.get(cur) ?? 0 });
    if (cur === last) break;
    cur = shiftMonthKey(cur, 1);
  }
  return out;
}

interface LinearFit {
  slope: number;
  intercept: number;
  rSquared: number;
}

/** Ordinary least-squares fit of `ys` against x = 0..ys.length-1. */
function fitLinearTrend(ys: number[]): LinearFit {
  const n = ys.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let x = 0; x < n; x++) {
    const y = ys[x]!;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let x = 0; x < n; x++) {
    const y = ys[x]!;
    const pred = intercept + slope * x;
    ssTot += (y - meanY) ** 2;
    ssRes += (y - pred) ** 2;
  }
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  return { slope, intercept, rSquared };
}

export type ForecastMethod = "seasonal" | "none";

export interface ForecastPoint {
  monthKey: string;
  label: string;
  commissionForecast: number;
  /** How many previous years supplied a same-month data point (0-8). */
  yearsOfHistory: number;
  /** Actual commission for this same calendar month one year earlier, if known. */
  sameMonthLastYear: number | null;
}

export interface CommissionForecast {
  method: ForecastMethod;
  historical: MonthlyCommissionPoint[];
  /** Future months only (does not include the bridging last-actual point). */
  forecastPoints: ForecastPoint[];
  nextMonthPredicted: number | null;
  horizonTotal: number;
  allTimeAverage: number | null;
}

const MAX_YEARS_BACK = 8;

/** Same-calendar-month values from previous years, most recent first; stops at the
 * first gap since `byMonthKey` only holds the contiguous zero-filled history range. */
function sameMonthHistory(
  byMonthKey: Map<string, number>,
  targetKey: string,
): { yearsAgo: number; value: number }[] {
  const samples: { yearsAgo: number; value: number }[] = [];
  for (let k = 1; k <= MAX_YEARS_BACK; k++) {
    const key = shiftMonthKey(targetKey, -12 * k);
    const v = byMonthKey.get(key);
    if (v === undefined) break;
    samples.push({ yearsAgo: k, value: v });
  }
  return samples;
}

/** Predicts one future month from its own same-month history across previous years:
 * a linear trend across those years when 2+ are available, the single prior year's
 * value when only one exists, and the all-time monthly average as a last resort. */
function predictFromSameMonthHistory(
  samples: { yearsAgo: number; value: number }[],
  fallback: number,
): number {
  if (samples.length === 0) return Math.max(0, fallback);
  if (samples.length === 1) return Math.max(0, samples[0]!.value);
  const chronological = [...samples].reverse().map((s) => s.value);
  const { slope, intercept } = fitLinearTrend(chronological);
  return Math.max(0, intercept + slope * chronological.length);
}

/** Builds a monthly commission history plus a forward projection of `horizonMonths`,
 * predicting each future month from that same calendar month in previous years
 * (e.g. next July's forecast is trended from prior Julys) rather than nearby months. */
export function buildCommissionForecast(
  rows: PayslipRow[],
  horizonMonths: number,
): CommissionForecast {
  const historical = buildMonthlyCommissionSeries(rows);
  const n = historical.length;

  if (n === 0) {
    return {
      method: "none",
      historical,
      forecastPoints: [],
      nextMonthPredicted: null,
      horizonTotal: 0,
      allTimeAverage: null,
    };
  }

  const allTimeAverage =
    historical.reduce((s, p) => s + p.commission, 0) / historical.length;
  const byMonthKey = new Map(historical.map((p) => [p.monthKey, p.commission]));
  const lastKey = historical[n - 1]!.monthKey;

  const forecastPoints: ForecastPoint[] = [];
  let cur = lastKey;
  let horizonTotal = 0;
  for (let i = 0; i < horizonMonths; i++) {
    cur = shiftMonthKey(cur, 1);
    const samples = sameMonthHistory(byMonthKey, cur);
    const predicted = predictFromSameMonthHistory(samples, allTimeAverage);
    horizonTotal += predicted;
    forecastPoints.push({
      monthKey: cur,
      label: monthLabel(cur),
      commissionForecast: predicted,
      yearsOfHistory: samples.length,
      sameMonthLastYear: samples[0]?.value ?? null,
    });
  }

  return {
    method: "seasonal",
    historical,
    forecastPoints,
    nextMonthPredicted: forecastPoints[0]?.commissionForecast ?? null,
    horizonTotal,
    allTimeAverage,
  };
}
