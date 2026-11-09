# Node web:lib:nav: lib/nav.ts
Kind: module
Language: typescript, 204 lines of code, location: web/src/lib/nav.ts

Source excerpt: web/src/lib/nav.ts (first 150 lines)
```
   1  import {
   2    CalendarIcon,
   3    ChartBarIcon,
   4    CreditCardIcon,
   5    DiagramIcon,
   6    DiceIcon,
   7    DocumentIcon,
   8    GridIcon,
   9    HeartPulseIcon,
  10    HomeIcon,
  11    LayersIcon,
  12    MusicIcon,
  13    PlaneIcon,
  14    PuzzleIcon,
  15    ReceiptIcon,
  16    SettingsIcon,
  17    TicketIcon,
  18    TrendingUpIcon,
  19    WalletIcon,
  20    type IconProps,
  21  } from "@/components/Icons";
  22  
  23  export type NavIcon = (p: IconProps) => React.ReactElement;
  24  export type NavChild = { href: string; label: string; icon: NavIcon };
  25  export type NavItem = {
  26    href: string;
  27    label: string;
  28    icon: NavIcon;
  29    children?: readonly NavChild[];
  30  };
  31  export type NavSection = { title: string | null; items: readonly NavItem[] };
  32  
  33  export const NAV_SECTIONS: readonly NavSection[] = [
  34    {
  35      title: "Finances",
  36      items: [
  37        {
  38          href: "/calendar",
  39          label: "Calendar",
  40          icon: CalendarIcon,
  41          children: [
  42            {
  43              href: "/monthly-expenses",
  44              label: "Monthly Expenses",
  45              icon: WalletIcon,
  46            },
  47            { href: "/credit-card", label: "Credit Cards", icon: CreditCardIcon },
  48            { href: "/installments", label: "Installments", icon: LayersIcon },
  49            { href: "/house-payments", label: "House Payments", icon: HomeIcon },
  50            { href: "/bills", label: "Bills", icon: ReceiptIcon },
  51          ],
  52        },
  53      ],
  54    },
  55    {
  56      title: "Health",
  57      items: [
  58        {
  59          href: "/blood-pressure",
  60          label: "Overall Health",
  61          icon: HeartPulseIcon,
  62        },
  63      ],
  64    },
  65    {
  66      title: "Travels",
  67      items: [{ href: "/travels", label: "Travels", icon: PlaneIcon }],
  68    },
  69    {
  70      title: "Games",
  71      items: [
  72        { href: "/games/mosaic", label: "Mosaic", icon: GridIcon },
  73        { href: "/games/mambo", label: "Mambo", icon: MusicIcon },
  74        { href: "/games/mastermind", label: "Mastermind", icon: PuzzleIcon },
  75        { href: "/games/sets", label: "Sets", icon: DiceIcon },
  76        { href: "/lotto", label: "Lotto", icon: TicketIcon },
  77      ],
  78    },
  79    {
  80      title: null,
  81      items: [
  82        { href: "/software-architecture", label: "Software Architecture", icon: DiagramIcon },
  83        { href: "/settings", label: "Settings", icon: SettingsIcon },
  84      ],
  85    },
  86  ];
  87  
  88  export function payslipNavItem(company: string, showCommission: boolean): NavItem {
  89    const slug = encodeURIComponent(company);
  90    return {
  91      href: `/payslip/${slug}`,
  92      label: `${company} Payslip`,
  93      icon: DocumentIcon,
  94      children: [
  95        ...(showCommission
  96          ? [{ href: `/commission/${slug}`, label: "Commission", icon: TrendingUpIcon }]
  97          : []),
  98        { href: `/salary-stats/${slug}`, label: "Salary Stats", icon: ChartBarIcon },
  99      ],
 100    };
 101  }
 102  
 103  export type NavDestination = {
 104    href: string;
 105    label: string;
 106    icon: NavIcon;
 107    section: string;
 108    parent?: string;
 109  };
 110  
 111  export const NAV_DESTINATIONS: readonly NavDestination[] = NAV_SECTIONS.flatMap(
 112    (section) =>
 113      section.items.flatMap((item): NavDestination[] => [
 114        {
 115          href: item.href,
 116          label: item.label,
 117          icon: item.icon,
 118          section: section.title ?? "General",
 119        },
 120        ...(item.children ?? []).map((child) => ({
 121          href: child.href,
 122          label: child.label,
 123          icon: child.icon,
 124          section: section.title ?? "General",
 125          parent: item.label,
 126        })),
 127      ]),
 128  );
 129  
 130  export function matchingNavHref(pathname: string): string {
 131    const sorted = [...NAV_DESTINATIONS].sort(
 132      (a, b) => b.href.length - a.href.length,
 133    );
 134    for (const { href } of sorted) {
 135      if (pathname === href || pathname.startsWith(`${href}/`)) return href;
 136    }
 137    for (const base of ["/payslip", "/commission", "/salary-stats"]) {
 138      if (pathname.startsWith(`${base}/`)) {
 139        const first = pathname.slice(base.length + 1).split("/")[0];
 140        return `${base}/${first}`;
 141      }
 142    }
 143    return "";
 144  }
 145  
 146  export function activeDestination(pathname: string): NavDestination | null {
 147    const href = matchingNavHref(pathname);
 148    return NAV_DESTINATIONS.find((d) => d.href === href) ?? null;
 149  }
 150  
```

## Outgoing connections
- call -> components/Icons.tsx (web:components:Icons)

## Incoming connections
- components/AppShell.tsx (web:components:AppShell) -> call
- components/AuthGate.tsx (web:components:AuthGate) -> call
- components/Header.tsx (web:components:Header) -> call
- components/HomeOverview.tsx (web:components:HomeOverview) -> call
- components/PageHeader.tsx (web:components:PageHeader) -> call
- components/SidebarNav.tsx (web:components:SidebarNav) -> call
- Home page (web:home) -> call
- /settings (web:settings) -> call
