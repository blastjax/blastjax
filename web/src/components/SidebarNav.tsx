"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RAIL_WIDTH, useShellLayout } from "@/lib/shellLayoutContext";

const LINKS = [
  { href: "/", label: "Calendar" },
  { href: "/stats", label: "Stats" },
  { href: "/categories", label: "Categories" },
  { href: "/accounts", label: "Accounts" },
  { href: "/payslip", label: "Payslip" },
  { href: "/installments", label: "Installments" },
  { href: "/summary", label: "Summary" },
  { href: "/settings", label: "Settings" },
] as const;

export function SidebarNav() {
  const pathname = usePathname();
  const { leftCollapsed, leftWidth, toggleLeft } = useShellLayout();

  return (
    <aside
      style={{
        width: leftCollapsed ? RAIL_WIDTH : leftWidth,
        flexShrink: 0,
      }}
      className="sticky top-0 flex h-screen max-h-[100dvh] flex-col overflow-hidden border-r border-zinc-200 bg-zinc-50/90 dark:border-zinc-800 dark:bg-zinc-950"
    >
      {leftCollapsed ? (
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
          <div className="flex shrink-0 items-start justify-between gap-2">
            <Link
              href="/"
              className="min-w-0 text-base font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-lg"
            >
              Budget workbook
            </Link>
            <button
              type="button"
              className="shrink-0 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 shadow-sm hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
            className="mt-5 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden"
            aria-label="Main"
          >
            {LINKS.map(({ href, label }) => {
              const active =
                pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/80 dark:text-indigo-100"
                      : "text-zinc-700 hover:bg-zinc-200/80 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-50"
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
