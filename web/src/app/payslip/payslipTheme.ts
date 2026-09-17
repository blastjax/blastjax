import { IBM_Plex_Mono, Manrope } from "next/font/google";

/**
 * Page-scoped dark theme matching the "Payslip page redesign" Claude Design
 * mock exactly (oklch dark neutrals + one teal accent), independent of the
 * site's light/dark toggle and shared `@/lib/ui` tokens. Only this page uses
 * these — every other page keeps the NextAdmin light/dark system untouched.
 */

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-payslip-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-payslip-mono",
});

/** Apply once, on the page's outermost element — cascades to the modal too
 * (Modal renders inline, not via portal, so it's still a DOM descendant). */
export const PAYSLIP_FONT_CLASS = `${manrope.variable} ${plexMono.variable} font-[family-name:var(--font-payslip-sans)]`;

export const PAYSLIP_MONO = "font-[family-name:var(--font-payslip-mono)] tabular-nums";

/* -------------------------------------------------------------------------
 * Surfaces (darkest to lightest tier)
 * ---------------------------------------------------------------------- */
export const PAYSLIP_BG_0 = "bg-[oklch(0.15_0.004_260)]"; // page floor
export const PAYSLIP_BG_1 = "bg-[oklch(0.18_0.005_260)]"; // big outer card
export const PAYSLIP_BG_2 = "bg-[oklch(0.19_0.005_260)]"; // month cards
export const PAYSLIP_BG_3 = "bg-[oklch(0.21_0.006_260)]"; // stat / hero tiles
export const PAYSLIP_BG_4 = "bg-[oklch(0.16_0.004_260)]"; // period mini-cards, dashed empties

/* -------------------------------------------------------------------------
 * Borders
 * ---------------------------------------------------------------------- */
export const PAYSLIP_BORDER_SOFT = "border-[oklch(1_0_0/0.06)]";
export const PAYSLIP_BORDER = "border-[oklch(1_0_0/0.07)]";
export const PAYSLIP_BORDER_STRONG = "border-[oklch(1_0_0/0.14)]";
export const PAYSLIP_BORDER_DASHED = "border-dashed border-[oklch(1_0_0/0.08)]";

/* -------------------------------------------------------------------------
 * Text
 * ---------------------------------------------------------------------- */
export const PAYSLIP_TEXT_INK = "text-[oklch(0.94_0.005_260)]";
export const PAYSLIP_TEXT_2 = "text-[oklch(0.75_0.01_260)]";
export const PAYSLIP_TEXT_MUTED = "text-[oklch(0.6_0.01_260)]";
export const PAYSLIP_TEXT_DIM = "text-[oklch(0.55_0.01_260)]";
export const PAYSLIP_TEXT_FAINT = "text-[oklch(0.5_0.01_260)]";
export const PAYSLIP_TEXT_GHOST = "text-[oklch(0.45_0.01_260)]";

/* -------------------------------------------------------------------------
 * Accent (teal) + deduction red
 * ---------------------------------------------------------------------- */
export const PAYSLIP_ACCENT_TEXT = "text-[oklch(0.72_0.11_195)]";
export const PAYSLIP_ACCENT_BG = "bg-[oklch(0.72_0.11_195)]";
export const PAYSLIP_ACCENT_BG_HOVER = "hover:bg-[oklch(0.8_0.11_195)]";
export const PAYSLIP_ACCENT_ON = "text-[oklch(0.12_0.004_260)]"; // text on teal fill
export const PAYSLIP_DANGER_TEXT = "text-[oklch(0.68_0.19_25)]";
export const PAYSLIP_TRACK_BG = "bg-[oklch(1_0_0/0.08)]";

/* -------------------------------------------------------------------------
 * Shared shells
 * ---------------------------------------------------------------------- */
export const PAYSLIP_CARD =
  `rounded-2xl border ${PAYSLIP_BORDER} ${PAYSLIP_BG_1}`;
export const PAYSLIP_TILE = `rounded-xl border ${PAYSLIP_BORDER_SOFT} ${PAYSLIP_BG_3}`;
export const PAYSLIP_MONTH_CARD = `rounded-lg border ${PAYSLIP_BORDER} ${PAYSLIP_BG_2}`;
export const PAYSLIP_MINI_CARD = `rounded-lg ${PAYSLIP_BG_4}`;

/* -------------------------------------------------------------------------
 * Buttons / controls
 * ---------------------------------------------------------------------- */
const BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50";

export const PAYSLIP_PRIMARY_BUTTON = `${BTN_BASE} h-9 px-4 text-sm ${PAYSLIP_ACCENT_BG} ${PAYSLIP_ACCENT_ON} ${PAYSLIP_ACCENT_BG_HOVER}`;
export const PAYSLIP_SECONDARY_BUTTON = `${BTN_BASE} h-9 px-4 text-sm border ${PAYSLIP_BORDER_STRONG} bg-transparent ${PAYSLIP_TEXT_2} hover:bg-[oklch(1_0_0/0.06)]`;
export const PAYSLIP_GHOST_BUTTON = `${BTN_BASE} h-8 px-3 text-xs bg-transparent ${PAYSLIP_TEXT_MUTED} hover:bg-[oklch(1_0_0/0.06)] hover:${PAYSLIP_TEXT_2}`;
export const PAYSLIP_DANGER_BUTTON = `${BTN_BASE} h-8 px-3 text-xs border border-[oklch(0.68_0.19_25/0.4)] bg-[oklch(0.68_0.19_25/0.1)] ${PAYSLIP_DANGER_TEXT} hover:border-[oklch(0.68_0.19_25/0.7)]`;
export const PAYSLIP_ICON_BUTTON =
  `inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${PAYSLIP_BORDER_STRONG} bg-transparent text-sm ${PAYSLIP_TEXT_2} transition-colors duration-150 hover:bg-[oklch(1_0_0/0.06)] disabled:pointer-events-none disabled:opacity-40`;

/** Override for shared `AmountInput`/select/textarea so form fields stay
 * legible against the dark shell regardless of the site's own theme toggle.
 * `!` forces these to win over `INPUT_CLASSES`'s own background/border/text. */
export const PAYSLIP_INPUT_OVERRIDE =
  "!border-[oklch(1_0_0/0.14)] !bg-[oklch(0.16_0.004_260)] !text-[oklch(0.94_0.005_260)] !ring-offset-0 focus:!border-[oklch(0.72_0.11_195)] focus:!ring-[oklch(0.72_0.11_195/0.25)]";

export const PAYSLIP_ERROR_ALERT =
  `rounded-lg border border-[oklch(0.68_0.19_25/0.4)] bg-[oklch(0.68_0.19_25/0.12)] px-4 py-3 text-sm ${PAYSLIP_DANGER_TEXT}`;
