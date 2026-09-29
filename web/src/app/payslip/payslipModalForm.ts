import { getPayslipDefaults, savePayslipDefaults } from "@/lib/api";

export type FormState = {
  company: string;
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
  bereavement_asst: string;
};

export const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function emptyForm(): FormState {
  return {
    company: "",
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
    bereavement_asst: "",
  };
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

const LS_PAYSLIP_MODAL_DEFAULTS_LEGACY = "blastjax:payslip:modalDefaults";

const BUILTIN_MODAL_DEFAULTS: Pick<FormState, "mp2" | "allowances"> = {
  mp2: "5,000.00",
  allowances: "1,108.30",
};

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

export function getPayslipDefaultsBundleFallback(): PayslipDefaultsBundle {
  return {
    formFirst: formFirstFallback(),
    formSecond: formSecondFallback(),
    settingsHalf: defaultSettingsHalf(),
  };
}

export const PAYSLIP_DEFAULTS_SAVED_EVENT = "blastjax:payslip-defaults-saved";

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

export function payslipDefaultsFormForSlotHalf(
  bundle: PayslipDefaultsBundle,
  half: 1 | 2,
): FormState {
  return half === 1 ? bundle.formFirst : bundle.formSecond;
}

function tryLoadLegacyLocalBundle(): PayslipDefaultsBundle | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_PAYSLIP_MODAL_DEFAULTS_LEGACY);
    if (!raw) return null;
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const rec = o as Record<string, unknown>;

    const ff = parseFormField(rec, "formFirst");
    const fs = parseFormField(rec, "formSecond");
    if (ff && fs) {
      return {
        formFirst: { ...ff, period_half: "1" },
        formSecond: { ...fs, period_half: "2" },
        settingsHalf: parseSettingsHalf(rec),
      };
    }

    if ("form" in rec && rec.form && typeof rec.form === "object") {
      const form = tryParseFormStateJson(JSON.stringify(rec.form));
      const merged = { ...defaultFormWithBuiltin(), ...(form ?? {}) };
      return {
        formFirst: { ...merged, period_half: "1" },
        formSecond: { ...merged, period_half: "2" },
        settingsHalf: parseSettingsHalf(rec),
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
  }
  return null;
}

function bundlesEqual(a: PayslipDefaultsBundle, b: PayslipDefaultsBundle): boolean {
  return (
    a.settingsHalf === b.settingsHalf &&
    JSON.stringify(a.formFirst) === JSON.stringify(b.formFirst) &&
    JSON.stringify(a.formSecond) === JSON.stringify(b.formSecond)
  );
}

function bundleFromApiResponse(resp: {
  formFirst: Record<string, unknown>;
  formSecond: Record<string, unknown>;
  settingsHalf: string;
}): PayslipDefaultsBundle {
  const fallback = getPayslipDefaultsBundleFallback();
  const ff = tryParseFormStateJson(JSON.stringify(resp.formFirst));
  const fs = tryParseFormStateJson(JSON.stringify(resp.formSecond));
  return {
    formFirst: ff ? { ...ff, period_half: "1" } : fallback.formFirst,
    formSecond: fs ? { ...fs, period_half: "2" } : fallback.formSecond,
    settingsHalf: resp.settingsHalf === "second" ? "second" : "first",
  };
}

function stripHalf(f: FormState): Omit<FormState, "period_half" | "company"> {
  const rest = { ...f };
  delete (rest as Partial<FormState>).period_half;
  delete (rest as Partial<FormState>).company;
  return rest;
}

const cachedDefaultsBundleByCompany = new Map<string, PayslipDefaultsBundle>();

export function loadPayslipDefaultsBundle(company: string): PayslipDefaultsBundle {
  return cachedDefaultsBundleByCompany.get(company) ?? getPayslipDefaultsBundleFallback();
}

export async function refreshPayslipDefaultsBundle(
  company: string,
): Promise<PayslipDefaultsBundle> {
  let bundle: PayslipDefaultsBundle;
  try {
    bundle = bundleFromApiResponse(await getPayslipDefaults(company));
  } catch {
    return loadPayslipDefaultsBundle(company);
  }

  if (bundlesEqual(bundle, getPayslipDefaultsBundleFallback())) {
    const legacy = tryLoadLegacyLocalBundle();
    if (legacy && !bundlesEqual(legacy, getPayslipDefaultsBundleFallback())) {
      bundle = legacy;
      void savePayslipDefaultsBundle(company, legacy).catch(() => {
      });
    }
  }
  try {
    localStorage.removeItem(LS_PAYSLIP_MODAL_DEFAULTS_LEGACY);
  } catch {
  }

  cachedDefaultsBundleByCompany.set(company, bundle);
  return bundle;
}

export async function savePayslipDefaultsBundle(
  company: string,
  bundle: PayslipDefaultsBundle,
): Promise<PayslipDefaultsBundle> {
  const resp = await savePayslipDefaults({
    company,
    form_first: stripHalf(bundle.formFirst),
    form_second: stripHalf(bundle.formSecond),
    settings_half: bundle.settingsHalf,
  });
  const saved = bundleFromApiResponse(resp);
  cachedDefaultsBundleByCompany.set(company, saved);
  notifyPayslipDefaultsSaved();
  return saved;
}

export function initialAddPayslipForm(
  year: number,
  month: number,
  half: 1 | 2,
  defaultsForHalf: FormState,
  company: string,
): FormState {
  const period = {
    company,
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
