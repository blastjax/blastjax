# Node web:lib:remainingPrice: lib/remainingPrice.ts
Kind: module
Language: typescript, 42 lines of code, location: web/src/lib/remainingPrice.ts

Source excerpt: web/src/lib/remainingPrice.ts (first 25 lines)
```
   1  import { formatAmountNumber, parseFormNumber } from "@/lib/parseFormNumber";
   2  
   3  // One amount with its currency, as free text: "THB 4,200", "₱4,200", "4,200 THB", "4,200".
   4  const PRICE = /^\s*([^\d\s]*\s*)(\d[\d,]*(?:\.\d+)?)(?![A-Za-z%])(\s*[A-Z]{3}\b)?(.*)$/;
   5  
   6  function parsePrice(raw: string) {
   7    const m = PRICE.exec(raw);
   8    // More numbers or a percentage after the amount ("2 x THB 1,000", "30%") isn't one amount.
   9    if (!m || /[\d%]/.test(m[4])) return null;
  10    const amount = parseFormNumber(m[2]);
  11    return amount == null ? null : { amount, before: m[1], after: m[3] ?? "" };
  12  }
  13  
  14  const currencyOf = (p: { before: string; after: string }) => (p.before + p.after).trim().toUpperCase();
  15  
  16  // What's left of total after paid, or "" unless that's certain: a blank paid isn't 0,
  17  // since older prices say "· paid" in the text, and different currencies can't be subtracted.
  18  export function remainingPrice(total: string, paid: string): string {
  19    const t = parsePrice(total);
  20    const p = parsePrice(paid);
  21    if (!t || !p) return "";
  22    if (currencyOf(t) && currencyOf(p) && currencyOf(t) !== currencyOf(p)) return "";
  23    const { before, after } = currencyOf(t) ? t : p;
  24    return `${before}${formatAmountNumber(t.amount - p.amount)}${after}`;
  25  }
```

## Outgoing connections
- call -> lib/parseFormNumber.ts (web:lib:parseFormNumber)

## Incoming connections
- /travels (web:travels) -> call
