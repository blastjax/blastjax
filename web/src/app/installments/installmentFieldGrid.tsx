"use client";

import type { Dispatch, SetStateAction } from "react";
import { AmountInput } from "@/components/AmountInput";
import { Field } from "@/components/FinanceUI";
import { INPUT_CLASSES } from "@/lib/ui";

export type InstallmentFormState = {
  name: string;
  installment_current: string;
  installment_total: string;
  principal: string;
  interest: string;
  payment_total: string;
  start_date: string;
  finish_date: string;
  remaining: string;
  original_total: string;
};

export function InstallmentFieldGrid({
  form,
  setForm,
  saving,
  hideAmounts = false,
}: {
  form: InstallmentFormState;
  setForm: Dispatch<SetStateAction<InstallmentFormState>>;
  saving: boolean;
  /** Hide principal / interest / per-payment total / remaining / original total (set per-row instead). */
  hideAmounts?: boolean;
}) {
  return (
    <>
      <Field label="Name" className="sm:col-span-2">
        <input
          required
          placeholder="e.g. Laptop"
          className={INPUT_CLASSES}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          disabled={saving}
        />
      </Field>
      <Field label="Number of payments">
        <input
          required
          type="number"
          min={1}
          className={INPUT_CLASSES}
          value={form.installment_total}
          onChange={(e) => setForm((f) => ({ ...f, installment_total: e.target.value }))}
          disabled={saving}
        />
      </Field>
      <Field label="Next payment #" hint="1 for a brand-new plan">
        <input
          required
          type="number"
          min={1}
          className={INPUT_CLASSES}
          value={form.installment_current}
          onChange={(e) => setForm((f) => ({ ...f, installment_current: e.target.value }))}
          disabled={saving}
        />
      </Field>
      {!hideAmounts && (
        <>
          <Field label="Principal" hint="Per payment">
            <AmountInput
              required
              value={form.principal}
              onChange={(v) => setForm((f) => ({ ...f, principal: v }))}
              disabled={saving}
            />
          </Field>
          <Field label="Interest" hint="Per payment · optional">
            <AmountInput
              value={form.interest}
              onChange={(v) => setForm((f) => ({ ...f, interest: v }))}
              disabled={saving}
            />
          </Field>
          <Field label="Payment total" hint="Optional · defaults to principal + interest" className="sm:col-span-2">
            <AmountInput
              value={form.payment_total}
              onChange={(v) => setForm((f) => ({ ...f, payment_total: v }))}
              disabled={saving}
            />
          </Field>
        </>
      )}
      <Field label="Start month" hint="Payment 1 is due the month after">
        <input
          required
          type="month"
          className={INPUT_CLASSES}
          value={form.start_date}
          onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
          disabled={saving}
        />
      </Field>
      <Field label="End month" hint="Optional · start + number of payments">
        <input
          type="month"
          className={INPUT_CLASSES}
          value={form.finish_date}
          onChange={(e) => setForm((f) => ({ ...f, finish_date: e.target.value }))}
          disabled={saving}
        />
      </Field>
      {!hideAmounts && (
        <>
          <Field label="Remaining" hint="Optional">
            <AmountInput
              value={form.remaining}
              onChange={(v) => setForm((f) => ({ ...f, remaining: v }))}
              disabled={saving}
            />
          </Field>
          <Field label="Original total" hint="Optional">
            <AmountInput
              value={form.original_total}
              onChange={(v) => setForm((f) => ({ ...f, original_total: v }))}
              disabled={saving}
            />
          </Field>
        </>
      )}
    </>
  );
}
