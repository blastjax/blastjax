"use client";

import type { Dispatch, FocusEvent, SetStateAction } from "react";
import { MONTH_NAMES_FULL } from "@/lib/dateFormat";
import { formatAmountOnBlur } from "@/lib/parseFormNumber";
import type { FormState } from "./payslipModalForm";
import { MONTHS } from "./payslipModalForm";

export function PayslipFormFields({
  form,
  setForm,
  disabled,
  lockPeriod,
  /** When true, half of month is always 1st or 2nd (no blank option). */
  requirePeriodHalf,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  disabled?: boolean;
  lockPeriod?: boolean;
  requirePeriodHalf?: boolean;
}) {
  const onAmountBlur =
    (key: keyof FormState) => (e: FocusEvent<HTMLInputElement>) => {
      const formatted = formatAmountOnBlur(e.target.value);
      if (formatted != null) setForm((f) => ({ ...f, [key]: formatted }));
    };

  const deductionFields = (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Withholding tax</span>
        <input
          type="text"
          inputMode="decimal"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          value={form.withholding_tax}
          onChange={(e) =>
            setForm((f) => ({ ...f, withholding_tax: e.target.value }))
          }
          onBlur={onAmountBlur("withholding_tax")}
          disabled={disabled}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">SSS contribution</span>
        <input
          type="text"
          inputMode="decimal"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          value={form.sss_contribution}
          onChange={(e) =>
            setForm((f) => ({ ...f, sss_contribution: e.target.value }))
          }
          onBlur={onAmountBlur("sss_contribution")}
          disabled={disabled}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Philhealth</span>
        <input
          type="text"
          inputMode="decimal"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          value={form.philhealth}
          onChange={(e) =>
            setForm((f) => ({ ...f, philhealth: e.target.value }))
          }
          onBlur={onAmountBlur("philhealth")}
          disabled={disabled}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">
          Pag-ibig (Employee HDMF)
        </span>
        <input
          type="text"
          inputMode="decimal"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          value={form.pag_ibig}
          onChange={(e) =>
            setForm((f) => ({ ...f, pag_ibig: e.target.value }))
          }
          onBlur={onAmountBlur("pag_ibig")}
          disabled={disabled}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">MP2</span>
        <input
          type="text"
          inputMode="decimal"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          value={form.mp2}
          onChange={(e) =>
            setForm((f) => ({ ...f, mp2: e.target.value }))
          }
          onBlur={onAmountBlur("mp2")}
          disabled={disabled}
        />
      </label>
    </>
  );

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,17.5rem)] lg:items-start lg:gap-8">
      <div className="grid min-w-0 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Period year</span>
          <input
            type="text"
            inputMode="numeric"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            value={form.period_year}
            onChange={(e) =>
              setForm((f) => ({ ...f, period_year: e.target.value }))
            }
            placeholder="e.g. 2024"
            disabled={disabled || lockPeriod}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Month</span>
          <select
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
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
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Half of month</span>
          <select
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
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
            ["total", "Total"],
            ["basic_salary", "Basic salary"],
            ["commission", "Commission"],
            ["reimbursement", "Reimbursement"],
            ["medical_reimbursement", "Medical reimbursement"],
            ["others", "Others"],
            ["allowances", "Allowances"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
            <input
              type="text"
              inputMode="decimal"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={form[key]}
              onChange={(e) =>
                setForm((f) => ({ ...f, [key]: e.target.value }))
              }
              onBlur={onAmountBlur(key)}
              disabled={disabled}
            />
          </label>
        ))}
        {form.period_month === "11" && form.period_half === "2" && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">13th Month</span>
            <input
              type="text"
              inputMode="decimal"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={form.thirteenth_month}
              onBlur={onAmountBlur("thirteenth_month")}
              onChange={(e) =>
                setForm((f) => ({ ...f, thirteenth_month: e.target.value }))
              }
              disabled={disabled}
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm sm:col-span-2 lg:col-span-3">
          <span className="text-zinc-600 dark:text-zinc-400">Notes</span>
          <textarea
            className="min-h-[4rem] rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            value={form.notes}
            onChange={(e) =>
              setForm((f) => ({ ...f, notes: e.target.value }))
            }
            disabled={disabled}
          />
        </label>
      </div>
      <aside className="flex min-w-0 flex-col gap-4 rounded-lg border border-zinc-200 bg-zinc-50/90 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/50">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Deductions
        </p>
        <div className="flex flex-col gap-4">{deductionFields}</div>
      </aside>
    </div>
  );
}
