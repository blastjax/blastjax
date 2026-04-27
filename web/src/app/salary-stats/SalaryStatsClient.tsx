"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getPayslips, type PayslipRow } from "@/lib/api";

/** Pie + non-deduction line categories (MP2 is grouped with statutory deductions). */
const PIE_SERIES_KEYS = [
  "reimbursement",
  "others",
  "allowances",
  "commission",
  "thirteenth_month",
  "medical_reimbursement",
] as const;

type PieSeriesKey = (typeof PIE_SERIES_KEYS)[number];

const DEDUCTION_KEYS = [
  "withholding_tax",
  "sss_contribution",
  "philhealth",
  "pag_ibig",
  "mp2",
] as const;

const LINE_SERIES_KEYS = [...PIE_SERIES_KEYS, ...DEDUCTION_KEYS] as const;

type LineSeriesKey = (typeof LINE_SERIES_KEYS)[number];

const CHART_LABEL: Record<LineSeriesKey, string> = {
  reimbursement: "Reimbursement",
  others: "Others",
  allowances: "Allowances",
  commission: "Commission",
  thirteenth_month: "13th Month",
  mp2: "MP2",
  medical_reimbursement: "Medical reimbursement",
  withholding_tax: "Withholding tax",
  sss_contribution: "SSS contribution",
  philhealth: "Philhealth",
  pag_ibig: "Pag-ibig",
};

const CHART_COLOR: Record<LineSeriesKey, string> = {
  reimbursement: "#3b82f6",
  others: "#8b5cf6",
  allowances: "#64748b",
  commission: "#f43f5e",
  thirteenth_month: "#ea580c",
  mp2: "#06b6d4",
  medical_reimbursement: "#14b8a6",
  withholding_tax: "#71717a",
  sss_contribution: "#b91c1c",
  philhealth: "#f97316",
  pag_ibig: "#fb7185",
};

function emptyTotals<K extends keyof PayslipRow>(
  keys: readonly K[],
): Record<K, number> {
  const o = {} as Record<K, number>;
  for (const k of keys) o[k] = 0;
  return o;
}

function addTotals<K extends keyof PayslipRow>(
  acc: Record<K, number>,
  r: PayslipRow,
  keys: readonly K[],
): Record<K, number> {
  const next = { ...acc };
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v)) next[k] += v;
  }
  return next;
}

/** Calendar year for a row (scheduled period or created_at year). */
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

/** Calendar month { y, m } for aggregation (1–12). */
function calendarMonthForRow(r: PayslipRow): { y: number; m: number } | null {
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
    return { y: Math.trunc(py), m: pm };
  }
  if (r.created_at) {
    const d = new Date(r.created_at);
    if (!Number.isNaN(d.getTime())) {
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    }
  }
  return null;
}

function monthKey(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

function parseMonthKey(s: string): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return { y, m: mo };
}

function compareMonthKeys(a: string, b: string): number {
  const pa = parseMonthKey(a);
  const pb = parseMonthKey(b);
  if (!pa || !pb) return 0;
  if (pa.y !== pb.y) return pa.y - pb.y;
  return pa.m - pb.m;
}

/** Inclusive range of YYYY-MM strings from start to end. */
function monthsBetweenInclusive(startKey: string, endKey: string): string[] {
  if (compareMonthKeys(startKey, endKey) > 0) return [];
  const out: string[] = [];
  const cur = parseMonthKey(startKey);
  const end = parseMonthKey(endKey);
  if (!cur || !end) return out;
  while (true) {
    const k = monthKey(cur.y, cur.m);
    out.push(k);
    if (cur.y === end.y && cur.m === end.m) break;
    cur.m += 1;
    if (cur.m > 12) {
      cur.m = 1;
      cur.y += 1;
    }
    if (cur.y > end.y + 200) break;
  }
  return out;
}

function aggregateYear<K extends keyof PayslipRow>(
  rows: PayslipRow[],
  year: number,
  keys: readonly K[],
): Record<K, number> {
  let acc = emptyTotals(keys);
  for (const r of rows) {
    if (calendarYearForRow(r) !== year) continue;
    acc = addTotals(acc, r, keys);
  }
  return acc;
}

function aggregateMonth<K extends keyof PayslipRow>(
  rows: PayslipRow[],
  year: number,
  month: number,
  keys: readonly K[],
): Record<K, number> {
  let acc = emptyTotals(keys);
  for (const r of rows) {
    const cm = calendarMonthForRow(r);
    if (!cm || cm.y !== year || cm.m !== month) continue;
    acc = addTotals(acc, r, keys);
  }
  return acc;
}

function aggregateRowsForMonthKey(
  rows: PayslipRow[],
  key: string,
): Record<LineSeriesKey, number> {
  const p = parseMonthKey(key);
  if (!p) return emptyTotals(LINE_SERIES_KEYS);
  return aggregateMonth(rows, p.y, p.m, LINE_SERIES_KEYS);
}

function sumDeductionKeys(
  sums: Record<(typeof DEDUCTION_KEYS)[number], number>,
): number {
  let s = 0;
  for (const k of DEDUCTION_KEYS) s += sums[k];
  return s;
}

function earliestMonthKey(rows: PayslipRow[]): string | null {
  let best: string | null = null;
  for (const r of rows) {
    const cm = calendarMonthForRow(r);
    if (!cm) continue;
    const k = monthKey(cm.y, cm.m);
    if (!best || compareMonthKeys(k, best) < 0) best = k;
  }
  return best;
}

function currentMonthKey(): string {
  const d = new Date();
  return monthKey(d.getFullYear(), d.getMonth() + 1);
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const PICKER_YEAR_MIN = 1900;
const PICKER_YEAR_MAX = 2200;

const LINE_MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatMonthKeyButtonLabel(key: string): string {
  const p = parseMonthKey(key);
  if (!p) return "Select month";
  const d = new Date(p.y, p.m - 1, 1);
  return d.toLocaleString(undefined, { month: "short", year: "numeric" });
}

const pickerBtnClass =
  "w-full min-w-[10rem] rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-left text-sm font-medium text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50";
const pickerYearNavBtnClass =
  "flex h-8 min-w-8 select-none items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-900";

type LineRangePickerAlign = "left" | "right";

function LineRangeMonthPicker({
  fieldLabel,
  value,
  onChange,
  open,
  onOpen,
  onClose,
  align = "left",
}: {
  fieldLabel: string;
  value: string;
  onChange: (key: string) => void;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  align?: LineRangePickerAlign;
}) {
  const p = value ? parseMonthKey(value) : null;
  const [browseYear, setBrowseYear] = useState(() => p?.y ?? new Date().getFullYear());

  useEffect(() => {
    if (open) {
      const pr = value ? parseMonthKey(value) : null;
      setBrowseYear(pr?.y ?? new Date().getFullYear());
    }
  }, [open, value]);

  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const onYearWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const d = e.deltaY > 0 ? 1 : -1;
    setBrowseYear((y) => Math.min(PICKER_YEAR_MAX, Math.max(PICKER_YEAR_MIN, y + d)));
  };

  return (
    <div className="relative" ref={rootRef}>
      <div className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">{fieldLabel}</span>
        <button
          type="button"
          className={pickerBtnClass}
          onClick={() => (open ? onClose() : onOpen())}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          {formatMonthKeyButtonLabel(value || "")}
        </button>
      </div>
      {open && (
        <div
          className={`absolute z-30 mt-1 min-w-[16.5rem] max-w-[calc(100vw-2rem)] rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 ${
            align === "right" ? "right-0" : "left-0"
          }`}
          role="dialog"
          aria-label={`Choose month for ${fieldLabel}`}
        >
          <div
            className="flex select-none items-center justify-center gap-0.5 text-sm text-zinc-700 dark:text-zinc-200"
            onWheel={onYearWheel}
            title="Scroll to change year"
          >
            <button
              type="button"
              className={pickerYearNavBtnClass}
              onClick={() =>
                setBrowseYear((y) => (y > PICKER_YEAR_MIN ? y - 1 : y))
              }
              aria-label="Previous year"
            >
              &lt;
            </button>
            <span className="min-w-[3.5rem] px-2 text-center text-base font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
              {browseYear}
            </span>
            <button
              type="button"
              className={pickerYearNavBtnClass}
              onClick={() =>
                setBrowseYear((y) => (y < PICKER_YEAR_MAX ? y + 1 : y))
              }
              aria-label="Next year"
            >
              &gt;
            </button>
          </div>
          <div
            className="mt-3 grid grid-cols-4 gap-1.5 sm:gap-2"
            onWheelCapture={(e) => e.stopPropagation()}
          >
            {LINE_MONTH_ABBR.map((abbr, i) => {
              const m = i + 1;
              const mk = monthKey(browseYear, m);
              const selected = value === mk;
              return (
                <button
                  key={mk}
                  type="button"
                  className={`rounded-md border px-1.5 py-2 text-center text-xs font-medium sm:px-2 sm:text-sm ${
                    selected
                      ? "border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-600"
                      : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-zinc-500 dark:hover:bg-zinc-700"
                  }`}
                  onClick={() => {
                    onChange(mk);
                    onClose();
                  }}
                >
                  {abbr}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

type PieMode = "month" | "year";

export default function SalaryStatsClient() {
  const [rows, setRows] = useState<PayslipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pieMode, setPieMode] = useState<PieMode>("year");
  const [pieYear, setPieYear] = useState(() => new Date().getFullYear());
  const [pieMonthStr, setPieMonthStr] = useState(() => currentMonthKey());

  const [lineStart, setLineStart] = useState("");
  const [lineEnd, setLineEnd] = useState(currentMonthKey());
  const [lineInitialized, setLineInitialized] = useState(false);
  const [lineRangeOpen, setLineRangeOpen] = useState<"from" | "to" | null>(null);

  const [visibleSeries, setVisibleSeries] = useState<Record<LineSeriesKey, boolean>>(
    () =>
      Object.fromEntries(LINE_SERIES_KEYS.map((k) => [k, true])) as Record<
        LineSeriesKey,
        boolean
      >,
  );

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
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
    if (lineInitialized || rows.length === 0) return;
    const earliest = earliestMonthKey(rows);
    const start = earliest ?? currentMonthKey();
    setLineStart(start);
    setLineEnd(currentMonthKey());
    setLineInitialized(true);
  }, [rows, lineInitialized]);

  const pieSlices = useMemo(() => {
    const sums =
      pieMode === "year"
        ? aggregateYear(rows, pieYear, PIE_SERIES_KEYS)
        : (() => {
            const p = parseMonthKey(pieMonthStr);
            return p
              ? aggregateMonth(rows, p.y, p.m, PIE_SERIES_KEYS)
              : emptyTotals(PIE_SERIES_KEYS);
          })();

    const list: { name: string; key: PieSeriesKey; value: number }[] = [];
    for (const k of PIE_SERIES_KEYS) {
      list.push({
        key: k,
        name: CHART_LABEL[k],
        value: sums[k],
      });
    }
    return list.filter((x) => x.value > 0);
  }, [rows, pieMode, pieYear, pieMonthStr]);

  const piePeriodDeductions = useMemo(() => {
    const sums =
      pieMode === "year"
        ? aggregateYear(rows, pieYear, DEDUCTION_KEYS)
        : (() => {
            const p = parseMonthKey(pieMonthStr);
            return p
              ? aggregateMonth(rows, p.y, p.m, DEDUCTION_KEYS)
              : emptyTotals(DEDUCTION_KEYS);
          })();
    return { sums, total: sumDeductionKeys(sums) };
  }, [rows, pieMode, pieYear, pieMonthStr]);

  const linePoints = useMemo(() => {
    const keys = monthsBetweenInclusive(lineStart, lineEnd);
    return keys.map((mk) => {
      const sums = aggregateRowsForMonthKey(rows, mk);
      const point: Record<string, string | number> = {
        monthKey: mk,
        label: mk,
      };
      for (const k of LINE_SERIES_KEYS) {
        point[k] = sums[k];
      }
      return point;
    });
  }, [rows, lineStart, lineEnd]);

  const lineRangeDeductionsTotal = useMemo(() => {
    if (!lineStart || !lineEnd || compareMonthKeys(lineStart, lineEnd) > 0) {
      return 0;
    }
    let t = 0;
    for (const p of linePoints) {
      for (const k of DEDUCTION_KEYS) {
        t += Number(p[k] ?? 0);
      }
    }
    return t;
  }, [linePoints, lineStart, lineEnd]);

  const anySeriesVisible = LINE_SERIES_KEYS.some((k) => visibleSeries[k]);

  const toggleSeriesGroup = (group: readonly LineSeriesKey[]) => {
    setVisibleSeries((prev) => {
      const anyOn = group.some((k) => prev[k]);
      const next = !anyOn;
      const o = { ...prev } as Record<LineSeriesKey, boolean>;
      for (const k of group) o[k] = next;
      return o;
    });
  };

  const toggleAllSeries = () => toggleSeriesGroup([...LINE_SERIES_KEYS]);
  const toggleAdditionsSeries = () => toggleSeriesGroup(PIE_SERIES_KEYS);
  const toggleDeductionsSeries = () => toggleSeriesGroup(DEDUCTION_KEYS);

  const chartTooltipStyle = {
    backgroundColor: "rgba(24, 24, 27, 0.92)",
    border: "1px solid rgb(63 63 70)",
    borderRadius: "8px",
    fontSize: "12px",
  };

  return (
    <div className="box-border flex w-full min-w-0 flex-col gap-10 px-4 pb-28 pt-10 sm:px-6 lg:px-8">
      <header className="border-b border-zinc-200 pb-8 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Salary Stats
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Compare reimbursement, allowances, commission, 13th month, medical
          reimbursement, and others by period. MP2 and statutory items are summarized
          under deductions.
        </p>
      </header>

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading payslips…</p>
      ) : (
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Composition
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Share of salary-related components including 13th month when present
              (excludes deductions, MP2, and gross total). Deductions for the same period
              are listed below.
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
                <button
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    pieMode === "year"
                      ? "bg-indigo-600 text-white"
                      : "text-zinc-700 dark:text-zinc-300"
                  }`}
                  onClick={() => setPieMode("year")}
                >
                  Per year
                </button>
                <button
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    pieMode === "month"
                      ? "bg-indigo-600 text-white"
                      : "text-zinc-700 dark:text-zinc-300"
                  }`}
                  onClick={() => setPieMode("month")}
                >
                  Per month
                </button>
              </div>
              {pieMode === "year" ? (
                <div
                  className="inline-flex items-center gap-0.5 text-sm"
                  role="group"
                  aria-label="Year"
                >
                  <button
                    type="button"
                    className="flex h-8 min-w-8 select-none items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    onClick={() =>
                      setPieYear((y) => (y > 1900 ? y - 1 : y))
                    }
                    aria-label="Previous year"
                  >
                    &lt;
                  </button>
                  <span className="min-w-[4.5rem] px-2 text-center font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                    {pieYear}
                  </span>
                  <button
                    type="button"
                    className="flex h-8 min-w-8 select-none items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    onClick={() =>
                      setPieYear((y) => (y < 2200 ? y + 1 : y))
                    }
                    aria-label="Next year"
                  >
                    &gt;
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">Month</span>
                  <input
                    type="month"
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-600 dark:bg-zinc-900"
                    value={pieMonthStr}
                    onChange={(e) => setPieMonthStr(e.target.value)}
                  />
                </label>
              )}
            </div>

            <div className="mt-6 h-[min(28rem,70vw)] w-full min-h-[260px]">
              {pieSlices.length === 0 ? (
                <p className="py-12 text-center text-sm text-zinc-500">
                  No data in this period for these categories.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieSlices}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius="80%"
                      label={({ name, percent }) =>
                        `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                    >
                      {pieSlices.map((s) => (
                        <Cell key={s.key} fill={CHART_COLOR[s.key]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) =>
                        fmtMoney(Number(value ?? 0))
                      }
                      contentStyle={chartTooltipStyle}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50/90 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Deductions ({pieMode === "year" ? `year ${pieYear}` : "selected month"})
              </h3>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {DEDUCTION_KEYS.map((k) => (
                  <div
                    key={k}
                    className="flex items-center justify-between gap-4 rounded-md border border-transparent px-0.5 py-1 sm:border-zinc-200/80 sm:px-2 sm:py-1.5 dark:sm:border-zinc-700/80"
                  >
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {CHART_LABEL[k]}
                    </span>
                    <span className="text-sm font-medium tabular-nums text-red-600 dark:text-red-400">
                      {fmtMoney(piePeriodDeductions.sums[k])}
                    </span>
                  </div>
                ))}
                <div className="col-span-full mt-2 flex flex-col gap-1 border-t border-zinc-200 pt-3 dark:border-zinc-600 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                    Deductions total
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-red-700 dark:text-red-300">
                    {fmtMoney(piePeriodDeductions.total)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Trend by month
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Monthly totals per category (including 13th month, withholding, SSS,
              Philhealth, Pag-ibig, and MP2). Adjust the range (defaults from first data
              month through today). A deductions total for the whole range is shown under
              the chart.
            </p>

            <div className="mt-4 flex flex-wrap items-end justify-center gap-4">
              <LineRangeMonthPicker
                fieldLabel="From"
                value={lineStart}
                onChange={setLineStart}
                open={lineRangeOpen === "from"}
                onOpen={() => setLineRangeOpen("from")}
                onClose={() => setLineRangeOpen((o) => (o === "from" ? null : o))}
                align="left"
              />
              <LineRangeMonthPicker
                fieldLabel="To"
                value={lineEnd}
                onChange={setLineEnd}
                open={lineRangeOpen === "to"}
                onOpen={() => setLineRangeOpen("to")}
                onClose={() => setLineRangeOpen((o) => (o === "to" ? null : o))}
                align="right"
              />
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  onClick={toggleAllSeries}
                >
                  Toggle all series
                </button>
                <button
                  type="button"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  onClick={toggleAdditionsSeries}
                >
                  Toggle additions
                </button>
                <button
                  type="button"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  onClick={toggleDeductionsSeries}
                >
                  Toggle deductions
                </button>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-3">
              {LINE_SERIES_KEYS.map((k) => (
                <label
                  key={k}
                  className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                >
                  <input
                    type="checkbox"
                    className="rounded border-zinc-400"
                    checked={visibleSeries[k]}
                    onChange={() =>
                      setVisibleSeries((prev) => ({ ...prev, [k]: !prev[k] }))
                    }
                  />
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: CHART_COLOR[k] }}
                    aria-hidden
                  />
                  {CHART_LABEL[k]}
                </label>
              ))}
            </div>

            <div className="mt-6 h-[min(24rem,55vh)] w-full min-h-[240px]">
              {!lineStart || !lineEnd || compareMonthKeys(lineStart, lineEnd) > 0 ? (
                <p className="py-10 text-center text-sm text-zinc-500">
                  Choose a valid period (from ≤ to).
                </p>
              ) : !anySeriesVisible ? (
                <p className="py-10 text-center text-sm text-zinc-500">
                  Turn on at least one series or use the range toggles above.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={linePoints}
                    margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-zinc-600" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      className="text-zinc-600"
                      tickFormatter={(v) =>
                        Number(v) >= 1000
                          ? `${(Number(v) / 1000).toFixed(1)}k`
                          : String(v)
                      }
                    />
                    <Tooltip
                      formatter={(value) => fmtMoney(Number(value ?? 0))}
                      contentStyle={chartTooltipStyle}
                    />
                    <Legend />
                    {LINE_SERIES_KEYS.filter((k) => visibleSeries[k]).map((k) => (
                      <Area
                        key={k}
                        type="monotone"
                        dataKey={k}
                        name={CHART_LABEL[k]}
                        stroke={CHART_COLOR[k]}
                        strokeWidth={2}
                        fill={CHART_COLOR[k]}
                        fillOpacity={0.22}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            {!lineStart || !lineEnd || compareMonthKeys(lineStart, lineEnd) > 0 ? null : (
              <div className="mt-4 flex flex-col gap-1 rounded-lg border border-zinc-200 bg-zinc-50/90 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/50 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Deductions total (sum over chart range)
                </span>
                <span className="text-sm font-semibold tabular-nums text-red-700 dark:text-red-300">
                  {fmtMoney(lineRangeDeductionsTotal)}
                </span>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
