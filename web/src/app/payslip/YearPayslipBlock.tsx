"use client";

import { memo } from "react";
import { MONTH_NAMES_FULL } from "@/lib/dateFormat";
import { MONTHS } from "./payslipModalForm";
import { fmtNum } from "./payslipDisplay";
import type { YearSlots } from "./payslipAggregates";

/** Match the year-stats Total card: white-ish for net, muted zinc for gross. */
const NET_TEXT_CLASSES = "text-slate-950 dark:text-slate-50";
const GROSS_TEXT_CLASSES = "text-zinc-500 dark:text-zinc-400";

function YearPayslipBlockInner({
  year,
  yearSlots,
  saving,
  showGross,
  onOpenSlot,
}: {
  year: number;
  yearSlots: YearSlots;
  saving: boolean;
  showGross: boolean;
  onOpenSlot: (y: number, m: number, h: 1 | 2) => void;
}) {
  const yearSum = yearSlots.netSum;
  const yearGross = showGross ? yearSlots.grossSum : null;
  return (
    <div className="flex w-full min-w-0 flex-col rounded-xl border border-zinc-200 bg-zinc-50/40 p-4 shadow-sm sm:p-5 dark:border-zinc-700 dark:bg-zinc-900/30">
      <h3 className="mb-4 flex min-w-0 items-start justify-between gap-2 border-b border-zinc-200 pb-3 text-base font-semibold text-zinc-800 dark:border-zinc-700 dark:text-zinc-100">
        <span className="shrink-0 whitespace-nowrap">{year}</span>
        {(yearSum != null || yearGross != null) && (
          <span className="flex min-w-0 flex-col items-end">
            {yearSum != null && (
              <span
                className={`min-w-0 truncate text-base font-normal tabular-nums ${NET_TEXT_CLASSES}`}
                title={`Net ${fmtNum(yearSum)}`}
              >
                {fmtNum(yearSum)}
              </span>
            )}
            {yearGross != null && (
              <span
                className={`min-w-0 truncate text-base font-normal tabular-nums ${GROSS_TEXT_CLASSES}`}
                title={`Gross ${fmtNum(yearGross)}`}
              >
                {fmtNum(yearGross)}
              </span>
            )}
            {yearGross != null && yearSum != null && (
              <span
                className="min-w-0 truncate text-base font-normal tabular-nums text-red-500 dark:text-red-400"
                title={`Deductions ${fmtNum(yearGross - yearSum)}`}
              >
                -{fmtNum(yearGross - yearSum)}
              </span>
            )}
          </span>
        )}
      </h3>
      {/* 3 months per row × 4 rows */}
      <div className="grid w-full min-w-0 grid-cols-3 gap-2 sm:gap-3.5">
        {MONTHS.map((month) => {
          const ms = yearSlots.months.get(month);
          const monthSum = ms?.netSum ?? null;
          const monthGross = showGross ? (ms?.grossSum ?? null) : null;
          const monthLabel = MONTH_NAMES_FULL[month - 1];
          return (
            <div
              key={month}
              className="flex min-w-0 flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-600 dark:bg-zinc-950/90"
            >
            <div className="flex min-w-0 items-start justify-between gap-1.5 border-b border-zinc-100 pb-1.5 dark:border-zinc-800">
              <span className="shrink-0 whitespace-nowrap text-xs font-semibold leading-tight text-zinc-800 dark:text-zinc-200">
                {monthLabel}
              </span>
              {(monthSum != null || monthGross != null || showGross) && (
                <span className="flex min-w-0 flex-col items-end">
                  {monthSum != null ? (
                    <span
                      className={`min-w-0 truncate text-[10px] tabular-nums leading-tight sm:text-xs ${NET_TEXT_CLASSES}`}
                      title={`Net ${fmtNum(monthSum)}`}
                    >
                      {fmtNum(monthSum)}
                    </span>
                  ) : showGross ? (
                    <span className="invisible text-[10px] sm:text-xs" aria-hidden>0.00</span>
                  ) : null}
                  {showGross ? (
                    monthGross != null ? (
                      <span
                        className={`min-w-0 truncate text-[10px] tabular-nums leading-tight sm:text-xs ${GROSS_TEXT_CLASSES}`}
                        title={`Gross ${fmtNum(monthGross)}`}
                      >
                        {fmtNum(monthGross)}
                      </span>
                    ) : (
                      <span className="invisible text-[10px] sm:text-xs" aria-hidden>0.00</span>
                    )
                  ) : null}
                  {showGross ? (
                    monthGross != null && monthSum != null ? (
                      <span
                        className="min-w-0 truncate text-[10px] tabular-nums leading-tight text-red-500 sm:text-xs dark:text-red-400"
                        title={`Deductions ${fmtNum(monthGross - monthSum)}`}
                      >
                        -{fmtNum(monthGross - monthSum)}
                      </span>
                    ) : (
                      <span className="invisible text-[10px] sm:text-xs" aria-hidden>0.00</span>
                    )
                  ) : null}
                </span>
              )}
            </div>
              <div className="flex flex-col gap-1.5">
                {[1, 2].map((half) => {
                  const isFirst = half === 1;
                  const rs = isFirst
                    ? (ms?.rows1 ?? null)
                    : (ms?.rows2 ?? null);
                  const st = isFirst
                    ? (ms?.netSum1 ?? null)
                    : (ms?.netSum2 ?? null);
                  const stGrossRaw = isFirst
                    ? (ms?.grossSum1 ?? null)
                    : (ms?.grossSum2 ?? null);
                  const stGross = showGross ? stGrossRaw : null;
                  const hasRows = rs != null && rs.length > 0;
                  const label = `${monthLabel} ${year} · ${isFirst ? "1st" : "2nd"} half`;
                  const netStr = st != null ? fmtNum(st) : "";
                  const grossStr = stGross != null ? fmtNum(stGross) : "";
                  const ariaLabel =
                    st != null
                      ? stGross != null
                        ? `${label}, net ${netStr}, gross ${grossStr}`
                        : `${label}, ${netStr}`
                      : label;
                  const titleText =
                    st != null
                      ? stGross != null
                        ? `Net ${netStr} · Gross ${grossStr}`
                        : netStr
                      : label;
                  return (
                    <button
                      key={half}
                      type="button"
                      disabled={saving}
                      aria-label={ariaLabel}
                      title={titleText}
                      onClick={() => onOpenSlot(year, month, half as 1 | 2)}
                      className={`flex min-h-[2.5rem] w-full min-w-0 items-center justify-end rounded-md border px-1 py-2 text-right tabular-nums leading-tight transition break-all sm:px-1.5 sm:leading-none ${
                        hasRows
                          ? "border-indigo-200 bg-indigo-50/90 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60"
                          : "border-dashed border-zinc-200 bg-zinc-50/50 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-500 dark:hover:bg-zinc-800/60"
                      }`}
                    >
                      <span className="flex w-full min-w-0 flex-col items-end gap-0 px-0.5">
                        {st != null ? (
                          <span
                            className={`min-w-0 truncate text-right text-[10px] sm:text-sm ${NET_TEXT_CLASSES}`}
                          >
                            {netStr}
                          </span>
                        ) : showGross ? (
                          <span className="invisible text-[10px] sm:text-sm" aria-hidden>0.00</span>
                        ) : null}
                        {showGross ? (
                          stGross != null ? (
                            <span
                              className={`min-w-0 truncate text-right text-[10px] sm:text-sm ${GROSS_TEXT_CLASSES}`}
                            >
                              {grossStr}
                            </span>
                          ) : (
                            <span className="invisible text-[10px] sm:text-sm" aria-hidden>0.00</span>
                          )
                        ) : null}
                        {showGross ? (
                          stGross != null && st != null ? (
                            <span
                              className="min-w-0 truncate text-right text-[10px] text-red-500 sm:text-sm dark:text-red-400"
                              title={`Deductions ${fmtNum(stGrossRaw! - st)}`}
                            >
                              -{fmtNum(stGrossRaw! - st)}
                            </span>
                          ) : (
                            <span className="invisible text-[10px] sm:text-sm" aria-hidden>0.00</span>
                          )
                        ) : null}
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

/**
 * Memoized so toggling unrelated state (e.g. the modal in `PayslipClient`)
 * doesn't force every year card to re-render. ``yearSlots`` is stable across
 * renders thanks to the ``useMemo`` index in the parent.
 */
export const YearPayslipBlock = memo(YearPayslipBlockInner);
