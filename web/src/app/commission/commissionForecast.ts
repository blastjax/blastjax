import type { PayslipRow } from "@/lib/api";
import { calendarMonthIndex } from "@/app/payslip/payslipAggregates";

/** Commission for one calendar month; `m` is 0-based. */
export type MonthValue = { y: number; m: number; v: number };

/** Commission summed per calendar month, zero-filled from the first month with a
 * commission entry to the last (so gaps don't skew the trend). */
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
  /** Fitted change per year. */
  slope: number;
  /** The same-month `[year, value]` inputs, oldest first. */
  pts: [number, number][];
};

const MAX_YEARS = 5;

/** Projects month `m` of year `y` from up to five prior years of that same
 * calendar month — a least-squares line over (year, value), since commission is
 * seasonal. With no prior year it falls back to `fallback`. */
function forecastMonth(
  byIndex: Map<number, number>,
  y: number,
  m: number,
  fallback: number,
): Forecast {
  const pts: [number, number][] = [];
  for (let yy = y - 1; pts.length < MAX_YEARS; yy--) {
    const v = byIndex.get(yy * 12 + m);
    if (v === undefined) break;
    pts.unshift([yy, v]);
  }
  const n = pts.length;
  if (n === 0) return { y, m, v: Math.max(0, fallback), slope: 0, pts };
  const mx = pts.reduce((a, p) => a + p[0], 0) / n;
  const my = pts.reduce((a, p) => a + p[1], 0) / n;
  let nu = 0;
  let de = 0;
  for (const [px, py] of pts) {
    nu += (px - mx) * (py - my);
    de += (px - mx) ** 2;
  }
  const slope = de ? nu / de : 0;
  return { y, m, v: Math.max(0, my + slope * (y - mx)), slope, pts };
}

/** The `horizon` months after the last actual month, each trended from its own
 * same-month history (the all-time monthly average when there is none). */
export function buildForecast(hist: readonly MonthValue[], horizon: number): Forecast[] {
  if (hist.length === 0) return [];
  const byIndex = new Map(hist.map((d) => [d.y * 12 + d.m, d.v]));
  const avg = hist.reduce((a, d) => a + d.v, 0) / hist.length;
  const last = hist[hist.length - 1]!;
  const lastT = last.y * 12 + last.m;
  return Array.from({ length: horizon }, (_, i) => {
    const t = lastT + 1 + i;
    return forecastMonth(byIndex, Math.floor(t / 12), t % 12, avg);
  });
}
