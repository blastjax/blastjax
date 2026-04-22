"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useShellLayout } from "@/lib/shellLayoutContext";

function hamburgerIcon() {
  return (
    <span className="flex w-5 flex-col gap-1" aria-hidden>
      <span className="h-0.5 rounded-full bg-current" />
      <span className="h-0.5 rounded-full bg-current" />
      <span className="h-0.5 rounded-full bg-current" />
    </span>
  );
}

export function MobileTopBar() {
  const pathname = usePathname();
  const {
    mobileNavOpen,
    setMobileNavOpen,
    mobileBalancesOpen,
    setMobileBalancesOpen,
    closeMobileNav,
    closeMobileBalances,
  } = useShellLayout();

  const showBalance =
    pathname === "/" ||
    pathname.startsWith("/calendar") ||
    pathname.startsWith("/stats") ||
    pathname.startsWith("/summary") ||
    pathname.startsWith("/categories") ||
    pathname.startsWith("/accounts");

  const toggleMobileNav = () => {
    setMobileNavOpen((open) => {
      const next = !open;
      if (next) closeMobileBalances();
      return next;
    });
  };

  const toggleMobileBalances = () => {
    setMobileBalancesOpen((open) => {
      const next = !open;
      if (next) closeMobileNav();
      return next;
    });
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-[55] flex h-14 items-center gap-2 border-b border-zinc-200 bg-zinc-50/95 px-3 pt-[max(0.25rem,env(safe-area-inset-top))] backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 lg:hidden">
      <button
        type="button"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-800 shadow-sm hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={mobileNavOpen}
        aria-controls="mobile-sidebar-nav"
        onClick={toggleMobileNav}
      >
        {hamburgerIcon()}
      </button>
      <Link
        href="/installments"
        className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
      >
        Budget workbook
      </Link>
      {showBalance ? (
        <button
          type="button"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-800 shadow-sm hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          aria-label={
            mobileBalancesOpen
              ? "Close account balances"
              : "Open account balances"
          }
          aria-expanded={mobileBalancesOpen}
          aria-controls="mobile-account-balances"
          onClick={toggleMobileBalances}
        >
          {hamburgerIcon()}
        </button>
      ) : null}
    </header>
  );
}
