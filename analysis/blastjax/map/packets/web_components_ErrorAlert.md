# Node web:components:ErrorAlert: components/ErrorAlert.tsx
Kind: module
Language: typescript, 21 lines of code, location: web/src/components/ErrorAlert.tsx

Source excerpt: web/src/components/ErrorAlert.tsx (first 24 lines)
```
   1  "use client";
   2  
   3  import { useState, type ReactNode } from "react";
   4  import { CloseIcon } from "@/components/Icons";
   5  import { ERROR_ALERT_CLASSES } from "@/lib/ui";
   6  
   7  export function ErrorAlert({ className = "", children }: { className?: string; children: ReactNode }) {
   8    const [dismissed, setDismissed] = useState<ReactNode>(null);
   9    if (dismissed === children) return null;
  10  
  11    return (
  12      <div className={`relative pr-10 ${ERROR_ALERT_CLASSES} ${className}`} role="alert">
  13        {children}
  14        <button
  15          type="button"
  16          aria-label="Dismiss error"
  17          onClick={() => setDismissed(children)}
  18          className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-md opacity-60 transition-opacity duration-150 hover:bg-danger-line/40 hover:opacity-100"
  19        >
  20          <CloseIcon className="size-4" />
  21        </button>
  22      </div>
  23    );
  24  }
```

## Outgoing connections
- call -> components/Icons.tsx (web:components:Icons)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- /bills (web:bills) -> call
- /blood-pressure (web:blood-pressure) -> call
- /calendar (web:calendar) -> call
- /commission (web:commission) -> call
- components/CompanyRedirect.tsx (web:components:CompanyRedirect) -> call
- /credit-card (web:credit-card) -> call
- /house-payments (web:house-payments) -> call
- /installments (web:installments) -> call
- /lotto (web:lotto) -> call
- /monthly-expenses (web:monthly-expenses) -> call
- /payslip (web:payslip) -> call
- /salary-stats (web:salary-stats) -> call
- /settings (web:settings) -> call
