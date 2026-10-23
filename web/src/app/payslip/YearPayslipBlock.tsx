"use client";

import { memo } from "react";
import { AddSlotButton, EmptyMonth, MonthCard, MonthEntry, MonthLine, YearMonthGrid } from "@/components/YearMonthGrid";
import { fmtNum } from "./payslipDisplay";
import type { YearSlots } from "./payslipAggregates";

const HALF_LABEL = { 1: "1st half", 2: "2nd half" } as const;

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
    <YearMonthGrid
      year={year}
      summary={
        (yearNet != null || yearGross != null) && (
          <>
            {yearNet != null && <>Net {fmtNum(yearNet)}</>}
            {yearGross != null && <> · Gross {fmtNum(yearGross)}</>}
          </>
        )
      }
      aside={
        yearGross != null &&
        yearNet != null && <span className="text-danger-text">−{fmtNum(yearGross - yearNet)}</span>
      }
      renderMonth={(month, name) => {
        const ms = yearSlots.months.get(month);
        const addButton = (half: 1 | 2) => (
          <AddSlotButton
            key={half}
            label={HALF_LABEL[half]}
            ariaLabel={`Add the ${name} ${year} ${HALF_LABEL[half]} payslip`}
            disabled={saving}
            onClick={() => onOpenSlot(year, month, half)}
          />
        );

        if (ms == null || ms.netSum == null) {
          return (
            <EmptyMonth name={name}>
              {addButton(1)}
              {addButton(2)}
            </EmptyMonth>
          );
        }

        const net = ms.netSum;
        const gross = showGross ? ms.grossSum : null;

        return (
          <MonthCard
            name={name}
            total={fmtNum(net)}
            sub={
              gross != null && (
                <>
                  <span className="text-ink-4">Gross {fmtNum(gross)}</span>
                  <span className="text-danger-text">−{fmtNum(gross - net)}</span>
                </>
              )
            }
          >
            {([1, 2] as const).map((half) => {
              const rows = half === 1 ? ms.rows1 : ms.rows2;
              if (rows.length === 0) return addButton(half);
              const periodNet = half === 1 ? ms.netSum1 : ms.netSum2;
              const periodGross = half === 1 ? ms.grossSum1 : ms.grossSum2;
              return (
                <MonthEntry
                  key={half}
                  ariaLabel={`Open the ${name} ${year} ${HALF_LABEL[half]} payslip`}
                  onClick={() => onOpenSlot(year, month, half)}
                >
                  <div className="mb-1.5 text-[11px] text-ink-3">{HALF_LABEL[half]}</div>
                  <MonthLine label="Net" value={fmtNum(periodNet)} strong />
                  {periodGross != null && <MonthLine label="Gross" value={fmtNum(periodGross)} tone="faint" />}
                  {periodGross != null && periodNet != null && (
                    <MonthLine label="Deductions" value={`−${fmtNum(periodGross - periodNet)}`} tone="danger" />
                  )}
                </MonthEntry>
              );
            })}
          </MonthCard>
        );
      }}
    />
  );
}

export const YearPayslipBlock = memo(YearPayslipBlockInner);
