"use client";

import { useCallback, useEffect, useState } from "react";
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

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

type FormState = {
  period_year: string;
  period_month: string;
  period_half: "" | "1" | "2";
  total: string;
  commission: string;
  reimbursement: string;
  medical_reimbursement: string;
  others: string;
  mp2: string;
  allowances: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  period_year: "",
  period_month: "",
  period_half: "",
  total: "",
  commission: "",
  reimbursement: "",
  medical_reimbursement: "",
  others: "",
  mp2: "",
  allowances: "",
  notes: "",
});

/** Default field values for new payslip rows (add from FAB or calendar half). */
const DEFAULT_MP2 = "5000";
const DEFAULT_ALLOWANCES = "1108.30";

/** New manual row: current year/month; day 1–15 → 1st half, 16–31 → 2nd half. */
function defaultFormFromToday(): FormState {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const half: "1" | "2" = day >= 1 && day <= 15 ? "1" : "2";
  return {
    ...emptyForm(),
    period_year: String(year),
    period_month: String(month),
    period_half: half,
    mp2: DEFAULT_MP2,
    allowances: DEFAULT_ALLOWANCES,
  };
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
    commission: r.commission != null ? String(r.commission) : "",
    reimbursement: r.reimbursement != null ? String(r.reimbursement) : "",
    medical_reimbursement:
      r.medical_reimbursement != null ? String(r.medical_reimbursement) : "",
    others: r.others != null ? String(r.others) : "",
    mp2: r.mp2 != null ? String(r.mp2) : "",
    allowances: r.allowances != null ? String(r.allowances) : "",
    notes: r.notes ?? "",
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
    commission: parseOptFloat(f.commission),
    reimbursement: parseOptFloat(f.reimbursement),
    medical_reimbursement: parseOptFloat(f.medical_reimbursement),
    others: parseOptFloat(f.others),
    mp2: parseOptFloat(f.mp2),
    allowances: parseOptFloat(f.allowances),
    notes: f.notes.trim() || null,
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

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

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

function FormFields({
  form,
  setForm,
  disabled,
  lockPeriod,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  disabled?: boolean;
  lockPeriod?: boolean;
}) {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Period year</span>
        <input
          type="text"
          inputMode="numeric"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          value={form.period_year}
          onChange={(e) =>
            setForm((f) => ({ ...f, period_year: e.target.value }))
          }
          placeholder="e.g. 2024"
          disabled={disabled || lockPeriod}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Month</span>
        <select
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          value={form.period_month}
          onChange={(e) =>
            setForm((f) => ({ ...f, period_month: e.target.value }))
          }
          disabled={disabled || lockPeriod}
        >
          <option value="">—</option>
          {MONTHS.map((m) => (
            <option key={m} value={String(m)}>
              {new Date(2000, m - 1, 1).toLocaleString(undefined, {
                month: "long",
              })}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Half of month</span>
        <select
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          value={form.period_half}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              period_half: e.target.value as "" | "1" | "2",
            }))
          }
          disabled={disabled || lockPeriod}
        >
          <option value="">—</option>
          <option value="1">First half</option>
          <option value="2">Second half</option>
        </select>
      </label>
      {(
        [
          ["total", "Total"],
          ["commission", "Commission"],
          ["reimbursement", "Reimbursement"],
          ["medical_reimbursement", "Medical reimbursement"],
          ["others", "Others"],
          ["mp2", "MP2"],
          ["allowances", "Allowances"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
          <input
            type="text"
            inputMode="decimal"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            value={form[key]}
            onChange={(e) =>
              setForm((f) => ({ ...f, [key]: e.target.value }))
            }
            disabled={disabled}
          />
        </label>
      ))}
      <label className="flex flex-col gap-1 text-sm sm:col-span-2 lg:col-span-3">
        <span className="text-zinc-600 dark:text-zinc-400">Notes</span>
        <textarea
          className="min-h-[4rem] rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          value={form.notes}
          onChange={(e) =>
            setForm((f) => ({ ...f, notes: e.target.value }))
          }
          disabled={disabled}
        />
      </label>
    </>
  );
}

export default function PayslipClient() {
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PayslipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nav, setNav] = useState<Nav | null>(null);
  const [modalForm, setModalForm] = useState<FormState>(emptyForm());

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
      if (e.key === "Escape") setNav(null);
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
      setNav({ screen: "slot", year, month, half });
    } else {
      setNav({ screen: "detail", row: items[0] });
    }
  };

  const goBack = () => {
    setNav((n) => {
      if (!n) return null;
      if (n.screen === "detail" || n.screen === "edit") {
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
      if (n.screen === "add") {
        return { screen: "slot", year: n.year, month: n.month, half: n.half };
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

  // Sync modal form when entering edit/add/manual
  useEffect(() => {
    if (!nav) return;
    if (nav.screen === "edit") {
      setModalForm(formFromRow(nav.row));
    } else if (nav.screen === "add") {
      setModalForm({
        ...emptyForm(),
        period_year: String(nav.year),
        period_month: String(nav.month),
        period_half: String(nav.half) as "1" | "2",
        mp2: DEFAULT_MP2,
        allowances: DEFAULT_ALLOWANCES,
      });
    } else if (nav.screen === "manual") {
      setModalForm(defaultFormFromToday());
    }
  }, [nav]);

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
            if (e.target === e.currentTarget) setNav(null);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
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
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    Details
                  </h2>
                  <button
                    type="button"
                    className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
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
                      {n} entries in this half. Use Back to open the list and
                      switch between them.
                    </p>
                  );
                })()}
                <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  {(
                    [
                      ["total", "Total"],
                      ["commission", "Commission"],
                      ["reimbursement", "Reimbursement"],
                      ["medical_reimbursement", "Medical reimbursement"],
                      ["others", "Others"],
                      ["mp2", "MP2"],
                      ["allowances", "Allowances"],
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
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
                    onClick={goBack}
                  >
                    Back
                  </button>
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
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    Edit #{nav.row.id}
                  </h2>
                  <button
                    type="button"
                    className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
                    onClick={goBack}
                  >
                    Back
                  </button>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <FormFields
                    form={modalForm}
                    setForm={setModalForm}
                    disabled={saving}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                    disabled={saving}
                    onClick={() => void saveEdit()}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
                    onClick={() =>
                      setNav({ screen: "detail", row: nav.row })
                    }
                  >
                    Cancel
                  </button>
                </div>
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
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <FormFields
                    form={modalForm}
                    setForm={setModalForm}
                    disabled={saving}
                    lockPeriod
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                    disabled={saving}
                    onClick={() => void saveAddInModal()}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
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
                    onClick={() => setNav(null)}
                  >
                    Close
                  </button>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <FormFields
                    form={modalForm}
                    setForm={setModalForm}
                    disabled={saving}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                    disabled={saving}
                    onClick={() => void saveManualAdd()}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
                    onClick={() => setNav(null)}
                  >
                    Cancel
                  </button>
                </div>
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
