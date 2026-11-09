# Node web:home: Home page
Kind: module
Language: typescript, 151 lines of code, location: web/src/app/page.tsx

Source excerpt: web/src/app/page.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import Link from "next/link";
   4  import { useCurrentUser } from "@/components/AuthGate";
   5  import { HomeOverview } from "@/components/HomeOverview";
   6  import {
   7    CalendarIcon,
   8    ChartBarIcon,
   9    ChevronRightIcon,
  10    CreditCardIcon,
  11    DiceIcon,
  12    DocumentIcon,
  13    GridIcon,
  14    HeartPulseIcon,
  15    HomeIcon,
  16    LayersIcon,
  17    MusicIcon,
  18    PlaneIcon,
  19    PuzzleIcon,
  20    ReceiptIcon,
  21    TicketIcon,
  22    type IconProps,
  23  } from "@/components/Icons";
  24  import { isPageAllowed } from "@/lib/nav";
  25  import { CARD_CLASSES, SECTION_LABEL_CLASSES } from "@/lib/ui";
  26  
  27  type Shortcut = { href: string; label: string; icon: (p: IconProps) => React.ReactElement };
  28  
  29  type Area = {
  30    href: string;
  31    title: string;
  32    description: string;
  33    icon: (p: IconProps) => React.ReactElement;
  34    tone: string;
  35    shortcuts: readonly Shortcut[];
  36  };
  37  
  38  const AREAS: readonly Area[] = [
  39    {
  40      href: "/calendar",
  41      title: "Finances",
  42      description:
  43        "Daily budget from your last net pay, plus everything that draws it down.",
  44      icon: CalendarIcon,
  45      tone: "bg-brand-soft text-brand-text",
  46      shortcuts: [
  47        { href: "/monthly-expenses", label: "Monthly Expenses", icon: DocumentIcon },
  48        { href: "/credit-card", label: "Credit Cards", icon: CreditCardIcon },
  49        { href: "/installments", label: "Installments", icon: LayersIcon },
  50        { href: "/house-payments", label: "House Payments", icon: HomeIcon },
  51        { href: "/bills", label: "Bills", icon: ReceiptIcon },
  52      ],
  53    },
  54    {
  55      href: "/payslip",
  56      title: "Payslip",
  57      description:
  58        "Payslips by year and pay period, with commission and salary trends alongside.",
  59      icon: DocumentIcon,
  60      tone: "bg-info-soft text-info-text",
  61      shortcuts: [
  62        { href: "/commission", label: "Commission", icon: ChartBarIcon },
  63        { href: "/salary-stats", label: "Salary Stats", icon: ChartBarIcon },
  64      ],
  65    },
  66    {
  67      href: "/blood-pressure",
  68      title: "Health",
  69      description: "Blood-pressure readings charted over time, with trend lines.",
  70      icon: HeartPulseIcon,
  71      tone: "bg-danger-soft text-danger-text",
  72      shortcuts: [],
  73    },
  74    {
  75      href: "/travels",
  76      title: "Travels",
  77      description:
  78        "Trips filed by year and month — flights, legs, itinerary and stays.",
  79      icon: PlaneIcon,
  80      tone: "bg-warning-soft text-warning-text",
  81      shortcuts: [],
  82    },
  83    {
  84      href: "/lotto",
  85      title: "Games",
  86      description: "Lotto draws and attempts, plus the solving assistants.",
  87      icon: TicketIcon,
  88      tone: "bg-success-soft text-success-text",
  89      shortcuts: [
  90        { href: "/games/mosaic", label: "Mosaic", icon: GridIcon },
  91        { href: "/games/mambo", label: "Mambo", icon: MusicIcon },
  92        { href: "/games/mastermind", label: "Mastermind", icon: PuzzleIcon },
  93        { href: "/games/sets", label: "Sets", icon: DiceIcon },
  94      ],
  95    },
  96  ];
  97  
  98  export default function Home() {
  99    const currentUser = useCurrentUser();
 100    const areas = AREAS.filter((a) => isPageAllowed(a.href, currentUser));
 101  
 102    return (
 103      <div className="relative mx-auto flex w-full min-w-0 max-w-[1536px] flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 xl:px-8">
 104        <div>
 105          <h1 className="text-2xl font-bold tracking-[-0.3px] text-ink">
 106            Welcome back
 107          </h1>
 108          <p className="mt-1 text-sm text-ink-3">
 109            Pick up where you left off, or jump straight to a section.
 110          </p>
 111        </div>
 112  
 113        <HomeOverview />
 114  
 115        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
 116          {areas.map(({ href, title, description, icon: Icon, tone, shortcuts }) => (
 117            <div key={href} className={`${CARD_CLASSES} flex flex-col`}>
 118              <Link href={href} className="group flex items-start gap-4">
 119                <span
 120                  className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full ${tone}`}
 121                  aria-hidden
 122                >
 123                  <Icon className="size-5" />
 124                </span>
 125                <span className="min-w-0 flex-1">
 126                  <span className="flex items-center gap-1.5">
 127                    <span className="text-base font-semibold tracking-[-0.2px] text-ink">
 128                      {title}
 129                    </span>
 130                    <ChevronRightIcon className="size-4 text-ink-4 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand-text" />
 131                  </span>
 132                  <span className="mt-1 block text-sm text-ink-3">
 133                    {description}
 134                  </span>
 135                </span>
 136              </Link>
 137  
 138              {shortcuts.length > 0 && (
 139                <div className="mt-5 border-t border-line pt-4">
 140                  <p className={SECTION_LABEL_CLASSES}>Jump to</p>
 141                  <div className="mt-2 flex flex-wrap gap-2">
 142                    {shortcuts.map((s) => (
 143                      <Link
 144                        key={s.href}
 145                        href={s.href}
 146                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2/60 px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink"
 147                      >
 148                        <s.icon className="size-3.5 text-ink-4" />
 149                        {s.label}
 150                      </Link>
```

## Outgoing connections
- call -> components/AuthGate.tsx (web:components:AuthGate)
- call -> components/HomeOverview.tsx (web:components:HomeOverview)
- call -> components/Icons.tsx (web:components:Icons)
- call -> lib/nav.ts (web:lib:nav)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- none
