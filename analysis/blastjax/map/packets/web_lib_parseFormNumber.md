# Node web:lib:parseFormNumber: lib/parseFormNumber.ts
Kind: module
Language: typescript, 66 lines of code, location: web/src/lib/parseFormNumber.ts

Source excerpt: web/src/lib/parseFormNumber.ts (first 78 lines)
```
   1  import { fmtAmountEnUs } from "@/lib/formatNumber";
   2  
   3  const RE_COMMAS = /,/g;
   4  const RE_WHITESPACE = /\s+/g;
   5  const RE_AMOUNT_EXPR_CHARS = /^[-+*/0-9.]+$/;
   6  
   7  function isDigitOrDot(c: string): boolean {
   8    return (c >= "0" && c <= "9") || c === ".";
   9  }
  10  
  11  export function parseFormNumber(raw: string): number | null {
  12    const trimmed = raw.trim();
  13    const t = trimmed.indexOf(",") === -1 ? trimmed : trimmed.replace(RE_COMMAS, "");
  14    if (t === "" || t === "+" || t === "-") return null;
  15    const n = Number(t);
  16    return Number.isFinite(n) ? n : null;
  17  }
  18  
  19  export function formatAmountNumber(n: number): string {
  20    return fmtAmountEnUs(n);
  21  }
  22  
  23  function formatComputedAmount(n: number): string {
  24    if (!Number.isFinite(n)) return "";
  25    const v = Math.round(n * 100) / 100;
  26    return formatAmountNumber(Object.is(v, -0) ? 0 : v);
  27  }
  28  
  29  export function formatAmountOnBlur(raw: string): string | null {
  30    const n = parseFormNumber(raw);
  31    if (n == null) return null;
  32    return formatAmountNumber(n);
  33  }
  34  
  35  export function evaluateAmountExpression(raw: string): string | null {
  36    let s = raw.trim();
  37    if (s.indexOf(",") !== -1) s = s.replace(RE_COMMAS, "");
  38    if (/\s/.test(s)) s = s.replace(RE_WHITESPACE, "");
  39    // Calculator keys insert × and ÷; an operator at the very end is still being typed.
  40    s = s.replace(/×/g, "*").replace(/÷/g, "/").replace(/[-+*/]$/, "");
  41    if (s === "") return null;
  42    if (!RE_AMOUNT_EXPR_CHARS.test(s)) return null;
  43  
  44    let i = 0;
  45  
  46    function readNumber(): number | null {
  47      const start = i;
  48      if (i < s.length && (s[i] === "+" || s[i] === "-")) i++;
  49      const d0 = i;
  50      while (i < s.length && isDigitOrDot(s[i])) i++;
  51      if (d0 === i) return null;
  52      const n = Number(s.slice(start, i));
  53      return Number.isFinite(n) ? n : null;
  54    }
  55  
  56    function readTerm(): number | null {
  57      let value = readNumber();
  58      while (value !== null && i < s.length && (s[i] === "*" || s[i] === "/")) {
  59        const op = s[i++];
  60        const next = readNumber();
  61        if (next === null || (op === "/" && next === 0)) return null;
  62        value = op === "*" ? value * next : value / next;
  63      }
  64      return value;
  65    }
  66  
  67    let total = readTerm();
  68    if (total === null) return null;
  69    while (i < s.length) {
  70      const op = s[i];
  71      if (op !== "+" && op !== "-") return null;
  72      i++;
  73      const next = readTerm();
  74      if (next === null) return null;
  75      total = op === "+" ? total + next : total - next;
  76    }
  77    return formatComputedAmount(total);
  78  }
```

## Outgoing connections
- call -> lib/formatNumber.ts (web:lib:formatNumber)

## Incoming connections
- /bills (web:bills) -> call
- /calendar (web:calendar) -> call
- components/AmountInput.tsx (web:components:AmountInput) -> call
- /credit-card (web:credit-card) -> call
- /house-payments (web:house-payments) -> call
- /installments (web:installments) -> call
- lib/remainingPrice.ts (web:lib:remainingPrice) -> call
- /monthly-expenses (web:monthly-expenses) -> call
- /payslip (web:payslip) -> call
