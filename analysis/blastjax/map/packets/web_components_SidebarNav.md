# Node web:components:SidebarNav: components/SidebarNav.tsx
Kind: module
Language: typescript, 284 lines of code, location: web/src/components/SidebarNav.tsx

Source excerpt: web/src/components/SidebarNav.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import Link from "next/link";
   4  import { usePathname } from "next/navigation";
   5  import { useEffect, useMemo, useState } from "react";
   6  import {
   7    ChevronDownIcon,
   8    CloseIcon,
   9    LogoutIcon,
  10    type IconProps,
  11  } from "@/components/Icons";
  12  import { dataApiBase, getCompanies } from "@/lib/api";
  13  import { clearSessionToken, getSessionToken } from "@/lib/auth";
  14  import { useCurrentUser } from "@/components/AuthGate";
  15  import {
  16    filterNavSections,
  17    matchingNavHref,
  18    payslipNavItem,
  19    NAV_SECTIONS,
  20    type NavItem,
  21  } from "@/lib/nav";
  22  import { useShellLayout } from "@/lib/shellLayoutContext";
  23  import { ICON_BUTTON_CLASSES } from "@/lib/ui";
  24  
  25  const ITEM_BASE =
  26    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150";
  27  const ITEM_IDLE = "text-ink-2 hover:bg-nav-hover hover:text-ink";
  28  const ITEM_ACTIVE = "bg-nav-active-bg text-nav-active-text";
  29  
  30  function NavRow({
  31    item,
  32    activeHref,
  33    onNavigate,
  34  }: {
  35    item: NavItem;
  36    activeHref: string;
  37    onNavigate: () => void;
  38  }) {
  39    const Icon = item.icon;
  40    const ownsActive =
  41      activeHref === item.href ||
  42      (item.children ?? []).some((c) => c.href === activeHref);
  43  
  44    const [open, setOpen] = useState(ownsActive);
  45    useEffect(() => {
  46      if (ownsActive) setOpen(true);
  47    }, [ownsActive]);
  48  
  49    const active = activeHref === item.href;
  50  
  51    return (
  52      <div>
  53        <div className="flex items-center">
  54          <Link
  55            href={item.href}
  56            onClick={onNavigate}
  57            aria-current={active ? "page" : undefined}
  58            className={`${ITEM_BASE} ${active ? ITEM_ACTIVE : ITEM_IDLE} ${
  59              item.children ? "rounded-r-none" : ""
  60            }`}
  61          >
  62            <Icon
  63              className={`size-5 shrink-0 ${
  64                active ? "text-nav-active-text" : "text-nav-icon"
  65              }`}
  66            />
  67            <span className="truncate">{item.label}</span>
  68          </Link>
  69  
  70          {item.children ? (
  71            <button
  72              type="button"
  73              onClick={() => setOpen((o) => !o)}
  74              aria-expanded={open}
  75              aria-label={`${open ? "Collapse" : "Expand"} ${item.label} pages`}
  76              className={`flex h-10 w-8 shrink-0 items-center justify-center rounded-lg rounded-l-none transition-colors duration-150 ${
  77                active ? ITEM_ACTIVE : ITEM_IDLE
  78              }`}
  79            >
  80              <ChevronDownIcon
  81                className={`size-4 transition-transform duration-200 ${
  82                  open ? "" : "-rotate-90"
  83                }`}
  84              />
  85            </button>
  86          ) : null}
  87        </div>
  88  
  89        {item.children && open ? (
  90          <div className="ml-5 mt-1 flex flex-col gap-0.5 border-l border-line pl-3">
  91            {item.children.map((child) => {
  92              const childActive = activeHref === child.href;
  93              return (
  94                <Link
  95                  key={child.href}
  96                  href={child.href}
  97                  onClick={onNavigate}
  98                  aria-current={childActive ? "page" : undefined}
  99                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ${
 100                    childActive ? ITEM_ACTIVE : ITEM_IDLE
 101                  }`}
 102                >
 103                  {child.label}
 104                </Link>
 105              );
 106            })}
 107          </div>
 108        ) : null}
 109      </div>
 110    );
 111  }
 112  
 113  function RailRow({
 114    href,
 115    label,
 116    Icon,
 117    active,
 118    onNavigate,
 119  }: {
 120    href: string;
 121    label: string;
 122    Icon: (p: IconProps) => React.ReactElement;
 123    active: boolean;
 124    onNavigate: () => void;
 125  }) {
 126    return (
 127      <Link
 128        href={href}
 129        onClick={onNavigate}
 130        aria-label={label}
 131        aria-current={active ? "page" : undefined}
 132        className={`group relative flex items-center justify-center rounded-lg p-2.5 transition-colors duration-150 ${
 133          active
 134            ? "bg-nav-active-bg text-nav-active-text"
 135            : "text-nav-icon hover:bg-nav-hover hover:text-ink"
 136        }`}
 137      >
 138        <Icon className="size-5" />
 139        <span className="pointer-events-none absolute left-full z-20 ml-2 hidden whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-ink shadow-pop group-hover:block">
 140          {label}
 141        </span>
 142      </Link>
 143    );
 144  }
 145  
 146  export function SidebarNav() {
 147    const pathname = usePathname();
 148    const { sidebarCollapsed, mobileNavOpen, closeMobileNav } = useShellLayout();
 149    const [hasSession] = useState(() => getSessionToken() !== null);
 150    const [companyItems, setCompanyItems] = useState<NavItem[]>([]);
```

## Outgoing connections
- dispatch -> routers/auth.py (be:router:auth)
- dispatch -> routers/company.py (be:router:company)
- call -> components/AuthGate.tsx (web:components:AuthGate)
- call -> components/Icons.tsx (web:components:Icons)
- call -> lib/api.ts (web:lib:api)
- call -> lib/auth.ts (web:lib:auth)
- call -> lib/nav.ts (web:lib:nav)
- call -> lib/shellLayoutContext.tsx (web:lib:shellLayoutContext)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- components/AppShell.tsx (web:components:AppShell) -> call
