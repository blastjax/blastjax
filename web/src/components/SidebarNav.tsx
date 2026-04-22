"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { sidebarNavInactiveHover } from "@/lib/ui";
import { RAIL_WIDTH, useShellLayout } from "@/lib/shellLayoutContext";
import { useLgUp } from "@/lib/useLgUp";

/** Other routes still exist; only these appear in the shell nav. */
const LINKS = [
  { href: "/installments", label: "Installments" },
  { href: "/payslip", label: "Payslip" },
] as const;

export function SidebarNav() {
  const pathname = usePathname();
  const lgUp = useLgUp();
  const {
    leftCollapsed,
    leftWidth,
    toggleLeft,
    mobileNavOpen,
    closeMobileNav,
  } = useShellLayout();

  useEffect(() => {
    closeMobileNav();
  }, [pathname, closeMobileNav]);

  const showRail = lgUp && leftCollapsed;

  return (
    <aside
      id="mobile-sidebar-nav"
      suppressHydrationWarning
      style={
        lgUp
          ? { width: showRail ? RAIL_WIDTH : leftWidth, flexShrink: 0 }
          : undefined
      }
      className={[
        "w-[min(18rem,88vw)] max-lg:max-w-[88vw]",
        "flex flex-col overflow-hidden border-r border-zinc-200 bg-zinc-50/90 dark:border-zinc-800 dark:bg-zinc-950",
        "max-lg:fixed max-lg:left-0 max-lg:top-14 max-lg:z-[52] max-lg:h-[calc(100dvh-3.5rem)] max-lg:max-h-[calc(100dvh-3.5rem)] max-lg:shadow-xl max-lg:transition-transform max-lg:duration-200 max-lg:ease-out",
        mobileNavOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
        "lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:max-h-[100dvh] lg:translate-x-0 lg:shadow-none",
      ].join(" ")}
    >
      {showRail ? (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 py-3">
          <button
            type="button"
            className="rounded-lg border border-zinc-300 bg-white p-2 text-zinc-700 shadow-sm hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            aria-label="Expand navigation"
            title="Expand navigation"
            onClick={toggleLeft}
          >
            <span className="text-lg leading-none" aria-hidden>
              ›
            </span>
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col px-3 py-5 sm:px-4">
          <div className="flex shrink-0 items-center justify-end gap-1">
            <button
              type="button"
              className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 shadow-sm hover:bg-zinc-100 lg:hidden dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              aria-label="Close menu"
              onClick={closeMobileNav}
            >
              <span className="leading-none" aria-hidden>
                ✕
              </span>
            </button>
            <button
              type="button"
              className="hidden rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 shadow-sm hover:bg-zinc-100 lg:inline-block dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              aria-label="Collapse navigation to slim bar"
              title="Collapse side panel (drag the edge to resize width)"
              onClick={toggleLeft}
            >
              <span className="leading-none" aria-hidden>
                «
              </span>
            </button>
          </div>

          <nav
            className="mt-4 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden"
            aria-label="Main"
          >
            {LINKS.map(({ href, label }) => {
              const active =
                pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={closeMobileNav}
                  className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/80 dark:text-indigo-100"
                      : `text-zinc-700 dark:text-zinc-300 ${sidebarNavInactiveHover}`
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </aside>
  );
}
