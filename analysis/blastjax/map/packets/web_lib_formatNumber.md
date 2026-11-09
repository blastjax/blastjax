# Node web:lib:formatNumber: lib/formatNumber.ts
Kind: module
Language: typescript, 33 lines of code, location: web/src/lib/formatNumber.ts

Source excerpt: web/src/lib/formatNumber.ts (first 41 lines)
```
   1  const AMOUNT_FORMAT = new Intl.NumberFormat(undefined, {
   2    minimumFractionDigits: 2,
   3    maximumFractionDigits: 2,
   4  });
   5  
   6  const COUNT_FORMAT = new Intl.NumberFormat(undefined);
   7  
   8  const EN_US_AMOUNT_FORMAT = new Intl.NumberFormat("en-US", {
   9    minimumFractionDigits: 2,
  10    maximumFractionDigits: 2,
  11  });
  12  
  13  export function fmtAmount(n: number): string {
  14    return AMOUNT_FORMAT.format(n);
  15  }
  16  
  17  export function fmtAmountOrDash(n: number): string {
  18    return Number.isFinite(n) ? AMOUNT_FORMAT.format(n) : "—";
  19  }
  20  
  21  export function fmtCount(n: number): string {
  22    return COUNT_FORMAT.format(n);
  23  }
  24  
  25  export function fmtAmountEnUs(n: number): string {
  26    return EN_US_AMOUNT_FORMAT.format(n);
  27  }
  28  
  29  export function fmtJackpotCompact(n: number): string {
  30    return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : fmtAmountOrDash(n);
  31  }
  32  
  33  const COMPACT_MONEY_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
  34  const COMPACT_MONEY_INT_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
  35  /** ≤4 chars ("4.8k", "10k", "423") so it fits a phone calendar cell. */
  36  export function fmtCompactMoney(n: number): string {
  37    if (!Number.isFinite(n)) return "–";
  38    if (Math.abs(n) < 1000) return COMPACT_MONEY_INT_FORMAT.format(n);
  39    const k = n / 1000;
  40    return `${(Math.abs(k) < 10 ? COMPACT_MONEY_FORMAT : COMPACT_MONEY_INT_FORMAT).format(k)}k`;
  41  }
```

## Outgoing connections
- none

## Incoming connections
- /bills (web:bills) -> call
- /calendar (web:calendar) -> call
- /commission (web:commission) -> call
- components/HomeOverview.tsx (web:components:HomeOverview) -> call
- /credit-card (web:credit-card) -> call
- /house-payments (web:house-payments) -> call
- /installments (web:installments) -> call
- lib/parseFormNumber.ts (web:lib:parseFormNumber) -> call
- /lotto (web:lotto) -> call
- /monthly-expenses (web:monthly-expenses) -> call
- /payslip (web:payslip) -> call
- /salary-stats (web:salary-stats) -> call
