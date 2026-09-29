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

export type NavDestination = {
  href: string;
  label: string;
  icon: NavIcon;
  section: string;
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

export function matchingNavHref(pathname: string): string {
  const sorted = [...NAV_DESTINATIONS].sort(
    (a, b) => b.href.length - a.href.length,
  );
  for (const { href } of sorted) {
    if (pathname === href || pathname.startsWith(`${href}/`)) return href;
  }
  for (const base of ["/payslip", "/commission", "/salary-stats"]) {
    if (pathname.startsWith(`${base}/`)) {
      const first = pathname.slice(base.length + 1).split("/")[0];
      return `${base}/${first}`;
    }
  }
  return "";
}

export function activeDestination(pathname: string): NavDestination | null {
  const href = matchingNavHref(pathname);
  return NAV_DESTINATIONS.find((d) => d.href === href) ?? null;
}

export type PageAccess = {
  isSuperuser: boolean;
  allowedPages: readonly string[] | null;
};

const _PAYSLIP_BUCKET_HREF = "/payslip";

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

export function topLevelHrefForPathname(pathname: string): string | null {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return item.href;
      for (const child of item.children ?? []) {
        if (pathname === child.href || pathname.startsWith(`${child.href}/`)) return item.href;
      }
    }
  }
  for (const base of ["/payslip", "/commission", "/salary-stats"]) {
    if (pathname === base || pathname.startsWith(`${base}/`)) return _PAYSLIP_BUCKET_HREF;
  }
  return null;
}

export function isPageAllowed(pathname: string, user: PageAccess | null): boolean {
  if (!user || user.isSuperuser || user.allowedPages === null) return true;
  const href = topLevelHrefForPathname(pathname);
  return href === null || user.allowedPages.includes(href);
}

export function searchDestinations(query: string): readonly NavDestination[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return NAV_DESTINATIONS.filter((d) =>
    [d.label, d.parent ?? "", d.section].some((s) =>
      s.toLowerCase().includes(q),
    ),
  ).slice(0, 8);
}
