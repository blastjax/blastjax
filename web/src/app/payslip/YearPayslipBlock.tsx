"use client";

import { memo } from "react";
import { MONTH_NAMES_FULL } from "@/lib/dateFormat";
import { MONTHS } from "./payslipModalForm";
import { fmtNum } from "./payslipDisplay";
import type { YearSlots } from "./payslipAggregates";
import {
  PAYSLIP_BORDER_DASHED,
  PAYSLIP_BORDER_SOFT,
  PAYSLIP_CARD,
  PAYSLIP_DANGER_TEXT,
  PAYSLIP_MINI_CARD,
  PAYSLIP_MONO,
  PAYSLIP_MONTH_CARD,
  PAYSLIP_TEXT_2,
  PAYSLIP_TEXT_DIM,
  PAYSLIP_TEXT_FAINT,
  PAYSLIP_TEXT_GHOST,
  PAYSLIP_TEXT_INK,
} from "./payslipTheme";

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
  const yearNet = yearSlots.netSum;
  const yearGross = yearSlots.grossSum;

  return (
    <div className={`${PAYSLIP_CARD} p-5`}>
      <div className={`mb-4 flex items-baseline justify-between gap-3 border-b ${PAYSLIP_BORDER_SOFT} pb-3.5`}>
        <div className="flex items-baseline gap-3.5">
          <span className={`${PAYSLIP_MONO} text-xl font-extrabold ${PAYSLIP_TEXT_INK}`}>{year}</span>
          {(yearNet != null || yearGross != null) && (
            <span className={`text-[13px] ${PAYSLIP_TEXT_DIM}`}>
              {yearNet != null && <>Net {fmtNum(yearNet)}</>}
              {yearGross != null && <> · Gross {fmtNum(yearGross)}</>}
            </span>
          )}
        </div>
        {yearGross != null && yearNet != null && (
          <span className={`${PAYSLIP_MONO} shrink-0 text-[13px] ${PAYSLIP_DANGER_TEXT}`}>
            −{fmtNum(yearGross - yearNet)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-4">
        {MONTHS.map((month) => {
          const ms = yearSlots.months.get(month);
          const hasData = ms != null && ms.netSum != null;
          const monthLabel = MONTH_NAMES_FULL[month - 1];

          if (!hasData) {
            return (
              <div key={month} className={`rounded-lg border ${PAYSLIP_BORDER_DASHED} p-4`}>
                <div className={`mb-3 text-sm ${PAYSLIP_TEXT_GHOST}`}>{monthLabel}</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => onOpenSlot(year, month, 1)}
                    className={`flex-1 rounded-md border ${PAYSLIP_BORDER_DASHED} px-2.5 py-1.5 text-xs font-semibold ${PAYSLIP_TEXT_DIM} transition-colors duration-150 hover:border-[oklch(1_0_0/0.16)] hover:${PAYSLIP_TEXT_2}`}
                  >
                    + 1st half
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => onOpenSlot(year, month, 2)}
                    className={`flex-1 rounded-md border ${PAYSLIP_BORDER_DASHED} px-2.5 py-1.5 text-xs font-semibold ${PAYSLIP_TEXT_DIM} transition-colors duration-150 hover:border-[oklch(1_0_0/0.16)] hover:${PAYSLIP_TEXT_2}`}
                  >
                    + 2nd half
                  </button>
                </div>
              </div>
            );
          }

          const net = ms.netSum;
          const gross = showGross ? ms.grossSum : null;

          return (
            <div key={month} className={`${PAYSLIP_MONTH_CARD} p-4`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-sm font-bold ${PAYSLIP_TEXT_INK}`}>{monthLabel}</span>
                <span className={`${PAYSLIP_MONO} text-base font-semibold ${PAYSLIP_TEXT_INK}`}>{fmtNum(net)}</span>
              </div>
              <div className={`mt-1 flex justify-end gap-3.5 ${PAYSLIP_MONO} text-xs`}>
                {gross != null && <span className={PAYSLIP_TEXT_FAINT}>Gross {fmtNum(gross)}</span>}
                {gross != null && net != null && (
                  <span className={PAYSLIP_DANGER_TEXT}>−{fmtNum(gross - net)}</span>
                )}
              </div>

              <div className={`mt-3.5 flex flex-col gap-2.5 border-t ${PAYSLIP_BORDER_SOFT} pt-3`}>
                {([1, 2] as const).map((half) => {
                  const rs = half === 1 ? ms.rows1 : ms.rows2;
                  if (rs.length === 0) return null;
                  const periodNet = half === 1 ? ms.netSum1 : ms.netSum2;
                  const periodGross = half === 1 ? ms.grossSum1 : ms.grossSum2;
                  return (
                    <div
                      key={half}
                      className={`${PAYSLIP_MINI_CARD} cursor-pointer p-3`}
                      onClick={() => onOpenSlot(year, month, half)}
                    >
                      <div className={`mb-1.5 text-[11px] ${PAYSLIP_TEXT_DIM}`}>
                        {half === 1 ? "1st half" : "2nd half"}
                      </div>
                      <div className={`flex justify-between ${PAYSLIP_MONO} text-[13px]`}>
                        <span className={PAYSLIP_TEXT_2}>Net</span>
                        <span className={`font-semibold ${PAYSLIP_TEXT_INK}`}>{fmtNum(periodNet)}</span>
                      </div>
                      {periodGross != null && (
                        <div className={`flex justify-between ${PAYSLIP_MONO} text-xs ${PAYSLIP_TEXT_FAINT}`}>
                          <span>Gross</span>
                          <span>{fmtNum(periodGross)}</span>
                        </div>
                      )}
                      {periodGross != null && periodNet != null && (
                        <div className={`flex justify-between ${PAYSLIP_MONO} text-xs ${PAYSLIP_DANGER_TEXT}`}>
                          <span>Deductions</span>
                          <span>−{fmtNum(periodGross - periodNet)}</span>
                        </div>
                      )}
                    </div>
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
