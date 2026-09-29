import type { PayslipRow } from "@/lib/api";
import { calendarMonthIndex } from "@/app/payslip/payslipAggregates";

export type MonthValue = { y: number; m: number; v: number };

export function monthlyCommission(rows: PayslipRow[]): MonthValue[] {
  const sums = new Map<number, number>();
  for (const r of rows) {
    const t = calendarMonthIndex(r);
    const v = r.commission;
    if (t == null || v == null || !Number.isFinite(v)) continue;
    sums.set(t, (sums.get(t) ?? 0) + v);
  }
  if (sums.size === 0) return [];
  const ts = [...sums.keys()];
  const hi = Math.max(...ts);
  const out: MonthValue[] = [];
  for (let t = Math.min(...ts); t <= hi; t++) {
    out.push({ y: Math.floor(t / 12), m: t % 12, v: sums.get(t) ?? 0 });
  }
  return out;
}

export type Forecast = MonthValue & {
  growth: number;
  pts: [number, number][];
};

const MAX_YEARS = 5;

function annualGrowth(hist: readonly MonthValue[]): number {
  const n = hist.length;
  if (n < 24) return 1;
  const total = (from: number) => hist.slice(from, from + 12).reduce((a, d) => a + d.v, 0);
  const first = total(0);
  const latest = total(n - 12);
  return first > 0 && latest > 0 ? (latest / first) ** (12 / (n - 12)) : 1;
}

function forecastMonth(
  byIndex: Map<number, number>,
  firstY: number,
  y: number,
  m: number,
  growth: number,
  fallback: number,
): Forecast {
  const pts: [number, number][] = [];
  for (let yy = y - 1; yy >= firstY && pts.length < MAX_YEARS; yy--) {
    const v = byIndex.get(yy * 12 + m);
    if (v !== undefined) pts.unshift([yy, v]);
  }
  if (pts.length === 0) return { y, m, v: Math.max(0, fallback), growth, pts };
  const grown = pts.map(([py, pv]) => pv * growth ** (y - py)).sort((a, b) => a - b);
  const mid = grown.length >> 1;
  const v = grown.length % 2 ? grown[mid]! : (grown[mid - 1]! + grown[mid]!) / 2;
  return { y, m, v: Math.max(0, v), growth, pts };
}

export function buildForecast(hist: readonly MonthValue[], horizon: number): Forecast[] {
  if (hist.length === 0) return [];
  const byIndex = new Map(hist.map((d) => [d.y * 12 + d.m, d.v]));
  const avg = hist.reduce((a, d) => a + d.v, 0) / hist.length;
  const growth = annualGrowth(hist);
  const last = hist[hist.length - 1]!;
  const lastT = last.y * 12 + last.m;
  return Array.from({ length: horizon }, (_, i) => {
    const t = lastT + 1 + i;
    return forecastMonth(byIndex, hist[0]!.y, Math.floor(t / 12), t % 12, growth, avg);
  });
}
