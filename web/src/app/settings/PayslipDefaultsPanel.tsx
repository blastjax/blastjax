"use client";

import { useCallback, useEffect, useState, type SetStateAction } from "react";
import { companyColumnFlags, getCompanies, type CompanyRow } from "@/lib/api";
import {
  ACTION_BUTTON_CLASSES,
  CARD_CLASSES,
  DASHED_EMPTY_CLASSES,
  INPUT_CLASSES,
  PRIMARY_BUTTON_CLASSES,
} from "@/lib/ui";
import { ErrorAlert } from "@/components/ErrorAlert";
import { LoadingBlocks, Segmented } from "@/components/FinanceUI";
import { PayslipFormFields } from "../payslip/PayslipFormFields";
import {
  getPayslipDefaultsBundleFallback,
  notifyPayslipDefaultsSaved,
  refreshPayslipDefaultsBundle,
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
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const [company, setCompany] = useState<string>("");
  const [activeHalf, setActiveHalf] = useState<PayslipPrefillHalfMode>(
    () => fb.settingsHalf,
  );
  const [formByHalf, setFormByHalf] = useState<{
    first: FormState;
    second: FormState;
  }>(() => normalizeStoredForms(fb));
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    getCompanies()
      .then((r) => {
        setCompanies(r.companies);
        setCompany((c) => c || r.companies[0]?.name || "");
      })
      .catch((e: unknown) =>
        setCompaniesError(e instanceof Error ? e.message : "Failed to load companies."),
      )
      .finally(() => setCompaniesLoaded(true));
  }, []);

  useEffect(() => {
    if (!company) return;
    let cancelled = false;
    void refreshPayslipDefaultsBundle(company).then((b) => {
      if (cancelled) return;
      setActiveHalf(b.settingsHalf);
      setFormByHalf(normalizeStoredForms(b));
    });
    return () => {
      cancelled = true;
    };
  }, [company]);

  useEffect(() => {
    if (!saveMsg) return;
    const t = window.setTimeout(() => setSaveMsg(null), 2800);
    return () => window.clearTimeout(t);
  }, [saveMsg]);

  return (
    <section className={CARD_CLASSES}>
      <h2 className="text-lg font-medium text-ink">
        Payslip defaults
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        Each company has its own pair of half templates and its own active
        half.
      </p>

      <fieldset className="mt-8 rounded-lg border border-line bg-zinc-50/80 px-4 py-4 dark:bg-zinc-900/40">
        <legend className="px-1 text-sm font-medium text-ink">Company</legend>
        {companiesError ? (
          <ErrorAlert className="mt-2">{companiesError}</ErrorAlert>
        ) : !companiesLoaded ? (
          <LoadingBlocks label="Loading companies…" rows={0} />
        ) : companies.length === 0 ? (
          <div className={DASHED_EMPTY_CLASSES}>
            Add a company under Settings → Companies first.
          </div>
        ) : (
          <select
            className={`mt-2 max-w-xs ${INPUT_CLASSES}`}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </fieldset>

      {company && (
        <>
          <fieldset className="mt-8 rounded-lg border border-line bg-surface-2 px-4 py-4">
            <legend className="px-1 text-sm font-medium text-ink">
              Edit defaults for
            </legend>
            <Segmented
              label="Which half template to edit"
              options={HALF_MODE_OPTIONS}
              value={activeHalf}
              onChange={(value) => {
                setActiveHalf(value);
                setFormByHalf((prev) => ({
                  first: { ...prev.first, period_half: "1" },
                  second: { ...prev.second, period_half: "2" },
                }));
              }}
              fill
              className="max-w-md"
            />
          </fieldset>
          <div className="mt-8 min-w-0">
            <PayslipFormFields
              form={displayedForm}
              setForm={setDisplayedForm}
              requirePeriodHalf
              showPeriodYearMonth={false}
              flags={companyColumnFlags(companies, company)}
            />
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={PRIMARY_BUTTON_CLASSES}
              disabled={busy}
              onClick={async () => {
                const normalized = normalizeStoredForms({
                  formFirst: formByHalf.first,
                  formSecond: formByHalf.second,
                });
                setBusy(true);
                setErrorMsg(null);
                try {
                  const saved = await savePayslipDefaultsBundle(company, {
                    formFirst: normalized.first,
                    formSecond: normalized.second,
                    settingsHalf: activeHalf,
                  });
                  setFormByHalf(normalizeStoredForms(saved));
                  setSaveMsg("Defaults saved. Open add modals were updated.");
                } catch (e) {
                  setErrorMsg(e instanceof Error ? e.message : "Save failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save defaults
            </button>
            <button
              type="button"
              className={ACTION_BUTTON_CLASSES}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErrorMsg(null);
                try {
                  const b = await refreshPayslipDefaultsBundle(company);
                  setActiveHalf(b.settingsHalf);
                  setFormByHalf(normalizeStoredForms(b));
                  setSaveMsg("Reloaded saved defaults.");
                  notifyPayslipDefaultsSaved();
                } catch (e) {
                  setErrorMsg(e instanceof Error ? e.message : "Reload failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reload saved
            </button>
            {saveMsg && (
              <span className="text-sm text-emerald-700 dark:text-emerald-400">
                {saveMsg}
              </span>
            )}
            {errorMsg && (
              <span className="text-sm text-red-700 dark:text-red-400">
                {errorMsg}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
