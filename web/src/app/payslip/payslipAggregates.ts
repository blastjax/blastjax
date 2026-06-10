import type { PayslipRow } from "@/lib/api";

/** Calendar year of April 1 that begins the med year containing this month. */
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

/** Which Apr-start med year this row counts toward (scheduled uses pay period; else `created_at`). */
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

export function sumMedicalReimbursementForMedicalYear(
  rows: PayslipRow[],
  aprilStartYear: number,
): number {
  let s = 0;
  for (const r of rows) {
    if (medicalBucketStartYear(r) !== aprilStartYear) continue;
    const v = r.medical_reimbursement;
    if (v != null && Number.isFinite(v)) s += v;
  }
  return s;
}

/** Calendar year containing this pay period (scheduled: period year; else created_at). */
export function calendarYearForRow(r: PayslipRow): number | null {
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
    return Math.trunc(py);
  }
  if (r.created_at) {
    const d = new Date(r.created_at);
    if (!Number.isNaN(d.getTime())) return d.getFullYear();
  }
  return null;
}

type SumFieldKey = Extract<
  keyof PayslipRow,
  | "total"
  | "basic_salary"
  | "commission"
  | "reimbursement"
  | "others"
  | "allowances"
  | "mp2"
  | "withholding_tax"
  | "sss_contribution"
  | "philhealth"
  | "pag_ibig"
  | "medical_reimbursement"
  | "thirteenth_month"
>;

export function sumFieldForCalendarYear(
  rows: PayslipRow[],
  calendarYear: number,
  field: SumFieldKey,
): number {
  let s = 0;
  for (const r of rows) {
    if (calendarYearForRow(r) !== calendarYear) continue;
    const v = r[field];
    if (v != null && Number.isFinite(v)) s += v;
  }
  return s;
}

/** Scheduled payslip rows in calendar year (each row = one half-month slot entry). */
export function countPayslipRowsInCalendarYear(
  rows: PayslipRow[],
  calendarYear: number,
): number {
  let n = 0;
  for (const r of rows) {
    if (calendarYearForRow(r) !== calendarYear) continue;
    const pm = r.period_month;
    const ph = r.period_half;
    if (pm == null || ph == null || ph < 1 || ph > 2) continue;
    n++;
  }
  return n;
}

/** Sum of withholding, SSS, Philhealth, Pag-ibig, and MP2 for one payslip row. */
export function deductionsTotalFromRow(r: PayslipRow): number {
  const num = (v: number | null | undefined) =>
    v != null && Number.isFinite(v) ? v : 0;
  return (
    num(r.withholding_tax) +
    num(r.sss_contribution) +
    num(r.philhealth) +
    num(r.pag_ibig) +
    num(r.mp2)
  );
}

/** Gross pay: income components before deductions (matches details modal breakdown). */
export function grossTotalFromRow(r: PayslipRow): number {
  const num = (v: number | null | undefined) =>
    v != null && Number.isFinite(v) ? v : 0;
  return (
    num(r.basic_salary) +
    num(r.commission) +
    num(r.allowances) +
    num(r.reimbursement) +
    num(r.others) +
    num(r.thirteenth_month) +
    num(r.medical_reimbursement)
  );
}

export function yearsToShow(rows: PayslipRow[]): number[] {
  const ys = new Set<number>();
  const cy = new Date().getFullYear();
  ys.add(cy);
  for (const r of rows) {
    if (
      r.period_year != null &&
      Number.isFinite(r.period_year) &&
      r.period_year >= 1900 &&
      r.period_year <= 2200
    ) {
      ys.add(Math.trunc(r.period_year));
    }
  }
  return Array.from(ys).sort((a, b) => b - a);
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

/** Neighbors in `rows` list order (matches ‹ › in details): older = next index, newer = previous. */
export function detailPayslipNeighbors(
  rows: PayslipRow[],
  currentId: number,
): { older: PayslipRow | null; newer: PayslipRow | null } {
  const ix = rows.findIndex((r) => r.id === currentId);
  const older = ix >= 0 && ix < rows.length - 1 ? (rows[ix + 1] ?? null) : null;
  const newer = ix > 0 ? (rows[ix - 1] ?? null) : null;
  return { older, newer };
}

export function unscheduledRows(rows: PayslipRow[]): PayslipRow[] {
  return rows.filter(
    (r) =>
      r.period_year == null ||
      r.period_month == null ||
      r.period_half == null ||
      r.period_half < 1 ||
      r.period_half > 2,
  );
}

export function sumTotal(rs: PayslipRow[]): number | null {
  let s = 0;
  let any = false;
  for (const r of rs) {
    if (r.total != null && Number.isFinite(r.total)) {
      s += r.total;
      any = true;
    }
  }
  return any ? s : null;
}

/** Sum of `total` for both halves of a month (scheduled rows only). */
export function sumTotalForMonth(
  rows: PayslipRow[],
  year: number,
  month: number,
): number | null {
  const r1 = rowsForSlot(rows, year, month, 1);
  const r2 = rowsForSlot(rows, year, month, 2);
  return sumTotal([...r1, ...r2]);
}

/** Sum of `total` for all scheduled slots in a calendar year. */
export function sumTotalForYear(
  rows: PayslipRow[],
  year: number,
): number | null {
  let s = 0;
  let any = false;
  for (const r of rows) {
    if (r.period_year !== year) continue;
    if (
      r.period_month == null ||
      r.period_half == null ||
      r.period_half < 1 ||
      r.period_half > 2
    ) {
      continue;
    }
    if (r.total != null && Number.isFinite(r.total)) {
      s += r.total;
      any = true;
    }
  }
  return any ? s : null;
}

/**
 * Per-row gross matching the year-stats Total card: net (`total`) plus the
 * statutory deductions (withholding, SSS, Philhealth, Pag-ibig, MP2). Returns
 * ``null`` when ``total`` is missing so callers can treat empty slots the same
 * way ``sumTotal`` does.
 */
export function grossWithDeductionsFromRow(r: PayslipRow): number | null {
  if (r.total == null || !Number.isFinite(r.total)) return null;
  const num = (v: number | null | undefined) =>
    v != null && Number.isFinite(v) ? v : 0;
  return (
    r.total +
    num(r.withholding_tax) +
    num(r.sss_contribution) +
    num(r.philhealth) +
    num(r.pag_ibig) +
    num(r.mp2)
  );
}

export function sumGross(rs: PayslipRow[]): number | null {
  let s = 0;
  let any = false;
  for (const r of rs) {
    const g = grossWithDeductionsFromRow(r);
    if (g == null) continue;
    s += g;
    any = true;
  }
  return any ? s : null;
}

/** Sum of gross for both halves of a month (scheduled rows only). */
export function sumGrossForMonth(
  rows: PayslipRow[],
  year: number,
  month: number,
): number | null {
  const r1 = rowsForSlot(rows, year, month, 1);
  const r2 = rowsForSlot(rows, year, month, 2);
  return sumGross([...r1, ...r2]);
}

/** Sum of gross for all scheduled slots in a calendar year. */
export function sumGrossForYear(
  rows: PayslipRow[],
  year: number,
): number | null {
  let s = 0;
  let any = false;
  for (const r of rows) {
    if (r.period_year !== year) continue;
    if (
      r.period_month == null ||
      r.period_half == null ||
      r.period_half < 1 ||
      r.period_half > 2
    ) {
      continue;
    }
    const g = grossWithDeductionsFromRow(r);
    if (g == null) continue;
    s += g;
    any = true;
  }
  return any ? s : null;
}

// ---------------------------------------------------------------------------
// Single-pass index used by the calendar UI.
//
// Building this once per `rows` change replaces ~6 `rows.filter` passes per
// month × 12 months × N years (in the previous design) with a single O(rows)
// loop. Toggling unrelated UI state (e.g. show/hide gross) no longer
// re-runs any of these aggregations, just re-reads the cached index.
// ---------------------------------------------------------------------------

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
  medical_reimbursement: number;
  thirteenth_month: number;
}

export interface MonthSlot {
  /** Scheduled rows with `period_half === 1`. */
  rows1: PayslipRow[];
  /** Scheduled rows with `period_half === 2`. */
  rows2: PayslipRow[];
  /** Sum of `total` across both halves; ``null`` when no row had a total. */
  netSum: number | null;
  /** Sum of net + statutory deductions; ``null`` when no row had a total. */
  grossSum: number | null;
  /** Sum of `total` for half 1; ``null`` when no row had a total. */
  netSum1: number | null;
  /** Sum of `total` for half 2; ``null`` when no row had a total. */
  netSum2: number | null;
  /** Sum of gross for half 1; ``null`` when no row had a total. */
  grossSum1: number | null;
  /** Sum of gross for half 2; ``null`` when no row had a total. */
  grossSum2: number | null;
}

export interface YearSlots {
  /** Months (1-12) → MonthSlot. Missing months have no scheduled rows. */
  months: Map<number, MonthSlot>;
  /** Year-wide net sum across scheduled half-slots. ``null`` when none had totals. */
  netSum: number | null;
  /** Year-wide gross sum across scheduled half-slots. ``null`` when none had totals. */
  grossSum: number | null;
  /** Year stat-card field sums (matches ``sumFieldForCalendarYear``). */
  fieldSums: YearFieldSums;
  /** Number of scheduled half-slot rows in this calendar year (0..N). */
  paySlotCount: number;
}

export interface PayslipIndex {
  /** Years the calendar should render (descending; always includes current year). */
  years: number[];
  /** Per-year aggregates keyed by calendar year. */
  byYear: Map<number, YearSlots>;
  /** Medical reimbursement totals keyed by April-start year (policy year). */
  medicalByPolicyYear: Map<number, number>;
  /** Rows that don't fit a scheduled year/month/half slot. */
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

/** Public accessor so callers don't have to manage the empty case themselves. */
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
    // Match the legacy aggregators: period_year/month/half must be non-null
    // and ``period_half`` in [1, 2]. ``period_month`` is *not* range-checked
    // here so totals that include out-of-range months stay consistent with
    // ``sumTotalForYear``/``unscheduledRows``. The calendar UI itself only
    // iterates months 1–12, so any oddballs slotted into ``ys.months`` are
    // simply never rendered.
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
