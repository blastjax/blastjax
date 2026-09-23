"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  DEFAULT_COMPANY_COLUMN_FLAGS,
  type CompanyColumnFlags,
  type CompanyRow,
} from "@/lib/api";
import { MONTH_NAMES_FULL } from "@/lib/dateFormat";
import { INPUT_CLASSES } from "@/lib/ui";
import { AmountInput } from "@/components/AmountInput";
import { YearPickerField } from "@/components/YearPickerField";
import type { FormState } from "./payslipModalForm";
import { MONTHS } from "./payslipModalForm";
import {
  PAYSLIP_BG_4,
  PAYSLIP_INPUT_OVERRIDE,
  PAYSLIP_TEXT_DIM,
} from "./payslipTheme";

const INPUT_CLS = `${INPUT_CLASSES} ${PAYSLIP_INPUT_OVERRIDE}`;

export function PayslipFormFields({
  form,
  setForm,
  companies,
  disabled,
  lockPeriod,
  /** Fixes Company to whatever `form.company` already is (no picking a
   * different one) — used when adding a payslip from a company-scoped page,
   * where the company is already decided by which page you're on. */
  lockCompany,
  /** When true, half of month is always 1st or 2nd (no blank option). */
  requirePeriodHalf,
  /** Set false to hide Period year / Month — used when editing a default
   * *template* (Settings → Payslip defaults), where only the half matters:
   * the year/month get overwritten by the actual slot every time the
   * template is applied. */
  showPeriodYearMonth = true,
  /** Which fields Settings → Companies has turned on for this payslip's
   * company (some companies just don't have Commission, Pag-ibig, etc.).
   * Defaults to everything shown — same as before this toggle existed. */
  flags = DEFAULT_COMPANY_COLUMN_FLAGS,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  /** Managed companies (Settings → Companies) a payslip can be tagged under.
   * Omit to hide the Company field entirely — used when editing a default
   * *template* (Settings → Payslip defaults), which isn't tied to a company. */
  companies?: CompanyRow[];
  disabled?: boolean;
  lockPeriod?: boolean;
  lockCompany?: boolean;
  requirePeriodHalf?: boolean;
  showPeriodYearMonth?: boolean;
  flags?: CompanyColumnFlags;
}) {
  const onAmountChange = (key: keyof FormState) => (v: string) =>
    setForm((f) => ({ ...f, [key]: v }));

  const deductionFields = (
    <>
      {flags.show_withholding_tax && (
        <label className="flex flex-col gap-1 text-sm">
          <span className={PAYSLIP_TEXT_DIM}>Withholding tax</span>
          <AmountInput
            value={form.withholding_tax}
            onChange={onAmountChange("withholding_tax")}
            disabled={disabled}
            className={PAYSLIP_INPUT_OVERRIDE}
          />
        </label>
      )}
      {flags.show_sss_contribution && (
        <label className="flex flex-col gap-1 text-sm">
          <span className={PAYSLIP_TEXT_DIM}>SSS contribution</span>
          <AmountInput
            value={form.sss_contribution}
            onChange={onAmountChange("sss_contribution")}
            disabled={disabled}
            className={PAYSLIP_INPUT_OVERRIDE}
          />
        </label>
      )}
      {flags.show_philhealth && (
        <label className="flex flex-col gap-1 text-sm">
          <span className={PAYSLIP_TEXT_DIM}>Philhealth</span>
          <AmountInput
            value={form.philhealth}
            onChange={onAmountChange("philhealth")}
            disabled={disabled}
            className={PAYSLIP_INPUT_OVERRIDE}
          />
        </label>
      )}
      {flags.show_pag_ibig && (
        <label className="flex flex-col gap-1 text-sm">
          <span className={PAYSLIP_TEXT_DIM}>
            Pag-ibig (Employee HDMF)
          </span>
          <AmountInput
            value={form.pag_ibig}
            onChange={onAmountChange("pag_ibig")}
            disabled={disabled}
            className={PAYSLIP_INPUT_OVERRIDE}
          />
        </label>
      )}
      {flags.show_mp2 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className={PAYSLIP_TEXT_DIM}>MP2</span>
          <AmountInput
            value={form.mp2}
            onChange={onAmountChange("mp2")}
            disabled={disabled}
            className={PAYSLIP_INPUT_OVERRIDE}
          />
        </label>
      )}
    </>
  );

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,17.5rem)] lg:items-start lg:gap-8">
      <div className="grid min-w-0 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {companies && (
          <label className="flex flex-col gap-1 text-sm">
            <span className={PAYSLIP_TEXT_DIM}>Company</span>
            <select
              className={INPUT_CLS}
              value={form.company}
              onChange={(e) =>
                setForm((f) => ({ ...f, company: e.target.value }))
              }
              disabled={disabled || lockCompany}
              required
            >
              {!companies.some((c) => c.name === form.company) && (
                <option value={form.company}>{form.company || "—"}</option>
              )}
              {companies.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {showPeriodYearMonth && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className={PAYSLIP_TEXT_DIM}>Period year</span>
              <YearPickerField
                value={form.period_year}
                onChange={(period_year) =>
                  setForm((f) => ({ ...f, period_year }))
                }
                disabled={disabled || lockPeriod}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className={PAYSLIP_TEXT_DIM}>Month</span>
              <select
                className={INPUT_CLS}
                value={form.period_month}
                onChange={(e) =>
                  setForm((f) => ({ ...f, period_month: e.target.value }))
                }
                disabled={disabled || lockPeriod}
              >
                <option value="">—</option>
                {MONTHS.map((m) => (
                  <option key={m} value={String(m)}>
                    {MONTH_NAMES_FULL[m - 1]}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className={PAYSLIP_TEXT_DIM}>Half of month</span>
          <select
            className={INPUT_CLS}
            value={
              requirePeriodHalf
                ? form.period_half === "2"
                  ? "2"
                  : "1"
                : form.period_half
            }
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                period_half: e.target.value as "" | "1" | "2",
              }))
            }
            disabled={disabled || lockPeriod}
          >
            {!requirePeriodHalf ? <option value="">—</option> : null}
            <option value="1">First half</option>
            <option value="2">Second half</option>
          </select>
        </label>
        {(
          [
            ["total", "Total", flags.show_total],
            ["basic_salary", "Basic salary", flags.show_basic_salary],
            [
              "commission",
              "Commission",
              flags.show_commission && form.period_half !== "1",
            ],
            ["reimbursement", "Reimbursement", flags.show_reimbursement],
            [
              "medical_reimbursement",
              "Medical reimbursement",
              flags.show_medical_reimbursement,
            ],
            ["others", "Others", flags.show_others],
            ["allowances", "Allowances", flags.show_allowances],
          ] as const
        )
        .filter(([, , shown]) => shown)
        .map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1 text-sm">
            <span className={PAYSLIP_TEXT_DIM}>{label}</span>
            <AmountInput
              value={form[key]}
              onChange={onAmountChange(key)}
              disabled={disabled}
              className={PAYSLIP_INPUT_OVERRIDE}
            />
          </label>
        ))}
        {flags.show_thirteenth_month &&
          form.period_month === "11" &&
          form.period_half === "2" && (
          <label className="flex flex-col gap-1 text-sm">
            <span className={PAYSLIP_TEXT_DIM}>13th Month</span>
            <AmountInput
              value={form.thirteenth_month}
              onChange={onAmountChange("thirteenth_month")}
              disabled={disabled}
              className={PAYSLIP_INPUT_OVERRIDE}
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm sm:col-span-2 lg:col-span-3">
          <span className={PAYSLIP_TEXT_DIM}>Notes</span>
          <textarea
            className={`min-h-[4rem] ${INPUT_CLS}`}
            value={form.notes}
            onChange={(e) =>
              setForm((f) => ({ ...f, notes: e.target.value }))
            }
            disabled={disabled}
          />
        </label>
      </div>
      <aside className={`flex min-w-0 flex-col gap-4 rounded-lg ${PAYSLIP_BG_4} p-4`}>
        <p className={`text-xs font-semibold uppercase tracking-wide ${PAYSLIP_TEXT_DIM}`}>
          Deductions
        </p>
        <div className="flex flex-col gap-4">{deductionFields}</div>
      </aside>
    </div>
  );
}
