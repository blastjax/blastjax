# Node web:components:CompanyRedirect: components/CompanyRedirect.tsx
Kind: module
Language: typescript, 40 lines of code, location: web/src/components/CompanyRedirect.tsx

Source excerpt: web/src/components/CompanyRedirect.tsx (first 47 lines)
```
   1  "use client";
   2  
   3  import { useEffect, useState } from "react";
   4  import { useRouter } from "next/navigation";
   5  import { ErrorAlert } from "@/components/ErrorAlert";
   6  import { LoadingBlocks } from "@/components/FinanceUI";
   7  import { getCompanies, type CompanyRow } from "@/lib/api";
   8  import { alertClasses, PAGE_CONTAINER_CLASSES } from "@/lib/ui";
   9  
  10  // Sends a per-company page's bare route (/payslip) to its first matching company (/payslip/Acme).
  11  export function CompanyRedirect({
  12    basePath,
  13    emptyMessage,
  14    pick = () => true,
  15  }: {
  16    basePath: string;
  17    emptyMessage: string;
  18    pick?: (company: CompanyRow) => boolean;
  19  }) {
  20    const router = useRouter();
  21    const [error, setError] = useState<string | null>(null);
  22    const [empty, setEmpty] = useState(false);
  23  
  24    useEffect(() => {
  25      getCompanies()
  26        .then((r) => {
  27          const first = r.companies.find(pick)?.name;
  28          if (first) router.replace(`${basePath}/${encodeURIComponent(first)}`);
  29          else setEmpty(true);
  30        })
  31        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load companies."));
  32      // pick is an inline lambda at every call site; it never changes meaning between renders.
  33      // eslint-disable-next-line react-hooks/exhaustive-deps
  34    }, [router, basePath]);
  35  
  36    return (
  37      <div className={PAGE_CONTAINER_CLASSES}>
  38        {error ? (
  39          <ErrorAlert>{error}</ErrorAlert>
  40        ) : empty ? (
  41          <p className={alertClasses("info")}>{emptyMessage}</p>
  42        ) : (
  43          <LoadingBlocks label="Loading…" />
  44        )}
  45      </div>
  46    );
  47  }
```

## Outgoing connections
- dispatch -> routers/company.py (be:router:company)
- call -> components/ErrorAlert.tsx (web:components:ErrorAlert)
- call -> components/FinanceUI.tsx (web:components:FinanceUI)
- call -> lib/api.ts (web:lib:api)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- /commission (web:commission) -> call
- /payslip (web:payslip) -> call
- /salary-stats (web:salary-stats) -> call
