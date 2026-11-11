"use client";

import type { Dispatch, SetStateAction } from "react";
import { AmountInput } from "@/components/AmountInput";
import { Field, Select, type SelectOption } from "@/components/FinanceUI";
import { YearPickerField } from "@/components/YearPickerField";
import {
  DEFAULT_COMPANY_COLUMN_FLAGS,
  type CompanyColumnFlags,
  type CompanyRow,
} from "@/lib/api";
import { MONTH_NAMES_FULL } from "@/lib/dateFormat";
import { INPUT_CLASSES } from "@/lib/ui";
import type { FormState } from "./payslipModalForm";
import { MONTHS } from "./payslipModalForm";

type AmountField = readonly [key: keyof FormState, label: string, flag: keyof CompanyColumnFlags];

const INCOME: readonly AmountField[] = [
  ["total", "Total", "show_total"],
  ["basic_salary", "Basic salary", "show_basic_salary"],
  ["commission", "Commission", "show_commission"],
  ["reimbursement", "Reimbursement", "show_reimbursement"],
  ["medical_reimbursement", "Medical reimbursement", "show_medical_reimbursement"],
  ["others", "Others", "show_others"],
  ["allowances", "Allowances", "show_allowances"],
  ["thirteenth_month", "13th Month", "show_thirteenth_month"],
];

const DEDUCTIONS: readonly AmountField[] = [
  ["withholding_tax", "Withholding tax", "show_withholding_tax"],
  ["sss_contribution", "SSS contribution", "show_sss_contribution"],
  ["philhealth", "Philhealth", "show_philhealth"],
  ["pag_ibig", "Pag-ibig (Employee HDMF)", "show_pag_ibig"],
  ["mp2", "MP2", "show_mp2"],
  ["bereavement_asst", "Bereavement asst", "show_bereavement_asst"],
];

const MONTH_OPTIONS: SelectOption[] = [
  { value: "", label: "—" },
  ...MONTHS.map((m) => ({ value: String(m), label: MONTH_NAMES_FULL[m - 1] })),
];

const HALF_OPTIONS: SelectOption<FormState["period_half"]>[] = [
  { value: "", label: "—" },
  { value: "1", label: "First half" },
  { value: "2", label: "Second half" },
];

export function PayslipFormFields({
  form,
  setForm,
  companies,
  disabled,
  lockPeriod,
  lockCompany,
  requirePeriodHalf,
  showPeriodYearMonth = true,
  flags = DEFAULT_COMPANY_COLUMN_FLAGS,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  companies?: CompanyRow[];
  disabled?: boolean;
  lockPeriod?: boolean;
  lockCompany?: boolean;
  requirePeriodHalf?: boolean;
  showPeriodYearMonth?: boolean;
  flags?: CompanyColumnFlags;
}) {
  // Commission is paid with the second half only, the 13th month with November's.
  const hidden = (key: keyof FormState) =>
    (key === "commission" && form.period_half === "1") ||
    (key === "thirteenth_month" && !(form.period_month === "11" && form.period_half === "2"));

  const amountFields = (fields: readonly AmountField[]) =>
    fields
      .filter(([key, , flag]) => flags[flag] && !hidden(key))
      .map(([key, label]) => (
        <Field key={key} label={label}>
          <AmountInput
            value={form[key]}
            onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
            disabled={disabled}
          />
        </Field>
      ));

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,17.5rem)] lg:items-start lg:gap-8">
      <div className="grid min-w-0 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {companies && (
          <Field label="Company">
            <Select
              required
              value={form.company}
              onChange={(company) => setForm((f) => ({ ...f, company }))}
              disabled={disabled || lockCompany}
              options={[
                // A payslip can carry a company that has since been renamed or removed.
                ...(companies.some((c) => c.name === form.company)
                  ? []
                  : [{ value: form.company, label: form.company || "—" }]),
                ...companies.map((c) => ({ value: c.name, label: c.name })),
              ]}
            />
          </Field>
        )}
        {showPeriodYearMonth && (
          <>
            <Field label="Period year">
              <YearPickerField
                value={form.period_year}
                onChange={(period_year) => setForm((f) => ({ ...f, period_year }))}
                disabled={disabled || lockPeriod}
                clearLabel="Clear"
              />
            </Field>
            <Field label="Month">
              <Select
                value={form.period_month}
                onChange={(period_month) => setForm((f) => ({ ...f, period_month }))}
                disabled={disabled || lockPeriod}
                options={MONTH_OPTIONS}
              />
            </Field>
          </>
        )}
        <Field label="Half of month">
          <Select
            value={requirePeriodHalf && form.period_half !== "2" ? "1" : form.period_half}
            onChange={(period_half) => setForm((f) => ({ ...f, period_half }))}
            disabled={disabled || lockPeriod}
            options={requirePeriodHalf ? HALF_OPTIONS.slice(1) : HALF_OPTIONS}
          />
        </Field>
        {amountFields(INCOME)}
        <Field label="Notes" className="sm:col-span-2 lg:col-span-3">
          <textarea
            className={`min-h-[4rem] ${INPUT_CLASSES}`}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            disabled={disabled}
          />
        </Field>
      </div>
      <aside className="flex min-w-0 flex-col gap-4 rounded-lg bg-surface-inset p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Deductions</p>
        <div className="flex flex-col gap-4">{amountFields(DEDUCTIONS)}</div>
      </aside>
    </div>
  );
}
