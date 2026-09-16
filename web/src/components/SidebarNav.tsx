"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDownIcon,
  CloseIcon,
  LogoutIcon,
  type IconProps,
} from "@/components/Icons";
import { dataApiBase, getCompanies } from "@/lib/api";
import { clearSessionToken, getSessionToken } from "@/lib/auth";
import { useCurrentUser } from "@/components/AuthGate";
import {
  filterNavSections,
  matchingNavHref,
  payslipNavItem,
  NAV_SECTIONS,
  type NavItem,
} from "@/lib/nav";
import { useShellLayout } from "@/lib/shellLayoutContext";
import { ICON_BUTTON_CLASSES } from "@/lib/ui";

const ITEM_BASE =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150";
const ITEM_IDLE = "text-ink-2 hover:bg-nav-hover hover:text-ink";
const ITEM_ACTIVE = "bg-nav-active-bg text-nav-active-text";

/** One top-level entry: a link, plus a chevron when it owns sub-pages. */
function NavRow({
  item,
  activeHref,
  onNavigate,
}: {
  item: NavItem;
  activeHref: string;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const ownsActive =
    activeHref === item.href ||
    (item.children ?? []).some((c) => c.href === activeHref);

  // Open whenever the branch you're in is active. Still free to toggle by
  // hand, and re-opens on its own when navigation moves back into it.
  const [open, setOpen] = useState(ownsActive);
  useEffect(() => {
    if (ownsActive) setOpen(true);
  }, [ownsActive]);

  const active = activeHref === item.href;

  return (
    <div>
      <div className="flex items-center">
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={`${ITEM_BASE} ${active ? ITEM_ACTIVE : ITEM_IDLE} ${
            item.children ? "rounded-r-none" : ""
          }`}
        >
          <Icon
            className={`size-5 shrink-0 ${
              active ? "text-nav-active-text" : "text-nav-icon"
            }`}
          />
          <span className="truncate">{item.label}</span>
        </Link>

        {item.children ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${item.label} pages`}
            className={`flex h-10 w-8 shrink-0 items-center justify-center rounded-lg rounded-l-none transition-colors duration-150 ${
              active ? ITEM_ACTIVE : ITEM_IDLE
            }`}
          >
            <ChevronDownIcon
              className={`size-4 transition-transform duration-200 ${
                open ? "" : "-rotate-90"
              }`}
            />
          </button>
        ) : null}
      </div>

      {item.children && open ? (
        <div className="ml-5 mt-1 flex flex-col gap-0.5 border-l border-line pl-3">
          {item.children.map((child) => {
            const childActive = activeHref === child.href;
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                aria-current={childActive ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                  childActive ? ITEM_ACTIVE : ITEM_IDLE
                }`}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Icon-only rail row with a hover tooltip, for the collapsed sidebar. */
function RailRow({
  href,
  label,
  Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  Icon: (p: IconProps) => React.ReactElement;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center justify-center rounded-lg p-2.5 transition-colors duration-150 ${
        active
          ? "bg-nav-active-bg text-nav-active-text"
          : "text-nav-icon hover:bg-nav-hover hover:text-ink"
      }`}
    >
      <Icon className="size-5" />
      <span className="pointer-events-none absolute left-full z-20 ml-2 hidden whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-ink shadow-pop group-hover:block">
        {label}
      </span>
    </Link>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  const { sidebarCollapsed, mobileNavOpen, closeMobileNav } = useShellLayout();
  // Set only when a login session is actually active — this component only
  // ever mounts once AuthGate has already decided the app is reachable
  // (login not required, or required and satisfied), so this value is
  // correct for the component's whole lifetime.
  const [hasSession] = useState(() => getSessionToken() !== null);
  const [companyItems, setCompanyItems] = useState<NavItem[]>([]);
  const currentUser = useCurrentUser();

  useEffect(() => {
    closeMobileNav();
  }, [pathname, closeMobileNav]);

  // One "<Company> Payslip" entry per row from Settings → Companies —
  // there's no build-time list of these, so the sidebar fetches it directly.
  useEffect(() => {
    getCompanies()
      .then((r) => setCompanyItems(r.companies.map((c) => payslipNavItem(c.name))))
      .catch(() => {
        /* sidebar just shows Finances without any company entries */
      });
  }, []);

  const sections = useMemo(
    () =>
      filterNavSections(
        NAV_SECTIONS.map((section) =>
          section.title === "Finances"
            ? {
                ...section,
                items: [
                  ...section.items.slice(0, 1),
                  ...companyItems,
                  ...section.items.slice(1),
                ],
              }
            : section,
        ),
        currentUser,
      ),
    [companyItems, currentUser],
  );

  const activeHref = useMemo(() => matchingNavHref(pathname), [pathname]);

  async function handleLogout() {
    const token = getSessionToken();
    try {
      await fetch(`${dataApiBase()}/api/auth/logout`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch {
      /* best effort — clear the local token and reload regardless */
    }
    clearSessionToken();
    window.location.reload();
  }

  return (
    <aside
      id="mobile-sidebar-nav"
      className={[
        "flex w-[min(17.5rem,85vw)] flex-col overflow-hidden border-r border-shell-line bg-shell",
        // The rail is a desktop affordance; the slide-over is always full width.
        sidebarCollapsed ? "lg:w-[76px]" : "lg:w-[280px]",
        "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-[60] max-lg:shadow-pop",
        "max-lg:transition-transform max-lg:duration-200 max-lg:ease-out",
        mobileNavOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
        "lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:translate-x-0",
        "lg:transition-[width] lg:duration-200 lg:ease-out",
      ].join(" ")}
    >
      {/* Brand row — doubles as the slide-over's close affordance on mobile.
       * Its height matches the header's so the nav below starts flush with the
       * page content; collapsed, it keeps that height as a bare spacer, since
       * the rail is too narrow for the wordmark. */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-shell-line px-4">
        <Link
          href="/"
          onClick={closeMobileNav}
          className={`min-w-0 truncate text-base font-semibold tracking-[-0.2px] text-ink ${
            sidebarCollapsed ? "lg:hidden" : ""
          }`}
        >
          Blastjax
        </Link>
        <button
          type="button"
          className={`${ICON_BUTTON_CLASSES} ml-auto lg:hidden`}
          aria-label="Close menu"
          onClick={closeMobileNav}
        >
          <CloseIcon className="size-5" />
        </button>
      </div>

      <nav
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden px-3 py-4"
        aria-label="Main"
      >
        {sections.map((section, sectionIndex) => (
          <div
            key={section.title ?? `section-${sectionIndex}`}
            className="flex flex-col gap-1"
          >
            {sidebarCollapsed ? (
              sectionIndex > 0 ? (
                <span className="mx-auto mb-2 h-px w-6 bg-line" aria-hidden />
              ) : null
            ) : section.title ? (
              <h2 className="px-3 pb-2 pt-1 text-xs font-medium uppercase tracking-wider text-ink-4">
                {section.title}
              </h2>
            ) : null}

            {section.items.map((item) =>
              sidebarCollapsed ? (
                // The rail has no room for a disclosure, so sub-pages are
                // promoted to siblings instead of hiding behind their parent.
                [
                  <RailRow
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    Icon={item.icon}
                    active={activeHref === item.href}
                    onNavigate={closeMobileNav}
                  />,
                  ...(item.children ?? []).map((child) => (
                    <RailRow
                      key={child.href}
                      href={child.href}
                      label={child.label}
                      Icon={child.icon}
                      active={activeHref === child.href}
                      onNavigate={closeMobileNav}
                    />
                  )),
                ]
              ) : (
                <NavRow
                  key={item.href}
                  item={item}
                  activeHref={activeHref}
                  onNavigate={closeMobileNav}
                />
              ),
            )}
          </div>
        ))}
      </nav>

      {hasSession && (
        <div className="shrink-0 border-t border-shell-line p-3">
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Log out"
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 transition-colors duration-150 hover:bg-danger-soft hover:text-danger-text ${
              sidebarCollapsed ? "lg:justify-center lg:px-0" : ""
            }`}
          >
            <LogoutIcon className="size-5 shrink-0" />
            <span className={sidebarCollapsed ? "lg:hidden" : ""}>Log out</span>
          </button>
        </div>
      )}
    </aside>
  );
}
