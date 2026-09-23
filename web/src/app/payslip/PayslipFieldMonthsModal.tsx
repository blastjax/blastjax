"use client";

import { Modal } from "@/components/Modal";
import type { PayslipRow } from "@/lib/api";
import { MONTH_NAMES_FULL } from "@/lib/dateFormat";
import { fmtNum } from "./payslipDisplay";
import { MONTHS } from "./payslipModalForm";
import type { YearSlots } from "./payslipAggregates";
import {
  PAYSLIP_BG_0,
  PAYSLIP_BG_2,
  PAYSLIP_BORDER_DASHED,
  PAYSLIP_BORDER_SOFT,
  PAYSLIP_BORDER_STRONG,
  PAYSLIP_DANGER_TEXT,
  PAYSLIP_FONT_CLASS,
  PAYSLIP_MONO,
  PAYSLIP_SECONDARY_BUTTON,
  PAYSLIP_TEXT_2,
  PAYSLIP_TEXT_DIM,
  PAYSLIP_TEXT_GHOST,
  PAYSLIP_TEXT_INK,
} from "./payslipTheme";

export type PayslipFieldKey = Extract<
  keyof PayslipRow,
  | "total"
  | "basic_salary"
  | "commission"
  | "reimbursement"
  | "medical_reimbursement"
  | "others"
  | "allowances"
  | "thirteenth_month"
  | "withholding_tax"
  | "sss_contribution"
  | "philhealth"
  | "pag_ibig"
  | "mp2"
>;

function sumField(rows: PayslipRow[], key: PayslipFieldKey): number {
  return rows.reduce((acc, r) => {
    const v = r[key];
    return acc + (typeof v === "number" && Number.isFinite(v) ? v : 0);
  }, 0);
}

/** Month-by-month breakdown of one income or deduction field for a year —
 * opened from a stat card so "what months made up this number" doesn't
 * require opening every payslip individually. */
export function PayslipFieldMonthsModal({
  year,
  label,
  fieldKey,
  isDeduction,
  months,
  onClose,
}: {
  year: number;
  label: string;
  fieldKey: PayslipFieldKey;
  isDeduction: boolean;
  months: YearSlots["months"];
  onClose: () => void;
}) {
  const valueClass = isDeduction ? PAYSLIP_DANGER_TEXT : PAYSLIP_TEXT_INK;
  const sign = isDeduction ? "−" : "";
  const yearTotal = MONTHS.reduce((acc, m) => {
    const ms = months.get(m);
    if (!ms) return acc;
    return acc + sumField(ms.rows1, fieldKey) + sumField(ms.rows2, fieldKey);
  }, 0);

  return (
    <Modal
      open
      onClose={onClose}
      backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-5 backdrop-blur-sm sm:items-center sm:p-6"
      dialogClassName={`${PAYSLIP_FONT_CLASS} max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border ${PAYSLIP_BORDER_STRONG} ${PAYSLIP_BG_0} p-6 shadow-pop sm:p-8`}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <h2 className={`text-lg font-semibold ${PAYSLIP_TEXT_INK}`}>{label}</h2>
          <p className={`mt-1 text-sm ${PAYSLIP_TEXT_DIM}`}>{year} · by month</p>
        </div>
        <button type="button" className={PAYSLIP_SECONDARY_BUTTON} onClick={onClose}>
          Close
        </button>
      </div>

      <div className={`mb-5 mt-3 flex items-baseline justify-between border-b ${PAYSLIP_BORDER_SOFT} pb-3`}>
        <span className={`text-xs font-medium uppercase tracking-wider ${PAYSLIP_TEXT_DIM}`}>
          Year total
        </span>
        <span className={`${PAYSLIP_MONO} text-xl font-semibold ${valueClass}`}>
          {sign}
          {fmtNum(yearTotal)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {MONTHS.map((month) => {
          const ms = months.get(month);
          const v1 = ms ? sumField(ms.rows1, fieldKey) : 0;
          const v2 = ms ? sumField(ms.rows2, fieldKey) : 0;
          const total = v1 + v2;
          const hasData = ms != null && (ms.rows1.length > 0 || ms.rows2.length > 0);
          const monthLabel = MONTH_NAMES_FULL[month - 1];
          return (
            <div
              key={month}
              className={`rounded-lg border p-3 ${hasData ? `${PAYSLIP_BORDER_SOFT} ${PAYSLIP_BG_2}` : PAYSLIP_BORDER_DASHED}`}
            >
              <div className={`text-xs font-semibold ${hasData ? PAYSLIP_TEXT_2 : PAYSLIP_TEXT_GHOST}`}>
                {monthLabel}
              </div>
              <div className={`mt-1 ${PAYSLIP_MONO} text-sm font-semibold ${hasData ? valueClass : PAYSLIP_TEXT_GHOST}`}>
                {hasData ? `${sign}${fmtNum(total)}` : "—"}
              </div>
              {hasData && v1 > 0 && v2 > 0 && (
                <div className={`mt-1.5 flex justify-between ${PAYSLIP_MONO} text-[11px] ${PAYSLIP_TEXT_DIM}`}>
                  <span>1st {fmtNum(v1)}</span>
                  <span>2nd {fmtNum(v2)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
