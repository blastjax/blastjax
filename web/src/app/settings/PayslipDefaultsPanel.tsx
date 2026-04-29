"use client";

import { useCallback, useEffect, useState, type SetStateAction } from "react";
import { PayslipFormFields } from "../payslip/PayslipFormFields";
import {
  getPayslipDefaultsBundleFallback,
  loadPayslipDefaultsBundle,
  notifyPayslipDefaultsSaved,
  savePayslipDefaultsBundle,
  type FormState,
  type PayslipPrefillHalfMode,
} from "../payslip/payslipModalForm";

const HALF_MODE_OPTIONS: { value: PayslipPrefillHalfMode; label: string }[] = [
  { value: "first", label: "First half" },
  { value: "second", label: "Second half" },
];

type HalfKey = "first" | "second";

function normalizeStoredForms(b: {
  formFirst: FormState;
  formSecond: FormState;
}): { first: FormState; second: FormState } {
  return {
    first: { ...b.formFirst, period_half: "1" },
    second: { ...b.formSecond, period_half: "2" },
  };
}

export function PayslipDefaultsPanel() {
  const fb = getPayslipDefaultsBundleFallback();
  const [activeHalf, setActiveHalf] = useState<PayslipPrefillHalfMode>(
    () => fb.settingsHalf,
  );
  const [formByHalf, setFormByHalf] = useState<{
    first: FormState;
    second: FormState;
  }>(() => normalizeStoredForms(fb));
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const displayedForm =
    activeHalf === "first" ? formByHalf.first : formByHalf.second;

  const setDisplayedForm = useCallback(
    (action: SetStateAction<FormState>) => {
      setFormByHalf((prev) => {
        const key: HalfKey = activeHalf === "first" ? "first" : "second";
        const cur = prev[key];
        const next =
          typeof action === "function"
            ? (action as (f: FormState) => FormState)(cur)
            : action;
        return { ...prev, [key]: next };
      });
    },
    [activeHalf],
  );

  useEffect(() => {
    const b = loadPayslipDefaultsBundle();
    setActiveHalf(b.settingsHalf);
    setFormByHalf(normalizeStoredForms(b));
  }, []);

  useEffect(() => {
    if (!saveMsg) return;
    const t = window.setTimeout(() => setSaveMsg(null), 2800);
    return () => window.clearTimeout(t);
  }, [saveMsg]);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
        Payslip defaults
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        You have two saved templates: one for the first half of the month and one
        for the second. The calendar add modal uses the template that matches the
        slot you opened. The + button uses today&apos;s calendar half to pick which
        template to load. Toggling below switches which template you are editing.
      </p>
      <fieldset className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50/80 px-4 py-4 dark:border-zinc-700 dark:bg-zinc-900/40">
        <legend className="px-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">
          Edit defaults for
        </legend>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Switch between first and second half to edit each template. Save stores both;
          open payslip modals pick up the matching half after save.
        </p>
        <div
          className="mt-4 inline-flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-stretch"
          role="radiogroup"
          aria-label="Which half template to edit"
        >
          {HALF_MODE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={activeHalf === value}
              className={`flex-1 rounded-lg border px-3 py-2.5 text-center text-sm font-medium transition sm:min-h-[2.75rem] ${
                activeHalf === value
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm dark:border-indigo-500 dark:bg-indigo-600"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
              }`}
              onClick={() => {
                setActiveHalf(value);
                setFormByHalf((prev) => ({
                  first: { ...prev.first, period_half: "1" },
                  second: { ...prev.second, period_half: "2" },
                }));
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="mt-8 min-w-0">
        <PayslipFormFields
          form={displayedForm}
          setForm={setDisplayedForm}
          requirePeriodHalf
        />
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          onClick={() => {
            const normalized = normalizeStoredForms({
              formFirst: formByHalf.first,
              formSecond: formByHalf.second,
            });
            savePayslipDefaultsBundle({
              formFirst: normalized.first,
              formSecond: normalized.second,
              settingsHalf: activeHalf,
            });
            setFormByHalf(normalized);
            setSaveMsg("Defaults saved. Open add modals were updated.");
          }}
        >
          Save defaults
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
          onClick={() => {
            const b = loadPayslipDefaultsBundle();
            setActiveHalf(b.settingsHalf);
            setFormByHalf(normalizeStoredForms(b));
            setSaveMsg("Reloaded saved defaults.");
            notifyPayslipDefaultsSaved();
          }}
        >
          Reload saved
        </button>
        {saveMsg && (
          <span className="text-sm text-emerald-700 dark:text-emerald-400">
            {saveMsg}
          </span>
        )}
      </div>
    </section>
  );
}
