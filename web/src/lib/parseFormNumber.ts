/**
 * Parse numeric form input that may include thousands separators (`1,000`, `1,000.00`).
 * Commas are removed; the rest is parsed as a US-style decimal.
 */
export function parseFormNumber(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (t === "" || t === "+" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function formatComputedAmount(n: number): string {
  if (!Number.isFinite(n)) return "";
  const v = Math.round(n * 100) / 100;
  if (Object.is(v, -0)) return "0";
  return String(v);
}

/**
 * Evaluates amount-like strings using only `+` and `-`, e.g. `100.00-10.00`, `11+1.5`.
 * Commas and spaces are ignored. Returns a display string or null if invalid/incomplete.
 */
export function evaluateAmountExpression(raw: string): string | null {
  const s = raw.trim().replace(/,/g, "").replace(/\s/g, "");
  if (s === "") return null;
  if (!/^[-+0-9.]+$/.test(s)) return null;

  let i = 0;

  function readNumber(): number | null {
    const start = i;
    if (i < s.length && (s[i] === "+" || s[i] === "-")) i++;
    const d0 = i;
    while (i < s.length && /[0-9.]/.test(s[i])) i++;
    if (d0 === i) return null;
    const n = Number(s.slice(start, i));
    return Number.isFinite(n) ? n : null;
  }

  let total = readNumber();
  if (total === null) return null;
  while (i < s.length) {
    const op = s[i];
    if (op !== "+" && op !== "-") return null;
    i++;
    const next = readNumber();
    if (next === null) return null;
    total = op === "+" ? total + next : total - next;
  }
  return formatComputedAmount(total);
}
