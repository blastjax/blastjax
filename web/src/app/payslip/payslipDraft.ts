import type { PayslipCreateBody, PayslipRow } from "@/lib/api";
import { formatAmountNumber, parseFormNumber } from "@/lib/parseFormNumber";
import type { FormState } from "./payslipModalForm";

/** Formats a stored amount as ``n,nnn.nn`` for display, or "" when absent. */
function fmtOptAmount(n: number | null | undefined): string {
  return n != null ? formatAmountNumber(n) : "";
}

const PAYSLIP_DRAFT_EDIT_PREFIX = "blastjax:payslip:draft:edit:";
const PAYSLIP_DRAFT_ADD_PREFIX = "blastjax:payslip:draft:add:";

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
    | { screen: "add"; year: number; month: number; half: 1 | 2 },
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
    }
  } catch {
    /* quota / private mode */
  }
}

export function clearPayslipModalDraft(
  nav:
    | { screen: "edit"; row: PayslipRow }
    | { screen: "add"; year: number; month: number; half: 1 | 2 },
): void {
  try {
    if (nav.screen === "edit") {
      sessionStorage.removeItem(payslipDraftKeyEdit(nav.row.id));
    } else if (nav.screen === "add") {
      sessionStorage.removeItem(
        payslipDraftKeyAdd(nav.year, nav.month, nav.half),
      );
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
    company: r.company,
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
    total: fmtOptAmount(r.total),
    basic_salary: fmtOptAmount(r.basic_salary),
    commission: fmtOptAmount(r.commission),
    reimbursement: fmtOptAmount(r.reimbursement),
    medical_reimbursement: fmtOptAmount(r.medical_reimbursement),
    others: fmtOptAmount(r.others),
    mp2: fmtOptAmount(r.mp2),
    allowances: fmtOptAmount(r.allowances),
    thirteenth_month: fmtOptAmount(r.thirteenth_month),
    notes: r.notes ?? "",
    withholding_tax: fmtOptAmount(r.withholding_tax),
    sss_contribution: fmtOptAmount(r.sss_contribution),
    philhealth: fmtOptAmount(r.philhealth),
    pag_ibig: fmtOptAmount(r.pag_ibig),
  };
}

export function formToCreateBody(f: FormState): PayslipCreateBody {
  return {
    company: f.company.trim(),
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
