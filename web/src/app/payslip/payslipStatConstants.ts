import {
  PAYSLIP_ACCENT_BG,
  PAYSLIP_ACCENT_TEXT,
  PAYSLIP_BG_3,
  PAYSLIP_BORDER_SOFT,
  PAYSLIP_TEXT_2,
  PAYSLIP_TEXT_DIM,
  PAYSLIP_TEXT_INK,
  PAYSLIP_TRACK_BG,
} from "./payslipTheme";

/** Annual ceiling; allowance resets each April 1 (Apr → Mar policy year). */
export const MEDICAL_REIMBURSEMENT_ANNUAL_CAP = 11500;

export type DraggableStatId =
  | "total"
  | "basic"
  | "reimbursement"
  | "others"
  | "allowances"
  | "commission"
  | "thirteenth_month"
  | "months_remaining";

export const DEFAULT_STAT_CARD_ORDER: DraggableStatId[] = [
  "total",
  "basic",
  "reimbursement",
  "others",
  "allowances",
  "commission",
  "thirteenth_month",
  "months_remaining",
];

export const DRAGGABLE_FIELD: Record<
  Exclude<DraggableStatId, "months_remaining" | "basic">,
  | "total"
  | "commission"
  | "reimbursement"
  | "others"
  | "allowances"
  | "thirteenth_month"
> = {
  total: "total",
  reimbursement: "reimbursement",
  others: "others",
  allowances: "allowances",
  commission: "commission",
  thirteenth_month: "thirteenth_month",
};

export const STAT_LABEL: Record<DraggableStatId, string> = {
  total: "Total",
  basic: "Basic salary",
  reimbursement: "Reimbursement",
  others: "Others",
  allowances: "Allowances",
  commission: "Commission",
  thirteenth_month: "13th Month",
  months_remaining: "Months Remaining",
};

export const MEDICAL_REIMBURSEMENT_LABEL = "Medical reimbursement";

export type StatTheme = {
  border: string;
  bg: string;
  title: string;
  sub: string;
  value: string;
  barTrack: string;
  barFill: string;
};

/**
 * The mock doesn't color-code categories by hue — every tile shares one
 * neutral dark panel, with the teal accent carried entirely by the bar fill.
 * One flat theme covers every stat id (and the pinned medical card).
 */
const FLAT_THEME: StatTheme = {
  border: PAYSLIP_BORDER_SOFT,
  bg: PAYSLIP_BG_3,
  title: PAYSLIP_TEXT_DIM,
  sub: PAYSLIP_TEXT_DIM,
  value: PAYSLIP_TEXT_INK,
  barTrack: PAYSLIP_TRACK_BG,
  barFill: PAYSLIP_ACCENT_BG,
};

/** Theme for the pinned medical card (not part of drag order). Same flat
 * panel; title picks up the accent color to stay visually anchored. */
export const MEDICAL_REIMBURSEMENT_STAT_THEME: StatTheme = {
  ...FLAT_THEME,
  title: PAYSLIP_ACCENT_TEXT,
  sub: PAYSLIP_TEXT_2,
};

export const STAT_THEMES: Record<DraggableStatId, StatTheme> = {
  total: FLAT_THEME,
  basic: FLAT_THEME,
  reimbursement: FLAT_THEME,
  others: FLAT_THEME,
  allowances: FLAT_THEME,
  commission: FLAT_THEME,
  thirteenth_month: FLAT_THEME,
  months_remaining: FLAT_THEME,
};

/** Shared shell: stretch with grid row height (match tallest card in the row). */
export const PAYSLIP_STAT_CARD_SHELL =
  "flex h-full min-h-0 min-w-0 flex-col rounded-xl border px-4 py-3.5";

/** Pinned stat card (e.g. medical): same layout, no drag cursor. */
export const PAYSLIP_STAT_CARD_SHELL_PINNED =
  "flex h-full min-h-0 min-w-0 cursor-default flex-col rounded-xl border px-4 py-3.5";

/** Deduction year totals: same grid density as stats, no progress bars. */
export const PAYSLIP_DEDUCTION_CARD_SHELL =
  `flex h-full min-h-0 min-w-0 flex-col rounded-xl border ${PAYSLIP_BORDER_SOFT} ${PAYSLIP_BG_3} px-4 py-3.5`;
