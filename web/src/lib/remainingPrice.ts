import { formatAmountNumber, parseFormNumber } from "@/lib/parseFormNumber";

// One amount with its currency, as free text: "THB 4,200", "₱4,200", "4,200 THB", "4,200".
const PRICE = /^\s*([^\d\s]*\s*)(\d[\d,]*(?:\.\d+)?)(?![A-Za-z%])(\s*[A-Z]{3}\b)?(.*)$/;

function parsePrice(raw: string) {
  const m = PRICE.exec(raw);
  // More numbers or a percentage after the amount ("2 x THB 1,000", "30%") isn't one amount.
  if (!m || /[\d%]/.test(m[4])) return null;
  const amount = parseFormNumber(m[2]);
  return amount == null ? null : { amount, before: m[1], after: m[3] ?? "" };
}

const currencyOf = (p: { before: string; after: string }) => (p.before + p.after).trim().toUpperCase();

// What's left of total after paid, or "" unless that's certain: a blank paid isn't 0,
// since older prices say "· paid" in the text, and different currencies can't be subtracted.
export function remainingPrice(total: string, paid: string): string {
  const t = parsePrice(total);
  const p = parsePrice(paid);
  if (!t || !p) return "";
  if (currencyOf(t) && currencyOf(p) && currencyOf(t) !== currencyOf(p)) return "";
  const { before, after } = currencyOf(t) ? t : p;
  return `${before}${formatAmountNumber(t.amount - p.amount)}${after}`;
}
