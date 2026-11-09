# Node web:components:Header: components/Header.tsx
Kind: module
Language: typescript, 219 lines of code, location: web/src/components/Header.tsx

Source excerpt: web/src/components/Header.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import { usePathname, useRouter } from "next/navigation";
   4  import { useEffect, useMemo, useRef, useState } from "react";
   5  import {
   6    MenuIcon,
   7    MoonIcon,
   8    SearchIcon,
   9    SidebarToggleIcon,
  10    SunIcon,
  11  } from "@/components/Icons";
  12  import { useCurrentUser } from "@/components/AuthGate";
  13  import { useTheme } from "@/components/ThemeProvider";
  14  import { searchRecords, type SearchResult } from "@/lib/api";
  15  import { NAV_DESTINATIONS, activeDestination, isPageAllowed, searchDestinations } from "@/lib/nav";
  16  import { useShellLayout } from "@/lib/shellLayoutContext";
  17  import { ICON_BUTTON_CLASSES } from "@/lib/ui";
  18  
  19  function NavSearch() {
  20    const router = useRouter();
  21    const user = useCurrentUser();
  22    const [query, setQuery] = useState("");
  23    const [records, setRecords] = useState<SearchResult[]>([]);
  24    const [open, setOpen] = useState(false);
  25    const [cursor, setCursor] = useState(0);
  26    const inputRef = useRef<HTMLInputElement>(null);
  27    const boxRef = useRef<HTMLDivElement>(null);
  28  
  29    useEffect(() => {
  30      const q = query.trim();
  31      if (q.length < 2) {
  32        setRecords([]);
  33        return;
  34      }
  35      let cancelled = false;
  36      const timer = setTimeout(() => {
  37        searchRecords(q).then(
  38          (r) => {
  39            if (!cancelled) setRecords(r.results);
  40          },
  41          () => {
  42            if (!cancelled) setRecords([]);
  43          },
  44        );
  45      }, 200);
  46      return () => {
  47        cancelled = true;
  48        clearTimeout(timer);
  49      };
  50    }, [query]);
  51  
  52    const results = useMemo(
  53      () => [
  54        ...searchDestinations(query).map((d) => ({
  55          key: d.href,
  56          href: d.href,
  57          label: d.label,
  58          note: d.parent ?? d.section,
  59          icon: d.icon,
  60        })),
  61        ...records
  62          .filter((r) => isPageAllowed(r.href, user))
  63          .map((r) => ({
  64            key: `${r.href}:${r.label}`,
  65            href: r.href,
  66            label: r.label,
  67            note: r.section,
  68            icon: NAV_DESTINATIONS.find((d) => d.href === r.href)?.icon ?? SearchIcon,
  69          })),
  70      ],
  71      [query, records, user],
  72    );
  73  
  74    useEffect(() => {
  75      setCursor(0);
  76    }, [query]);
  77  
  78    useEffect(() => {
  79      const onKey = (e: KeyboardEvent) => {
  80        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
  81          e.preventDefault();
  82          inputRef.current?.focus();
  83          inputRef.current?.select();
  84        }
  85      };
  86      window.addEventListener("keydown", onKey);
  87      return () => window.removeEventListener("keydown", onKey);
  88    }, []);
  89  
  90    useEffect(() => {
  91      if (!open) return;
  92      const onPointerDown = (e: MouseEvent) => {
  93        if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
  94      };
  95      window.addEventListener("mousedown", onPointerDown);
  96      return () => window.removeEventListener("mousedown", onPointerDown);
  97    }, [open]);
  98  
  99    function go(href: string) {
 100      setOpen(false);
 101      setQuery("");
 102      inputRef.current?.blur();
 103      router.push(href);
 104    }
 105  
 106    return (
 107      <div ref={boxRef} className="relative w-full max-w-md">
 108        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
 109        <input
 110          ref={inputRef}
 111          type="search"
 112          value={query}
 113          placeholder="Search…"
 114          aria-label="Search pages, bills, expenses and more"
 115          onChange={(e) => {
 116            setQuery(e.target.value);
 117            setOpen(true);
 118          }}
 119          onFocus={() => setOpen(true)}
 120          onKeyDown={(e) => {
 121            if (e.key === "Escape") {
 122              setOpen(false);
 123              inputRef.current?.blur();
 124              return;
 125            }
 126            if (!results.length) return;
 127            if (e.key === "ArrowDown") {
 128              e.preventDefault();
 129              setCursor((c) => (c + 1) % results.length);
 130            } else if (e.key === "ArrowUp") {
 131              e.preventDefault();
 132              setCursor((c) => (c - 1 + results.length) % results.length);
 133            } else if (e.key === "Enter") {
 134              e.preventDefault();
 135              go(results[cursor].href);
 136            }
 137          }}
 138          className="h-10 w-full rounded-lg border border-input-line bg-input-bg pl-9 pr-16 text-sm text-ink transition-colors duration-150 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/20 [&::-webkit-search-cancel-button]:hidden"
 139        />
 140        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-medium text-ink-4 sm:block">
 141          ⌘K
 142        </kbd>
 143  
 144        {open && query.trim() ? (
 145          <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-pop">
 146            {results.length === 0 ? (
 147              <p className="px-3 py-3 text-sm text-ink-3">
 148                Nothing matches “{query.trim()}”.
 149              </p>
 150            ) : (
```

## Outgoing connections
- dispatch -> routers/search.py (be:router:search)
- call -> components/AuthGate.tsx (web:components:AuthGate)
- call -> components/Icons.tsx (web:components:Icons)
- call -> components/ThemeProvider.tsx (web:components:ThemeProvider)
- call -> lib/api.ts (web:lib:api)
- call -> lib/nav.ts (web:lib:nav)
- call -> lib/shellLayoutContext.tsx (web:lib:shellLayoutContext)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- components/AppShell.tsx (web:components:AppShell) -> call
