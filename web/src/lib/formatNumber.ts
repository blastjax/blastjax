const AMOUNT_FORMAT = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INTEGER_FORMAT = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
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

export function fmtIntegerOrDash(n: number): string {
  return Number.isFinite(n) ? INTEGER_FORMAT.format(n) : "—";
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
export function fmtCompactMoney(n: number): string {
  if (!Number.isFinite(n)) return "–";
  return Math.abs(n) >= 1000
    ? `${COMPACT_MONEY_FORMAT.format(n / 1000)}k`
    : COMPACT_MONEY_FORMAT.format(n);
}
