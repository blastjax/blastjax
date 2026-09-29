import { fmtAmountEnUs } from "@/lib/formatNumber";

const RE_COMMAS = /,/g;
const RE_WHITESPACE = /\s+/g;
const RE_AMOUNT_EXPR_CHARS = /^[-+0-9.]+$/;

function isDigitOrDot(c: string): boolean {
  return (c >= "0" && c <= "9") || c === ".";
}

export function parseFormNumber(raw: string): number | null {
  const trimmed = raw.trim();
  const t = trimmed.indexOf(",") === -1 ? trimmed : trimmed.replace(RE_COMMAS, "");
  if (t === "" || t === "+" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function formatAmountNumber(n: number): string {
  return fmtAmountEnUs(n);
}

function formatComputedAmount(n: number): string {
  if (!Number.isFinite(n)) return "";
  const v = Math.round(n * 100) / 100;
  return formatAmountNumber(Object.is(v, -0) ? 0 : v);
}

export function formatAmountOnBlur(raw: string): string | null {
  const n = parseFormNumber(raw);
  if (n == null) return null;
  return formatAmountNumber(n);
}

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
