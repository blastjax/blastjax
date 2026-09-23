import type { BudgetTheme } from "./theme";

/** Series keys used for pie slices, line/area strokes, and legend swatches. */
export const CHART_SERIES_COLOR_KEYS = [
  "basic_salary",
  "reimbursement",
  "others",
  "allowances",
  "commission",
  "thirteenth_month",
  "medical_reimbursement",
  "mp2",
  "withholding_tax",
  "sss_contribution",
  "philhealth",
  "pag_ibig",
] as const;

export type ChartSeriesColorKey = (typeof CHART_SERIES_COLOR_KEYS)[number];

export const CHART_SERIES_LABEL: Record<ChartSeriesColorKey, string> = {
  basic_salary: "Basic Salary",
  reimbursement: "Reimbursement",
  others: "Others",
  allowances: "Allowances",
  commission: "Commission",
  thirteenth_month: "13th Month",
  mp2: "MP2",
  medical_reimbursement: "Medical reimbursement",
  withholding_tax: "Withholding tax",
  sss_contribution: "SSS contribution",
  philhealth: "Philhealth",
  pag_ibig: "Pag-ibig",
};

const LS_CHART_PALETTE = "blastjax:chartPalette:v1";

export type ChartPaletteByTheme = Record<
  BudgetTheme,
  Record<ChartSeriesColorKey, string>
>;

/** Default line + pie colors (light UI). */
const BUILTIN_LIGHT: Record<ChartSeriesColorKey, string> = {
  basic_salary: "#ffffff",
  reimbursement: "#3b82f6",
  others: "#8b5cf6",
  allowances: "#64748b",
  commission: "#f43f5e",
  thirteenth_month: "#ea580c",
  mp2: "#06b6d4",
  medical_reimbursement: "#14b8a6",
  withholding_tax: "#71717a",
  sss_contribution: "#b91c1c",
  philhealth: "#f97316",
  pag_ibig: "#fb7185",
};

/** Slightly brighter defaults on dark backgrounds for readability. */
const BUILTIN_DARK: Record<ChartSeriesColorKey, string> = {
  basic_salary: "#ffffff",
  reimbursement: "#60a5fa",
  others: "#a78bfa",
  allowances: "#94a3b8",
  commission: "#fb7185",
  thirteenth_month: "#fb923c",
  mp2: "#22d3ee",
  medical_reimbursement: "#2dd4bf",
  withholding_tax: "#a1a1aa",
  sss_contribution: "#ef4444",
  philhealth: "#fdba74",
  pag_ibig: "#fda4af",
};

export function defaultChartPalette(): ChartPaletteByTheme {
  return {
    light: { ...BUILTIN_LIGHT },
    dark: { ...BUILTIN_DARK },
  };
}

function isValidHex(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim())
  );
}

export function loadChartPalette(): ChartPaletteByTheme {
  const out = defaultChartPalette();
  try {
    const raw = localStorage.getItem(LS_CHART_PALETTE);
    if (!raw) return out;
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return out;
    for (const th of ["light", "dark"] as const) {
      const bucket = (o as Record<string, unknown>)[th];
      if (!bucket || typeof bucket !== "object") continue;
      for (const k of CHART_SERIES_COLOR_KEYS) {
        const v = (bucket as Record<string, unknown>)[k];
        if (isValidHex(v)) out[th][k] = v.trim();
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function saveChartPalette(p: ChartPaletteByTheme): void {
  try {
    localStorage.setItem(LS_CHART_PALETTE, JSON.stringify(p));
  } catch {
    /* quota / private mode */
  }
}

/** Normalize to #RRGGBB for `<input type="color">`. */
export function normalizeHexForColorInput(hex: string): string {
  const s = hex.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.slice(0, 7).toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    const r = s[1]!;
    const g = s[2]!;
    const b = s[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return "#888888";
}
