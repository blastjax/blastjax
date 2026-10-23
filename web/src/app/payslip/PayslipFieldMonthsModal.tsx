"use client";

import { Modal } from "@/components/Modal";
import type { PayslipRow } from "@/lib/api";
import { MONTH_NAMES_FULL } from "@/lib/dateFormat";
import { fmtNum } from "./payslipDisplay";
import { MONTHS } from "./payslipModalForm";
import type { YearSlots } from "./payslipAggregates";
import { DIALOG_BODY_CLASSES, DIALOG_CLASSES, ModalHeader } from "@/components/FinanceUI";

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
  | "bereavement_asst"
>;

function sumField(rows: PayslipRow[], key: PayslipFieldKey): number {
  return rows.reduce((acc, r) => {
    const v = r[key];
    return acc + (typeof v === "number" && Number.isFinite(v) ? v : 0);
  }, 0);
}

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
  const valueClass = isDeduction ? "text-danger-text" : "text-ink";
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
      ariaLabelledBy="payslip-field-months-title"
      dialogClassName={`${DIALOG_CLASSES} max-w-3xl`}
    >
      <ModalHeader id="payslip-field-months-title" title={label} subtitle={`${year} · by month`} onClose={onClose} />
      <div className={DIALOG_BODY_CLASSES}>
        <div className="mb-5 flex items-baseline justify-between border-b border-line-soft pb-3">
          <span className="text-xs font-medium uppercase tracking-wider text-ink-3">
            Year total
          </span>
          <span className={`font-mono tabular-nums text-xl font-semibold ${valueClass}`}>
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
                className={`rounded-lg border p-3 ${hasData ? `border-line-soft bg-surface-2` : "border-dashed border-line"}`}
              >
                <div className={`text-xs font-semibold ${hasData ? "text-ink-2" : "text-ink-4"}`}>
                  {monthLabel}
                </div>
                <div className={`mt-1 font-mono tabular-nums text-sm font-semibold ${hasData ? valueClass : "text-ink-4"}`}>
                  {hasData ? `${sign}${fmtNum(total)}` : "—"}
                </div>
                {hasData && v1 > 0 && v2 > 0 && (
                  <div className="mt-1.5 flex justify-between font-mono tabular-nums text-[11px] text-ink-3">
                    <span>1st {fmtNum(v1)}</span>
                    <span>2nd {fmtNum(v2)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
