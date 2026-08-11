"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
const sidebarNavInactiveHover =
  "hover:bg-zinc-100 dark:hover:bg-zinc-800/80";
import { useShellLayout } from "@/lib/shellLayoutContext";
import { useLgUp } from "@/lib/useLgUp";

type NavLink = { href: string; label: string; indent?: boolean };

/** Other routes still exist; only these appear in the shell nav. */
const NAV_SEGMENTS: readonly { title: string | null; links: readonly NavLink[] }[] = [
  {
    title: "Finances",
    links: [
      { href: "/calendar", label: "Calendar" },
      { href: "/monthly-expenses", label: "Monthly Expenses", indent: true },
      { href: "/credit-card", label: "Credit Card", indent: true },
      { href: "/installments", label: "Installments", indent: true },
      { href: "/house-payments", label: "House Payments", indent: true },
      { href: "/payslip", label: "Payslip" },
      { href: "/commission", label: "Commission", indent: true },
      { href: "/salary-stats", label: "Salary Stats", indent: true },
    ],
  },
  {
    title: "Health",
    links: [{ href: "/blood-pressure", label: "Overall Health" }],
  },
  {
    title: "Games",
    links: [
      { href: "/games/mosaic", label: "Mosaic" },
      { href: "/games/mambo", label: "Mambo" },
      { href: "/games/mastermind", label: "Mastermind" },
      { href: "/games/sets", label: "Sets" },
    ],
  },
  {
    title: null,
    links: [{ href: "/settings", label: "Settings" }],
  },
];

const LINKS: readonly NavLink[] = NAV_SEGMENTS.flatMap((s) => s.links);

function matchingNavHref(
  pathname: string,
  links: readonly { href: string }[],
): string {
  const sorted = [...links].sort((a, b) => b.href.length - a.href.length);
  for (const { href } of sorted) {
    if (pathname === href) return href;
    if (pathname.startsWith(`${href}/`)) return href;
  }
  return "";
}

export function SidebarNav() {
  const pathname = usePathname();
  const lgUp = useLgUp();
  const { leftWidth, mobileNavOpen, closeMobileNav } = useShellLayout();

  useEffect(() => {
    closeMobileNav();
  }, [pathname, closeMobileNav]);

  const activeHref = matchingNavHref(pathname, LINKS);

  return (
    <aside
      id="mobile-sidebar-nav"
      suppressHydrationWarning
      style={lgUp ? { width: leftWidth, flexShrink: 0 } : undefined}
      className={[
        "w-[min(18rem,88vw)] max-lg:max-w-[88vw]",
        "flex flex-col overflow-hidden border-r border-zinc-200 bg-zinc-50/90 dark:border-zinc-800 dark:bg-zinc-950",
        "max-lg:fixed max-lg:left-0 max-lg:top-14 max-lg:z-[52] max-lg:h-[calc(100dvh-3.5rem)] max-lg:max-h-[calc(100dvh-3.5rem)] max-lg:shadow-xl max-lg:transition-transform max-lg:duration-200 max-lg:ease-out",
        mobileNavOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
        "lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:max-h-[100dvh] lg:translate-x-0 lg:shadow-none",
      ].join(" ")}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col px-3 py-5 sm:px-4">
        <div className="flex shrink-0 items-center justify-end gap-1 lg:hidden">
          <button
            type="button"
            className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 shadow-sm hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            aria-label="Close menu"
            onClick={closeMobileNav}
          >
            <span className="leading-none" aria-hidden>
              ✕
            </span>
          </button>
        </div>

        <nav
          className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden lg:mt-0"
          aria-label="Main"
        >
          {NAV_SEGMENTS.map((segment, segmentIndex) => (
            <div
              key={segment.title ?? `segment-${segmentIndex}`}
              className="flex flex-col gap-0.5"
            >
              {segment.title ? (
                <h2 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {segment.title}
                </h2>
              ) : null}
              {segment.links.map(({ href, label, indent }) => {
                const active = activeHref === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={closeMobileNav}
                    className={`rounded-lg py-2.5 text-sm font-medium transition ${
                      indent ? "pl-6 pr-3" : "px-3"
                    } ${
                      active
                        ? "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/80 dark:text-indigo-100"
                        : `text-zinc-700 dark:text-zinc-300 ${sidebarNavInactiveHover}`
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
