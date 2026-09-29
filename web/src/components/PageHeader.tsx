"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { ChevronRightIcon } from "@/components/Icons";
import { activeDestination } from "@/lib/nav";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const pathname = usePathname();
  const destination = useMemo(() => activeDestination(pathname), [pathname]);

  const crumbs: { label: string; href?: string }[] = [
    { label: "Home", href: "/" },
    ...(destination?.parent ? [{ label: destination.parent }] : []),
    { label: destination?.label ?? title },
  ];

  return (
    <div className="flex flex-col gap-3 pb-1 md:flex-row md:items-center md:justify-between md:gap-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-[-0.3px] text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm text-ink-3">{description}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 md:justify-end">
        {actions}
        <nav aria-label="Breadcrumb" className="max-md:hidden">
          <ol className="flex items-center gap-1.5 text-sm">
            {crumbs.map((crumb, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
                  {crumb.href && !last ? (
                    <Link
                      href={crumb.href}
                      className="text-ink-3 transition-colors duration-150 hover:text-ink"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={last ? "font-medium text-brand-text" : "text-ink-3"}
                      aria-current={last ? "page" : undefined}
                    >
                      {crumb.label}
                    </span>
                  )}
                  {last ? null : (
                    <ChevronRightIcon className="size-3.5 text-ink-4" />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
}
