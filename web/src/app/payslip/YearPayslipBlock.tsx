"use client";

import type { PayslipRow } from "@/lib/api";
import { MONTHS } from "./payslipModalForm";
import { fmtNum } from "./payslipDisplay";
import { rowsForSlot, sumTotal, sumTotalForMonth, sumTotalForYear } from "./payslipAggregates";

export function YearPayslipBlock({
  year,
  rows,
  saving,
  onOpenSlot,
}: {
  year: number;
  rows: PayslipRow[];
  saving: boolean;
  onOpenSlot: (y: number, m: number, h: 1 | 2) => void;
}) {
  const yearSum = sumTotalForYear(rows, year);
  return (
    <div className="flex w-full min-w-0 flex-col rounded-xl border border-zinc-200 bg-zinc-50/40 p-4 shadow-sm sm:p-5 dark:border-zinc-700 dark:bg-zinc-900/30">
      <h3 className="mb-4 flex min-w-0 items-baseline justify-between gap-3 border-b border-zinc-200 pb-3 text-base font-semibold text-zinc-800 dark:border-zinc-700 dark:text-zinc-100">
        <span className="shrink-0 whitespace-nowrap">{year}</span>
        {yearSum != null && (
          <span
            className="min-w-0 flex-1 truncate text-right text-sm font-normal tabular-nums text-zinc-600 dark:text-zinc-400"
            title={fmtNum(yearSum)}
          >
            {fmtNum(yearSum)}
          </span>
        )}
      </h3>
      {/* 3 months per row × 4 rows */}
      <div className="grid w-full min-w-0 grid-cols-3 gap-2 sm:gap-3.5">
        {MONTHS.map((month) => {
          const r1 = rowsForSlot(rows, year, month, 1);
          const r2 = rowsForSlot(rows, year, month, 2);
          const monthSum = sumTotalForMonth(rows, year, month);
          const labelShort = new Date(2000, month - 1, 1).toLocaleString(
            undefined,
            { month: "short" },
          );
          return (
            <div
              key={month}
              className="flex min-w-0 flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-600 dark:bg-zinc-950/90"
            >
              <div className="flex min-w-0 items-baseline justify-between gap-2 border-b border-zinc-100 pb-1.5 dark:border-zinc-800">
                <span className="shrink-0 whitespace-nowrap text-xs font-semibold leading-tight text-zinc-800 dark:text-zinc-200">
                  {labelShort}
                </span>
                {monthSum != null && (
                  <span
                    className="min-w-0 max-w-[58%] flex-1 text-right text-[10px] tabular-nums leading-tight text-zinc-600 break-all dark:text-zinc-400 sm:max-w-none sm:text-xs"
                    title={fmtNum(monthSum)}
                  >
                    {fmtNum(monthSum)}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {[1, 2].map((half) => {
                  const rs = half === 1 ? r1 : r2;
                  const st = sumTotal(rs);
                  const label = `${labelShort} ${year} · ${half === 1 ? "1st" : "2nd"} half`;
                  const amountStr = st != null ? fmtNum(st) : "";
                  return (
                    <button
                      key={half}
                      type="button"
                      disabled={saving}
                      aria-label={
                        st != null ? `${label}, ${amountStr}` : label
                      }
                      title={st != null ? amountStr : label}
                      onClick={() => onOpenSlot(year, month, half as 1 | 2)}
                      className={`flex min-h-[2.5rem] w-full min-w-0 items-center justify-end rounded-md border px-1 py-2 text-right text-[10px] tabular-nums leading-tight transition break-all sm:px-1.5 sm:text-sm sm:leading-none ${
                        rs.length > 0
                          ? "border-indigo-200 bg-indigo-50/90 text-indigo-950 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-100 dark:hover:bg-indigo-900/60"
                          : "border-dashed border-zinc-200 bg-zinc-50/50 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-500 dark:hover:bg-zinc-800/60"
                      }`}
                    >
                      <span className="block w-full min-w-0 px-0.5">
                        {st != null ? amountStr : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
