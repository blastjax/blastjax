"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState, type SetStateAction } from "react";
import { companyColumnFlags, errorMessage } from "@/lib/api";
import { queries } from "@/lib/queries";
import { ACTION_BUTTON_CLASSES, DASHED_EMPTY_CLASSES, PRIMARY_BUTTON_CLASSES } from "@/lib/ui";
import { ErrorAlert } from "@/components/ErrorAlert";
import { FormSection, LoadingBlocks, Panel, Segmented, Select } from "@/components/FinanceUI";
import { useFlashMessage } from "@/lib/useFlashMessage";
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
  const companiesQuery = useQuery(queries.companies());
  const companies = companiesQuery.data?.companies ?? [];
  const companiesLoaded = !companiesQuery.isPending;
  const companiesError = companiesQuery.error ? errorMessage(companiesQuery.error, "Failed to load companies.") : null;
  const [picked, setCompany] = useState("");
  const company = picked || companies[0]?.name || "";
  const [activeHalf, setActiveHalf] = useState<PayslipPrefillHalfMode>(
    () => fb.settingsHalf,
  );
  const [formByHalf, setFormByHalf] = useState<{
    first: FormState;
    second: FormState;
  }>(() => normalizeStoredForms(fb));
  const [saveMsg, setSaveMsg] = useFlashMessage();
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

  return (
    <Panel
      title="Payslip defaults"
      subtitle="Each company has its own pair of half templates and its own active half."
    >
      <div className="flex flex-col gap-6">
      <FormSection title="Company">
        {companiesError ? (
          <ErrorAlert>{companiesError}</ErrorAlert>
        ) : !companiesLoaded ? (
          <LoadingBlocks label="Loading companies…" rows={0} />
        ) : companies.length === 0 ? (
          <div className={DASHED_EMPTY_CLASSES}>
            Add a company under Settings → Companies first.
          </div>
        ) : (
          <Select
            aria-label="Company"
            className="max-w-xs"
            value={company}
            onChange={setCompany}
            options={companies.map((c) => ({ value: c.name, label: c.name }))}
          />
        )}
      </FormSection>

      {company && (
        <>
          <FormSection title="Edit defaults for">
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
          </FormSection>
          <div className="min-w-0">
            <PayslipFormFields
              form={displayedForm}
              setForm={setDisplayedForm}
              requirePeriodHalf
              showPeriodYearMonth={false}
              flags={companyColumnFlags(companies, company)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
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
                  setErrorMsg(errorMessage(e, "Save failed"));
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
                  setErrorMsg(errorMessage(e, "Reload failed"));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reload saved
            </button>
            {saveMsg && (
              <span role="status" className="text-sm text-success-text">
                {saveMsg}
              </span>
            )}
            {errorMsg && (
              <span role="alert" className="text-sm text-danger-text">
                {errorMsg}
              </span>
            )}
          </div>
        </>
      )}
      </div>
    </Panel>
  );
}
