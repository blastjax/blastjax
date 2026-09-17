/**
 * The Payslip page's redesign (oklch dark neutrals + one teal accent) is now
 * the sitewide design language — see `globals.css` and `@/lib/ui`. This file
 * stays only so the page's many call sites don't need touching: every export
 * below is a thin alias onto the shared tokens, preserving Payslip's own
 * control geometry (its buttons/tiles use slightly different sizing than the
 * shared `@/lib/ui` primitives) without duplicating any color value.
 */

export const PAYSLIP_FONT_CLASS = "";

export const PAYSLIP_MONO = "font-mono tabular-nums";

/* -------------------------------------------------------------------------
 * Surfaces (darkest to lightest tier)
 * ---------------------------------------------------------------------- */
export const PAYSLIP_BG_0 = "bg-page";
export const PAYSLIP_BG_1 = "bg-surface";
export const PAYSLIP_BG_2 = "bg-surface-2";
export const PAYSLIP_BG_3 = "bg-surface-3";
export const PAYSLIP_BG_4 = "bg-surface-inset";

/* -------------------------------------------------------------------------
 * Borders
 * ---------------------------------------------------------------------- */
export const PAYSLIP_BORDER_SOFT = "border-line-soft";
export const PAYSLIP_BORDER = "border-line";
export const PAYSLIP_BORDER_STRONG = "border-line-strong";
export const PAYSLIP_BORDER_DASHED = "border-dashed border-line";

/* -------------------------------------------------------------------------
 * Text
 * ---------------------------------------------------------------------- */
export const PAYSLIP_TEXT_INK = "text-ink";
export const PAYSLIP_TEXT_2 = "text-ink-2";
export const PAYSLIP_TEXT_MUTED = "text-ink-3";
export const PAYSLIP_TEXT_DIM = "text-ink-3";
export const PAYSLIP_TEXT_FAINT = "text-ink-4";
export const PAYSLIP_TEXT_GHOST = "text-ink-4";

/* -------------------------------------------------------------------------
 * Accent (teal) + deduction red
 * ---------------------------------------------------------------------- */
export const PAYSLIP_ACCENT_TEXT = "text-brand-text";
export const PAYSLIP_ACCENT_BG = "bg-brand";
export const PAYSLIP_ACCENT_BG_HOVER = "hover:bg-brand-hover";
export const PAYSLIP_ACCENT_ON = "text-brand-on"; // text on teal fill
export const PAYSLIP_DANGER_TEXT = "text-danger-text";
export const PAYSLIP_TRACK_BG = "bg-line-strong";

/* -------------------------------------------------------------------------
 * Shared shells
 * ---------------------------------------------------------------------- */
export const PAYSLIP_CARD = `rounded-2xl border ${PAYSLIP_BORDER} ${PAYSLIP_BG_1}`;
export const PAYSLIP_TILE = `rounded-xl border ${PAYSLIP_BORDER_SOFT} ${PAYSLIP_BG_3}`;
export const PAYSLIP_MONTH_CARD = `rounded-lg border ${PAYSLIP_BORDER} ${PAYSLIP_BG_2}`;
export const PAYSLIP_MINI_CARD = `rounded-lg ${PAYSLIP_BG_4}`;

/* -------------------------------------------------------------------------
 * Buttons / controls
 * ---------------------------------------------------------------------- */
const BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50";

export const PAYSLIP_PRIMARY_BUTTON = `${BTN_BASE} h-9 px-4 text-sm ${PAYSLIP_ACCENT_BG} ${PAYSLIP_ACCENT_ON} ${PAYSLIP_ACCENT_BG_HOVER}`;
export const PAYSLIP_SECONDARY_BUTTON = `${BTN_BASE} h-9 px-4 text-sm border ${PAYSLIP_BORDER_STRONG} bg-transparent ${PAYSLIP_TEXT_2} hover:bg-surface-2`;
export const PAYSLIP_GHOST_BUTTON = `${BTN_BASE} h-8 px-3 text-xs bg-transparent ${PAYSLIP_TEXT_MUTED} hover:bg-surface-2 hover:${PAYSLIP_TEXT_2}`;
export const PAYSLIP_DANGER_BUTTON = `${BTN_BASE} h-8 px-3 text-xs border border-danger-line bg-danger-soft ${PAYSLIP_DANGER_TEXT} hover:border-danger/70`;
export const PAYSLIP_ICON_BUTTON =
  `inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${PAYSLIP_BORDER_STRONG} bg-transparent text-sm ${PAYSLIP_TEXT_2} transition-colors duration-150 hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40`;

/** No longer needed — the shared `INPUT_CLASSES` already read the same
 * theme-aware tokens this page used to force. Kept as a no-op so call sites
 * that still splice it in don't need touching. */
export const PAYSLIP_INPUT_OVERRIDE = "";

export const PAYSLIP_ERROR_ALERT =
  `rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-sm ${PAYSLIP_DANGER_TEXT}`;
