import { parseFormNumber } from "@/lib/parseFormNumber";

export type FormState = {
  period_year: string;
  period_month: string;
  period_half: "" | "1" | "2";
  total: string;
  basic_salary: string;
  commission: string;
  reimbursement: string;
  medical_reimbursement: string;
  others: string;
  mp2: string;
  allowances: string;
  thirteenth_month: string;
  notes: string;
  withholding_tax: string;
  sss_contribution: string;
  philhealth: string;
  pag_ibig: string;
};

export const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function emptyForm(): FormState {
  return {
    period_year: "",
    period_month: "",
    period_half: "",
    total: "",
    basic_salary: "",
    commission: "",
    reimbursement: "",
    medical_reimbursement: "",
    others: "",
    mp2: "",
    allowances: "",
    thirteenth_month: "",
    notes: "",
    withholding_tax: "",
    sss_contribution: "",
    philhealth: "",
    pag_ibig: "",
  };
}

function parseOptYear(s: string): number | null {
  const n = parseFormNumber(s);
  if (n == null) return null;
  const y = Math.trunc(n);
  if (y < 1900 || y > 2200) return null;
  return y;
}

export function tryParseFormStateJson(raw: string): FormState | null {
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const x = o as Record<string, unknown>;
    const base = emptyForm();
    (Object.keys(base) as (keyof FormState)[]).forEach((k) => {
      const v = x[k as string];
      if (typeof v === "string") {
        (base as Record<string, string>)[k] = v;
      } else if (typeof v === "number" && Number.isFinite(v)) {
        (base as Record<string, string>)[k] = String(v);
      }
    });
    if (
      base.period_half !== "" &&
      base.period_half !== "1" &&
      base.period_half !== "2"
    ) {
      base.period_half = "";
    }
    return base;
  } catch {
    return null;
  }
}

const LS_PAYSLIP_MODAL_DEFAULTS = "budgetapp:payslip:modalDefaults";

const BUILTIN_MODAL_DEFAULTS: Pick<FormState, "mp2" | "allowances"> = {
  mp2: "5000",
  allowances: "1108.30",
};

/** Settings toggle / last-selected half (first vs second template). */
export type PayslipPrefillHalfMode = "first" | "second";

export type PayslipDefaultsBundle = {
  formFirst: FormState;
  formSecond: FormState;
  settingsHalf: PayslipPrefillHalfMode;
};

const defaultFormWithBuiltin = (): FormState => ({
  ...emptyForm(),
  ...BUILTIN_MODAL_DEFAULTS,
});

const defaultSettingsHalf = (): PayslipPrefillHalfMode => "first";

function formFirstFallback(): FormState {
  return { ...defaultFormWithBuiltin(), period_half: "1" };
}

function formSecondFallback(): FormState {
  return { ...defaultFormWithBuiltin(), period_half: "2" };
}

/** Same values as `loadPayslipDefaultsBundle()` when localStorage is empty/unavailable (SSR-safe). */
export function getPayslipDefaultsBundleFallback(): PayslipDefaultsBundle {
  return {
    formFirst: formFirstFallback(),
    formSecond: formSecondFallback(),
    settingsHalf: defaultSettingsHalf(),
  };
}

export const PAYSLIP_DEFAULTS_SAVED_EVENT = "budgetapp:payslip-defaults-saved";

export function notifyPayslipDefaultsSaved(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PAYSLIP_DEFAULTS_SAVED_EVENT));
}

function parseSettingsHalf(rec: Record<string, unknown>): PayslipPrefillHalfMode {
  const m = rec.settingsHalf ?? rec.prefillHalfMode;
  if (m === "first" || m === "second") return m;
  if (m === "both") return "first";
  const legacy = rec.prefillHalves;
  if (legacy && typeof legacy === "object") {
    const o = legacy as Record<string, unknown>;
    const first = o.first === true;
    const second = o.second === true;
    if (first && second) return "first";
    if (first) return "first";
    if (second) return "second";
  }
  return defaultSettingsHalf();
}

function parseFormField(rec: Record<string, unknown>, key: string): FormState | null {
  const v = rec[key];
  if (!v || typeof v !== "object") return null;
  return tryParseFormStateJson(JSON.stringify(v));
}

/** Defaults used when opening the add modal for a calendar half (1 vs 2). */
export function payslipDefaultsFormForSlotHalf(
  bundle: PayslipDefaultsBundle,
  half: 1 | 2,
): FormState {
  return half === 1 ? bundle.formFirst : bundle.formSecond;
}

/** Loads saved form defaults (separate first- and second-half templates). */
export function loadPayslipDefaultsBundle(): PayslipDefaultsBundle {
  const fallback = getPayslipDefaultsBundleFallback();
  try {
    const raw = localStorage.getItem(LS_PAYSLIP_MODAL_DEFAULTS);
    if (!raw) return fallback;
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return fallback;
    const rec = o as Record<string, unknown>;

    const ff = parseFormField(rec, "formFirst");
    const fs = parseFormField(rec, "formSecond");
    if (ff && fs) {
      return {
        formFirst: ff,
        formSecond: fs,
        settingsHalf: parseSettingsHalf(rec),
      };
    }

    if ("form" in rec && rec.form && typeof rec.form === "object") {
      const form = tryParseFormStateJson(JSON.stringify(rec.form));
      const merged = { ...defaultFormWithBuiltin(), ...(form ?? {}) };
      const mode = parseSettingsHalf(rec);
      return {
        formFirst: { ...merged, period_half: "1" },
        formSecond: { ...merged, period_half: "2" },
        settingsHalf: mode,
      };
    }

    const legacy = tryParseFormStateJson(raw);
    if (legacy) {
      const merged = { ...defaultFormWithBuiltin(), ...legacy };
      return {
        formFirst: { ...merged, period_half: "1" },
        formSecond: { ...merged, period_half: "2" },
        settingsHalf: defaultSettingsHalf(),
      };
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function savePayslipDefaultsBundle(bundle: PayslipDefaultsBundle): void {
  try {
    localStorage.setItem(
      LS_PAYSLIP_MODAL_DEFAULTS,
      JSON.stringify({
        formFirst: bundle.formFirst,
        formSecond: bundle.formSecond,
        settingsHalf: bundle.settingsHalf,
      }),
    );
    notifyPayslipDefaultsSaved();
  } catch {
    /* quota / private mode */
  }
}

export function payPeriodFromToday(): Pick<
  FormState,
  "period_year" | "period_month" | "period_half"
> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const half: "1" | "2" = day >= 1 && day <= 15 ? "1" : "2";
  return {
    period_year: String(year),
    period_month: String(month),
    period_half: half,
  };
}

export function payPeriodFromDefaultsIfComplete(
  d: FormState,
): Pick<FormState, "period_year" | "period_month" | "period_half"> | null {
  const y = parseOptYear(d.period_year);
  if (y == null) return null;
  const mRaw = parseFormNumber(d.period_month);
  const month = mRaw != null ? Math.trunc(mRaw) : null;
  if (month == null || month < 1 || month > 12) return null;
  if (d.period_half !== "1" && d.period_half !== "2") return null;
  return {
    period_year: String(y),
    period_month: String(month),
    period_half: d.period_half,
  };
}

export function initialAddPayslipForm(
  year: number,
  month: number,
  half: 1 | 2,
  defaultsForHalf: FormState,
): FormState {
  const period = {
    period_year: String(year),
    period_month: String(month),
    period_half: String(half) as "1" | "2",
  };
  return {
    ...emptyForm(),
    ...defaultsForHalf,
    ...period,
  };
}

export function initialManualPayslipForm(
  formFirst: FormState,
  formSecond: FormState,
): FormState {
  const today = payPeriodFromToday();
  const halfNum: 1 | 2 = today.period_half === "2" ? 2 : 1;
  const defaults = halfNum === 1 ? formFirst : formSecond;
  const halfStr: "1" | "2" = halfNum === 2 ? "2" : "1";
  const fromDefaults = payPeriodFromDefaultsIfComplete(defaults);
  const period =
    fromDefaults != null
      ? {
          period_year: fromDefaults.period_year,
          period_month: fromDefaults.period_month,
          period_half: halfStr,
        }
      : {
          period_year: today.period_year,
          period_month: today.period_month,
          period_half: halfStr,
        };
  return {
    ...emptyForm(),
    ...defaults,
    ...period,
  };
}
