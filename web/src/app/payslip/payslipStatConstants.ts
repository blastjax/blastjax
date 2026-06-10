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

export const LS_PAYSLIP_STAT_ORDER = "budgetapp:payslip:statCardOrder";

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

/** Theme for the pinned medical card (not part of drag order). */
export const MEDICAL_REIMBURSEMENT_STAT_THEME: StatTheme = {
  border: "border-teal-200 dark:border-teal-800",
  bg: "bg-teal-50/80 dark:bg-teal-950/35",
  title: "text-teal-900 dark:text-teal-100",
  sub: "text-teal-800/90 dark:text-teal-300/90",
  value: "text-teal-950 dark:text-teal-50",
  barTrack: "bg-teal-200/70 dark:bg-teal-900/50",
  barFill: "bg-teal-600 dark:bg-teal-500",
};

export const STAT_THEMES: Record<DraggableStatId, StatTheme> = {
  total: {
    border: "border-slate-200 dark:border-slate-600",
    bg: "bg-slate-50/80 dark:bg-slate-950/40",
    title: "text-slate-900 dark:text-slate-100",
    sub: "text-slate-700 dark:text-slate-300",
    value: "text-slate-950 dark:text-slate-50",
    barTrack: "bg-slate-200/80 dark:bg-slate-800/80",
    barFill: "bg-slate-600 dark:bg-slate-400",
  },
  reimbursement: {
    border: "border-blue-200 dark:border-blue-800",
    bg: "bg-blue-50/80 dark:bg-blue-950/35",
    title: "text-blue-900 dark:text-blue-100",
    sub: "text-blue-800/90 dark:text-blue-300/90",
    value: "text-blue-950 dark:text-blue-50",
    barTrack: "bg-blue-200/70 dark:bg-blue-900/50",
    barFill: "bg-blue-600 dark:bg-blue-500",
  },
  others: {
    border: "border-violet-200 dark:border-violet-800",
    bg: "bg-violet-50/80 dark:bg-violet-950/35",
    title: "text-violet-900 dark:text-violet-100",
    sub: "text-violet-800/90 dark:text-violet-300/90",
    value: "text-violet-950 dark:text-violet-50",
    barTrack: "bg-violet-200/70 dark:bg-violet-900/50",
    barFill: "bg-violet-600 dark:bg-violet-500",
  },
  /** Same neutral styling as Total (white / slate). */
  allowances: {
    border: "border-slate-200 dark:border-slate-600",
    bg: "bg-slate-50/80 dark:bg-slate-950/40",
    title: "text-slate-900 dark:text-slate-100",
    sub: "text-slate-700 dark:text-slate-300",
    value: "text-slate-950 dark:text-slate-50",
    barTrack: "bg-slate-200/80 dark:bg-slate-800/80",
    barFill: "bg-slate-600 dark:bg-slate-400",
  },
  commission: {
    border: "border-rose-200 dark:border-rose-800",
    bg: "bg-rose-50/80 dark:bg-rose-950/35",
    title: "text-rose-900 dark:text-rose-100",
    sub: "text-rose-800/90 dark:text-rose-300/90",
    value: "text-rose-950 dark:text-rose-50",
    barTrack: "bg-rose-200/70 dark:bg-rose-900/50",
    barFill: "bg-rose-600 dark:bg-rose-500",
  },
  thirteenth_month: {
    border: "border-orange-200 dark:border-orange-900",
    bg: "bg-orange-50/85 dark:bg-orange-950/35",
    title: "text-orange-950 dark:text-orange-100",
    sub: "text-orange-900/85 dark:text-orange-300/90",
    value: "text-orange-950 dark:text-orange-50",
    barTrack: "bg-orange-200/75 dark:bg-orange-900/45",
    barFill: "bg-orange-600 dark:bg-orange-500",
  },
  basic: {
    border: "border-amber-200 dark:border-amber-900",
    bg: "bg-amber-50/85 dark:bg-amber-950/35",
    title: "text-amber-950 dark:text-amber-100",
    sub: "text-amber-900/85 dark:text-amber-300/90",
    value: "text-amber-950 dark:text-amber-50",
    barTrack: "bg-amber-200/75 dark:bg-amber-900/45",
    barFill: "bg-amber-600 dark:bg-amber-500",
  },
  months_remaining: {
    border: "border-emerald-200 dark:border-emerald-800",
    bg: "bg-emerald-50/80 dark:bg-emerald-950/35",
    title: "text-emerald-900 dark:text-emerald-100",
    sub: "text-emerald-800/90 dark:text-emerald-300/90",
    value: "text-emerald-950 dark:text-emerald-50",
    barTrack: "bg-emerald-200/70 dark:bg-emerald-900/50",
    barFill: "bg-emerald-600 dark:bg-emerald-500",
  },
};

export function isDraggableStatId(x: unknown): x is DraggableStatId {
  return (
    x === "total" ||
    x === "basic" ||
    x === "reimbursement" ||
    x === "others" ||
    x === "allowances" ||
    x === "commission" ||
    x === "thirteenth_month" ||
    x === "months_remaining"
  );
}

export function sanitizeStatOrder(parsed: unknown): DraggableStatId[] {
  if (!Array.isArray(parsed)) return [...DEFAULT_STAT_CARD_ORDER];
  const ids = parsed
    .filter((item) => item !== "medical" && item !== "mp2")
    .filter(isDraggableStatId);
  const seen = new Set<DraggableStatId>();
  const out: DraggableStatId[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of DEFAULT_STAT_CARD_ORDER) {
    if (!seen.has(id)) out.push(id);
  }
  return out.slice(0, DEFAULT_STAT_CARD_ORDER.length);
}

/** Shared shell: stretch with grid row height (match tallest card in the row). */
export const PAYSLIP_STAT_CARD_SHELL =
  "flex h-full min-h-0 min-w-0 flex-col rounded-lg border px-3 py-2.5 shadow-sm";

/** Pinned stat card (e.g. medical): same layout, no drag cursor. */
export const PAYSLIP_STAT_CARD_SHELL_PINNED =
  "flex h-full min-h-0 min-w-0 cursor-default flex-col rounded-lg border px-3 py-2.5 shadow-sm";

/** Deduction year totals: same grid density as stats, no progress bars. */
export const PAYSLIP_DEDUCTION_CARD_SHELL =
  "flex h-full min-h-0 min-w-0 flex-col rounded-lg border border-red-200/80 bg-red-50/50 px-3 py-2.5 shadow-sm dark:border-red-900/45 dark:bg-red-950/25";
