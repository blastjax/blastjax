"use client";

import { useState } from "react";
import {
  DEFAULT_COMPANY_COLUMN_FLAGS,
  type CompanyColumnFlags,
} from "@/lib/api";
import {
  medicalYearStartFromPeriod,
  yearSlotsFromIndex,
  type PayslipIndex,
} from "./payslipAggregates";
import { fmtAmount } from "@/lib/formatNumber";
import { fmtNum, fmtPctOfTotal } from "./payslipDisplay";
import {
  PayslipFieldMonthsModal,
  type PayslipFieldKey,
} from "./PayslipFieldMonthsModal";
import {
  PAYSLIP_ACCENT_BG,
  PAYSLIP_BG_3,
  PAYSLIP_BORDER_SOFT,
  PAYSLIP_DANGER_TEXT,
  PAYSLIP_ICON_BUTTON,
  PAYSLIP_MONO,
  PAYSLIP_TEXT_2,
  PAYSLIP_TEXT_DIM,
  PAYSLIP_TEXT_INK,
  PAYSLIP_TILE,
  PAYSLIP_TRACK_BG,
} from "./payslipTheme";
import {
  DEFAULT_STAT_CARD_ORDER,
  DRAGGABLE_FIELD,
  MEDICAL_REIMBURSEMENT_ANNUAL_CAP,
  MEDICAL_REIMBURSEMENT_LABEL,
  MEDICAL_REIMBURSEMENT_STAT_THEME,
  PAYSLIP_STAT_CARD_SHELL,
  type DraggableStatId,
  STAT_LABEL,
  STAT_THEMES,
} from "./payslipStatConstants";

export function PayslipYearStatsSection({
  index,
  flags = DEFAULT_COMPANY_COLUMN_FLAGS,
}: {
  index: PayslipIndex;
  /** Settings → Companies decides which of these show up per company (some
   * companies just don't have commission, and Trust Fund is off everywhere
   * until a company turns it on), so the stat cards follow suit. */
  flags?: CompanyColumnFlags;
}) {
  const [statsYear, setStatsYear] = useState(() => new Date().getFullYear());
  const [fieldModal, setFieldModal] = useState<{
    label: string;
    fieldKey: PayslipFieldKey;
    isDeduction: boolean;
  } | null>(null);
  const categoryCardOrder = DEFAULT_STAT_CARD_ORDER.filter((id) => {
    if (id === "total" || id === "months_remaining") return false;
    switch (id) {
      case "basic":
        return flags.show_basic_salary;
      case "commission":
        return flags.show_commission;
      case "reimbursement":
        return flags.show_reimbursement;
      case "others":
        return flags.show_others;
      case "allowances":
        return flags.show_allowances;
      case "thirteenth_month":
        return flags.show_thirteenth_month;
      case "trust_fund":
        return flags.show_trust_fund;
      default:
        return true;
    }
  });

  const yearSlots = yearSlotsFromIndex(index, statsYear);
  const sums = yearSlots.fieldSums;

  /** Policy year aligned with selected calendar stats year (July → Apr–Mar window containing mid-year). */
  const medicalAprilStart = medicalYearStartFromPeriod(statsYear, 7);
  const medicalUsed = index.medicalByPolicyYear.get(medicalAprilStart) ?? 0;
  const medicalRemaining = MEDICAL_REIMBURSEMENT_ANNUAL_CAP - medicalUsed;
  const medicalPctCap = Math.min(
    100,
    Math.max(0, (medicalUsed / MEDICAL_REIMBURSEMENT_ANNUAL_CAP) * 100),
  );
  const medicalOver = medicalRemaining < 0;

  const sumForId = (id: Exclude<DraggableStatId, "months_remaining" | "basic">) =>
    sums[DRAGGABLE_FIELD[id]];

  const deductionsSumYtd =
    sums.withholding_tax +
    sums.sss_contribution +
    sums.philhealth +
    sums.pag_ibig +
    sums.mp2 +
    sums.trust_fund;
  const totalPlusDeductions = sums.total + deductionsSumYtd;
  /** Breakdown cards: compare line items to gross (net + deductions), falling back to net if gross is unset. */
  const pctDenominator =
    totalPlusDeductions > 0 ? totalPlusDeductions : sums.total;

  const basicSalaryYearSum = sums.basic_salary;

  const amountForCategoryId = (id: DraggableStatId) =>
    id === "basic" ? basicSalaryYearSum : sumForId(id as Exclude<DraggableStatId, "months_remaining" | "basic">);
  const orderedCategoryCardOrder = categoryCardOrder
    .slice()
    .sort((a, b) => amountForCategoryId(b) - amountForCategoryId(a));

  const fieldKeyForCategoryId = (id: DraggableStatId): PayslipFieldKey =>
    id === "basic"
      ? "basic_salary"
      : DRAGGABLE_FIELD[id as Exclude<DraggableStatId, "months_remaining" | "basic">];

  const payCount = yearSlots.paySlotCount;
  const payslipSlotPct = Math.min(100, (payCount / 24) * 100);
  const halvesLeft = Math.max(0, 24 - Math.min(payCount, 24));
  const pctYearRemaining =
    halvesLeft <= 0 ? 0 : Math.min(100, (halvesLeft / 24) * 100);
  const pctRemainingLabel = `${fmtAmount(pctYearRemaining)}% of year remaining`;

  const renderCategoryCard = (id: DraggableStatId) => {
    if (id === "basic") {
      const theme = STAT_THEMES.basic;
      const amount = basicSalaryYearSum;
      const pctOfTotal =
        pctDenominator > 0
          ? Math.min(100, Math.max(0, (amount / pctDenominator) * 100))
          : 0;
      return (
        <div
          key={id}
          className={`${PAYSLIP_STAT_CARD_SHELL} cursor-pointer ${theme.border} ${theme.bg}`}
          onClick={() =>
            setFieldModal({ label: STAT_LABEL.basic, fieldKey: "basic_salary", isDeduction: false })
          }
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className={`text-xs font-semibold leading-tight ${theme.title}`}>
                  {STAT_LABEL.basic}
                </h3>
                <p className={`mt-1 text-[11px] ${theme.sub}`}>
                  {fmtPctOfTotal(amount, pctDenominator)}
                </p>
              </div>
              <div className={`shrink-0 ${PAYSLIP_MONO} text-base font-semibold leading-tight ${theme.value}`}>
                {fmtNum(amount)}
              </div>
            </div>
          </div>
          <div className="mt-auto w-full shrink-0 pt-2.5">
            <div
              className={`h-1.5 w-full overflow-hidden rounded-full ${theme.barTrack}`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pctOfTotal)}
              aria-label="Basic salary as percent of year gross"
            >
              <div className={`h-full rounded-full transition-[width] ${theme.barFill}`} style={{ width: `${pctOfTotal}%` }} />
            </div>
          </div>
        </div>
      );
    }

    if (id === "months_remaining") return null;
    const theme = STAT_THEMES[id];
    const amount = sumForId(id);
    const pctOfTotal =
      pctDenominator > 0
        ? Math.min(100, Math.max(0, (amount / pctDenominator) * 100))
        : 0;

    return (
      <div
        key={id}
        className={`${PAYSLIP_STAT_CARD_SHELL} cursor-pointer ${theme.border} ${theme.bg}`}
        onClick={() =>
          setFieldModal({ label: STAT_LABEL[id], fieldKey: fieldKeyForCategoryId(id), isDeduction: false })
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className={`text-xs font-semibold leading-tight ${theme.title}`}>
                {STAT_LABEL[id]}
              </h3>
              <p className={`mt-1 text-[11px] ${theme.sub}`}>
                {fmtPctOfTotal(amount, pctDenominator)}
              </p>
            </div>
            <div className={`shrink-0 ${PAYSLIP_MONO} text-base font-semibold leading-tight ${theme.value}`}>
              {fmtNum(amount)}
            </div>
          </div>
        </div>
        <div className="mt-auto w-full shrink-0 pt-2.5">
          <div
            className={`h-1.5 w-full overflow-hidden rounded-full ${theme.barTrack}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pctOfTotal)}
            aria-label={`${STAT_LABEL[id]} as percent of year gross`}
          >
            <div className={`h-full rounded-full transition-[width] ${theme.barFill}`} style={{ width: `${pctOfTotal}%` }} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`mb-6 rounded-2xl border ${PAYSLIP_BORDER_SOFT} ${PAYSLIP_BG_3}/40 p-4 sm:p-6`}>
      <div className="mb-6 flex items-center justify-center gap-3">
        <button
          type="button"
          className={PAYSLIP_ICON_BUTTON}
          aria-label="Previous year"
          disabled={statsYear <= 1900}
          onClick={() => setStatsYear((y) => Math.max(1900, y - 1))}
        >
          ‹
        </button>
        <span className={`min-w-[4.5rem] text-center ${PAYSLIP_MONO} text-lg font-extrabold ${PAYSLIP_TEXT_INK}`}>
          {statsYear}
        </span>
        <button
          type="button"
          className={PAYSLIP_ICON_BUTTON}
          aria-label="Next year"
          disabled={statsYear >= 2200}
          onClick={() => setStatsYear((y) => Math.min(2200, y + 1))}
        >
          ›
        </button>
      </div>

      {/* Hero row: net income + months remaining / medical reimbursement */}
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        {flags.show_total && (
          <div
            className={`${PAYSLIP_TILE} cursor-pointer p-6`}
            onClick={() =>
              setFieldModal({ label: "Net income", fieldKey: "total", isDeduction: false })
            }
          >
            <div className={`text-[11px] font-medium uppercase tracking-wider ${PAYSLIP_TEXT_DIM}`}>
              Net income
            </div>
            <div className={`mt-2.5 ${PAYSLIP_MONO} text-4xl font-semibold tracking-tight ${PAYSLIP_TEXT_INK}`}>
              {fmtNum(sums.total)}
            </div>
            <div className={`mt-3.5 flex flex-wrap gap-6 ${PAYSLIP_MONO} text-sm`}>
              <div>
                <span className={PAYSLIP_TEXT_DIM}>Gross </span>
                <span className={PAYSLIP_TEXT_2}>{fmtNum(totalPlusDeductions)}</span>
              </div>
              <div>
                <span className={PAYSLIP_TEXT_DIM}>Deductions </span>
                <span className={PAYSLIP_DANGER_TEXT}>−{fmtNum(deductionsSumYtd)}</span>
              </div>
            </div>
          </div>
        )}
        <div className="grid grid-rows-2 gap-4">
          <div className={`${PAYSLIP_TILE} p-4`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] font-medium uppercase tracking-wider ${PAYSLIP_TEXT_DIM}`}>
                Months remaining
              </span>
              <span className={`${PAYSLIP_MONO} text-sm font-semibold ${PAYSLIP_TEXT_INK}`}>
                {payCount}/24
              </span>
            </div>
            <div
              className={`mt-2 h-1.5 w-full overflow-hidden rounded-full ${PAYSLIP_TRACK_BG}`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={24}
              aria-valuenow={payCount}
              aria-label={`Payslip rows this year ${payCount} of 24 half-month slots`}
            >
              <div className={`h-full rounded-full ${PAYSLIP_ACCENT_BG}`} style={{ width: `${payslipSlotPct}%` }} />
            </div>
            <p className={`mt-1 text-[11px] ${PAYSLIP_TEXT_DIM}`}>{pctRemainingLabel}</p>
          </div>

          {flags.show_medical_reimbursement && (
            <div
              className={`${PAYSLIP_TILE} cursor-pointer p-4`}
              onClick={() =>
                setFieldModal({
                  label: MEDICAL_REIMBURSEMENT_LABEL,
                  fieldKey: "medical_reimbursement",
                  isDeduction: false,
                })
              }
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`text-[11px] font-medium uppercase tracking-wider ${MEDICAL_REIMBURSEMENT_STAT_THEME.title}`}>
                  {MEDICAL_REIMBURSEMENT_LABEL}
                </span>
                <span className={`text-[11px] ${PAYSLIP_TEXT_DIM}`}>
                  {medicalAprilStart}–{medicalAprilStart + 1}
                </span>
              </div>
              <div
                className={`mt-2 h-1.5 w-full overflow-hidden rounded-full ${PAYSLIP_TRACK_BG}`}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={MEDICAL_REIMBURSEMENT_ANNUAL_CAP}
                aria-valuenow={Math.round(medicalUsed)}
                aria-label="Medical reimbursement used this policy year"
              >
                <div
                  className={`h-full rounded-full ${medicalOver ? "bg-[oklch(0.68_0.19_25)]" : PAYSLIP_ACCENT_BG}`}
                  style={{ width: `${Math.min(100, medicalPctCap)}%` }}
                />
              </div>
              <div className={`mt-1.5 ${PAYSLIP_MONO} text-xs ${PAYSLIP_TEXT_DIM}`}>
                Used {fmtNum(medicalUsed)} · Remaining{" "}
                <span className={medicalOver ? PAYSLIP_DANGER_TEXT : undefined}>
                  {fmtNum(medicalRemaining)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Category breakdown, largest gross first */}
      <div className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
        {orderedCategoryCardOrder.map((id) => renderCategoryCard(id))}
      </div>

      {/* Deductions, largest first */}
      {(() => {
        const deductionRows = (
          [
            ["Withholding tax", sums.withholding_tax, flags.show_withholding_tax, "withholding_tax"],
            ["SSS contribution", sums.sss_contribution, flags.show_sss_contribution, "sss_contribution"],
            ["Philhealth", sums.philhealth, flags.show_philhealth, "philhealth"],
            ["Pag-ibig (Employee HDMF)", sums.pag_ibig, flags.show_pag_ibig, "pag_ibig"],
            ["MP2", sums.mp2, flags.show_mp2, "mp2"],
          ] as const
        )
          .filter(([, , shown]) => shown)
          .sort((a, b) => b[1] - a[1]);
        if (deductionRows.length === 0) return null;
        return (
          <div className={`${PAYSLIP_TILE} p-5`}>
            <div className={`mb-3.5 text-[11px] font-medium uppercase tracking-wider ${PAYSLIP_TEXT_DIM}`}>
              Deductions
            </div>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              {deductionRows.map(([label, value, , fieldKey]) => (
                <DeductionRow
                  key={label}
                  label={label}
                  value={value}
                  onClick={() => setFieldModal({ label, fieldKey, isDeduction: true })}
                />
              ))}
            </div>
            <div className={`mt-4 flex justify-between border-t ${PAYSLIP_BORDER_SOFT} pt-3.5`}>
              <span className={`text-sm font-semibold ${PAYSLIP_TEXT_INK}`}>Total deductions</span>
              <span className={`${PAYSLIP_MONO} text-base font-semibold ${PAYSLIP_DANGER_TEXT}`}>
                −{fmtNum(deductionsSumYtd)}
              </span>
            </div>
          </div>
        );
      })()}

      {fieldModal && (
        <PayslipFieldMonthsModal
          year={statsYear}
          label={fieldModal.label}
          fieldKey={fieldModal.fieldKey}
          isDeduction={fieldModal.isDeduction}
          months={yearSlots.months}
          onClose={() => setFieldModal(null)}
        />
      )}
    </div>
  );
}

function DeductionRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick: () => void;
}) {
  return (
    <div
      className={`flex cursor-pointer items-center justify-between gap-3 border-b ${PAYSLIP_BORDER_SOFT} pb-2`}
      onClick={onClick}
    >
      <span className={`text-[13px] ${PAYSLIP_TEXT_2}`}>{label}</span>
      <span className={`${PAYSLIP_MONO} text-sm ${PAYSLIP_DANGER_TEXT}`}>−{fmtNum(value)}</span>
    </div>
  );
}
