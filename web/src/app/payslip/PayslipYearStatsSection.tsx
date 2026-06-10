"use client";

import { useMemo, useState } from "react";
import type { PayslipRow } from "@/lib/api";
import {
  countPayslipRowsInCalendarYear,
  medicalYearStartFromPeriod,
  sumFieldForCalendarYear,
  sumMedicalReimbursementForMedicalYear,
} from "./payslipAggregates";
import { fmtNum, fmtPctOfTotal } from "./payslipDisplay";
import {
  DEFAULT_STAT_CARD_ORDER,
  DRAGGABLE_FIELD,
  MEDICAL_REIMBURSEMENT_ANNUAL_CAP,
  MEDICAL_REIMBURSEMENT_LABEL,
  MEDICAL_REIMBURSEMENT_STAT_THEME,
  PAYSLIP_DEDUCTION_CARD_SHELL,
  PAYSLIP_STAT_CARD_SHELL,
  PAYSLIP_STAT_CARD_SHELL_PINNED,
  type DraggableStatId,
  STAT_LABEL,
  STAT_THEMES,
} from "./payslipStatConstants";

export function PayslipYearStatsSection({ rows }: { rows: PayslipRow[] }) {
  const [statsYear, setStatsYear] = useState(() => new Date().getFullYear());

  const sums = useMemo(
    () => ({
      total: sumFieldForCalendarYear(rows, statsYear, "total"),
      basic_salary: sumFieldForCalendarYear(rows, statsYear, "basic_salary"),
      reimbursement: sumFieldForCalendarYear(rows, statsYear, "reimbursement"),
      others: sumFieldForCalendarYear(rows, statsYear, "others"),
      allowances: sumFieldForCalendarYear(rows, statsYear, "allowances"),
      commission: sumFieldForCalendarYear(rows, statsYear, "commission"),
      mp2: sumFieldForCalendarYear(rows, statsYear, "mp2"),
      withholding_tax: sumFieldForCalendarYear(rows, statsYear, "withholding_tax"),
      sss_contribution: sumFieldForCalendarYear(rows, statsYear, "sss_contribution"),
      philhealth: sumFieldForCalendarYear(rows, statsYear, "philhealth"),
      pag_ibig: sumFieldForCalendarYear(rows, statsYear, "pag_ibig"),
      medical_reimbursement: sumFieldForCalendarYear(
        rows,
        statsYear,
        "medical_reimbursement",
      ),
      thirteenth_month: sumFieldForCalendarYear(
        rows,
        statsYear,
        "thirteenth_month",
      ),
    }),
    [rows, statsYear],
  );

  /** Policy year aligned with selected calendar stats year (July → Apr–Mar window containing mid-year). */
  const medicalAprilStart = medicalYearStartFromPeriod(statsYear, 7);
  const medicalUsed = sumMedicalReimbursementForMedicalYear(rows, medicalAprilStart);
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
    sums.mp2;
  const totalPlusDeductions = sums.total + deductionsSumYtd;
  /** Breakdown cards: compare line items to gross (net + deductions), falling back to net if gross is unset. */
  const pctDenominator =
    totalPlusDeductions > 0 ? totalPlusDeductions : sums.total;

  const medicalVsTotalPct =
    pctDenominator > 0
      ? Math.min(100, Math.max(0, (medicalUsed / pctDenominator) * 100))
      : 0;

  const basicSalaryYearSum = sums.basic_salary;

  const renderStatCard = (id: DraggableStatId) => {
    if (id === "months_remaining") {
      const theme = STAT_THEMES.months_remaining;
      const payCount = countPayslipRowsInCalendarYear(rows, statsYear);
      const payslipSlotPct = Math.min(100, (payCount / 24) * 100);
      const halvesLeft = Math.max(0, 24 - Math.min(payCount, 24));
      const pctYearRemaining =
        halvesLeft <= 0 ? 0 : Math.min(100, (halvesLeft / 24) * 100);
      const pctRemainingLabel = (() => {
        const s = pctYearRemaining.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        return `${s}% of year remaining`;
      })();

      return (
        <div
          key={id}
          className={`${PAYSLIP_STAT_CARD_SHELL} ${theme.border} ${theme.bg}`}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3
                  className={`text-xs font-semibold leading-tight ${theme.title}`}
                >
                  {STAT_LABEL.months_remaining}
                </h3>
                <p className={`mt-0.5 text-[11px] ${theme.sub}`}>
                  {pctRemainingLabel}
                </p>
              </div>
              <div
                className={`shrink-0 text-xs font-semibold tabular-nums leading-tight ${theme.value}`}
              >
                {payCount}/24
              </div>
            </div>
          </div>
          <div className="mt-auto w-full shrink-0 pt-2">
            <div
              className={`h-1.5 w-full overflow-hidden rounded-full ${theme.barTrack}`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={24}
              aria-valuenow={payCount}
              aria-label={`Payslip rows this year ${payCount} of 24 half-month slots`}
            >
              <div
                className={`h-full rounded-full transition-[width] ${theme.barFill}`}
                style={{ width: `${payslipSlotPct}%` }}
              />
            </div>
          </div>
        </div>
      );
    }

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
          className={`${PAYSLIP_STAT_CARD_SHELL} ${theme.border} ${theme.bg}`}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className={`text-xs font-semibold leading-tight ${theme.title}`}>
                  {STAT_LABEL.basic}
                </h3>
                <p className={`mt-0.5 text-[11px] ${theme.sub}`}>
                  {fmtPctOfTotal(amount, pctDenominator)}
                </p>
              </div>
              <div
                className={`shrink-0 text-xs font-semibold tabular-nums leading-tight ${theme.value}`}
              >
                {fmtNum(amount)}
              </div>
            </div>
          </div>
          <div className="mt-auto w-full shrink-0 pt-2">
            <div
              className={`h-1.5 w-full overflow-hidden rounded-full ${theme.barTrack}`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pctOfTotal)}
              aria-label="Basic salary as percent of year gross"
            >
              <div
                className={`h-full rounded-full transition-[width] ${theme.barFill}`}
                style={{ width: `${pctOfTotal}%` }}
              />
            </div>
          </div>
        </div>
      );
    }

    const theme = STAT_THEMES[id];
    const amount = sumForId(id);
    const pctOfTotal =
      pctDenominator > 0
        ? Math.min(100, Math.max(0, (amount / pctDenominator) * 100))
        : 0;

    if (id === "total") {
      return (
        <div
          key={id}
          className={`${PAYSLIP_STAT_CARD_SHELL} ${theme.border} ${theme.bg}`}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className={`text-xs font-semibold leading-tight ${theme.title}`}>
                  {STAT_LABEL[id]}
                </h3>
              </div>
              <div
                className={`shrink-0 text-xs font-semibold tabular-nums leading-tight ${theme.value}`}
              >
                Net: {fmtNum(amount)}
              </div>
            </div>
            <div className="mt-auto w-full shrink-0 pt-2 text-right">
              <span
                className="text-xs font-medium tabular-nums leading-tight text-zinc-500 dark:text-zinc-400"
                title="Total + deductions (withholding, SSS, Philhealth, Pag-ibig, MP2)"
              >
                Gross: {fmtNum(totalPlusDeductions)}
              </span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={id}
        className={`${PAYSLIP_STAT_CARD_SHELL} ${theme.border} ${theme.bg}`}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className={`text-xs font-semibold leading-tight ${theme.title}`}>
                {STAT_LABEL[id]}
              </h3>
              <p className={`mt-0.5 text-[11px] ${theme.sub}`}>
                {fmtPctOfTotal(amount, pctDenominator)}
              </p>
            </div>
            <div
              className={`shrink-0 text-xs font-semibold tabular-nums leading-tight ${theme.value}`}
            >
              {fmtNum(amount)}
            </div>
          </div>
        </div>
        <div className="mt-auto w-full shrink-0 pt-2">
          <div
            className={`h-1.5 w-full overflow-hidden rounded-full ${theme.barTrack}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pctOfTotal)}
            aria-label={`${STAT_LABEL[id]} as percent of year gross`}
          >
            <div
              className={`h-full rounded-full transition-[width] ${theme.barFill}`}
              style={{ width: `${pctOfTotal}%` }}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="mb-8 rounded-2xl border border-zinc-200/90 bg-zinc-50/90 p-4 shadow-sm sm:p-5 dark:border-zinc-700/80 dark:bg-zinc-900/30"
    >
      <div className="mb-3 flex items-center justify-center gap-2 tabular-nums sm:mb-4 sm:gap-3">
        <button
          type="button"
          className="flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          aria-label="Previous year"
          disabled={statsYear <= 1900}
          onClick={() => setStatsYear((y) => Math.max(1900, y - 1))}
        >
          ‹
        </button>
        <span className="min-w-[4rem] text-center text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          {statsYear}
        </span>
        <button
          type="button"
          className="flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          aria-label="Next year"
          disabled={statsYear >= 2200}
          onClick={() => setStatsYear((y) => Math.min(2200, y + 1))}
        >
          ›
        </button>
      </div>

      <div className="grid min-w-0 grid-cols-2 items-stretch gap-3 sm:gap-4 md:gap-5">
        {DEFAULT_STAT_CARD_ORDER.map((id) => renderStatCard(id))}
      </div>

      <div className="mt-4 flex w-full justify-center sm:mt-5">
        <div className="w-full max-w-[calc((100%-0.75rem)/2)] sm:max-w-[calc((100%-1rem)/2)] md:max-w-[calc((100%-1.25rem)/2)]">
          <div
            className={`${PAYSLIP_STAT_CARD_SHELL_PINNED} ${MEDICAL_REIMBURSEMENT_STAT_THEME.border} ${MEDICAL_REIMBURSEMENT_STAT_THEME.bg}`}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3
                    className={`text-xs font-semibold leading-tight ${MEDICAL_REIMBURSEMENT_STAT_THEME.title}`}
                  >
                    {MEDICAL_REIMBURSEMENT_LABEL}
                  </h3>
                  <p
                    className={`mt-0.5 text-[11px] font-medium tabular-nums ${MEDICAL_REIMBURSEMENT_STAT_THEME.sub}`}
                  >
                    Apr {medicalAprilStart} – Mar {medicalAprilStart + 1}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 text-[11px] leading-tight">
                  <span className={MEDICAL_REIMBURSEMENT_STAT_THEME.sub}>
                    Used{" "}
                    <span
                      className={`font-semibold tabular-nums ${MEDICAL_REIMBURSEMENT_STAT_THEME.value}`}
                    >
                      {fmtNum(medicalUsed)}
                    </span>
                  </span>
                  <span
                    className={
                      medicalOver
                        ? "font-semibold text-red-700 dark:text-red-400"
                        : MEDICAL_REIMBURSEMENT_STAT_THEME.sub
                    }
                  >
                    Remaining{" "}
                    <span className="tabular-nums">{fmtNum(medicalRemaining)}</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-auto w-full shrink-0 space-y-1 pt-2">
              <div
                className={`h-1.5 w-full overflow-hidden rounded-full ${MEDICAL_REIMBURSEMENT_STAT_THEME.barTrack}`}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={MEDICAL_REIMBURSEMENT_ANNUAL_CAP}
                aria-valuenow={Math.round(medicalUsed)}
                aria-label="Medical reimbursement used this policy year"
              >
                <div
                  className={`h-full rounded-full transition-[width] ${
                    medicalOver ? "bg-red-500 dark:bg-red-600" : MEDICAL_REIMBURSEMENT_STAT_THEME.barFill
                  }`}
                  style={{ width: `${Math.min(100, medicalPctCap)}%` }}
                />
              </div>
              <p className={`text-[11px] ${MEDICAL_REIMBURSEMENT_STAT_THEME.sub}`}>
                {fmtPctOfTotal(medicalUsed, pctDenominator)}
              </p>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-700/80"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(medicalVsTotalPct)}
                aria-label="Medical reimbursement used as percent of year gross"
              >
                <div
                  className="h-full rounded-full bg-teal-700 transition-[width] dark:bg-teal-400"
                  style={{ width: `${medicalVsTotalPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="my-4 border-t border-zinc-200/90 dark:border-zinc-700/80"
        role="separator"
        aria-hidden
      />

      <div className="mt-1">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Deductions
        </h3>
        <div className="grid min-w-0 grid-cols-2 items-stretch gap-3 sm:gap-4 md:gap-5">
          <div className={PAYSLIP_DEDUCTION_CARD_SHELL}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-xs font-semibold leading-tight text-red-950 dark:text-red-100">
                Withholding tax
              </h3>
              <div className="shrink-0 text-xs font-semibold tabular-nums leading-tight text-red-600 dark:text-red-400">
                {fmtNum(sums.withholding_tax)}
              </div>
            </div>
          </div>
          <div className={PAYSLIP_DEDUCTION_CARD_SHELL}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-xs font-semibold leading-tight text-red-950 dark:text-red-100">
                SSS contribution
              </h3>
              <div className="shrink-0 text-xs font-semibold tabular-nums leading-tight text-red-600 dark:text-red-400">
                {fmtNum(sums.sss_contribution)}
              </div>
            </div>
          </div>
          <div className={PAYSLIP_DEDUCTION_CARD_SHELL}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-xs font-semibold leading-tight text-red-950 dark:text-red-100">
                Philhealth
              </h3>
              <div className="shrink-0 text-xs font-semibold tabular-nums leading-tight text-red-600 dark:text-red-400">
                {fmtNum(sums.philhealth)}
              </div>
            </div>
          </div>
          <div className={PAYSLIP_DEDUCTION_CARD_SHELL}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-xs font-semibold leading-tight text-red-950 dark:text-red-100">
                Pag-ibig (Employee HDMF)
              </h3>
              <div className="shrink-0 text-xs font-semibold tabular-nums leading-tight text-red-600 dark:text-red-400">
                {fmtNum(sums.pag_ibig)}
              </div>
            </div>
          </div>
          <div className={PAYSLIP_DEDUCTION_CARD_SHELL}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-xs font-semibold leading-tight text-red-950 dark:text-red-100">
                MP2
              </h3>
              <div className="shrink-0 text-xs font-semibold tabular-nums leading-tight text-red-600 dark:text-red-400">
                {fmtNum(sums.mp2)}
              </div>
            </div>
          </div>
          <div className={`col-span-2 ${PAYSLIP_DEDUCTION_CARD_SHELL}`}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-xs font-semibold leading-tight text-red-950 dark:text-red-100">
                Deductions total
              </h3>
              <div className="shrink-0 text-sm font-semibold tabular-nums leading-tight text-red-700 dark:text-red-300">
                {fmtNum(deductionsSumYtd)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
