// Hoisted regexes so `parseFormNumber` / `evaluateAmountExpression` don't
// recompile per call, and a fast-path that skips ``replace`` when no
// thousands separators are present in the input.
const RE_COMMAS = /,/g;
const RE_WHITESPACE = /\s+/g;
const RE_AMOUNT_EXPR_CHARS = /^[-+0-9.]+$/;

/** True when c is an ASCII digit or '.'. Tighter and ~2x faster than a regex test. */
function isDigitOrDot(c: string): boolean {
  return (c >= "0" && c <= "9") || c === ".";
}

/**
 * Parse numeric form input that may include thousands separators (`1,000`, `1,000.00`).
 * Commas are removed; the rest is parsed as a US-style decimal.
 */
export function parseFormNumber(raw: string): number | null {
  const trimmed = raw.trim();
  const t = trimmed.indexOf(",") === -1 ? trimmed : trimmed.replace(RE_COMMAS, "");
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
 * Formats a form amount input as ``n,nnn.nn`` for display once the field
 * loses focus. Returns null (leave the raw text as-is) when it doesn't
 * parse to a number.
 */
export function formatAmountOnBlur(raw: string): string | null {
  const n = parseFormNumber(raw);
  if (n == null) return null;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Evaluates amount-like strings using only `+` and `-`, e.g. `100.00-10.00`, `11+1.5`.
 * Commas and spaces are ignored. Returns a display string or null if invalid/incomplete.
 */
export function evaluateAmountExpression(raw: string): string | null {
  let s = raw.trim();
  if (s.indexOf(",") !== -1) s = s.replace(RE_COMMAS, "");
  if (/\s/.test(s)) s = s.replace(RE_WHITESPACE, "");
  if (s === "") return null;
  if (!RE_AMOUNT_EXPR_CHARS.test(s)) return null;

  let i = 0;

  function readNumber(): number | null {
    const start = i;
    if (i < s.length && (s[i] === "+" || s[i] === "-")) i++;
    const d0 = i;
    while (i < s.length && isDigitOrDot(s[i])) i++;
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
