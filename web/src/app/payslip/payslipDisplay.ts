export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "0.00";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtPctOfTotal(
  amount: number,
  totalSum: number,
  ofLabel: "gross" | "net" = "gross",
): string {
  if (!(totalSum > 0)) return "—";
  const pct = (amount / totalSum) * 100;
  const s = pct.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${s}% of ${ofLabel}`;
}

export function fmtPayPeriod(
  y: number | null | undefined,
  m: number | null | undefined,
  h: number | null | undefined,
): string {
  if (
    (y == null || !Number.isFinite(y)) &&
    (m == null || !Number.isFinite(m)) &&
    (h == null || !Number.isFinite(h))
  ) {
    return "—";
  }
  const parts: string[] = [];
  if (m != null && m >= 1 && m <= 12) {
    parts.push(
      new Date(2000, m - 1, 1).toLocaleString(undefined, { month: "long" }),
    );
  }
  if (y != null && Number.isFinite(y)) parts.push(String(Math.trunc(y)));
  let s = parts.join(" ");
  if (h === 1) s = s ? `${s} · 1st half` : "1st half";
  else if (h === 2) s = s ? `${s} · 2nd half` : "2nd half";
  return s || "—";
}

export function slotTitle(year: number, month: number, half: 1 | 2): string {
  return `${new Date(2000, month - 1, 1).toLocaleString(undefined, {
    month: "long",
  })} ${year} · ${half === 1 ? "1st" : "2nd"} half`;
}
