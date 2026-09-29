import type { PayslipRow } from "@/lib/api";

export function medicalYearStartFromPeriod(
  periodYear: number,
  periodMonth: number,
): number {
  return periodMonth >= 4 ? periodYear : periodYear - 1;
}

function medicalYearStartFromDate(d: Date): number {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return m >= 4 ? y : y - 1;
}

export function medicalBucketStartYear(r: PayslipRow): number | null {
  const py = r.period_year;
  const pm = r.period_month;
  if (
    py != null &&
    Number.isFinite(py) &&
    pm != null &&
    pm >= 1 &&
    pm <= 12 &&
    r.period_half != null &&
    r.period_half >= 1 &&
    r.period_half <= 2
  ) {
    return medicalYearStartFromPeriod(Math.trunc(py), pm);
  }
  if (r.created_at) {
    const d = new Date(r.created_at);
    if (!Number.isNaN(d.getTime())) return medicalYearStartFromDate(d);
  }
  return null;
}

export function calendarMonthIndex(r: PayslipRow): number | null {
  const py = r.period_year;
  const pm = r.period_month;
  if (
    py != null &&
    Number.isFinite(py) &&
    pm != null &&
    pm >= 1 &&
    pm <= 12 &&
    r.period_half != null &&
    r.period_half >= 1 &&
    r.period_half <= 2
  ) {
    return Math.trunc(py) * 12 + pm - 1;
  }
  if (r.created_at) {
    const d = new Date(r.created_at);
    if (!Number.isNaN(d.getTime())) return d.getFullYear() * 12 + d.getMonth();
  }
  return null;
}

export function calendarYearForRow(r: PayslipRow): number | null {
  const t = calendarMonthIndex(r);
  return t == null ? null : Math.floor(t / 12);
}

export function deductionsTotalFromRow(r: PayslipRow): number {
  const num = (v: number | null | undefined) =>
    v != null && Number.isFinite(v) ? v : 0;
  return (
    num(r.withholding_tax) +
    num(r.sss_contribution) +
    num(r.philhealth) +
    num(r.pag_ibig) +
    num(r.mp2) +
    num(r.bereavement_asst)
  );
}

export function grossTotalFromRow(r: PayslipRow): number {
  const num = (v: number | null | undefined) =>
    v != null && Number.isFinite(v) ? v : 0;
  return (
    num(r.basic_salary) +
    num(r.commission) +
    num(r.allowances) +
    num(r.medical_reimbursement) +
    num(r.reimbursement) +
    num(r.others)
  );
}

export function rowsForSlot(
  rows: PayslipRow[],
  year: number,
  month: number,
  half: 1 | 2,
): PayslipRow[] {
  return rows.filter(
    (r) =>
      r.period_year === year &&
      r.period_month === month &&
      r.period_half === half,
  );
}

export function detailPayslipNeighbors(
  rows: PayslipRow[],
  currentId: number,
): { older: PayslipRow | null; newer: PayslipRow | null } {
  const ix = rows.findIndex((r) => r.id === currentId);
  const older = ix >= 0 && ix < rows.length - 1 ? (rows[ix + 1] ?? null) : null;
  const newer = ix > 0 ? (rows[ix - 1] ?? null) : null;
  return { older, newer };
}

export function grossWithDeductionsFromRow(r: PayslipRow): number | null {
  if (r.total == null || !Number.isFinite(r.total)) return null;
  return r.total + deductionsTotalFromRow(r);
}

export interface YearFieldSums {
  total: number;
  basic_salary: number;
  reimbursement: number;
  others: number;
  allowances: number;
  commission: number;
  mp2: number;
  withholding_tax: number;
  sss_contribution: number;
  philhealth: number;
  pag_ibig: number;
  bereavement_asst: number;
  medical_reimbursement: number;
  thirteenth_month: number;
}

export interface MonthSlot {
  rows1: PayslipRow[];
  rows2: PayslipRow[];
  netSum: number | null;
  grossSum: number | null;
  netSum1: number | null;
  netSum2: number | null;
  grossSum1: number | null;
  grossSum2: number | null;
}

export interface YearSlots {
  months: Map<number, MonthSlot>;
  netSum: number | null;
  grossSum: number | null;
  fieldSums: YearFieldSums;
  paySlotCount: number;
}

export interface PayslipIndex {
  years: number[];
  byYear: Map<number, YearSlots>;
  medicalByPolicyYear: Map<number, number>;
  unscheduled: PayslipRow[];
}

const EMPTY_FIELD_SUMS: YearFieldSums = Object.freeze({
  total: 0,
  basic_salary: 0,
  reimbursement: 0,
  others: 0,
  allowances: 0,
  commission: 0,
  mp2: 0,
  withholding_tax: 0,
  sss_contribution: 0,
  philhealth: 0,
  pag_ibig: 0,
  bereavement_asst: 0,
  medical_reimbursement: 0,
  thirteenth_month: 0,
}) as YearFieldSums;

const EMPTY_YEAR_SLOTS: YearSlots = Object.freeze({
  months: new Map<number, MonthSlot>(),
  netSum: null,
  grossSum: null,
  fieldSums: EMPTY_FIELD_SUMS,
  paySlotCount: 0,
}) as YearSlots;

export function yearSlotsFromIndex(
  idx: PayslipIndex,
  year: number,
): YearSlots {
  return idx.byYear.get(year) ?? EMPTY_YEAR_SLOTS;
}

function num(v: number | null | undefined): number {
  return v != null && Number.isFinite(v) ? v : 0;
}

function makeYearSlots(): YearSlots {
  return {
    months: new Map(),
    netSum: null,
    grossSum: null,
    fieldSums: {
      total: 0,
      basic_salary: 0,
      reimbursement: 0,
      others: 0,
      allowances: 0,
      commission: 0,
      mp2: 0,
      withholding_tax: 0,
      sss_contribution: 0,
      philhealth: 0,
      pag_ibig: 0,
      bereavement_asst: 0,
      medical_reimbursement: 0,
      thirteenth_month: 0,
    },
    paySlotCount: 0,
  };
}

function makeMonthSlot(): MonthSlot {
  return {
    rows1: [],
    rows2: [],
    netSum: null,
    grossSum: null,
    netSum1: null,
    netSum2: null,
    grossSum1: null,
    grossSum2: null,
  };
}

export function buildPayslipIndex(rows: PayslipRow[]): PayslipIndex {
  const byYear = new Map<number, YearSlots>();
  const medicalByPolicyYear = new Map<number, number>();
  const unscheduled: PayslipRow[] = [];
  const yearSet = new Set<number>([new Date().getFullYear()]);

  for (const r of rows) {
    const py = r.period_year;
    const pm = r.period_month;
    const ph = r.period_half;
    const isScheduledHalf =
      py != null &&
      Number.isFinite(py) &&
      pm != null &&
      ph != null &&
      ph >= 1 &&
      ph <= 2;

    if (!isScheduledHalf) unscheduled.push(r);

    const calY = calendarYearForRow(r);
    if (calY != null) {
      let ys = byYear.get(calY);
      if (!ys) {
        ys = makeYearSlots();
        byYear.set(calY, ys);
      }
      const fs = ys.fieldSums;
      fs.total += num(r.total);
      fs.basic_salary += num(r.basic_salary);
      fs.reimbursement += num(r.reimbursement);
      fs.others += num(r.others);
      fs.allowances += num(r.allowances);
      fs.commission += num(r.commission);
      fs.mp2 += num(r.mp2);
      fs.withholding_tax += num(r.withholding_tax);
      fs.sss_contribution += num(r.sss_contribution);
      fs.philhealth += num(r.philhealth);
      fs.pag_ibig += num(r.pag_ibig);
      fs.bereavement_asst += num(r.bereavement_asst);
      fs.medical_reimbursement += num(r.medical_reimbursement);
      fs.thirteenth_month += num(r.thirteenth_month);
      if (isScheduledHalf) ys.paySlotCount += 1;
    }

    if (isScheduledHalf) {
      const periodYear = Math.trunc(py as number);
      yearSet.add(periodYear);
      let ys = byYear.get(periodYear);
      if (!ys) {
        ys = makeYearSlots();
        byYear.set(periodYear, ys);
      }
      let ms = ys.months.get(pm as number);
      if (!ms) {
        ms = makeMonthSlot();
        ys.months.set(pm as number, ms);
      }
      const isFirst = ph === 1;
      if (isFirst) ms.rows1.push(r);
      else ms.rows2.push(r);

      const t = r.total;
      if (t != null && Number.isFinite(t)) {
        ms.netSum = (ms.netSum ?? 0) + t;
        ys.netSum = (ys.netSum ?? 0) + t;
        if (isFirst) ms.netSum1 = (ms.netSum1 ?? 0) + t;
        else ms.netSum2 = (ms.netSum2 ?? 0) + t;
        const g = grossWithDeductionsFromRow(r);
        if (g != null) {
          ms.grossSum = (ms.grossSum ?? 0) + g;
          ys.grossSum = (ys.grossSum ?? 0) + g;
          if (isFirst) ms.grossSum1 = (ms.grossSum1 ?? 0) + g;
          else ms.grossSum2 = (ms.grossSum2 ?? 0) + g;
        }
      }
    }

    const medY = medicalBucketStartYear(r);
    if (medY != null) {
      const v = r.medical_reimbursement;
      if (v != null && Number.isFinite(v)) {
        medicalByPolicyYear.set(
          medY,
          (medicalByPolicyYear.get(medY) ?? 0) + v,
        );
      }
    }
  }

  const years = Array.from(yearSet).sort((a, b) => b - a);
  return { years, byYear, medicalByPolicyYear, unscheduled };
}
