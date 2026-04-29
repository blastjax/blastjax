"use client";

import type { Dispatch, SetStateAction } from "react";
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
                {new Date(2000, m - 1, 1).toLocaleString(undefined, {
                  month: "long",
                })}
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
            ["thirteenth_month", "13th Month"],
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
              disabled={disabled}
            />
          </label>
        ))}
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
