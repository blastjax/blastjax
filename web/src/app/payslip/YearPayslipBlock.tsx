"use client";

import { memo } from "react";
import { MONTH_NAMES_FULL } from "@/lib/dateFormat";
import { MONTHS } from "./payslipModalForm";
import { fmtNum } from "./payslipDisplay";
import type { YearSlots } from "./payslipAggregates";

/** Match the year-stats Total card: white-ish for net, muted zinc for gross. */
const NET_TEXT_CLASSES = "text-slate-950 dark:text-slate-50";
const GROSS_TEXT_CLASSES = "text-ink-3";

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
    <div className="@container flex w-full min-w-0 flex-col rounded-lg border border-line bg-zinc-50/40 p-4 sm:p-5 dark:bg-zinc-900/30">
      <h3 className="mb-4 flex min-w-0 items-start justify-between gap-2 border-b border-line pb-3 text-base font-semibold text-ink">
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
                className="min-w-0 truncate text-base font-normal tabular-nums text-red-600 dark:text-red-400"
                title={`Deductions ${fmtNum(yearGross - yearSum)}`}
              >
                -{fmtNum(yearGross - yearSum)}
              </span>
            )}
          </span>
        )}
      </h3>
      {/* Always 3 months per row × 4 rows. Gap widens once the card itself has room, keyed off the
          card's own width via a container query (not the viewport) so it reflows correctly
          regardless of how much space the sidebar leaves it. */}
      <div className="grid w-full min-w-0 grid-cols-3 gap-2 @lg:gap-3.5">
        {MONTHS.map((month) => {
          const ms = yearSlots.months.get(month);
          const monthSum = ms?.netSum ?? null;
          const monthGross = showGross ? (ms?.grossSum ?? null) : null;
          const monthLabel = MONTH_NAMES_FULL[month - 1];
          return (
            <div
              key={month}
              className="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface p-2.5 dark:bg-zinc-900/90"
            >
            <div className="flex min-w-0 items-start justify-between gap-1.5 border-b border-line-soft pb-1.5">
              <span className="shrink-0 whitespace-nowrap text-xs font-semibold leading-tight text-ink">
                {monthLabel}
              </span>
              {(monthSum != null || monthGross != null || showGross) && (
                <span className="flex min-w-0 flex-1 flex-col">
                  {monthSum != null ? (
                    <span
                      className={`block w-full min-w-0 truncate text-right text-[10px] tabular-nums leading-tight @lg:text-xs ${NET_TEXT_CLASSES}`}
                      title={`Net ${fmtNum(monthSum)}`}
                    >
                      {fmtNum(monthSum)}
                    </span>
                  ) : showGross ? (
                    <span className="invisible block w-full text-right text-[10px] @lg:text-xs" aria-hidden>0.00</span>
                  ) : null}
                  {showGross ? (
                    monthGross != null ? (
                      <span
                        className={`block w-full min-w-0 truncate text-right text-[10px] tabular-nums leading-tight @lg:text-xs ${GROSS_TEXT_CLASSES}`}
                        title={`Gross ${fmtNum(monthGross)}`}
                      >
                        {fmtNum(monthGross)}
                      </span>
                    ) : (
                      <span className="invisible block w-full text-right text-[10px] @lg:text-xs" aria-hidden>0.00</span>
                    )
                  ) : null}
                  {showGross ? (
                    monthGross != null && monthSum != null ? (
                      <span
                        className="block w-full min-w-0 truncate text-right text-[10px] tabular-nums leading-tight text-red-600 @lg:text-xs dark:text-red-400"
                        title={`Deductions ${fmtNum(monthGross - monthSum)}`}
                      >
                        -{fmtNum(monthGross - monthSum)}
                      </span>
                    ) : (
                      <span className="invisible block w-full text-right text-[10px] @lg:text-xs" aria-hidden>0.00</span>
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
                      className={`flex min-h-[2.5rem] w-full min-w-0 items-center justify-end rounded-md border px-1 py-2 text-right tabular-nums leading-tight transition-colors duration-150 break-all @lg:px-1.5 @lg:leading-none ${
                        hasRows
                          ? "border-indigo-200 bg-indigo-50/90 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60"
                          : "border-dashed border-line bg-zinc-50/50 text-ink-3 hover:border-line-strong hover:bg-surface-2 dark:bg-zinc-900/40"
                      }`}
                    >
                      <span className="flex w-full min-w-0 flex-col items-end gap-0 px-0.5">
                        {st != null ? (
                          <span
                            className={`min-w-0 truncate text-right text-[10px] @lg:text-sm ${NET_TEXT_CLASSES}`}
                          >
                            {netStr}
                          </span>
                        ) : showGross ? (
                          <span className="invisible text-[10px] @lg:text-sm" aria-hidden>0.00</span>
                        ) : null}
                        {showGross ? (
                          stGross != null ? (
                            <span
                              className={`min-w-0 truncate text-right text-[10px] @lg:text-sm ${GROSS_TEXT_CLASSES}`}
                            >
                              {grossStr}
                            </span>
                          ) : (
                            <span className="invisible text-[10px] @lg:text-sm" aria-hidden>0.00</span>
                          )
                        ) : null}
                        {showGross ? (
                          stGross != null && st != null ? (
                            <span
                              className="min-w-0 truncate text-right text-[10px] text-red-600 @lg:text-sm dark:text-red-400"
                              title={`Deductions ${fmtNum(stGrossRaw! - st)}`}
                            >
                              -{fmtNum(stGrossRaw! - st)}
                            </span>
                          ) : (
                            <span className="invisible text-[10px] @lg:text-sm" aria-hidden>0.00</span>
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
