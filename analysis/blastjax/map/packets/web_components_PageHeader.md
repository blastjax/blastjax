# Node web:components:PageHeader: components/PageHeader.tsx
Kind: module
Language: typescript, 67 lines of code, location: web/src/components/PageHeader.tsx

Source excerpt: web/src/components/PageHeader.tsx (first 72 lines)
```
   1  "use client";
   2  
   3  import Link from "next/link";
   4  import { usePathname } from "next/navigation";
   5  import { useMemo, type ReactNode } from "react";
   6  import { ChevronRightIcon } from "@/components/Icons";
   7  import { activeDestination } from "@/lib/nav";
   8  
   9  export function PageHeader({
  10    title,
  11    description,
  12    actions,
  13  }: {
  14    title: string;
  15    description?: ReactNode;
  16    actions?: ReactNode;
  17  }) {
  18    const pathname = usePathname();
  19    const destination = useMemo(() => activeDestination(pathname), [pathname]);
  20  
  21    const crumbs: { label: string; href?: string }[] = [
  22      { label: "Home", href: "/" },
  23      ...(destination?.parent ? [{ label: destination.parent }] : []),
  24      { label: destination?.label ?? title },
  25    ];
  26  
  27    return (
  28      <div className="flex flex-col gap-3 pb-1 md:flex-row md:items-center md:justify-between md:gap-6">
  29        <div className="min-w-0">
  30          <h1 className="text-2xl font-bold tracking-[-0.3px] text-ink">
  31            {title}
  32          </h1>
  33          {description ? (
  34            <p className="mt-1 max-w-3xl text-sm text-ink-3">{description}</p>
  35          ) : null}
  36        </div>
  37  
  38        <div className="flex shrink-0 flex-wrap items-center gap-3 md:justify-end">
  39          {actions}
  40          <nav aria-label="Breadcrumb" className="max-md:hidden">
  41            <ol className="flex items-center gap-1.5 text-sm">
  42              {crumbs.map((crumb, i) => {
  43                const last = i === crumbs.length - 1;
  44                return (
  45                  <li key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
  46                    {crumb.href && !last ? (
  47                      <Link
  48                        href={crumb.href}
  49                        className="text-ink-3 transition-colors duration-150 hover:text-ink"
  50                      >
  51                        {crumb.label}
  52                      </Link>
  53                    ) : (
  54                      <span
  55                        className={last ? "font-medium text-brand-text" : "text-ink-3"}
  56                        aria-current={last ? "page" : undefined}
  57                      >
  58                        {crumb.label}
  59                      </span>
  60                    )}
  61                    {last ? null : (
  62                      <ChevronRightIcon className="size-3.5 text-ink-4" />
  63                    )}
  64                  </li>
  65                );
  66              })}
  67            </ol>
  68          </nav>
  69        </div>
  70      </div>
  71    );
  72  }
```

## Outgoing connections
- call -> components/Icons.tsx (web:components:Icons)
- call -> lib/nav.ts (web:lib:nav)

## Incoming connections
- /bills (web:bills) -> call
- /blood-pressure (web:blood-pressure) -> call
- /calendar (web:calendar) -> call
- /credit-card (web:credit-card) -> call
- /games/mastermind (web:games/mastermind) -> call
- /games/sets (web:games/sets) -> call
- /house-payments (web:house-payments) -> call
- /installments (web:installments) -> call
- /lotto (web:lotto) -> call
- /monthly-expenses (web:monthly-expenses) -> call
- /payslip (web:payslip) -> call
- /settings (web:settings) -> call
- /software-architecture (web:software-architecture) -> call
