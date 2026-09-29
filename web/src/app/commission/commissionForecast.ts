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
  /** Annual growth factor the inputs were grown by (1.1 = +10%/yr). */
  growth: number;
  /** The same-month `[year, value]` inputs, oldest first. */
  pts: [number, number][];
};

const MAX_YEARS = 5;

/** Compound annual growth from the first 12 months' total to the latest 12
 * months' total of the contiguous `hist`; 1 with under two years of data. */
function annualGrowth(hist: readonly MonthValue[]): number {
  const n = hist.length;
  if (n < 24) return 1;
  const total = (from: number) => hist.slice(from, from + 12).reduce((a, d) => a + d.v, 0);
  const first = total(0);
  const latest = total(n - 12);
  return first > 0 && latest > 0 ? (latest / first) ** (12 / (n - 12)) : 1;
}

/** Projects month `m` of year `y` as the median of up to five prior years of
 * that same calendar month, each grown to year `y` by `growth` — commission is
 * seasonal and trends up, and the median shrugs off one-off spikes and dips.
 * Backtested on real history this beat a per-month least-squares line (~15%
 * lower monthly error, same 12-month-total error). With no prior year it falls
 * back to `fallback`. */
function forecastMonth(
  byIndex: Map<number, number>,
  firstY: number,
  y: number,
  m: number,
  growth: number,
  fallback: number,
): Forecast {
  const pts: [number, number][] = [];
  // Skips years with no actual (e.g. next year's Dec when this Dec is still a forecast).
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

/** The `horizon` months after the last actual month, each from its own
 * growth-adjusted same-month history (the all-time monthly average when there is none). */
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
