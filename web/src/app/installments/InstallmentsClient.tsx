"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FloatingAddButton } from "@/components/FloatingAddButton";
import { Modal } from "@/components/Modal";
import {
  createInstallment,
  deleteInstallment,
  getInstallment,
  getInstallments,
  getInstallmentSchedules,
  recordInstallmentPayment,
  reorderInstallmentLines,
  updateInstallment,
  updateInstallmentLine,
  type InstallmentCreateBody,
  type InstallmentDetailResponse,
  type InstallmentLineRow,
  type InstallmentRow,
} from "@/lib/api";
import { parseFormNumber } from "@/lib/parseFormNumber";
import { InstallmentFieldGrid } from "./installmentFieldGrid";

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function addMonths(d: Date, months: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setMonth(x.getMonth() + months);
  return x;
}

/** Parse API date to first of month (day ignored for schedule math). */
function startAsFirstOfMonth(iso: string): Date {
  const ymd = iso.slice(0, 10);
  const [y, m] = ymd.split("-").map(Number);
  if (!y || !m) return new Date(NaN);
  return new Date(y, m - 1, 1);
}

/**
 * Next payment due month (credit-card style: bill is due the month after the cycle,
 * not in the same month as the plan start for payment 1).
 */
function nextDueDate(r: InstallmentRow): Date {
  const start = startAsFirstOfMonth(r.start_date);
  return addMonths(start, r.installment_current);
}

/** Due month for payment #seq (same rule as API: credit-card style). */
function dueMonthForSeq(startIso: string, seq: number): Date {
  const start = startAsFirstOfMonth(startIso);
  return addMonths(start, seq);
}

/** Display as mm-yyyy (no day). */
function fmtMonthYear(iso: string): string {
  const ymd = iso.slice(0, 10);
  const parts = ymd.split("-");
  if (parts.length < 2) return "—";
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return "—";
  return `${String(m).padStart(2, "0")}-${y}`;
}

function fmtMonthYearFromDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

/** Value for <input type="month" /> (always yyyy-MM). */
function toInputMonth(iso: string): string {
  if (!iso) return "";
  const t = iso.trim();
  const ymd = t.slice(0, 10);
  const isoD = /^(\d{4})-(\d{2})-\d{2}$/.exec(ymd);
  if (isoD) return `${isoD[1]}-${isoD[2]}`;
  const my = /^(\d{1,2})-(\d{4})$/.exec(t);
  if (my) return `${my[2]}-${my[1].padStart(2, "0")}`;
  return t.slice(0, 7);
}

/**
 * API expects YYYY-MM-DD; month-only is stored as first of month.
 * Accepts yyyy-MM (from <input type="month" />) or mm-yyyy if pasted.
 */
function monthToApiDate(ym: string): string {
  const t = ym.trim();
  if (!t) return "";
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (full) return `${full[1]}-${full[2]}-01`;
  const isoMonth = /^(\d{4})-(\d{2})$/.exec(t);
  if (isoMonth) return `${isoMonth[1]}-${isoMonth[2]}-01`;
  const flipped = /^(\d{1,2})-(\d{4})$/.exec(t);
  if (flipped) {
    const mo = flipped[1].padStart(2, "0");
    return `${flipped[2]}-${mo}-01`;
  }
  return "";
}

/** Add ``months`` to a YYYY-MM-DD API date, returning first-of-month YYYY-MM-DD. */
function addMonthsToApiDate(apiDate: string, months: number): string {
  const [y, m] = apiDate.slice(0, 7).split("-").map(Number);
  if (!y || !m) return "";
  const d = addMonths(new Date(y, m - 1, 1), months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function isDueThisMonth(r: InstallmentRow): boolean {
  if (r.installment_current > r.installment_total || r.remaining <= 0) return false;
  const due = nextDueDate(r);
  const now = new Date();
  return (
    due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth()
  );
}

/** Bar width to align with "Installment current/total" (schedule position), not dollar % paid. */
function installmentScheduleProgressPct(r: InstallmentRow): number {
  const tot = Number(r.installment_total);
  const cur = Number(r.installment_current);
  const rem = Number(r.remaining);
  if (!(tot > 0) || !Number.isFinite(tot) || !Number.isFinite(cur)) return 0;
  if (cur > tot || (Number.isFinite(rem) && rem <= 0)) return 100;
  return Math.min(
    100,
    Math.max(0, ((cur - 1) / tot) * 100),
  );
}

function fmtPct2(pct: number): string {
  return pct.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const MONTH_ABBR = [
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

const emptyForm = {
  name: "",
  installment_current: "1",
  installment_total: "12",
  principal: "",
  interest: "",
  payment_total: "",
  start_date: "",
  finish_date: "",
  remaining: "",
  original_total: "",
};

export default function InstallmentsClient() {
  const [rows, setRows] = useState<InstallmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [scheduleModalId, setScheduleModalId] = useState<number | null>(null);
  const [detail, setDetail] = useState<InstallmentDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [lineEdits, setLineEdits] = useState<
    Record<number, { principal: string; interest: string }>
  >({});
  /** Line ids in display order (drag to reorder; saved with Save changes). */
  const [lineOrderIds, setLineOrderIds] = useState<number[]>([]);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [paymentsModalOpen, setPaymentsModalOpen] = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsDetails, setPaymentsDetails] = useState<
    InstallmentDetailResponse[]
  >([]);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await getInstallments(500);
      setRows(r.installments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const activeRows = useMemo(
    () => rows.filter((r) => r.installment_current <= r.installment_total && r.remaining > 0),
    [rows],
  );

  const doneRows = useMemo(
    () => rows.filter((r) => r.installment_current > r.installment_total || r.remaining <= 0),
    [rows],
  );

  /**
   * Mirrors the server's ``installment_summary`` so saves can patch the
   * in-memory ``rows`` list and skip the full ``getInstallments`` round
   * trip. The "due this month" calculation matches ``isDueThisMonth``
   * (CC-style: due month = ``start_date`` + ``installment_current``).
   */
  const summary = useMemo(() => {
    let sum_original_total = 0;
    let sum_remaining = 0;
    let due_this_month = 0;
    for (const r of activeRows) {
      sum_original_total += r.original_total || 0;
      sum_remaining += r.remaining || 0;
      if (r.remaining > 0 && isDueThisMonth(r)) {
        due_this_month += r.due_payment ?? r.payment_total ?? 0;
      }
    }
    return { sum_original_total, sum_remaining, due_this_month };
  }, [activeRows]);

  const upsertRow = useCallback((row: InstallmentRow) => {
    setRows((rs) => {
      const i = rs.findIndex((r) => r.id === row.id);
      if (i === -1) return [row, ...rs];
      const out = rs.slice();
      out[i] = row;
      return out;
    });
  }, []);

  const removeRow = useCallback((id: number) => {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closeAddModal = useCallback(() => {
    setAddModalOpen(false);
    setForm(emptyForm);
  }, []);

  useEffect(() => {
    if (!detail) {
      setLineOrderIds([]);
      return;
    }
    const e: Record<number, { principal: string; interest: string }> = {};
    for (const ln of detail.lines) {
      e[ln.id] = {
        principal: String(ln.principal),
        interest: ln.interest != null ? String(ln.interest) : "",
      };
    }
    setLineEdits(e);
    setLineOrderIds(detail.lines.map((l) => l.id));
  }, [detail]);

  const orderedScheduleLines = useMemo((): InstallmentLineRow[] => {
    if (!detail) return [];
    const byId = new Map(detail.lines.map((l) => [l.id, l]));
    const ids =
      lineOrderIds.length === detail.lines.length
        ? lineOrderIds
        : detail.lines.map((l) => l.id);
    return ids
      .map((id) => byId.get(id))
      .filter((ln): ln is InstallmentLineRow => ln != null);
  }, [detail, lineOrderIds]);

  const scheduleHasChanges = useMemo(() => {
    if (!detail) return false;
    const baselineIds = detail.lines.map((l) => l.id);
    const orderDirty =
      lineOrderIds.length !== baselineIds.length ||
      lineOrderIds.some((id, i) => id !== baselineIds[i]);
    if (orderDirty) return true;
    for (const ln of detail.lines) {
      const ed = lineEdits[ln.id];
      if (!ed) continue;
      const p = parseFormNumber(ed.principal);
      if (p == null || p < 0) return true;
      let iVal: number | null = null;
      if (ed.interest.trim() !== "") {
        const i = parseFormNumber(ed.interest);
        if (i == null || i < 0) return true;
        iVal = i;
      }
      if (p !== ln.principal) return true;
      const oi = ln.interest;
      if (iVal === null && oi != null) return true;
      if (iVal !== null && oi === null) return true;
      if (
        iVal !== null &&
        oi !== null &&
        iVal !== oi
      ) {
        return true;
      }
    }
    return false;
  }, [detail, lineEdits, lineOrderIds]);

  const saveScheduleEdits = useCallback(async () => {
    if (!detail) return;
    const insId = detail.installment.id;
    const baselineIds = detail.lines.map((l) => l.id);
    const orderDirty =
      lineOrderIds.length !== baselineIds.length ||
      lineOrderIds.some((id, i) => id !== baselineIds[i]);

    const pendingAmountEdits: {
      seq: number;
      principal: number;
      interest: number | null;
    }[] = [];
    for (const ln of detail.lines) {
      const ed = lineEdits[ln.id];
      if (!ed) continue;
      const principal = parseFormNumber(ed.principal);
      if (principal == null || principal < 0) {
        setError(`Payment #${ln.seq}: principal must be a valid non-negative number.`);
        return;
      }
      let interest: number | null = null;
      if (ed.interest.trim() !== "") {
        const i = parseFormNumber(ed.interest);
        if (i == null || i < 0) {
          setError(`Payment #${ln.seq}: interest must be a valid non-negative number.`);
          return;
        }
        interest = i;
      }
      const oi = ln.interest;
      const changed =
        principal !== ln.principal ||
        (interest === null && oi != null) ||
        (interest !== null && oi === null) ||
        (interest !== null && oi !== null && interest !== oi);
      if (changed) {
        pendingAmountEdits.push({ seq: ln.seq, principal, interest });
      }
    }

    if (!orderDirty && pendingAmountEdits.length === 0) return;

    setSavingSchedule(true);
    setError(null);
    try {
      let working = detail;
      if (orderDirty) {
        working = await reorderInstallmentLines(insId, lineOrderIds);
        setDetail(working);
        setLineOrderIds(working.lines.map((l) => l.id));
      }

      let last: InstallmentDetailResponse | null = null;
      for (const ln of working.lines) {
        const ed = lineEdits[ln.id];
        if (!ed) continue;
        const principal = parseFormNumber(ed.principal);
        if (principal == null || principal < 0) continue;
        let interest: number | null = null;
        if (ed.interest.trim() !== "") {
          const i = parseFormNumber(ed.interest);
          if (i == null || i < 0) continue;
          interest = i;
        }
        const oi = ln.interest;
        const changed =
          principal !== ln.principal ||
          (interest === null && oi != null) ||
          (interest !== null && oi === null) ||
          (interest !== null && oi !== null && interest !== oi);
        if (!changed) continue;
        last = await updateInstallmentLine(insId, ln.seq, {
          principal,
          interest,
        });
      }
      const finalDetail = last ?? working;
      setDetail(finalDetail);
      // Each detail response includes the updated installment row (with
      // recomputed aggregates), so patch the page list in place rather
      // than re-fetching every plan.
      upsertRow(finalDetail.installment);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingSchedule(false);
    }
  }, [detail, lineEdits, lineOrderIds, upsertRow]);

  const closeScheduleModal = useCallback(() => {
    setScheduleModalId(null);
    setDetail(null);
  }, []);

  const openPayments = async () => {
    setPaymentsModalOpen(true);
    setPaymentsLoading(true);
    setPaymentsDetails([]);
    setError(null);
    try {
      // One request returns every plan with its schedule lines — far faster than
      // a per-plan detail call (each of which would trigger its own cloud check).
      const res = await getInstallmentSchedules(2000);
      setPaymentsDetails(res.schedules);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payments");
      setPaymentsModalOpen(false);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const closePayments = useCallback(() => {
    setPaymentsModalOpen(false);
    setPaymentsDetails([]);
  }, []);

  /**
   * Every scheduled payment across all plans, bucketed by its due month.
   * Due month for payment #seq is start + seq (credit-card style, matching
   * the schedule view); a payment is "done" once its seq is below the plan's
   * current (next-to-pay) position.
   */
  const paymentsByMonth = useMemo(() => {
    type Item = {
      planId: number;
      planName: string;
      seq: number;
      amount: number;
      paid: boolean;
    };
    type Group = {
      key: number;
      label: string;
      items: Item[];
      subtotal: number;
      doneTotal: number;
      toPayTotal: number;
    };
    const map = new Map<number, Group>();
    let grandTotal = 0;
    let grandDone = 0;
    let grandToPay = 0;
    for (const d of paymentsDetails) {
      const start = d.installment.start_date;
      const current = d.installment.installment_current;
      for (const ln of d.lines) {
        const due = dueMonthForSeq(start, ln.seq);
        if (Number.isNaN(due.getTime())) continue;
        const key = due.getFullYear() * 12 + due.getMonth();
        let g = map.get(key);
        if (!g) {
          g = {
            key,
            label: fmtMonthYearFromDate(due),
            items: [],
            subtotal: 0,
            doneTotal: 0,
            toPayTotal: 0,
          };
          map.set(key, g);
        }
        const amount = Number(ln.payment_total) || 0;
        const paid = ln.seq < current;
        g.items.push({
          planId: d.installment.id,
          planName: d.installment.name,
          seq: ln.seq,
          amount,
          paid,
        });
        g.subtotal += amount;
        grandTotal += amount;
        if (paid) {
          g.doneTotal += amount;
          grandDone += amount;
        } else {
          g.toPayTotal += amount;
          grandToPay += amount;
        }
      }
    }
    for (const g of map.values()) {
      g.items.sort(
        (a, b) => a.planName.localeCompare(b.planName) || a.seq - b.seq,
      );
    }
    // Continuous year range so the calendar shows every month (incl. empty
    // ones) from the first to the last scheduled payment.
    const keys = [...map.keys()];
    const years: number[] = [];
    if (keys.length > 0) {
      const minYear = Math.floor(Math.min(...keys) / 12);
      const maxYear = Math.floor(Math.max(...keys) / 12);
      for (let y = minYear; y <= maxYear; y++) years.push(y);
    }
    return { map, years, grandTotal, grandDone, grandToPay };
  }, [paymentsDetails]);

  const openDetail = async (id: number) => {
    setScheduleModalId(id);
    setDetail(null);
    setDetailLoading(true);
    setError(null);
    try {
      const d = await getInstallment(id);
      setDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schedule");
      setDetail(null);
      setScheduleModalId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const sd = monthToApiDate(form.start_date);
      if (!sd) {
        throw new Error(
          "Start must be a valid month (use yyyy-mm or mm-yyyy).",
        );
      }
      const total = parseFormNumber(form.installment_total) ?? NaN;
      // Finish defaults to start + total installments (CC-style: payment #n
      // is due n months after start).
      let fd = monthToApiDate(form.finish_date);
      if (!fd) {
        if (!Number.isFinite(total) || total < 1) {
          throw new Error(
            "Enter total installments so the finish date can be computed.",
          );
        }
        fd = addMonthsToApiDate(sd, total);
      }
      const principalVal = parseFormNumber(form.principal) ?? 0;
      const interestVal =
        form.interest.trim() === ""
          ? null
          : (parseFormNumber(form.interest) ?? NaN);
      // Per-payment total defaults to principal + interest when left blank.
      const paymentTotal =
        form.payment_total.trim() === ""
          ? principalVal + (interestVal ?? 0)
          : (parseFormNumber(form.payment_total) ?? NaN);
      const body: InstallmentCreateBody = {
        name: form.name.trim(),
        installment_current: parseFormNumber(form.installment_current) ?? NaN,
        installment_total: total,
        principal: principalVal,
        interest: interestVal,
        payment_total: paymentTotal,
        start_date: sd,
        finish_date: fd,
        remaining:
          form.remaining.trim() === "" ? null : parseFormNumber(form.remaining),
        original_total:
          form.original_total.trim() === ""
            ? null
            : parseFormNumber(form.original_total),
      };
      const fresh =
        editingId != null
          ? await updateInstallment(editingId, body)
          : await createInstallment(body);
      if (editingId != null) setEditingId(null);
      else setAddModalOpen(false);
      setForm(emptyForm);
      upsertRow(fresh.installment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (r: InstallmentRow) => {
    setAddModalOpen(false);
    setEditingId(r.id);
    setForm({
      name: r.name,
      installment_current: String(r.installment_current),
      installment_total: String(r.installment_total),
      principal: String(r.principal),
      interest: r.interest != null ? String(r.interest) : "",
      payment_total: String(r.payment_total),
      start_date: toInputMonth(r.start_date),
      finish_date: toInputMonth(r.finish_date),
      remaining: String(r.remaining),
      original_total: String(r.original_total),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const onPay = async (id: number) => {
    setSaving(true);
    setError(null);
    try {
      const fresh = await recordInstallmentPayment(id);
      upsertRow(fresh.installment);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record payment");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: number) => {
    if (!confirm("Delete this installment plan?")) return;
    setSaving(true);
    setError(null);
    try {
      await deleteInstallment(id);
      if (editingId === id) cancelEdit();
      removeRow(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const dueIds = useMemo(() => {
    const s = new Set<number>();
    for (const r of activeRows) {
      if (isDueThisMonth(r)) s.add(r.id);
    }
    return s;
  }, [activeRows]);

  return (
    <div className="relative mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-8 px-4 pb-28 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Installments
        </h1>
        <div className="flex gap-2">
          {doneRows.length > 0 && (
            <button
              type="button"
              className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                showArchived
                  ? "border-zinc-400 bg-zinc-200 text-zinc-800 dark:border-zinc-500 dark:bg-zinc-700 dark:text-zinc-100"
                  : "border-zinc-300 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300 dark:hover:bg-zinc-700/40"
              }`}
              onClick={() => setShowArchived((v) => !v)}
            >
              Archived ({doneRows.length})
            </button>
          )}
          <button
            type="button"
            disabled={loading || rows.length === 0}
            className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200 dark:hover:bg-indigo-900/40"
            onClick={() => void openPayments()}
          >
            Payments by month
          </button>
        </div>
      </header>

      {error && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {error}
        </div>
      )}

      {!loading && (
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-medium uppercase text-zinc-500">
              Total (active plans)
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
              {fmtMoney(summary.sum_original_total)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-medium uppercase text-zinc-500">
              Remaining
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-800 dark:text-amber-200">
              {fmtMoney(summary.sum_remaining)}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <p className="text-xs font-medium uppercase text-emerald-800 dark:text-emerald-200">
              Due this month
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">
              {fmtMoney(summary.due_this_month)}
            </p>
          </div>
        </section>
      )}

      {editingId != null && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
            Edit installment
          </h2>
          <form
            onSubmit={submitCreate}
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <InstallmentFieldGrid
              form={form}
              setForm={setForm}
              saving={saving}
            />
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Update"}
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
                onClick={cancelEdit}
              >
                Cancel edit
              </button>
            </div>
          </form>
        </section>
      )}

      <Modal
        open={addModalOpen}
        onClose={closeAddModal}
        ariaLabelledBy="installment-add-title"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2
            id="installment-add-title"
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Add installment
          </h2>
          <button
            type="button"
            className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
            onClick={closeAddModal}
          >
            Close
          </button>
        </div>
        <form onSubmit={submitCreate} className="grid gap-4 sm:grid-cols-2">
          <InstallmentFieldGrid
            form={form}
            setForm={setForm}
            saving={saving}
            hideAmounts
          />
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add"}
            </button>
            <button
              type="button"
              disabled={saving}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
              onClick={closeAddModal}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <section>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          Plans
        </h2>
        <ul className="mt-4 grid grid-cols-3 gap-2 sm:gap-4">
          {!loading &&
            activeRows.map((r) => {
              const canPay =
                r.installment_current <= r.installment_total && r.remaining > 0;
              const due = dueIds.has(r.id);
              const nn = `${r.installment_current}/${r.installment_total}`;
              const orig = Number(r.original_total);
              const rem = Number(r.remaining);
              const pct = installmentScheduleProgressPct(r);
              return (
                <li
                  key={`${r.id}-${orig}-${rem}-${r.installment_current}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => void openDetail(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void openDetail(r.id);
                    }
                  }}
                  className={`min-w-0 rounded-xl border p-3 shadow-sm transition hover:ring-2 hover:ring-indigo-300/60 sm:p-4 dark:hover:ring-indigo-700/50 ${
                    due
                      ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
                      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                  } cursor-pointer`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-zinc-900 sm:text-base dark:text-zinc-50">
                        {r.name}
                      </h3>
                      <p className="mt-1 text-xs text-zinc-600 sm:text-sm dark:text-zinc-400">
                        Installment{" "}
                        <span className="font-mono font-medium tabular-nums">
                          {nn}
                        </span>
                        {due && (
                          <span className="ml-2 rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
                            Due this month
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-1.5 sm:gap-2">
                      {canPay && (
                        <button
                          type="button"
                          disabled={saving}
                          className="rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50 sm:px-3 sm:text-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            void onPay(r.id);
                          }}
                        >
                          Record payment
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={saving}
                        className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs dark:border-zinc-600 sm:px-3 sm:text-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(r);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        className="rounded-md border border-red-200 px-2 py-1.5 text-xs text-red-700 dark:border-red-900 dark:text-red-300 sm:px-3 sm:text-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onDelete(r.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs sm:mt-4 sm:gap-3 sm:text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="text-xs text-zinc-500">Principal</dt>
                      <dd className="tabular-nums font-medium">{fmtMoney(r.principal)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Interest</dt>
                      <dd className="tabular-nums font-medium">
                        {r.interest != null ? fmtMoney(r.interest) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Total (per payment)</dt>
                      <dd className="tabular-nums font-medium">
                        {fmtMoney(r.payment_total)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Next due</dt>
                      <dd className="text-zinc-800 dark:text-zinc-200">
                        {r.installment_current <= r.installment_total
                          ? fmtMonthYearFromDate(nextDueDate(r))
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Start</dt>
                      <dd className="tabular-nums">{fmtMonthYear(r.start_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Finish</dt>
                      <dd className="tabular-nums">{fmtMonthYear(r.finish_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Original total</dt>
                      <dd className="tabular-nums">{fmtMoney(r.original_total)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Remaining</dt>
                      <dd className="tabular-nums font-semibold text-amber-800 dark:text-amber-200">
                        {fmtMoney(r.remaining)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all dark:bg-indigo-600"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">
                    {fmtPct2(pct)}% of schedule
                  </p>
                </li>
              );
            })}
          {!loading && activeRows.length === 0 && (
            <li className="col-span-3 rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-800 dark:text-zinc-200 dark:border-zinc-700">
              {doneRows.length > 0 ? "All plans are fully paid." : "No installment plans yet."}
            </li>
          )}
        </ul>
      </section>

      {showArchived && doneRows.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-zinc-500 dark:text-zinc-400">
            Archived — Fully Paid
          </h2>
          <ul className="mt-4 grid grid-cols-3 gap-2 sm:gap-4">
            {doneRows.map((r) => {
              const orig = Number(r.original_total);
              const rem = Number(r.remaining);
              const pct = installmentScheduleProgressPct(r);
              return (
                <li
                  key={`${r.id}-${orig}-${rem}-${r.installment_current}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => void openDetail(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void openDetail(r.id);
                    }
                  }}
                  className="min-w-0 cursor-pointer rounded-xl border border-zinc-200 bg-zinc-50 p-3 opacity-70 shadow-sm transition hover:opacity-100 hover:ring-2 hover:ring-indigo-300/60 sm:p-4 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:ring-indigo-700/50"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-zinc-900 sm:text-base dark:text-zinc-50">
                        {r.name}
                      </h3>
                      <p className="mt-1 text-xs text-zinc-500 sm:text-sm dark:text-zinc-400">
                        {r.installment_total}/{r.installment_total} payments ·{" "}
                        <span className="rounded bg-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                          Paid off
                        </span>
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs dark:border-zinc-600 sm:px-3 sm:text-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(r);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        className="rounded-md border border-red-200 px-2 py-1.5 text-xs text-red-700 dark:border-red-900 dark:text-red-300 sm:px-3 sm:text-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onDelete(r.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs sm:mt-4 sm:gap-3 sm:text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="text-xs text-zinc-500">Principal</dt>
                      <dd className="tabular-nums font-medium">{fmtMoney(r.principal)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Interest</dt>
                      <dd className="tabular-nums font-medium">
                        {r.interest != null ? fmtMoney(r.interest) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Total (per payment)</dt>
                      <dd className="tabular-nums font-medium">
                        {fmtMoney(r.payment_total)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Original total</dt>
                      <dd className="tabular-nums">{fmtMoney(r.original_total)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Start</dt>
                      <dd className="tabular-nums">{fmtMonthYear(r.start_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Finish</dt>
                      <dd className="tabular-nums">{fmtMonthYear(r.finish_date)}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-zinc-400 transition-all dark:bg-zinc-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {fmtPct2(pct)}% of schedule
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Modal
        open={scheduleModalId != null}
        onClose={closeScheduleModal}
        ariaLabelledBy="schedule-title"
        backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
        dialogClassName="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
      >
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h2
                id="schedule-title"
                className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
              >
                {detail?.installment.name ?? "Payment schedule"}
              </h2>
              <button
                type="button"
                className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
                onClick={closeScheduleModal}
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {detailLoading && (
                <p className="text-sm text-zinc-800 dark:text-zinc-200">Loading schedule…</p>
              )}
              {!detailLoading && detail && detail.lines.length === 0 && (
                <p className="text-sm text-zinc-800 dark:text-zinc-200">
                  No monthly rows yet.
                </p>
              )}
              {!detailLoading && detail && detail.lines.length > 0 && (
                <div className="overflow-x-auto">
                <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
                  Drag a row to reorder payments. Due dates follow the new row order after you save.
                </p>
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-800">
                      <th className="pb-2 pr-2">#</th>
                      <th className="pb-2 pr-2">Due (mm-yyyy)</th>
                      <th className="pb-2 pr-2">Principal</th>
                      <th className="pb-2 pr-2">Interest</th>
                      <th className="pb-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderedScheduleLines.map((ln, idx) => {
                      const ed = lineEdits[ln.id];
                      const visPos = idx + 1;
                      const p = ed
                        ? (parseFormNumber(ed.principal) ?? NaN)
                        : ln.principal;
                      const iRaw =
                        ed && ed.interest.trim() !== ""
                          ? (parseFormNumber(ed.interest) ?? NaN)
                          : ln.interest != null
                            ? ln.interest
                            : 0;
                      const rowTotal =
                        (Number.isFinite(p) ? p : 0) +
                        (Number.isFinite(iRaw) ? iRaw : 0);
                      const isNext =
                        ln.seq === detail.installment.installment_current;
                      return (
                        <tr
                          key={ln.id}
                          draggable
                          className={`cursor-grab border-b border-zinc-100 active:cursor-grabbing dark:border-zinc-800 ${
                            isNext ? "bg-indigo-50/80 dark:bg-indigo-950/30" : ""
                          }`}
                          title="Drag row to reorder"
                          onDragStart={(e) => {
                            const el = e.target as HTMLElement | null;
                            if (
                              !el ||
                              el.closest(
                                "input, textarea, button, select, option",
                              )
                            ) {
                              e.preventDefault();
                              return;
                            }
                            e.dataTransfer.setData(
                              "text/plain",
                              String(ln.id),
                            );
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const fromId = Number(
                              e.dataTransfer.getData("text/plain"),
                            );
                            if (
                              !Number.isFinite(fromId) ||
                              fromId === ln.id
                            ) {
                              return;
                            }
                            setLineOrderIds((prev) => {
                              const next = [...prev];
                              const from = next.indexOf(fromId);
                              const to = next.indexOf(ln.id);
                              if (from < 0 || to < 0) return prev;
                              next.splice(from, 1);
                              next.splice(to, 0, fromId);
                              return next;
                            });
                          }}
                        >
                          <td className="py-2 pr-2 font-mono tabular-nums">
                            {visPos}
                            {isNext && (
                              <span className="ml-1 text-[10px] font-sans text-indigo-600 dark:text-indigo-300">
                                (next)
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-2 tabular-nums text-zinc-800 dark:text-zinc-200">
                            {fmtMonthYearFromDate(
                              dueMonthForSeq(
                                detail.installment.start_date,
                                visPos,
                              ),
                            )}
                          </td>
                          <td className="cursor-auto py-2 pr-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              draggable={false}
                              className="w-28 cursor-text rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                              value={
                                ed?.principal ?? String(ln.principal)
                              }
                              onChange={(e) =>
                                setLineEdits((prev) => ({
                                  ...prev,
                                  [ln.id]: {
                                    principal: e.target.value,
                                    interest:
                                      prev[ln.id]?.interest ??
                                      (ln.interest != null
                                        ? String(ln.interest)
                                        : ""),
                                  },
                                }))
                              }
                            />
                          </td>
                          <td className="cursor-auto py-2 pr-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="—"
                              draggable={false}
                              className="w-24 cursor-text rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                              value={
                                ed?.interest ??
                                (ln.interest != null ? String(ln.interest) : "")
                              }
                              onChange={(e) =>
                                setLineEdits((prev) => ({
                                  ...prev,
                                  [ln.id]: {
                                    principal:
                                      prev[ln.id]?.principal ??
                                      String(ln.principal),
                                    interest: e.target.value,
                                  },
                                }))
                              }
                            />
                          </td>
                          <td className="py-2 tabular-nums text-zinc-800 dark:text-zinc-100">
                            {fmtMoney(rowTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </div>
            {!detailLoading && detail && detail.lines.length > 0 && (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-zinc-800 bg-black px-4 py-3 dark:border-zinc-700 dark:bg-black">
                <button
                  type="button"
                  disabled={savingSchedule || !scheduleHasChanges}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
                  onClick={() => void saveScheduleEdits()}
                >
                  {savingSchedule ? "Saving…" : "Save changes"}
                </button>
              </div>
            )}
      </Modal>

      <Modal
        open={paymentsModalOpen}
        onClose={closePayments}
        ariaLabelledBy="payments-title"
        backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
        dialogClassName="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2
            id="payments-title"
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Payments by month
          </h2>
          <button
            type="button"
            className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
            onClick={closePayments}
          >
            Close
          </button>
        </div>

        {!paymentsLoading && (
          <div className="grid shrink-0 grid-cols-3 gap-2 border-b border-zinc-200 px-4 py-3 text-center dark:border-zinc-800">
            <div>
              <p className="text-[11px] font-medium uppercase text-zinc-500">Done</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {fmtMoney(paymentsByMonth.grandDone)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase text-zinc-500">
                To be made
              </p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                {fmtMoney(paymentsByMonth.grandToPay)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase text-zinc-500">Total</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {fmtMoney(paymentsByMonth.grandTotal)}
              </p>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {paymentsLoading && (
            <p className="text-sm text-zinc-800 dark:text-zinc-200">
              Loading payments…
            </p>
          )}
          {!paymentsLoading && paymentsByMonth.years.length === 0 && (
            <p className="text-sm text-zinc-800 dark:text-zinc-200">
              No scheduled payments.
            </p>
          )}
          {!paymentsLoading && paymentsByMonth.years.length > 0 && (
            <div className="flex flex-col gap-6">
              {paymentsByMonth.years.map((year) => (
                <div key={year}>
                  <h3 className="mb-2 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                    {year}
                  </h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {MONTH_ABBR.map((abbr, m) => {
                      const g = paymentsByMonth.map.get(year * 12 + m);
                      if (!g) {
                        return (
                          <div
                            key={m}
                            className="flex min-h-[5rem] flex-col rounded-lg border border-dashed border-zinc-200 px-2 py-2 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600"
                          >
                            <span className="text-xs font-medium">{abbr}</span>
                          </div>
                        );
                      }
                      const allDone = g.toPayTotal <= 0;
                      return (
                        <div
                          key={m}
                          className={`flex min-h-[5rem] flex-col rounded-lg border px-2 py-2 ${
                            allDone
                              ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20"
                              : "border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20"
                          }`}
                        >
                          <div className="flex items-baseline justify-between gap-1">
                            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                              {abbr}
                            </span>
                            <span className="text-xs font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                              {fmtMoney(g.subtotal)}
                            </span>
                          </div>
                          <ul className="mt-1 flex flex-col gap-0.5">
                            {g.items.map((it) => (
                              <li
                                key={`${it.planId}-${it.seq}`}
                                className="flex items-center justify-between gap-1 text-[11px] leading-tight"
                                title={`${it.planName} #${it.seq} — ${it.paid ? "Done" : "To pay"}`}
                              >
                                <span
                                  className={`min-w-0 truncate ${
                                    it.paid
                                      ? "text-emerald-700 line-through dark:text-emerald-400"
                                      : "text-amber-800 dark:text-amber-300"
                                  }`}
                                >
                                  {it.planName}
                                </span>
                                <span className="shrink-0 tabular-nums text-zinc-700 dark:text-zinc-300">
                                  {fmtMoney(it.amount)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <FloatingAddButton
        hidden={addModalOpen || scheduleModalId != null || paymentsModalOpen}
        onClick={() => {
          setEditingId(null);
          setForm(emptyForm);
          setAddModalOpen(true);
        }}
        ariaLabel="Add installment"
      />
    </div>
  );
}
