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
