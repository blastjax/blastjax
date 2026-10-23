"use client";

import { DocumentIcon, PlusIcon } from "@/components/Icons";
import type { BillRow } from "@/lib/api";
import { MONTH_NAMES_FULL, parseDateOnlyLocal } from "@/lib/dateFormat";
import { fmtAmountOrDash, fmtCount } from "@/lib/formatNumber";

const SHORT_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

const shortDay = (iso: string) => {
  const d = parseDateOnlyLocal(iso);
  return d ? SHORT_DAY.format(d) : "—";
};

// NaN when none has an amount yet, which shows as a dash.
const total = (bills: BillRow[]) =>
  bills.some((b) => b.amount != null) ? bills.reduce((sum, b) => sum + (b.amount ?? 0), 0) : NaN;

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2 font-mono text-xs tabular-nums">
      <span className="text-ink-3">{label}</span>
      <span className={strong ? "font-semibold text-ink" : "text-ink-2"}>{value}</span>
    </div>
  );
}

// A year of one category's bills laid out by month, like a year of payslips on the payslip page.
export function BillYearBlock({
  year,
  bills,
  onAdd,
  onEdit,
  onView,
}: {
  year: number;
  bills: BillRow[]; // this year's, by bill date
  onAdd: (month: number) => void;
  onEdit: (bill: BillRow) => void;
  onView: (bill: BillRow) => void;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-baseline gap-x-3.5 gap-y-1 border-b border-line-soft pb-3.5">
        <h3 className="font-mono text-xl font-extrabold tabular-nums text-ink">{year}</h3>
        {bills.length > 0 && (
          <span className="text-[13px] text-ink-3">
            {fmtCount(bills.length)} bill{bills.length === 1 ? "" : "s"} · total {fmtAmountOrDash(total(bills))}
          </span>
        )}
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {MONTH_NAMES_FULL.map((name, i) => {
          const month = bills.filter((b) => Number(b.bill_date.slice(5, 7)) === i + 1);
          if (month.length === 0) {
            return (
              <div key={name} className="rounded-lg border border-dashed border-line p-3.5">
                <div className="mb-3 text-sm text-ink-4">{name}</div>
                <button
                  type="button"
                  aria-label={`Add a ${name} ${year} bill`}
                  onClick={() => onAdd(i + 1)}
                  className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-line px-2.5 py-1.5 text-xs font-semibold text-ink-3 transition-colors duration-150 hover:border-line-strong hover:text-ink-2"
                >
                  <PlusIcon className="size-3.5" />
                  Add
                </button>
              </div>
            );
          }
          return (
            <div key={name} className="rounded-lg border border-line bg-surface-2 p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-ink">{name}</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-ink">
                  {fmtAmountOrDash(total(month))}
                </span>
              </div>
              <div className="mt-3 flex flex-col gap-2 border-t border-line-soft pt-3">
                {month.map((b) => (
                  <div key={b.id} className="rounded-lg bg-surface-inset">
                    <button
                      type="button"
                      aria-label={`Edit the ${name} ${year} bill`}
                      onClick={() => onEdit(b)}
                      className="block w-full rounded-lg p-2.5 text-left transition-colors duration-150 hover:bg-surface-3"
                    >
                      {month.length > 1 && <Line label="Amount" value={fmtAmountOrDash(b.amount ?? NaN)} strong />}
                      <Line label="Due" value={shortDay(b.due_date)} />
                      {b.minimum_due != null && <Line label="Minimum" value={fmtAmountOrDash(b.minimum_due)} />}
                      <div className="mt-1 text-[11px] text-ink-4">
                        {shortDay(b.period_start)} – {shortDay(b.period_end)}
                      </div>
                    </button>
                    {b.has_pdf && (
                      <button
                        type="button"
                        aria-label={`View the ${name} ${year} bill`}
                        onClick={() => onView(b)}
                        className="flex w-full items-center gap-1.5 rounded-b-lg border-t border-line-soft px-2.5 py-1.5 text-xs font-medium text-brand-text transition-colors duration-150 hover:bg-surface-3"
                      >
                        <DocumentIcon className="size-3.5" />
                        View
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
