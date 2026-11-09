# Node web:lib:chartTooltipStyle: lib/chartTooltipStyle.ts
Kind: module
Language: typescript, 21 lines of code, location: web/src/lib/chartTooltipStyle.ts

Source excerpt: web/src/lib/chartTooltipStyle.ts (first 22 lines)
```
   1  import type { CSSProperties } from "react";
   2  import type { BudgetTheme } from "./theme";
   3  
   4  export function getChartTooltipStyle(theme: BudgetTheme): CSSProperties {
   5    return theme === "dark"
   6      ? {
   7          backgroundColor: "rgba(23, 23, 24, 0.95)",
   8          border: "1px solid #2b2c2e",
   9          borderRadius: "10px",
  10          boxShadow: "0 12px 16px -4px rgba(0, 0, 0, 0.55)",
  11          fontSize: "12px",
  12          color: "rgba(255, 255, 255, 0.92)",
  13        }
  14      : {
  15          backgroundColor: "rgba(255, 255, 255, 0.97)",
  16          border: "1px solid #e8e8e8",
  17          borderRadius: "10px",
  18          boxShadow: "0 12px 16px -4px rgba(16, 24, 40, 0.08)",
  19          fontSize: "12px",
  20          color: "#18181b",
  21        };
  22  }
```

## Outgoing connections
- none

## Incoming connections
- /blood-pressure (web:blood-pressure) -> call
