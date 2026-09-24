/**
 * The app's icon set — hand-rolled inline SVG rather than an icon package,
 * so the shell stays dependency-free and every glyph shares one grid.
 *
 * House rules: 24-unit viewBox, 1.5 stroke, round caps/joins, `currentColor`
 * for both stroke and fill. Size comes from the `className` (`size-5`), never
 * from hardcoded width/height, so a single icon works in nav, buttons, and
 * stat tiles without variants.
 */

export type IconProps = {
  className?: string;
};

function Svg({
  className = "size-5",
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/* ---------------------------------------------------------------- Navigation */

export function CalendarIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8 15h.01M12 15h.01M16 15h.01" />
    </Svg>
  );
}

export function WalletIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 8a3 3 0 0 1 3-3h11a2 2 0 0 1 2 2v1" />
      <rect x="3" y="7" width="18" height="13" rx="3" />
      <path d="M16 13.5h2.5" />
    </Svg>
  );
}

export function CreditCardIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <path d="M2.5 10h19M6.5 15h3" />
    </Svg>
  );
}

export function LayersIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" />
      <path d="m3 12.5 9 4.5 9-4.5M3 17l9 4.5L21 17" />
    </Svg>
  );
}

export function HomeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 10.5 12 4l8.5 6.5V19a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-8.5Z" />
      <path d="M9.5 21v-6h5v6" />
    </Svg>
  );
}

export function DocumentIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 3h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M13 3v5h5M8.5 13h7M8.5 17h4" />
    </Svg>
  );
}

export function TrendingUpIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m3 16 5.5-5.5 3.5 3.5L21 5" />
      <path d="M15.5 5H21v5.5" />
      <path d="M3 21h18" />
    </Svg>
  );
}

export function ChartBarIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 21h18" />
      <rect x="4.5" y="11" width="4" height="7" rx="1" />
      <rect x="10" y="6.5" width="4" height="11.5" rx="1" />
      <rect x="15.5" y="14" width="4" height="4" rx="1" />
    </Svg>
  );
}

export function HeartPulseIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20.4 6.6a4.6 4.6 0 0 0-7.5-1.4L12 6.1l-.9-.9a4.6 4.6 0 0 0-7.5 5.1" />
      <path d="M3.2 13h3.3l1.6-2.7L10.4 16l2.2-4.4 1.2 1.4h7" />
      <path d="M20.6 13.2c-1.4 2.6-5 5.6-8.6 8.3-1.4-1-3-2.3-4.5-3.6" />
    </Svg>
  );
}

export function PlaneIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10.5 3.2a1.5 1.5 0 0 1 3 0V9l7.5 4.4v2.3l-7.5-2.3v3.9l2.5 1.9v1.6L12 20l-4 .8v-1.6l2.5-1.9v-3.9L3 15.7v-2.3L10.5 9V3.2Z" />
    </Svg>
  );
}

export function GridIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Svg>
  );
}

export function MusicIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </Svg>
  );
}

export function PuzzleIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10.5 3.5a1.9 1.9 0 0 1 3.8 0c0 .5-.2 1-.5 1.4h3.4a1 1 0 0 1 1 1v3.4c.4-.3.9-.5 1.4-.5a1.9 1.9 0 0 1 0 3.8c-.5 0-1-.2-1.4-.5v4.4a1 1 0 0 1-1 1h-4.4c.3-.4.5-.9.5-1.4a1.9 1.9 0 0 0-3.8 0c0 .5.2 1 .5 1.4H5.6a1 1 0 0 1-1-1v-4.4c.4.3.9.5 1.4.5a1.9 1.9 0 0 0 0-3.8c-.5 0-1 .2-1.4.5V5.9a1 1 0 0 1 1-1H11c-.3-.4-.5-.9-.5-1.4Z" />
    </Svg>
  );
}

export function DiceIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" />
    </Svg>
  );
}

export function TicketIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v1.8a2 2 0 0 0 0 3.4v1.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5v-1.8a2 2 0 0 0 0-3.4V8.5Z" />
      <path d="M14 7v10" strokeDasharray="2 2" />
    </Svg>
  );
}

export function SettingsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </Svg>
  );
}

/* -------------------------------------------------------------------- Chrome */

export function MenuIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function CloseIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function SearchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  );
}

export function SunIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  );
}

export function MoonIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2Z" />
    </Svg>
  );
}

export function ChevronDownIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function ChevronRightIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  );
}

export function ChevronLeftIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m15 6-6 6 6 6" />
    </Svg>
  );
}

export function ChevronUpIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m6 15 6-6 6 6" />
    </Svg>
  );
}

export function ArrowUpRightIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 17 17 7M7 7h10v10" />
    </Svg>
  );
}

export function ArrowDownRightIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m7 7 10 10M17 7v10H7" />
    </Svg>
  );
}

export function LogoutIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14" />
      <path d="M10 8 6 12l4 4M6 12h9" />
    </Svg>
  );
}

export function SidebarToggleIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9.5 4v16" />
    </Svg>
  );
}

/* -------------------------------------------------------------------- Actions */

export function PencilIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M15.5 4.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
      <path d="M13.5 6.5l3 3" />
    </Svg>
  );
}

export function PlusIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function TrashIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7h16M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  );
}
