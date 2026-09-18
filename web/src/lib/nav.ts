/**
 * The shell's navigation map — one source of truth for the sidebar tree, the
 * header's quick search, and the breadcrumb each page shows.
 *
 * Other routes still exist; only what's listed here is navigable from chrome.
 */

import {
  CalendarIcon,
  ChartBarIcon,
  CreditCardIcon,
  DiceIcon,
  DocumentIcon,
  GridIcon,
  HeartPulseIcon,
  HomeIcon,
  LayersIcon,
  MusicIcon,
  PlaneIcon,
  PuzzleIcon,
  SettingsIcon,
  TicketIcon,
  TrendingUpIcon,
  WalletIcon,
  type IconProps,
} from "@/components/Icons";

export type NavIcon = (p: IconProps) => React.ReactElement;
export type NavChild = { href: string; label: string; icon: NavIcon };
export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  children?: readonly NavChild[];
};
export type NavSection = { title: string | null; items: readonly NavItem[] };

/**
 * Sub-pages hang off the page they belong to rather than sitting at the same
 * level behind an indent, so the tree collapses to just the section you're in.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    title: "Finances",
    items: [
      {
        href: "/calendar",
        label: "Calendar",
        icon: CalendarIcon,
        children: [
          {
            href: "/monthly-expenses",
            label: "Monthly Expenses",
            icon: WalletIcon,
          },
          { href: "/credit-card", label: "Credit Card", icon: CreditCardIcon },
          { href: "/installments", label: "Installments", icon: LayersIcon },
          { href: "/house-payments", label: "House Payments", icon: HomeIcon },
        ],
      },
      // One "<Company> Payslip" entry per row from Settings → Companies is
      // spliced in here at render time (see SidebarNav) -- companies are
      // data, not something this static map can list ahead of time.
    ],
  },
  {
    title: "Health",
    items: [
      {
        href: "/blood-pressure",
        label: "Overall Health",
        icon: HeartPulseIcon,
      },
    ],
  },
  {
    title: "Travels",
    items: [{ href: "/travels", label: "Travels", icon: PlaneIcon }],
  },
  {
    title: "Games",
    items: [
      { href: "/games/mosaic", label: "Mosaic", icon: GridIcon },
      { href: "/games/mambo", label: "Mambo", icon: MusicIcon },
      { href: "/games/mastermind", label: "Mastermind", icon: PuzzleIcon },
      { href: "/games/sets", label: "Sets", icon: DiceIcon },
      { href: "/lotto", label: "Lotto", icon: TicketIcon },
    ],
  },
  {
    title: null,
    items: [{ href: "/settings", label: "Settings", icon: SettingsIcon }],
  },
];

/** The "<Company> Payslip" nav item for one company (Settings → Companies),
 * with its own Commission (only if that company has commission turned on)
 * and Salary Stats pages nested under it. Built at render time in SidebarNav
 * rather than listed here statically, since companies are data. */
export function payslipNavItem(company: string, showCommission: boolean): NavItem {
  const slug = encodeURIComponent(company);
  return {
    href: `/payslip/${slug}`,
    label: `${company} Payslip`,
    icon: DocumentIcon,
    children: [
      ...(showCommission
        ? [{ href: `/commission/${slug}`, label: "Commission", icon: TrendingUpIcon }]
        : []),
      { href: `/salary-stats/${slug}`, label: "Salary Stats", icon: ChartBarIcon },
    ],
  };
}

/** Every destination, flattened — parents and sub-pages alike. */
export type NavDestination = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Section heading, used as the search result's supporting line. */
  section: string;
  /** Parent page label when this is a sub-page. */
  parent?: string;
};

export const NAV_DESTINATIONS: readonly NavDestination[] = NAV_SECTIONS.flatMap(
  (section) =>
    section.items.flatMap((item): NavDestination[] => [
      {
        href: item.href,
        label: item.label,
        icon: item.icon,
        section: section.title ?? "General",
      },
      ...(item.children ?? []).map((child) => ({
        href: child.href,
        label: child.label,
        icon: child.icon,
        section: section.title ?? "General",
        parent: item.label,
      })),
    ]),
);

/**
 * The nav entry the current URL belongs to.
 *
 * Longest match wins, so `/payslip/settings` resolves to `/payslip` rather
 * than to `/settings`, and a nested route highlights the page it lives under.
 */
export function matchingNavHref(pathname: string): string {
  const sorted = [...NAV_DESTINATIONS].sort(
    (a, b) => b.href.length - a.href.length,
  );
  for (const { href } of sorted) {
    if (pathname === href || pathname.startsWith(`${href}/`)) return href;
  }
  // /payslip/<company>, /commission/<company> and /salary-stats/<company>
  // are data-driven (one per row in Settings → Companies), so they can't be
  // listed in NAV_DESTINATIONS above -- self-match the first segment so the
  // sidebar item SidebarNav builds for that company (see payslipNavItem)
  // still gets to highlight.
  for (const base of ["/payslip", "/commission", "/salary-stats"]) {
    if (pathname.startsWith(`${base}/`)) {
      const first = pathname.slice(base.length + 1).split("/")[0];
      return `${base}/${first}`;
    }
  }
  return "";
}

/** The destination a URL resolves to, for titles and breadcrumbs. */
export function activeDestination(pathname: string): NavDestination | null {
  const href = matchingNavHref(pathname);
  return NAV_DESTINATIONS.find((d) => d.href === href) ?? null;
}

/** A user account's page-visibility state (see Settings → Users). */
export type PageAccess = {
  isSuperuser: boolean;
  /** `null` means no restriction — every page. */
  allowedPages: readonly string[] | null;
};

/** Company payslip pages (spliced into "Finances" per row from Settings →
 * Companies — see payslipNavItem/SidebarNav) aren't a single static
 * NAV_SECTIONS item, so they share this one virtual bucket instead of each
 * company getting its own toggle. */
const _PAYSLIP_BUCKET_HREF = "/payslip";

/** Every href a per-user restriction can target: one per top-level
 * NAV_SECTIONS item (not their children — a child is shown/hidden with its
 * parent), plus the payslip bucket above. ``blastjax`` (and anyone with
 * ``isSuperuser``) always bypasses this. */
export const RESTRICTABLE_PAGES: readonly { href: string; label: string; section: string }[] = [
  ...NAV_SECTIONS.flatMap((section) =>
    section.items.map((item) => ({
      href: item.href,
      label: item.label,
      section: section.title ?? "General",
    })),
  ),
  { href: _PAYSLIP_BUCKET_HREF, label: "Payslip", section: "Finances" },
];

const _RESTRICTABLE_HREFS = new Set(RESTRICTABLE_PAGES.map((p) => p.href));

/** Sections/items a restricted user can see. Unrestricted users (superusers,
 * or an ``allowedPages: null`` account) get every section back untouched. */
export function filterNavSections(
  sections: readonly NavSection[],
  user: PageAccess | null,
): NavSection[] {
  if (!user || user.isSuperuser || user.allowedPages === null) return [...sections];
  const allowed = new Set(user.allowedPages);
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.href.startsWith(`${_PAYSLIP_BUCKET_HREF}/`)) {
          return allowed.has(_PAYSLIP_BUCKET_HREF);
        }
        return !_RESTRICTABLE_HREFS.has(item.href) || allowed.has(item.href);
      }),
    }))
    .filter((section) => section.items.length > 0);
}

/** The top-level NAV_SECTIONS item a pathname belongs to (its own href, or
 * its parent's if it's a sub-page), the payslip bucket for a per-company
 * payslip/commission/salary-stats page, or `null` for anything else outside
 * the static nav map. */
export function topLevelHrefForPathname(pathname: string): string | null {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return item.href;
      for (const child of item.children ?? []) {
        if (pathname === child.href || pathname.startsWith(`${child.href}/`)) return item.href;
      }
    }
  }
  // Mirrors matchingNavHref's own special-case: these are data-driven
  // (one per row in Settings → Companies), so they can't be listed above.
  for (const base of ["/payslip", "/commission", "/salary-stats"]) {
    if (pathname === base || pathname.startsWith(`${base}/`)) return _PAYSLIP_BUCKET_HREF;
  }
  return null;
}

/** Whether `user` may navigate directly to `pathname` — the route-guard
 * counterpart to `filterNavSections` hiding the link. */
export function isPageAllowed(pathname: string, user: PageAccess | null): boolean {
  if (!user || user.isSuperuser || user.allowedPages === null) return true;
  const href = topLevelHrefForPathname(pathname);
  return href === null || user.allowedPages.includes(href);
}

/** Case-insensitive substring match over labels, parents and sections. */
export function searchDestinations(query: string): readonly NavDestination[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return NAV_DESTINATIONS.filter((d) =>
    [d.label, d.parent ?? "", d.section].some((s) =>
      s.toLowerCase().includes(q),
    ),
  ).slice(0, 8);
}
