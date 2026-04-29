"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { FloatingAddButton } from "@/components/FloatingAddButton";
import {
  createPayslip,
  deletePayslip,
  getPayslip,
  getPayslips,
  updatePayslip,
  type PayslipRow,
} from "@/lib/api";
import { parseFormNumber } from "@/lib/parseFormNumber";
import { PayslipFormFields } from "./PayslipFormFields";
import {
  emptyForm,
  initialAddPayslipForm,
  initialManualPayslipForm,
  loadPayslipDefaultsBundle,
  payslipDefaultsFormForSlotHalf,
  PAYSLIP_DEFAULTS_SAVED_EVENT,
  tryParseFormStateJson,
  type FormState,
  MONTHS,
} from "./payslipModalForm";

/** Annual ceiling; allowance resets each April 1 (Apr → Mar policy year). */
const MEDICAL_REIMBURSEMENT_ANNUAL_CAP = 11500;

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Calendar year of April 1 that begins the med year containing this month. */
function medicalYearStartFromPeriod(periodYear: number, periodMonth: number): number {
  return periodMonth >= 4 ? periodYear : periodYear - 1;
}

function medicalYearStartFromDate(d: Date): number {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return m >= 4 ? y : y - 1;
}

/** Which Apr-start med year this row counts toward (scheduled uses pay period; else `created_at`). */
function medicalBucketStartYear(r: PayslipRow): number | null {
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

function sumMedicalReimbursementForMedicalYear(rows: PayslipRow[], aprilStartYear: number): number {
  let s = 0;
  for (const r of rows) {
    if (medicalBucketStartYear(r) !== aprilStartYear) continue;
    const v = r.medical_reimbursement;
    if (v != null && Number.isFinite(v)) s += v;
  }
  return s;
}

/** Calendar year containing this pay period (scheduled: period year; else created_at). */
function calendarYearForRow(r: PayslipRow): number | null {
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

function sumFieldForCalendarYear(
  rows: PayslipRow[],
  calendarYear: number,
  field:
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
    | "thirteenth_month",
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
function countPayslipRowsInCalendarYear(rows: PayslipRow[], calendarYear: number): number {
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
function deductionsTotalFromRow(r: PayslipRow): number {
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
function grossTotalFromRow(r: PayslipRow): number {
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

type DraggableStatId =
  | "total"
  | "basic"
  | "reimbursement"
  | "others"
  | "allowances"
  | "commission"
  | "thirteenth_month"
  | "months_remaining";

const DEFAULT_STAT_CARD_ORDER: DraggableStatId[] = [
  "total",
  "basic",
  "reimbursement",
  "others",
  "allowances",
  "commission",
  "thirteenth_month",
  "months_remaining",
];

const LS_PAYSLIP_STAT_ORDER = "budgetapp:payslip:statCardOrder";

const DRAGGABLE_FIELD: Record<
  Exclude<DraggableStatId, "months_remaining" | "basic">,
  | "total"
  | "commission"
  | "reimbursement"
  | "others"
  | "allowances"
  | "thirteenth_month"
> = {
  total: "total",
  reimbursement: "reimbursement",
  others: "others",
  allowances: "allowances",
  commission: "commission",
  thirteenth_month: "thirteenth_month",
};

const STAT_LABEL: Record<DraggableStatId, string> = {
  total: "Total",
  basic: "Basic salary",
  reimbursement: "Reimbursement",
  others: "Others",
  allowances: "Allowances",
  commission: "Commission",
  thirteenth_month: "13th Month",
  months_remaining: "Months Remaining",
};

const MEDICAL_REIMBURSEMENT_LABEL = "Medical reimbursement";

type StatTheme = {
  border: string;
  bg: string;
  title: string;
  sub: string;
  value: string;
  barTrack: string;
  barFill: string;
};

/** Theme for the pinned medical card (not part of drag order). */
const MEDICAL_REIMBURSEMENT_STAT_THEME: StatTheme = {
  border: "border-teal-200 dark:border-teal-800",
  bg: "bg-teal-50/80 dark:bg-teal-950/35",
  title: "text-teal-900 dark:text-teal-100",
  sub: "text-teal-800/90 dark:text-teal-300/90",
  value: "text-teal-950 dark:text-teal-50",
  barTrack: "bg-teal-200/70 dark:bg-teal-900/50",
  barFill: "bg-teal-600 dark:bg-teal-500",
};

const STAT_THEMES: Record<DraggableStatId, StatTheme> = {
  total: {
    border: "border-slate-200 dark:border-slate-600",
    bg: "bg-slate-50/80 dark:bg-slate-950/40",
    title: "text-slate-900 dark:text-slate-100",
    sub: "text-slate-700 dark:text-slate-300",
    value: "text-slate-950 dark:text-slate-50",
    barTrack: "bg-slate-200/80 dark:bg-slate-800/80",
    barFill: "bg-slate-600 dark:bg-slate-400",
  },
  reimbursement: {
    border: "border-blue-200 dark:border-blue-800",
    bg: "bg-blue-50/80 dark:bg-blue-950/35",
    title: "text-blue-900 dark:text-blue-100",
    sub: "text-blue-800/90 dark:text-blue-300/90",
    value: "text-blue-950 dark:text-blue-50",
    barTrack: "bg-blue-200/70 dark:bg-blue-900/50",
    barFill: "bg-blue-600 dark:bg-blue-500",
  },
  others: {
    border: "border-violet-200 dark:border-violet-800",
    bg: "bg-violet-50/80 dark:bg-violet-950/35",
    title: "text-violet-900 dark:text-violet-100",
    sub: "text-violet-800/90 dark:text-violet-300/90",
    value: "text-violet-950 dark:text-violet-50",
    barTrack: "bg-violet-200/70 dark:bg-violet-900/50",
    barFill: "bg-violet-600 dark:bg-violet-500",
  },
  /** Same neutral styling as Total (white / slate). */
  allowances: {
    border: "border-slate-200 dark:border-slate-600",
    bg: "bg-slate-50/80 dark:bg-slate-950/40",
    title: "text-slate-900 dark:text-slate-100",
    sub: "text-slate-700 dark:text-slate-300",
    value: "text-slate-950 dark:text-slate-50",
    barTrack: "bg-slate-200/80 dark:bg-slate-800/80",
    barFill: "bg-slate-600 dark:bg-slate-400",
  },
  commission: {
    border: "border-rose-200 dark:border-rose-800",
    bg: "bg-rose-50/80 dark:bg-rose-950/35",
    title: "text-rose-900 dark:text-rose-100",
    sub: "text-rose-800/90 dark:text-rose-300/90",
    value: "text-rose-950 dark:text-rose-50",
    barTrack: "bg-rose-200/70 dark:bg-rose-900/50",
    barFill: "bg-rose-600 dark:bg-rose-500",
  },
  thirteenth_month: {
    border: "border-orange-200 dark:border-orange-900",
    bg: "bg-orange-50/85 dark:bg-orange-950/35",
    title: "text-orange-950 dark:text-orange-100",
    sub: "text-orange-900/85 dark:text-orange-300/90",
    value: "text-orange-950 dark:text-orange-50",
    barTrack: "bg-orange-200/75 dark:bg-orange-900/45",
    barFill: "bg-orange-600 dark:bg-orange-500",
  },
  basic: {
    border: "border-amber-200 dark:border-amber-900",
    bg: "bg-amber-50/85 dark:bg-amber-950/35",
    title: "text-amber-950 dark:text-amber-100",
    sub: "text-amber-900/85 dark:text-amber-300/90",
    value: "text-amber-950 dark:text-amber-50",
    barTrack: "bg-amber-200/75 dark:bg-amber-900/45",
    barFill: "bg-amber-600 dark:bg-amber-500",
  },
  months_remaining: {
    border: "border-emerald-200 dark:border-emerald-800",
    bg: "bg-emerald-50/80 dark:bg-emerald-950/35",
    title: "text-emerald-900 dark:text-emerald-100",
    sub: "text-emerald-800/90 dark:text-emerald-300/90",
    value: "text-emerald-950 dark:text-emerald-50",
    barTrack: "bg-emerald-200/70 dark:bg-emerald-900/50",
    barFill: "bg-emerald-600 dark:bg-emerald-500",
  },
};

function isDraggableStatId(x: unknown): x is DraggableStatId {
  return (
    x === "total" ||
    x === "basic" ||
    x === "reimbursement" ||
    x === "others" ||
    x === "allowances" ||
    x === "commission" ||
    x === "thirteenth_month" ||
    x === "months_remaining"
  );
}

function sanitizeStatOrder(parsed: unknown): DraggableStatId[] {
  if (!Array.isArray(parsed)) return [...DEFAULT_STAT_CARD_ORDER];
  const ids = parsed
    .filter((item) => item !== "medical" && item !== "mp2")
    .filter(isDraggableStatId);
  const seen = new Set<DraggableStatId>();
  const out: DraggableStatId[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of DEFAULT_STAT_CARD_ORDER) {
    if (!seen.has(id)) out.push(id);
  }
  return out.slice(0, DEFAULT_STAT_CARD_ORDER.length);
}

function fmtPctOfTotal(
  amount: number,
  totalSum: number,
  ofLabel: "gross" | "net" = "gross",
): string {
  if (!(totalSum > 0)) return "—";
  const pct = (amount / totalSum) * 100;
  const x = Math.round(pct * 10) / 10;
  const s =
    x % 1 === 0
      ? String(Math.round(x))
      : x.toLocaleString(undefined, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
  return `${s}% of ${ofLabel}`;
}

/** Shared shell: stretch with grid row height (match tallest card in the row). */
const PAYSLIP_STAT_CARD_SHELL =
  "flex h-full min-h-0 min-w-0 cursor-grab flex-col rounded-lg border px-3 py-2.5 shadow-sm transition-opacity active:cursor-grabbing";

/** Pinned stat card (e.g. medical): same layout, no drag cursor. */
const PAYSLIP_STAT_CARD_SHELL_PINNED =
  "flex h-full min-h-0 min-w-0 cursor-default flex-col rounded-lg border px-3 py-2.5 shadow-sm";

/** Deduction year totals: same grid density as stats, no progress bars. */
const PAYSLIP_DEDUCTION_CARD_SHELL =
  "flex h-full min-h-0 min-w-0 flex-col rounded-lg border border-red-200/80 bg-red-50/50 px-3 py-2.5 shadow-sm dark:border-red-900/45 dark:bg-red-950/25";

function PayslipYearStatsSection({ rows }: { rows: PayslipRow[] }) {
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

  const [statCardOrder, setStatCardOrder] = useState<DraggableStatId[]>(
    DEFAULT_STAT_CARD_ORDER,
  );
  const [dragOrderIdx, setDragOrderIdx] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_PAYSLIP_STAT_ORDER);
      if (raw) setStatCardOrder(sanitizeStatOrder(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_PAYSLIP_STAT_ORDER, JSON.stringify(statCardOrder));
    } catch {
      /* ignore */
    }
  }, [statCardOrder]);

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

  const onDragStart = (id: DraggableStatId, orderIdx: number) => (e: DragEvent) => {
    setDragOrderIdx(orderIdx);
    e.dataTransfer.effectAllowed = "move";
    // `text/plain` is the most reliable type across browsers for drop.getData().
    e.dataTransfer.setData("text/plain", id);
  };

  const onDragEnd = () => setDragOrderIdx(null);

  const onDragOverCard = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
  };

  const onDropOn = (targetOrderIdx: number) => (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedIdRaw = e.dataTransfer.getData("text/plain").trim();
    if (!draggedIdRaw || !isDraggableStatId(draggedIdRaw)) return;
    const draggedId = draggedIdRaw as DraggableStatId;
    setStatCardOrder((prev) => {
      const from = prev.indexOf(draggedId);
      if (from < 0 || from === targetOrderIdx) return prev;
      const next = [...prev];
      const t = next[from];
      next[from] = next[targetOrderIdx];
      next[targetOrderIdx] = t;
      return next;
    });
    setDragOrderIdx(null);
  };

  const renderDraggable = (id: DraggableStatId, orderIdx: number) => {
    if (id === "months_remaining") {
      const theme = STAT_THEMES.months_remaining;
      const payCount = countPayslipRowsInCalendarYear(rows, statsYear);
      const payslipSlotPct = Math.min(100, (payCount / 24) * 100);
      const halvesLeft = Math.max(0, 24 - Math.min(payCount, 24));
      const pctYearRemaining =
        halvesLeft <= 0 ? 0 : Math.min(100, (halvesLeft / 24) * 100);
      const pctRemainingLabel = (() => {
        const x = Math.round(pctYearRemaining * 10) / 10;
        const s =
          x % 1 === 0
            ? String(Math.round(x))
            : x.toLocaleString(undefined, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              });
        return `${s}% of year remaining`;
      })();
      const monthsApprox =
        halvesLeft <= 0 ? 0 : Math.round((halvesLeft / 2) * 10) / 10;
      const dragging = dragOrderIdx === orderIdx;
      const displayMain =
        monthsApprox === 0
          ? "0"
          : monthsApprox.toLocaleString(undefined, {
              maximumFractionDigits: 1,
              minimumFractionDigits: monthsApprox % 1 === 0 ? 0 : 1,
            });

      return (
        <div
          key={id}
          draggable
          onDragStart={onDragStart(id, orderIdx)}
          onDragEnd={onDragEnd}
          onDragOver={onDragOverCard}
          onDrop={onDropOn(orderIdx)}
          className={`${PAYSLIP_STAT_CARD_SHELL} ${theme.border} ${theme.bg} ${
            dragging ? "opacity-60" : ""
          }`}
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
                  {payCount}/24 payslips · {pctRemainingLabel}
                </p>
              </div>
              <div
                className={`shrink-0 text-xs font-semibold tabular-nums leading-tight ${theme.value}`}
              >
                {displayMain}%
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
      const dragging = dragOrderIdx === orderIdx;
      const pctOfTotal =
        pctDenominator > 0
          ? Math.min(100, Math.max(0, (amount / pctDenominator) * 100))
          : 0;
      return (
        <div
          key={id}
          draggable
          onDragStart={onDragStart(id, orderIdx)}
          onDragEnd={onDragEnd}
          onDragOver={onDragOverCard}
          onDrop={onDropOn(orderIdx)}
          className={`${PAYSLIP_STAT_CARD_SHELL} ${theme.border} ${theme.bg} ${
            dragging ? "opacity-60" : ""
          }`}
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
    const dragging = dragOrderIdx === orderIdx;
    const pctOfTotal =
      pctDenominator > 0
        ? Math.min(100, Math.max(0, (amount / pctDenominator) * 100))
        : 0;

    if (id === "total") {
      return (
        <div
          key={id}
          draggable
          onDragStart={onDragStart(id, orderIdx)}
          onDragEnd={onDragEnd}
          onDragOver={onDragOverCard}
          onDrop={onDropOn(orderIdx)}
          className={`${PAYSLIP_STAT_CARD_SHELL} ${theme.border} ${theme.bg} ${
            dragging ? "opacity-60" : ""
          }`}
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
        draggable
        onDragStart={onDragStart(id, orderIdx)}
        onDragEnd={onDragEnd}
        onDragOver={onDragOverCard}
        onDrop={onDropOn(orderIdx)}
        className={`${PAYSLIP_STAT_CARD_SHELL} ${theme.border} ${theme.bg} ${
          dragging ? "opacity-60" : ""
        }`}
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
        {statCardOrder.map((id, idx) => renderDraggable(id, idx))}
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

function parseOptFloat(s: string): number | null {
  return parseFormNumber(s);
}

function parseOptYear(s: string): number | null {
  const n = parseFormNumber(s);
  if (n == null) return null;
  const y = Math.trunc(n);
  if (y < 1900 || y > 2200) return null;
  return y;
}

function fmtPayPeriod(
  y: number | null | undefined,
  m: number | null | undefined,
  h: number | null | undefined,
): string {
  if (
    (y == null || !Number.isFinite(y)) &&
    (m == null || !Number.isFinite(m)) &&
    (h == null || !Number.isFinite(h))
  ) {
    return "—";
  }
  const parts: string[] = [];
  if (m != null && m >= 1 && m <= 12) {
    parts.push(
      new Date(2000, m - 1, 1).toLocaleString(undefined, { month: "short" }),
    );
  }
  if (y != null && Number.isFinite(y)) parts.push(String(Math.trunc(y)));
  let s = parts.join(" ");
  if (h === 1) s = s ? `${s} · 1st half` : "1st half";
  else if (h === 2) s = s ? `${s} · 2nd half` : "2nd half";
  return s || "—";
}

const PAYSLIP_DRAFT_EDIT_PREFIX = "budgetapp:payslip:draft:edit:";
const PAYSLIP_DRAFT_ADD_PREFIX = "budgetapp:payslip:draft:add:";
const PAYSLIP_DRAFT_MANUAL = "budgetapp:payslip:draft:manual";

function payslipDraftKeyEdit(id: number): string {
  return `${PAYSLIP_DRAFT_EDIT_PREFIX}${id}`;
}

function payslipDraftKeyAdd(
  year: number,
  month: number,
  half: number,
): string {
  return `${PAYSLIP_DRAFT_ADD_PREFIX}${year}:${month}:${half}`;
}

function stashPayslipModalDraft(
  nav:
    | { screen: "edit"; row: PayslipRow }
    | { screen: "add"; year: number; month: number; half: 1 | 2 }
    | { screen: "manual" },
  form: FormState,
): void {
  try {
    if (nav.screen === "edit") {
      sessionStorage.setItem(
        payslipDraftKeyEdit(nav.row.id),
        JSON.stringify(form),
      );
    } else if (nav.screen === "add") {
      sessionStorage.setItem(
        payslipDraftKeyAdd(nav.year, nav.month, nav.half),
        JSON.stringify(form),
      );
    } else if (nav.screen === "manual") {
      sessionStorage.setItem(PAYSLIP_DRAFT_MANUAL, JSON.stringify(form));
    }
  } catch {
    /* quota / private mode */
  }
}

function clearPayslipModalDraft(
  nav:
    | { screen: "edit"; row: PayslipRow }
    | { screen: "add"; year: number; month: number; half: 1 | 2 }
    | { screen: "manual" },
): void {
  try {
    if (nav.screen === "edit") {
      sessionStorage.removeItem(payslipDraftKeyEdit(nav.row.id));
    } else if (nav.screen === "add") {
      sessionStorage.removeItem(
        payslipDraftKeyAdd(nav.year, nav.month, nav.half),
      );
    } else if (nav.screen === "manual") {
      sessionStorage.removeItem(PAYSLIP_DRAFT_MANUAL);
    }
  } catch {
    /* ignore */
  }
}

function formFromRow(r: PayslipRow): FormState {
  return {
    period_year:
      r.period_year != null && Number.isFinite(r.period_year)
        ? String(Math.trunc(r.period_year))
        : "",
    period_month:
      r.period_month != null && r.period_month >= 1 && r.period_month <= 12
        ? String(r.period_month)
        : "",
    period_half:
      r.period_half === 1 ? "1" : r.period_half === 2 ? "2" : "",
    total: r.total != null ? String(r.total) : "",
    basic_salary:
      r.basic_salary != null ? String(r.basic_salary) : "",
    commission: r.commission != null ? String(r.commission) : "",
    reimbursement: r.reimbursement != null ? String(r.reimbursement) : "",
    medical_reimbursement:
      r.medical_reimbursement != null ? String(r.medical_reimbursement) : "",
    others: r.others != null ? String(r.others) : "",
    mp2: r.mp2 != null ? String(r.mp2) : "",
    allowances: r.allowances != null ? String(r.allowances) : "",
    thirteenth_month:
      r.thirteenth_month != null ? String(r.thirteenth_month) : "",
    notes: r.notes ?? "",
    withholding_tax:
      r.withholding_tax != null ? String(r.withholding_tax) : "",
    sss_contribution:
      r.sss_contribution != null ? String(r.sss_contribution) : "",
    philhealth: r.philhealth != null ? String(r.philhealth) : "",
    pag_ibig:
      r.pag_ibig != null ? String(r.pag_ibig) : "",
  };
}

function formToCreateBody(f: FormState) {
  return {
    period_year: parseOptYear(f.period_year),
    period_month:
      f.period_month.trim() === ""
        ? null
        : (() => {
            const n = parseFormNumber(f.period_month);
            return n != null ? Math.trunc(n) : null;
          })(),
    period_half:
      f.period_half === ""
        ? null
        : (() => {
            const n = parseFormNumber(f.period_half);
            return n === 1 || n === 2 ? (n as 1 | 2) : null;
          })(),
    total: parseOptFloat(f.total),
    basic_salary: parseOptFloat(f.basic_salary),
    commission: parseOptFloat(f.commission),
    reimbursement: parseOptFloat(f.reimbursement),
    medical_reimbursement: parseOptFloat(f.medical_reimbursement),
    others: parseOptFloat(f.others),
    mp2: parseOptFloat(f.mp2),
    allowances: parseOptFloat(f.allowances),
    thirteenth_month: parseOptFloat(f.thirteenth_month),
    notes: f.notes.trim() || null,
    withholding_tax: parseOptFloat(f.withholding_tax),
    sss_contribution: parseOptFloat(f.sss_contribution),
    philhealth: parseOptFloat(f.philhealth),
    pag_ibig: parseOptFloat(f.pag_ibig),
  };
}

function yearsToShow(rows: PayslipRow[]): number[] {
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

function rowsForSlot(
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
function detailPayslipNeighbors(
  rows: PayslipRow[],
  currentId: number,
): { older: PayslipRow | null; newer: PayslipRow | null } {
  const ix = rows.findIndex((r) => r.id === currentId);
  const older =
    ix >= 0 && ix < rows.length - 1 ? (rows[ix + 1] ?? null) : null;
  const newer = ix > 0 ? (rows[ix - 1] ?? null) : null;
  return { older, newer };
}

function unscheduledRows(rows: PayslipRow[]): PayslipRow[] {
  return rows.filter(
    (r) =>
      r.period_year == null ||
      r.period_month == null ||
      r.period_half == null ||
      r.period_half < 1 ||
      r.period_half > 2,
  );
}

function sumTotal(rs: PayslipRow[]): number | null {
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
function sumTotalForMonth(
  rows: PayslipRow[],
  year: number,
  month: number,
): number | null {
  const r1 = rowsForSlot(rows, year, month, 1);
  const r2 = rowsForSlot(rows, year, month, 2);
  return sumTotal([...r1, ...r2]);
}

/** Sum of `total` for all scheduled slots in a calendar year. */
function sumTotalForYear(rows: PayslipRow[], year: number): number | null {
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

type Nav =
  | { screen: "manual" }
  | { screen: "slot"; year: number; month: number; half: 1 | 2 }
  | { screen: "detail"; row: PayslipRow }
  | { screen: "edit"; row: PayslipRow }
  | { screen: "add"; year: number; month: number; half: 1 | 2 };

function YearPayslipBlock({
  year,
  rows,
  saving,
  onOpenSlot,
}: {
  year: number;
  rows: PayslipRow[];
  saving: boolean;
  onOpenSlot: (y: number, m: number, h: 1 | 2) => void;
}) {
  const yearSum = sumTotalForYear(rows, year);
  return (
    <div className="flex w-full min-w-0 flex-col rounded-xl border border-zinc-200 bg-zinc-50/40 p-4 shadow-sm sm:p-5 dark:border-zinc-700 dark:bg-zinc-900/30">
      <h3 className="mb-4 flex min-w-0 items-baseline justify-between gap-3 border-b border-zinc-200 pb-3 text-base font-semibold text-zinc-800 dark:border-zinc-700 dark:text-zinc-100">
        <span className="shrink-0 whitespace-nowrap">{year}</span>
        {yearSum != null && (
          <span
            className="min-w-0 flex-1 truncate text-right text-sm font-normal tabular-nums text-zinc-600 dark:text-zinc-400"
            title={fmtNum(yearSum)}
          >
            {fmtNum(yearSum)}
          </span>
        )}
      </h3>
      {/* 3 months per row × 4 rows */}
      <div className="grid w-full min-w-0 grid-cols-3 gap-2 sm:gap-3.5">
        {MONTHS.map((month) => {
          const r1 = rowsForSlot(rows, year, month, 1);
          const r2 = rowsForSlot(rows, year, month, 2);
          const monthSum = sumTotalForMonth(rows, year, month);
          const labelShort = new Date(2000, month - 1, 1).toLocaleString(
            undefined,
            { month: "short" },
          );
          return (
            <div
              key={month}
              className="flex min-w-0 flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-600 dark:bg-zinc-950/90"
            >
              <div className="flex min-w-0 items-baseline justify-between gap-2 border-b border-zinc-100 pb-1.5 dark:border-zinc-800">
                <span className="shrink-0 whitespace-nowrap text-xs font-semibold leading-tight text-zinc-800 dark:text-zinc-200">
                  {labelShort}
                </span>
                {monthSum != null && (
                  <span
                    className="min-w-0 max-w-[58%] flex-1 text-right text-[10px] tabular-nums leading-tight text-zinc-600 break-all dark:text-zinc-400 sm:max-w-none sm:text-xs"
                    title={fmtNum(monthSum)}
                  >
                    {fmtNum(monthSum)}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {[1, 2].map((half) => {
                  const rs = half === 1 ? r1 : r2;
                  const st = sumTotal(rs);
                  const label = `${labelShort} ${year} · ${half === 1 ? "1st" : "2nd"} half`;
                  const amountStr = st != null ? fmtNum(st) : "";
                  return (
                    <button
                      key={half}
                      type="button"
                      disabled={saving}
                      aria-label={
                        st != null ? `${label}, ${amountStr}` : label
                      }
                      title={st != null ? amountStr : label}
                      onClick={() => onOpenSlot(year, month, half as 1 | 2)}
                      className={`flex min-h-[2.5rem] w-full min-w-0 items-center justify-end rounded-md border px-1 py-2 text-right text-[10px] tabular-nums leading-tight transition break-all sm:px-1.5 sm:text-sm sm:leading-none ${
                        rs.length > 0
                          ? "border-indigo-200 bg-indigo-50/90 text-indigo-950 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-100 dark:hover:bg-indigo-900/60"
                          : "border-dashed border-zinc-200 bg-zinc-50/50 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-500 dark:hover:bg-zinc-800/60"
                      }`}
                    >
                      <span className="block w-full min-w-0 px-0.5">
                        {st != null ? amountStr : ""}
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

export default function PayslipClient() {
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PayslipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nav, setNav] = useState<Nav | null>(null);
  const [modalForm, setModalForm] = useState<FormState>(emptyForm());
  const modalFormRef = useRef(modalForm);
  modalFormRef.current = modalForm;
  const navRef = useRef(nav);
  navRef.current = nav;

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await getPayslips(2000);
      setRows(r.payslips);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payslips");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!nav) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (
        nav.screen === "edit" ||
        nav.screen === "add" ||
        nav.screen === "manual"
      ) {
        stashPayslipModalDraft(nav, modalFormRef.current);
      }
      setNav(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  const saveManualAdd = async () => {
    if (nav?.screen !== "manual") return;
    setSaving(true);
    setError(null);
    try {
      await createPayslip(formToCreateBody(modalForm));
      clearPayslipModalDraft(nav);
      setNav(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const openSlot = (year: number, month: number, half: 1 | 2) => {
    const items = rowsForSlot(rows, year, month, half);
    if (items.length === 0) {
      setNav({ screen: "add", year, month, half });
    } else {
      setNav({ screen: "detail", row: items[0] });
    }
  };

  const goBack = () => {
    setNav((n) => {
      if (!n) return null;
      if (n.screen === "edit") {
        stashPayslipModalDraft(n, modalFormRef.current);
        const fresh = rows.find((r) => r.id === n.row.id);
        return { screen: "detail", row: fresh ?? n.row };
      }
      if (n.screen === "add") {
        stashPayslipModalDraft(n, modalFormRef.current);
        const slotRows = rowsForSlot(rows, n.year, n.month, n.half);
        if (slotRows.length === 0) {
          return null;
        }
        return { screen: "slot", year: n.year, month: n.month, half: n.half };
      }
      if (n.screen === "detail") {
        const y = n.row.period_year;
        const m = n.row.period_month;
        const h = n.row.period_half;
        if (
          y != null &&
          m != null &&
          (h === 1 || h === 2)
        ) {
          return { screen: "slot", year: y, month: m, half: h };
        }
        return null;
      }
      return null;
    });
  };

  const slotTitle = (year: number, month: number, half: 1 | 2) =>
    `${new Date(2000, month - 1, 1).toLocaleString(undefined, {
      month: "long",
    })} ${year} · ${half === 1 ? "1st" : "2nd"} half`;

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this payslip row?")) return;
    setSaving(true);
    setError(null);
    try {
      await deletePayslip(id);
      setNav((n) => {
        if (n?.screen === "detail" && n.row.id === id) return null;
        if (n?.screen === "edit" && n.row.id === id) return null;
        return n;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (nav?.screen !== "edit") return;
    const id = nav.row.id;
    setSaving(true);
    setError(null);
    try {
      await updatePayslip(id, formToCreateBody(modalForm));
      clearPayslipModalDraft(nav);
      const updated = await getPayslip(id);
      await load();
      setNav({ screen: "detail", row: updated });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const saveAddInModal = async () => {
    if (nav?.screen !== "add") return;
    setSaving(true);
    setError(null);
    try {
      await createPayslip(formToCreateBody(modalForm));
      clearPayslipModalDraft(nav);
      await load();
      setNav({
        screen: "slot",
        year: nav.year,
        month: nav.month,
        half: nav.half,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // Sync modal form when entering edit/add/manual (restore session draft if present)
  useEffect(() => {
    if (!nav) return;
    if (nav.screen === "edit") {
      const raw = sessionStorage.getItem(payslipDraftKeyEdit(nav.row.id));
      if (raw) {
        const d = tryParseFormStateJson(raw);
        if (d) {
          setModalForm(d);
          return;
        }
      }
      setModalForm(formFromRow(nav.row));
    } else if (nav.screen === "add") {
      const raw = sessionStorage.getItem(
        payslipDraftKeyAdd(nav.year, nav.month, nav.half),
      );
      if (raw) {
        const d = tryParseFormStateJson(raw);
        if (d) {
          setModalForm(d);
          return;
        }
      }
      const b = loadPayslipDefaultsBundle();
      setModalForm(
        initialAddPayslipForm(
          nav.year,
          nav.month,
          nav.half,
          payslipDefaultsFormForSlotHalf(b, nav.half),
        ),
      );
    } else if (nav.screen === "manual") {
      const raw = sessionStorage.getItem(PAYSLIP_DRAFT_MANUAL);
      if (raw) {
        const d = tryParseFormStateJson(raw);
        if (d) {
          setModalForm(d);
          return;
        }
      }
      const b = loadPayslipDefaultsBundle();
      setModalForm(initialManualPayslipForm(b.formFirst, b.formSecond));
    }
  }, [nav]);

  useEffect(() => {
    const onDefaultsSaved = () => {
      const n = navRef.current;
      if (!n || (n.screen !== "add" && n.screen !== "manual")) return;
      clearPayslipModalDraft(n);
      const b = loadPayslipDefaultsBundle();
      if (n.screen === "add") {
        setModalForm(
          initialAddPayslipForm(
            n.year,
            n.month,
            n.half,
            payslipDefaultsFormForSlotHalf(b, n.half),
          ),
        );
      } else {
        setModalForm(initialManualPayslipForm(b.formFirst, b.formSecond));
      }
    };
    window.addEventListener(PAYSLIP_DEFAULTS_SAVED_EVENT, onDefaultsSaved);
    return () => {
      window.removeEventListener(
        PAYSLIP_DEFAULTS_SAVED_EVENT,
        onDefaultsSaved,
      );
    };
  }, []);

  useEffect(() => {
    if (!nav || nav.screen !== "detail") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = e.target as HTMLElement | null;
      if (
        el?.closest("input, textarea, select") ||
        el?.isContentEditable
      ) {
        return;
      }
      const { older, newer } = detailPayslipNeighbors(rows, nav.row.id);
      if (e.key === "ArrowLeft" && older) {
        e.preventDefault();
        setNav({ screen: "detail", row: older });
      } else if (e.key === "ArrowRight" && newer) {
        e.preventDefault();
        setNav({ screen: "detail", row: newer });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nav, rows]);

  const years = yearsToShow(rows);
  const unsorted = unscheduledRows(rows);

  return (
    <div className="box-border flex w-full min-w-0 flex-col gap-12 px-4 pb-28 pt-10 sm:px-6 lg:px-8">
      <header className="border-b border-zinc-200 pb-8 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Payslip
        </h1>
      </header>

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </div>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-8 flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Pay period calendar
            </h2>
          </div>
        </div>

        {!loading && <PayslipYearStatsSection rows={rows} />}

        {!loading && (
          <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {years.map((year) => (
              <div key={year} className="min-w-0">
                <YearPayslipBlock
                  year={year}
                  rows={rows}
                  saving={saving}
                  onOpenSlot={openSlot}
                />
              </div>
            ))}
          </div>
        )}

        {!loading && unsorted.length > 0 && (
          <div className="mt-10 border-t border-amber-200 pt-8 dark:border-amber-900/50">
            <h3 className="mb-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
              Without pay period ({unsorted.length})
            </h3>
            <ul className="flex flex-col gap-2">
              {unsorted.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/50"
                >
                  <span className="tabular-nums text-zinc-800 dark:text-zinc-200">
                    #{r.id} · Total {fmtNum(r.total)}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-white dark:border-zinc-600 dark:hover:bg-zinc-800"
                      onClick={() =>
                        setNav({ screen: "detail", row: r })
                      }
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-white dark:border-zinc-600 dark:hover:bg-zinc-800"
                      onClick={() => {
                        setModalForm(formFromRow(r));
                        setNav({ screen: "edit", row: r });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                      onClick={() => void handleDelete(r.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {nav && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-5 sm:items-center sm:p-6"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (
              nav.screen === "edit" ||
              nav.screen === "add" ||
              nav.screen === "manual"
            ) {
              stashPayslipModalDraft(nav, modalFormRef.current);
            }
            setNav(null);
          }}
        >
          <div
            className="max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl sm:p-8 lg:max-w-6xl dark:border-zinc-700 dark:bg-zinc-950"
            role="dialog"
            aria-modal="true"
          >
            {nav.screen === "slot" && (
              <>
                <div className="mb-4 flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {slotTitle(nav.year, nav.month, nav.half)}
                  </h2>
                  <button
                    type="button"
                    className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
                    onClick={() => setNav(null)}
                  >
                    Close
                  </button>
                </div>
                {(() => {
                  const items = rowsForSlot(
                    rows,
                    nav.year,
                    nav.month,
                    nav.half,
                  );
                  return (
                    <>
                      {items.length === 0 ? (
                        <p className="mb-4 text-sm text-zinc-800 dark:text-zinc-200">
                          No entries for this half.
                        </p>
                      ) : (
                        <ul className="mb-4 flex flex-col gap-2">
                          {items.map((r) => (
                            <li
                              key={r.id}
                              className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/40"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                                    Total {fmtNum(r.total)}
                                  </p>
                                  {r.notes && (
                                    <p className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                                      {r.notes}
                                    </p>
                                  )}
                                </div>
                                <div className="flex shrink-0 gap-1">
                                  <button
                                    type="button"
                                    className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
                                    onClick={() =>
                                      setNav({ screen: "detail", row: r })
                                    }
                                  >
                                    Details
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
                                    onClick={() => {
                                      setModalForm(formFromRow(r));
                                      setNav({ screen: "edit", row: r });
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:text-red-300"
                                    onClick={() => void handleDelete(r.id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      <button
                        type="button"
                        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                        onClick={() =>
                          setNav({
                            screen: "add",
                            year: nav.year,
                            month: nav.month,
                            half: nav.half,
                          })
                        }
                      >
                        Add entry for this half
                      </button>
                    </>
                  );
                })()}
              </>
            )}

            {nav.screen === "detail" && (
              <>
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                    {(() => {
                      const { older, newer } = detailPayslipNeighbors(
                        rows,
                        nav.row.id,
                      );
                      const btnCls =
                        "flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";
                      return (
                        <>
                          <button
                            type="button"
                            className={btnCls}
                            aria-label="Older payslip"
                            disabled={!older}
                            onClick={() =>
                              older &&
                              setNav({ screen: "detail", row: older })
                            }
                          >
                            ‹
                          </button>
                          <h2 className="min-w-0 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                            Details
                          </h2>
                          <button
                            type="button"
                            className={btnCls}
                            aria-label="Newer payslip"
                            disabled={!newer}
                            onClick={() =>
                              newer &&
                              setNav({ screen: "detail", row: newer })
                            }
                          >
                            ›
                          </button>
                        </>
                      );
                    })()}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
                    onClick={() => setNav(null)}
                  >
                    Close
                  </button>
                </div>
                <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                  {fmtPayPeriod(
                    nav.row.period_year,
                    nav.row.period_month,
                    nav.row.period_half,
                  )}
                </p>
                {(() => {
                  const y = nav.row.period_year;
                  const m = nav.row.period_month;
                  const h = nav.row.period_half;
                  if (
                    y == null ||
                    m == null ||
                    (h !== 1 && h !== 2)
                  ) {
                    return null;
                  }
                  const n = rowsForSlot(rows, y, m, h).length;
                  if (n <= 1) return null;
                  return (
                    <p className="mb-4 rounded-md border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                      {n} entries in this half — use ‹ › or arrow keys for other
                      payslips, or close and open that calendar slot to see the full
                      list.
                    </p>
                  );
                })()}
                <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,17.5rem)] lg:items-start lg:gap-8">
                  <div className="min-w-0">
                    <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-zinc-500">Gross total</dt>
                        <dd className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
                          {fmtNum(grossTotalFromRow(nav.row))}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">Net total</dt>
                        <dd className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
                          {fmtNum(nav.row.total)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">Basic salary</dt>
                        <dd className="tabular-nums text-zinc-900 dark:text-zinc-100">
                          {fmtNum(nav.row.basic_salary)}
                        </dd>
                      </div>
                      {(
                        [
                          ["commission", "Commission"],
                          ["reimbursement", "Reimbursement"],
                          ["medical_reimbursement", "Medical reimbursement"],
                          ["others", "Others"],
                          ["allowances", "Allowances"],
                          ["thirteenth_month", "13th Month"],
                        ] as const
                      ).map(([k, lab]) => (
                        <div key={k}>
                          <dt className="text-xs text-zinc-500">{lab}</dt>
                          <dd className="tabular-nums text-zinc-900 dark:text-zinc-100">
                            {fmtNum(nav.row[k])}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {nav.row.notes && (
                      <div className="mt-3">
                        <dt className="text-xs text-zinc-500">Notes</dt>
                        <dd className="mt-1 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
                          {nav.row.notes}
                        </dd>
                      </div>
                    )}
                  </div>
                  <aside className="flex min-w-0 flex-col gap-4 rounded-lg border border-zinc-200 bg-zinc-50/90 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/50">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Deductions
                    </p>
                    <dl className="flex flex-col gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-zinc-500">
                          Withholding tax
                        </dt>
                        <dd className="tabular-nums text-red-600 dark:text-red-400">
                          {fmtNum(nav.row.withholding_tax)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">
                          SSS contribution
                        </dt>
                        <dd className="tabular-nums text-red-600 dark:text-red-400">
                          {fmtNum(nav.row.sss_contribution)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">Philhealth</dt>
                        <dd className="tabular-nums text-red-600 dark:text-red-400">
                          {fmtNum(nav.row.philhealth)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">
                          Pag-ibig (Employee HDMF)
                        </dt>
                        <dd className="tabular-nums text-red-600 dark:text-red-400">
                          {fmtNum(nav.row.pag_ibig)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">MP2</dt>
                        <dd className="tabular-nums text-red-600 dark:text-red-400">
                          {fmtNum(nav.row.mp2)}
                        </dd>
                      </div>
                      <div className="mt-1 border-t border-zinc-200 pt-3 dark:border-zinc-600">
                        <dt className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                          Deductions total
                        </dt>
                        <dd className="mt-0.5 text-sm font-semibold tabular-nums text-red-700 dark:text-red-300">
                          {fmtNum(deductionsTotalFromRow(nav.row))}
                        </dd>
                      </div>
                    </dl>
                  </aside>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500"
                    onClick={() => {
                      setModalForm(formFromRow(nav.row));
                      setNav({ screen: "edit", row: nav.row });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-300"
                    onClick={() => void handleDelete(nav.row.id)}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}

            {nav.screen === "edit" && (
              <>
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
                      {(() => {
                        const r = nav.row;
                        const y = r.period_year;
                        const m = r.period_month;
                        const h = r.period_half;
                        if (
                          y != null &&
                          Number.isFinite(y) &&
                          m != null &&
                          m >= 1 &&
                          m <= 12 &&
                          (h === 1 || h === 2)
                        ) {
                          return (
                            <>
                              Edit · {slotTitle(y, m, h)}{" "}
                              <span className="font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                                (#{r.id})
                              </span>
                            </>
                          );
                        }
                        return (
                          <>
                            Edit payslip{" "}
                            <span className="font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                              (#{r.id})
                            </span>
                          </>
                        );
                      })()}
                    </h2>
                    {(() => {
                      const r = nav.row;
                      const y = r.period_year;
                      const m = r.period_month;
                      const h = r.period_half;
                      const scheduled =
                        y != null &&
                        Number.isFinite(y) &&
                        m != null &&
                        m >= 1 &&
                        m <= 12 &&
                        (h === 1 || h === 2);
                      if (scheduled) return null;
                      return (
                        <p className="mt-1 text-sm font-normal text-zinc-600 dark:text-zinc-400">
                          {fmtPayPeriod(y, m, h)}
                        </p>
                      );
                    })()}
                  </div>
                  <button
                    type="button"
                    className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
                    onClick={goBack}
                  >
                    Back
                  </button>
                </div>
                <form
                  className="min-w-0"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveEdit();
                  }}
                >
                  <PayslipFormFields
                    form={modalForm}
                    setForm={setModalForm}
                    disabled={saving}
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
                      onClick={() => {
                        clearPayslipModalDraft(nav);
                        setNav({ screen: "detail", row: nav.row });
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            )}

            {nav.screen === "add" && (
              <>
                <div className="mb-4 flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    New · {slotTitle(nav.year, nav.month, nav.half)}
                  </h2>
                  <button
                    type="button"
                    className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
                    onClick={goBack}
                  >
                    Back
                  </button>
                </div>
                <form
                  className="min-w-0"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveAddInModal();
                  }}
                >
                  <PayslipFormFields
                    form={modalForm}
                    setForm={setModalForm}
                    disabled={saving}
                    lockPeriod
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </form>
              </>
            )}

            {nav.screen === "manual" && (
              <>
                <div className="mb-4 flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    Add payslip
                  </h2>
                  <button
                    type="button"
                    className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
                    onClick={() => {
                      stashPayslipModalDraft(nav, modalFormRef.current);
                      setNav(null);
                    }}
                  >
                    Close
                  </button>
                </div>
                <form
                  className="min-w-0"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveManualAdd();
                  }}
                >
                  <PayslipFormFields
                    form={modalForm}
                    setForm={setModalForm}
                    disabled={saving}
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
                      onClick={() => {
                        clearPayslipModalDraft(nav);
                        setNav(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      <FloatingAddButton
        hidden={!!nav}
        onClick={() => setNav({ screen: "manual" })}
      />
    </div>
  );
}
