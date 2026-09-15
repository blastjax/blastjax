"use client";

import type { Dispatch, SetStateAction } from "react";
import { AmountInput } from "@/components/AmountInput";
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
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="text-ink-2">Name</span>
        <input
          required
          className={INPUT_CLASSES}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          disabled={saving}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-2">
          Installment # (next to pay)
        </span>
        <input
          required
          type="number"
          min={1}
          className={INPUT_CLASSES}
          value={form.installment_current}
          onChange={(e) =>
            setForm((f) => ({ ...f, installment_current: e.target.value }))
          }
          disabled={saving}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-2">
          Total installments (n)
        </span>
        <input
          required
          type="number"
          min={1}
          className={INPUT_CLASSES}
          value={form.installment_total}
          onChange={(e) =>
            setForm((f) => ({ ...f, installment_total: e.target.value }))
          }
          disabled={saving}
        />
      </label>
      {!hideAmounts && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">Principal</span>
            <AmountInput
              required
              value={form.principal}
              onChange={(v) => setForm((f) => ({ ...f, principal: v }))}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">
              Interest (optional)
            </span>
            <AmountInput
              value={form.interest}
              onChange={(v) => setForm((f) => ({ ...f, interest: v }))}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">
              Total (per payment, optional)
            </span>
            <AmountInput
              value={form.payment_total}
              onChange={(v) => setForm((f) => ({ ...f, payment_total: v }))}
              disabled={saving}
            />
          </label>
        </>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-2">Start (mm-yyyy)</span>
        <input
          required
          type="month"
          className={INPUT_CLASSES}
          value={form.start_date}
          onChange={(e) =>
            setForm((f) => ({ ...f, start_date: e.target.value }))
          }
          disabled={saving}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-2">
          Finish (mm-yyyy, optional)
        </span>
        <input
          type="month"
          className={INPUT_CLASSES}
          value={form.finish_date}
          onChange={(e) =>
            setForm((f) => ({ ...f, finish_date: e.target.value }))
          }
          disabled={saving}
        />
      </label>
      {!hideAmounts && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-2">
            Remaining (optional)
          </span>
          <AmountInput
            value={form.remaining}
            onChange={(v) => setForm((f) => ({ ...f, remaining: v }))}
            disabled={saving}
          />
        </label>
      )}
      {!hideAmounts && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-2">
            Original total (optional)
          </span>
          <AmountInput
            value={form.original_total}
            onChange={(v) => setForm((f) => ({ ...f, original_total: v }))}
            disabled={saving}
          />
        </label>
      )}
    </>
  );
}
