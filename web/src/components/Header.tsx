"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MenuIcon,
  MoonIcon,
  SearchIcon,
  SidebarToggleIcon,
  SunIcon,
} from "@/components/Icons";
import { useTheme } from "@/components/ThemeProvider";
import { activeDestination, searchDestinations } from "@/lib/nav";
import { useShellLayout } from "@/lib/shellLayoutContext";
import { ICON_BUTTON_CLASSES } from "@/lib/ui";

function NavSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchDestinations(query), [query]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(href);
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder="Search pages…"
        aria-label="Search pages"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
            return;
          }
          if (!results.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => (c + 1) % results.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => (c - 1 + results.length) % results.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            go(results[cursor].href);
          }
        }}
        className="h-10 w-full rounded-lg border border-input-line bg-input-bg pl-9 pr-16 text-sm text-ink transition-colors duration-150 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/20 [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-medium text-ink-4 sm:block">
        ⌘K
      </kbd>

      {open && query.trim() ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-pop">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-ink-3">
              No page matches “{query.trim()}”.
            </p>
          ) : (
            results.map((d, i) => {
              const Icon = d.icon;
              return (
                <button
                  key={d.href}
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(d.href)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-100 ${
                    i === cursor ? "bg-nav-hover" : ""
                  }`}
                >
                  <Icon className="size-4 shrink-0 text-ink-4" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                    {d.label}
                  </span>
                  <span className="shrink-0 text-xs text-ink-4">
                    {d.parent ?? d.section}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={ICON_BUTTON_CLASSES}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      {dark ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
    </button>
  );
}

export function Header() {
  const pathname = usePathname();
  const { toggleSidebar, sidebarCollapsed, setMobileNavOpen, mobileNavOpen } =
    useShellLayout();

  const destination = useMemo(() => activeDestination(pathname), [pathname]);

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 border-b border-shell-line bg-shell/85 px-3 backdrop-blur-md sm:gap-4 sm:px-6">
      <button
        type="button"
        className={`${ICON_BUTTON_CLASSES} lg:hidden`}
        aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={mobileNavOpen}
        aria-controls="mobile-sidebar-nav"
        onClick={() => setMobileNavOpen((o) => !o)}
      >
        <MenuIcon className="size-5" />
      </button>

      <button
        type="button"
        className={`${ICON_BUTTON_CLASSES} max-lg:hidden`}
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={toggleSidebar}
      >
        <SidebarToggleIcon className="size-5" />
      </button>

      <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.2px] text-ink lg:hidden">
        {destination?.label ?? "Blastjax"}
      </span>

      <div className="hidden min-w-0 flex-1 lg:flex">
        <NavSearch />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <ThemeToggle />
      </div>
    </header>
  );
}
