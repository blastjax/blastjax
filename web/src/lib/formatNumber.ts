const AMOUNT_FORMAT = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const COUNT_FORMAT = new Intl.NumberFormat(undefined);

const EN_US_AMOUNT_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function fmtAmount(n: number): string {
  return AMOUNT_FORMAT.format(n);
}

export function fmtAmountOrDash(n: number): string {
  return Number.isFinite(n) ? AMOUNT_FORMAT.format(n) : "—";
}

export function fmtCount(n: number): string {
  return COUNT_FORMAT.format(n);
}

export function fmtAmountEnUs(n: number): string {
  return EN_US_AMOUNT_FORMAT.format(n);
}

export function fmtJackpotCompact(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : fmtAmountOrDash(n);
}

const COMPACT_MONEY_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const COMPACT_MONEY_INT_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
/** ≤4 chars ("4.8k", "10k", "423") so it fits a phone calendar cell. */
export function fmtCompactMoney(n: number): string {
  if (!Number.isFinite(n)) return "–";
  if (Math.abs(n) < 1000) return COMPACT_MONEY_INT_FORMAT.format(n);
  const k = n / 1000;
  return `${(Math.abs(k) < 10 ? COMPACT_MONEY_FORMAT : COMPACT_MONEY_INT_FORMAT).format(k)}k`;
}
