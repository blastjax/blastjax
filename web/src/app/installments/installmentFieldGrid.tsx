"use client";

import type { Dispatch, SetStateAction } from "react";
import { formatAmountOnBlur } from "@/lib/parseFormNumber";

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
  /** Hide principal / interest / per-payment total / remaining (filled later via the schedule editor). */
  hideAmounts?: boolean;
}) {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="text-zinc-600 dark:text-zinc-400">Name</span>
        <input
          required
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          disabled={saving}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">
          Installment # (next to pay)
        </span>
        <input
          required
          type="number"
          min={1}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          value={form.installment_current}
          onChange={(e) =>
            setForm((f) => ({ ...f, installment_current: e.target.value }))
          }
          disabled={saving}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">
          Total installments (n)
        </span>
        <input
          required
          type="number"
          min={1}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
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
            <span className="text-zinc-600 dark:text-zinc-400">Principal</span>
            <input
              required
              type="text"
              inputMode="decimal"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={form.principal}
              onChange={(e) =>
                setForm((f) => ({ ...f, principal: e.target.value }))
              }
              onBlur={(e) => {
                const formatted = formatAmountOnBlur(e.target.value);
                if (formatted != null) setForm((f) => ({ ...f, principal: formatted }));
              }}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">
              Interest (optional)
            </span>
            <input
              type="text"
              inputMode="decimal"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={form.interest}
              onChange={(e) =>
                setForm((f) => ({ ...f, interest: e.target.value }))
              }
              onBlur={(e) => {
                const formatted = formatAmountOnBlur(e.target.value);
                if (formatted != null) setForm((f) => ({ ...f, interest: formatted }));
              }}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">
              Total (per payment, optional)
            </span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Auto: principal + interest"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={form.payment_total}
              onChange={(e) =>
                setForm((f) => ({ ...f, payment_total: e.target.value }))
              }
              disabled={saving}
            />
          </label>
        </>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Start (mm-yyyy)</span>
        <input
          required
          type="month"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          value={form.start_date}
          onChange={(e) =>
            setForm((f) => ({ ...f, start_date: e.target.value }))
          }
          disabled={saving}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">
          Finish (mm-yyyy, optional)
        </span>
        <input
          type="month"
          placeholder="Auto: start + total installments"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          value={form.finish_date}
          onChange={(e) =>
            setForm((f) => ({ ...f, finish_date: e.target.value }))
          }
          disabled={saving}
        />
      </label>
      {!hideAmounts && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">
            Remaining (optional)
          </span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Auto: payments left × per payment"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            value={form.remaining}
            onChange={(e) =>
              setForm((f) => ({ ...f, remaining: e.target.value }))
            }
            disabled={saving}
          />
        </label>
      )}
      {!hideAmounts && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">
            Original total (optional)
          </span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Auto: n × per payment"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            value={form.original_total}
            onChange={(e) =>
              setForm((f) => ({ ...f, original_total: e.target.value }))
            }
            disabled={saving}
          />
        </label>
      )}
    </>
  );
}
