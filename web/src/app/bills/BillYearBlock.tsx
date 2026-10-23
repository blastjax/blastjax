"use client";

import { DocumentIcon } from "@/components/Icons";
import { AddSlotButton, EmptyMonth, MonthCard, MonthEntry, MonthLine, YearMonthGrid } from "@/components/YearMonthGrid";
import type { BillRow } from "@/lib/api";
import { formatMonthDayShort } from "@/lib/dateFormat";
import { fmtAmountOrDash, fmtCount } from "@/lib/formatNumber";

// NaN when none has an amount yet, which shows as a dash.
const total = (bills: BillRow[]) =>
  bills.some((b) => b.amount != null) ? bills.reduce((sum, b) => sum + (b.amount ?? 0), 0) : NaN;

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
    <YearMonthGrid
      year={year}
      summary={
        bills.length > 0 &&
        `${fmtCount(bills.length)} bill${bills.length === 1 ? "" : "s"} · total ${fmtAmountOrDash(total(bills))}`
      }
      renderMonth={(m, name) => {
        const month = bills.filter((b) => Number(b.bill_date.slice(5, 7)) === m);
        if (month.length === 0) {
          return (
            <EmptyMonth name={name}>
              <AddSlotButton label="Add" ariaLabel={`Add a ${name} ${year} bill`} onClick={() => onAdd(m)} />
            </EmptyMonth>
          );
        }
        return (
          <MonthCard name={name} total={fmtAmountOrDash(total(month))}>
            {month.map((b) => (
              <MonthEntry
                key={b.id}
                ariaLabel={`Edit the ${name} ${year} bill`}
                onClick={() => onEdit(b)}
                footer={
                  b.has_pdf && (
                    <button
                      type="button"
                      aria-label={`View the ${name} ${year} bill`}
                      onClick={() => onView(b)}
                      className="flex w-full items-center gap-1.5 rounded-b-lg border-t border-line-soft px-3 py-1.5 text-xs font-medium text-brand-text transition-colors duration-150 hover:bg-surface-3"
                    >
                      <DocumentIcon className="size-3.5" />
                      View
                    </button>
                  )
                }
              >
                {month.length > 1 && <MonthLine label="Amount" value={fmtAmountOrDash(b.amount ?? NaN)} strong />}
                <MonthLine label="Due" value={formatMonthDayShort(b.due_date)} />
                {b.minimum_due != null && <MonthLine label="Minimum" value={fmtAmountOrDash(b.minimum_due)} />}
                <div className="mt-1 text-[11px] text-ink-4">
                  {formatMonthDayShort(b.period_start)} – {formatMonthDayShort(b.period_end)}
                </div>
              </MonthEntry>
            ))}
          </MonthCard>
        );
      }}
    />
  );
}
