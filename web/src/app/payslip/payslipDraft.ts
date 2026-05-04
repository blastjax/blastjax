import type { PayslipCreateBody, PayslipRow } from "@/lib/api";
import { parseFormNumber } from "@/lib/parseFormNumber";
import type { FormState } from "./payslipModalForm";

const PAYSLIP_DRAFT_EDIT_PREFIX = "budgetapp:payslip:draft:edit:";
const PAYSLIP_DRAFT_ADD_PREFIX = "budgetapp:payslip:draft:add:";
export const PAYSLIP_DRAFT_MANUAL = "budgetapp:payslip:draft:manual";

export function payslipDraftKeyEdit(id: number): string {
  return `${PAYSLIP_DRAFT_EDIT_PREFIX}${id}`;
}

export function payslipDraftKeyAdd(
  year: number,
  month: number,
  half: number,
): string {
  return `${PAYSLIP_DRAFT_ADD_PREFIX}${year}:${month}:${half}`;
}

export function stashPayslipModalDraft(
  nav:
    | { screen: "edit"; row: PayslipRow }
    | { screen: "add"; year: number; month: number; half: 1 | 2 }
    | { screen: "manual" },
  form: FormState,
): void {
  try {
    if (nav.screen === "edit") {
      sessionStorage.setItem(
        payslipDraftKeyEdit(nav.row.id),
        JSON.stringify(form),
      );
    } else if (nav.screen === "add") {
      sessionStorage.setItem(
        payslipDraftKeyAdd(nav.year, nav.month, nav.half),
        JSON.stringify(form),
      );
    } else if (nav.screen === "manual") {
      sessionStorage.setItem(PAYSLIP_DRAFT_MANUAL, JSON.stringify(form));
    }
  } catch {
    /* quota / private mode */
  }
}

export function clearPayslipModalDraft(
  nav:
    | { screen: "edit"; row: PayslipRow }
    | { screen: "add"; year: number; month: number; half: 1 | 2 }
    | { screen: "manual" },
): void {
  try {
    if (nav.screen === "edit") {
      sessionStorage.removeItem(payslipDraftKeyEdit(nav.row.id));
    } else if (nav.screen === "add") {
      sessionStorage.removeItem(
        payslipDraftKeyAdd(nav.year, nav.month, nav.half),
      );
    } else if (nav.screen === "manual") {
      sessionStorage.removeItem(PAYSLIP_DRAFT_MANUAL);
    }
  } catch {
    /* ignore */
  }
}

export function parseOptFloat(s: string): number | null {
  return parseFormNumber(s);
}

export function parseOptYear(s: string): number | null {
  const n = parseFormNumber(s);
  if (n == null) return null;
  const y = Math.trunc(n);
  if (y < 1900 || y > 2200) return null;
  return y;
}

export function formFromRow(r: PayslipRow): FormState {
  return {
    period_year:
      r.period_year != null && Number.isFinite(r.period_year)
        ? String(Math.trunc(r.period_year))
        : "",
    period_month:
      r.period_month != null && r.period_month >= 1 && r.period_month <= 12
        ? String(r.period_month)
        : "",
    period_half:
      r.period_half === 1 ? "1" : r.period_half === 2 ? "2" : "",
    total: r.total != null ? String(r.total) : "",
    basic_salary:
      r.basic_salary != null ? String(r.basic_salary) : "",
    commission: r.commission != null ? String(r.commission) : "",
    reimbursement: r.reimbursement != null ? String(r.reimbursement) : "",
    medical_reimbursement:
      r.medical_reimbursement != null ? String(r.medical_reimbursement) : "",
    others: r.others != null ? String(r.others) : "",
    mp2: r.mp2 != null ? String(r.mp2) : "",
    allowances: r.allowances != null ? String(r.allowances) : "",
    thirteenth_month:
      r.thirteenth_month != null ? String(r.thirteenth_month) : "",
    notes: r.notes ?? "",
    withholding_tax:
      r.withholding_tax != null ? String(r.withholding_tax) : "",
    sss_contribution:
      r.sss_contribution != null ? String(r.sss_contribution) : "",
    philhealth: r.philhealth != null ? String(r.philhealth) : "",
    pag_ibig:
      r.pag_ibig != null ? String(r.pag_ibig) : "",
  };
}

export function formToCreateBody(f: FormState): PayslipCreateBody {
  return {
    period_year: parseOptYear(f.period_year),
    period_month:
      f.period_month.trim() === ""
        ? null
        : (() => {
            const n = parseFormNumber(f.period_month);
            return n != null ? Math.trunc(n) : null;
          })(),
    period_half:
      f.period_half === ""
        ? null
        : (() => {
            const n = parseFormNumber(f.period_half);
            return n === 1 || n === 2 ? (n as 1 | 2) : null;
          })(),
    total: parseOptFloat(f.total),
    basic_salary: parseOptFloat(f.basic_salary),
    commission: parseOptFloat(f.commission),
    reimbursement: parseOptFloat(f.reimbursement),
    medical_reimbursement: parseOptFloat(f.medical_reimbursement),
    others: parseOptFloat(f.others),
    mp2: parseOptFloat(f.mp2),
    allowances: parseOptFloat(f.allowances),
    thirteenth_month: parseOptFloat(f.thirteenth_month),
    notes: f.notes.trim() || null,
    withholding_tax: parseOptFloat(f.withholding_tax),
    sss_contribution: parseOptFloat(f.sss_contribution),
    philhealth: parseOptFloat(f.philhealth),
    pag_ibig: parseOptFloat(f.pag_ibig),
  };
}
