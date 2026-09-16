"use client";

import Link from "next/link";
import { useCurrentUser } from "@/components/AuthGate";
import {
  CalendarIcon,
  ChartBarIcon,
  ChevronRightIcon,
  CreditCardIcon,
  DocumentIcon,
  GridIcon,
  HeartPulseIcon,
  LayersIcon,
  MusicIcon,
  PlaneIcon,
  PuzzleIcon,
  TicketIcon,
  type IconProps,
} from "@/components/Icons";
import { isPageAllowed } from "@/lib/nav";
import { CARD_CLASSES, SECTION_LABEL_CLASSES } from "@/lib/ui";

type Shortcut = { href: string; label: string; icon: (p: IconProps) => React.ReactElement };

type Area = {
  href: string;
  title: string;
  description: string;
  icon: (p: IconProps) => React.ReactElement;
  /** Tint for the icon chip — the one place each area gets its own hue. */
  tone: string;
  shortcuts: readonly Shortcut[];
};

const AREAS: readonly Area[] = [
  {
    href: "/calendar",
    title: "Finances",
    description:
      "Daily budget from your last net pay, plus everything that draws it down.",
    icon: CalendarIcon,
    tone: "bg-brand-soft text-brand-text",
    shortcuts: [
      { href: "/monthly-expenses", label: "Monthly Expenses", icon: DocumentIcon },
      { href: "/credit-card", label: "Credit Card", icon: CreditCardIcon },
      { href: "/installments", label: "Installments", icon: LayersIcon },
    ],
  },
  {
    href: "/payslip",
    title: "Payslip",
    description:
      "Payslips by year and pay period, with commission and salary trends alongside.",
    icon: DocumentIcon,
    tone: "bg-info-soft text-info-text",
    shortcuts: [
      { href: "/commission", label: "Commission", icon: ChartBarIcon },
      { href: "/salary-stats", label: "Salary Stats", icon: ChartBarIcon },
    ],
  },
  {
    href: "/blood-pressure",
    title: "Health",
    description: "Blood-pressure readings charted over time, with trend lines.",
    icon: HeartPulseIcon,
    tone: "bg-danger-soft text-danger-text",
    shortcuts: [],
  },
  {
    href: "/travels",
    title: "Travels",
    description:
      "Trips filed by year and month — flights, legs, itinerary and stays.",
    icon: PlaneIcon,
    tone: "bg-warning-soft text-warning-text",
    shortcuts: [],
  },
  {
    href: "/lotto",
    title: "Games",
    description: "Lotto draws and attempts, plus the solving assistants.",
    icon: TicketIcon,
    tone: "bg-success-soft text-success-text",
    shortcuts: [
      { href: "/games/mosaic", label: "Mosaic", icon: GridIcon },
      { href: "/games/mambo", label: "Mambo", icon: MusicIcon },
      { href: "/games/mastermind", label: "Mastermind", icon: PuzzleIcon },
    ],
  },
];

export default function Home() {
  const currentUser = useCurrentUser();
  const areas = AREAS.filter((a) => isPageAllowed(a.href, currentUser));

  return (
    <div className="relative mx-auto flex w-full min-w-0 max-w-[1536px] flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 xl:px-8">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.3px] text-ink">
          Welcome back
        </h1>
        <p className="mt-1 text-sm text-ink-3">
          Pick up where you left off, or jump straight to a section.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {areas.map(({ href, title, description, icon: Icon, tone, shortcuts }) => (
          <div key={href} className={`${CARD_CLASSES} flex flex-col`}>
            <Link href={href} className="group flex items-start gap-4">
              <span
                className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full ${tone}`}
                aria-hidden
              >
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-base font-semibold tracking-[-0.2px] text-ink">
                    {title}
                  </span>
                  <ChevronRightIcon className="size-4 text-ink-4 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand-text" />
                </span>
                <span className="mt-1 block text-sm text-ink-3">
                  {description}
                </span>
              </span>
            </Link>

            {shortcuts.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <p className={SECTION_LABEL_CLASSES}>Jump to</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {shortcuts.map((s) => (
                    <Link
                      key={s.href}
                      href={s.href}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2/60 px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink"
                    >
                      <s.icon className="size-3.5 text-ink-4" />
                      {s.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
