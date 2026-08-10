/**
 * Canonical number formatting for the whole app, built on *cached*
 * `Intl.NumberFormat` instances.
 *
 * Every call site used to inline `n.toLocaleString(undefined, { … })`, which
 * re-resolves the locale and options on each call. That cost is invisible for
 * one label and very visible in the places this app actually formats numbers:
 * a 42-cell calendar grid, installment schedule tables, and recharts
 * `tickFormatter` / `label` callbacks that run per tick and per data point on
 * every chart render. Constructing the formatter once and reusing it is the
 * whole optimization — `format()` on a live instance is roughly an order of
 * magnitude cheaper than `toLocaleString` with an options object.
 *
 * The locale stays `undefined` (i.e. the reader's browser locale) so output is
 * byte-identical to what these call sites produced before; it's resolved once
 * at module load instead of per call. Date formatting is the deliberate
 * exception — see `dateFormat.ts`, which pins `en-US`.
 */

/** `1,234.57` — two fraction digits, always. The app's default money format. */
const AMOUNT_FORMAT = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `1,235` — whole numbers only. */
const INTEGER_FORMAT = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

/** `1,234` — plain locale grouping, matching a bare `toLocaleString()`. */
const COUNT_FORMAT = new Intl.NumberFormat(undefined);

/** `n,nnn.nn`, pinned to `en-US` — for form inputs the app re-parses itself. */
const EN_US_AMOUNT_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `1,234.57`. Non-finite input formats as-is (`NaN`, `∞`) — use {@link fmtAmountOrDash} to guard. */
export function fmtAmount(n: number): string {
  return AMOUNT_FORMAT.format(n);
}

/** {@link fmtAmount}, but an em dash for `NaN`/`Infinity` instead of a broken-looking number. */
export function fmtAmountOrDash(n: number): string {
  return Number.isFinite(n) ? AMOUNT_FORMAT.format(n) : "—";
}

/** `1,235` — rounded to a whole number; em dash when non-finite. */
export function fmtIntegerOrDash(n: number): string {
  return Number.isFinite(n) ? INTEGER_FORMAT.format(n) : "—";
}

/** `1,234` — locale grouping with no fraction-digit overrides. */
export function fmtCount(n: number): string {
  return COUNT_FORMAT.format(n);
}

/** `n,nnn.nn` in `en-US`, regardless of the reader's locale. */
export function fmtAmountEnUs(n: number): string {
  return EN_US_AMOUNT_FORMAT.format(n);
}

/**
 * Chart axis ticks: `12,500.00` below 1000, `12.50k` at or above it. Shared by
 * every money y-axis so the three chart pages can't drift apart, and so the
 * formatter isn't rebuilt for each of the ~6 ticks per render.
 */
export function fmtAxisMoneyTick(value: unknown): string {
  const n = Number(value);
  return n >= 1000 ? `${AMOUNT_FORMAT.format(n / 1000)}k` : AMOUNT_FORMAT.format(n);
}
