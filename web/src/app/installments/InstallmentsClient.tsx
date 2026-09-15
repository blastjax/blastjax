"use client";

import {
  CalendarIcon,
  LayersIcon,
  WalletIcon,
} from "@/components/Icons";
import { AmountInput } from "@/components/AmountInput";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import {
  createInstallment,
  deleteInstallment,
  getCreditCard,
  getInstallment,
  getInstallments,
  getInstallmentSchedules,
  recordInstallmentPayment,
  reorderInstallmentLines,
  updateInstallment,
  updateInstallmentLinesBulk,
  type InstallmentCreateBody,
  type InstallmentDetailResponse,
  type InstallmentLineRow,
  type InstallmentRow,
} from "@/lib/api";
import { formatAmountNumber, parseFormNumber } from "@/lib/parseFormNumber";
import { MONTH_NAMES_SHORT, formatMonthYear } from "@/lib/dateFormat";
import { fmtAmount, fmtAmountOrDash } from "@/lib/formatNumber";
import {
  ACTION_BUTTON_CLASSES,
  AMOUNT_POSITIVE_CLASSES,
  CLOSE_BUTTON_CLASSES,
  DASHED_EMPTY_CLASSES,
  DELETE_BUTTON_CLASSES,
  ERROR_ALERT_CLASSES,
  LOADING_TEXT_CLASSES,
  PAGE_CONTAINER_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
  TABLE_CELL_CLASSES,
  TABLE_HEAD_CELL_CLASSES,
  TABLE_HEAD_ROW_CLASSES,
  TABLE_ROW_CLASSES,
  TABLE_WRAPPER_CLASSES,
  TOGGLE_ACTIVE_BUTTON_CLASSES,
  TOGGLE_INACTIVE_BUTTON_CLASSES,
} from "@/lib/ui";
import { InstallmentFieldGrid } from "./installmentFieldGrid";

const fmtMoney = fmtAmountOrDash;

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

/** Display a stored YYYY-MM(-DD) date as its month + year, e.g. "July 2026". */
function fmtMonthYear(iso: string): string {
  const ymd = iso.slice(0, 10);
  const parts = ymd.split("-");
  if (parts.length < 2) return "—";
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return "—";
  return formatMonthYear(y, m);
}

function fmtMonthYearFromDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return "—";
  return formatMonthYear(d.getFullYear(), d.getMonth() + 1);
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

const fmtPct2 = fmtAmount;

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

function formFromRow(row: InstallmentRow) {
  return {
    name: row.name,
    installment_current: String(row.installment_current),
    installment_total: String(row.installment_total),
    principal: formatAmountNumber(row.principal),
    interest: row.interest != null ? formatAmountNumber(row.interest) : "",
    payment_total: formatAmountNumber(row.payment_total),
    start_date: toInputMonth(row.start_date),
    finish_date: toInputMonth(row.finish_date),
    remaining: formatAmountNumber(row.remaining),
    original_total: formatAmountNumber(row.original_total),
  };
}

export default function InstallmentsClient() {
  const [rows, setRows] = useState<InstallmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
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
  const [cardId, setCardId] = useState<number | null>(null);
  const [linkToCard, setLinkToCard] = useState(false);
  /** Per-payment principal/interest drafts for the Add form, keyed by seq (1..n). */
  const [lineDrafts, setLineDrafts] = useState<
    Record<number, { principal: string; interest: string }>
  >({});

  const draftTotal = useMemo(
    () => Math.max(0, Math.trunc(parseFormNumber(form.installment_total) ?? 0)),
    [form.installment_total],
  );

  const draftSums = useMemo(() => {
    let principal = 0;
    let interest = 0;
    for (let seq = 1; seq <= draftTotal; seq++) {
      const ld = lineDrafts[seq];
      const p = parseFormNumber(ld?.principal ?? "");
      if (p != null) principal += p;
      if (ld?.interest && ld.interest.trim() !== "") {
        const iv = parseFormNumber(ld.interest);
        if (iv != null) interest += iv;
      }
    }
    return { principal, interest, total: principal + interest };
  }, [lineDrafts, draftTotal]);

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

  useEffect(() => {
    void (async () => {
      try {
        const r = await getCreditCard();
        setCardId(r.card?.id ?? null);
      } catch {
        setCardId(null);
      }
    })();
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
    setLinkToCard(false);
    setLineDrafts({});
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

      const changedLines: { seq: number; principal: number; interest: number | null }[] = [];
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
        changedLines.push({ seq: ln.seq, principal, interest });
      }
      // One bulk request updates every dirty row in a single round trip,
      // instead of a PUT per changed line.
      const finalDetail =
        changedLines.length > 0
          ? await updateInstallmentLinesBulk(insId, changedLines)
          : working;
      setDetail(finalDetail);
      // Each detail response includes the updated installment row (with
      // recomputed aggregates), so patch the page list — and the header
      // fields shown above the schedule table — in place rather than
      // re-fetching every plan.
      setForm(formFromRow(finalDetail.installment));
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
    setForm(emptyForm);
    setLinkToCard(false);
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
    // Header fields come from the already-loaded row instantly; the
    // schedule lines below still need their own fetch.
    const row = rows.find((r) => r.id === id);
    if (row) {
      setForm(formFromRow(row));
      setLinkToCard(row.credit_card_id != null);
    }
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
      if (!Number.isFinite(total) || total < 1) {
        throw new Error("Enter a valid total installments (n).");
      }
      // Finish defaults to start + total installments (CC-style: payment #n
      // is due n months after start).
      let fd = monthToApiDate(form.finish_date);
      if (!fd) fd = addMonthsToApiDate(sd, total);

      if (scheduleModalId == null) {
        // Add flow: every payment (1..n) has its own principal/interest,
        // entered in the per-row table below. Create seeds every row with
        // payment #1's amount, then one bulk call patches in the rest —
        // still just two requests total, not one per row.
        const parsedLines: {
          seq: number;
          principal: number;
          interest: number | null;
        }[] = [];
        for (let seq = 1; seq <= total; seq++) {
          const ld = lineDrafts[seq];
          const principal = parseFormNumber(ld?.principal ?? "");
          if (principal == null || principal < 0) {
            throw new Error(
              `Payment #${seq}: principal must be a valid non-negative number.`,
            );
          }
          let interest: number | null = null;
          if (ld?.interest && ld.interest.trim() !== "") {
            const iv = parseFormNumber(ld.interest);
            if (iv == null || iv < 0) {
              throw new Error(
                `Payment #${seq}: interest must be a valid non-negative number.`,
              );
            }
            interest = iv;
          }
          parsedLines.push({ seq, principal, interest });
        }
        const first = parsedLines[0];
        const body: InstallmentCreateBody = {
          name: form.name.trim(),
          installment_current:
            parseFormNumber(form.installment_current) ?? NaN,
          installment_total: total,
          principal: first.principal,
          interest: first.interest,
          payment_total: first.principal + (first.interest ?? 0),
          start_date: sd,
          finish_date: fd,
          remaining: null,
          original_total: null,
          credit_card_id: linkToCard && cardId != null ? cardId : null,
        };
        const created = await createInstallment(body);
        const fresh = await updateInstallmentLinesBulk(
          created.installment.id,
          parsedLines,
        );
        setAddModalOpen(false);
        setForm(emptyForm);
        setLinkToCard(false);
        setLineDrafts({});
        upsertRow(fresh.installment);
      } else {
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
          installment_current:
            parseFormNumber(form.installment_current) ?? NaN,
          installment_total: total,
          principal: principalVal,
          interest: interestVal,
          payment_total: paymentTotal,
          start_date: sd,
          finish_date: fd,
          remaining:
            form.remaining.trim() === ""
              ? null
              : parseFormNumber(form.remaining),
          original_total:
            form.original_total.trim() === ""
              ? null
              : parseFormNumber(form.original_total),
          credit_card_id: linkToCard && cardId != null ? cardId : null,
        };
        // The replace endpoint already returns the full detail (header +
        // lines), so one request refreshes both the schedule modal and the
        // plans list — no follow-up GET needed.
        const fresh = await updateInstallment(scheduleModalId, body);
        setForm(formFromRow(fresh.installment));
        setLinkToCard(fresh.installment.credit_card_id != null);
        setDetail(fresh);
        upsertRow(fresh.installment);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
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
      if (scheduleModalId === id) closeScheduleModal();
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
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="Installments"
        description={
          <>
            Track scheduled installment plans and record payments as they&apos;re made.
          </>
        }
        actions={
          <>
            {doneRows.length > 0 && (
              <button
                type="button"
                className={
                  showArchived
                    ? TOGGLE_ACTIVE_BUTTON_CLASSES
                    : TOGGLE_INACTIVE_BUTTON_CLASSES
                }
                onClick={() => setShowArchived((v) => !v)}
              >
                Archived ({doneRows.length})
              </button>
            )}
            <button
              type="button"
              disabled={loading || rows.length === 0}
              className={ACTION_BUTTON_CLASSES}
              onClick={() => void openPayments()}
            >
              Payments by month
            </button>
          </>
        }
      />

      {error && (
        <div className={ERROR_ALERT_CLASSES} role="alert">
          {error}
        </div>
      )}

      {!loading && (
        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Total (active plans)"
            value={fmtMoney(summary.sum_original_total)}
            icon={<LayersIcon className="size-5" />}
            tone="brand"
          />
          <StatCard
            label="Remaining"
            value={fmtMoney(summary.sum_remaining)}
            icon={<WalletIcon className="size-5" />}
            tone="warning"
          />
          <StatCard
            label="Due this month"
            value={fmtMoney(summary.due_this_month)}
            icon={<CalendarIcon className="size-5" />}
            tone="success"
          />
        </section>
      )}

      <Modal
        open={addModalOpen}
        onClose={closeAddModal}
        ariaLabelledBy="installment-add-title"
        dialogClassName="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-pop"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2
            id="installment-add-title"
            className="text-lg font-semibold text-ink"
          >
            Add installment
          </h2>
          <button
            type="button"
            className={CLOSE_BUTTON_CLASSES}
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
          {draftTotal > 0 && (
            <div className="sm:col-span-2">
              <p className="mb-2 text-sm font-medium text-ink-2">
                Per-payment amounts ({draftTotal} row{draftTotal === 1 ? "" : "s"})
              </p>
              <div className={`${TABLE_WRAPPER_CLASSES} max-h-64 overflow-x-auto overflow-y-auto`}>
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead className="sticky top-0 bg-surface-2">
                    <tr className={TABLE_HEAD_ROW_CLASSES}>
                      <th className={TABLE_HEAD_CELL_CLASSES}>#</th>
                      <th className={TABLE_HEAD_CELL_CLASSES}>Due</th>
                      <th className={TABLE_HEAD_CELL_CLASSES}>Principal</th>
                      <th className={TABLE_HEAD_CELL_CLASSES}>Interest</th>
                      <th className={TABLE_HEAD_CELL_CLASSES}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: draftTotal }, (_, i) => i + 1).map(
                      (seq) => {
                        const ld = lineDrafts[seq] ?? {
                          principal: "",
                          interest: "",
                        };
                        const sdApi = monthToApiDate(form.start_date);
                        const due = sdApi
                          ? dueMonthForSeq(sdApi, seq)
                          : new Date(NaN);
                        const p = parseFormNumber(ld.principal);
                        const iRaw =
                          ld.interest.trim() !== ""
                            ? parseFormNumber(ld.interest)
                            : 0;
                        const rowTotal = (p ?? 0) + (iRaw ?? 0);
                        return (
                          <tr
                            key={seq}
                            className={TABLE_ROW_CLASSES}
                          >
                            <td className={`${TABLE_CELL_CLASSES} font-mono`}>
                              {seq}
                            </td>
                            <td className={TABLE_CELL_CLASSES}>
                              {fmtMonthYearFromDate(due)}
                            </td>
                            <td className={TABLE_CELL_CLASSES}>
                              <AmountInput
                                required
                                className="w-24"
                                value={ld.principal}
                                onChange={(v) =>
                                  setLineDrafts((prev) => ({
                                    ...prev,
                                    [seq]: {
                                      principal: v,
                                      interest: prev[seq]?.interest ?? "",
                                    },
                                  }))
                                }
                                disabled={saving}
                              />
                            </td>
                            <td className={TABLE_CELL_CLASSES}>
                              <AmountInput
                                className="w-24"
                                value={ld.interest}
                                onChange={(v) =>
                                  setLineDrafts((prev) => ({
                                    ...prev,
                                    [seq]: {
                                      principal: prev[seq]?.principal ?? "",
                                      interest: v,
                                    },
                                  }))
                                }
                                disabled={saving}
                              />
                            </td>
                            <td className={TABLE_CELL_CLASSES}>
                              {fmtMoney(rowTotal)}
                            </td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-ink-2">
                Sum: principal {fmtMoney(draftSums.principal)} + interest{" "}
                {fmtMoney(draftSums.interest)} = {fmtMoney(draftSums.total)}
              </p>
            </div>
          )}
          {cardId != null && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={linkToCard}
                onChange={(e) => setLinkToCard(e.target.checked)}
                disabled={saving}
              />
              <span className="text-ink-2">On my credit card</span>
            </label>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className={PRIMARY_BUTTON_CLASSES}
            >
              {saving ? "Saving…" : "Add"}
            </button>
            <button
              type="button"
              disabled={saving}
              className={SECONDARY_BUTTON_CLASSES}
              onClick={closeAddModal}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <section>
        <h2 className="text-lg font-medium text-ink">
          Plans
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {!loading && (
            <li>
              <button
                type="button"
                onClick={() => {
                  setForm(emptyForm);
                  setLineDrafts({});
                  setAddModalOpen(true);
                }}
                className="flex min-h-[8rem] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong p-3 text-center text-sm text-ink-3 transition-colors duration-150 hover:border-brand hover:text-brand sm:p-4"
              >
                <span className="text-lg font-medium">+</span>
                <span className="font-medium">Add installment</span>
              </button>
            </li>
          )}
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
                  className={`min-w-0 cursor-pointer rounded-lg border p-3 transition-colors duration-150 hover:ring-2 hover:ring-indigo-300/60 sm:p-4 dark:hover:ring-indigo-700/50 ${
                    due
                      ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
                      : "border-line bg-surface"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-ink sm:text-base">
                        {r.name}
                      </h3>
                      <p className="mt-1 text-xs text-ink-2 sm:text-sm">
                        Installment{" "}
                        <span className="font-mono font-medium tabular-nums">
                          {nn}
                        </span>
                        {due && (
                          <span className="ml-2 rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
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
                          className={PRIMARY_BUTTON_CLASSES}
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
                        className={DELETE_BUTTON_CLASSES}
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
                      <dt className="text-xs text-ink-3">Principal</dt>
                      <dd className="tabular-nums font-medium">{fmtMoney(r.principal)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">Interest</dt>
                      <dd className="tabular-nums font-medium">
                        {r.interest != null ? fmtMoney(r.interest) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">Total (per payment)</dt>
                      <dd className="tabular-nums font-medium">
                        {fmtMoney(r.payment_total)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">Next due</dt>
                      <dd className="text-ink">
                        {r.installment_current <= r.installment_total
                          ? fmtMonthYearFromDate(nextDueDate(r))
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">Start</dt>
                      <dd className="tabular-nums">{fmtMonthYear(r.start_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">Finish</dt>
                      <dd className="tabular-nums">{fmtMonthYear(r.finish_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">Original total</dt>
                      <dd className="tabular-nums">{fmtMoney(r.original_total)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">Remaining</dt>
                      <dd className="tabular-nums font-semibold text-amber-800 dark:text-amber-200">
                        {fmtMoney(r.remaining)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-[width] dark:bg-indigo-600"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-ink-2">
                    {fmtPct2(pct)}% of schedule
                  </p>
                </li>
              );
            })}
          {!loading && activeRows.length === 0 && (
            <li className={`col-span-full ${DASHED_EMPTY_CLASSES}`}>
              {doneRows.length > 0 ? "All plans are fully paid." : "No installment plans yet."}
            </li>
          )}
        </ul>
      </section>

      {showArchived && doneRows.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-ink-3">
            Archived — Fully Paid
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
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
                  className="min-w-0 cursor-pointer rounded-lg border border-line bg-surface-2 p-3 opacity-70 transition-colors duration-150 hover:opacity-100 hover:ring-2 hover:ring-indigo-300/60 sm:p-4 dark:hover:ring-indigo-700/50"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-ink sm:text-base">
                        {r.name}
                      </h3>
                      <p className="mt-1 text-xs text-ink-3 sm:text-sm">
                        {r.installment_total}/{r.installment_total} payments ·{" "}
                        <span className="rounded-md bg-zinc-300 px-2 py-0.5 text-xs font-medium text-ink-2 dark:bg-zinc-700">
                          Paid off
                        </span>
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        className={DELETE_BUTTON_CLASSES}
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
                      <dt className="text-xs text-ink-3">Principal</dt>
                      <dd className="tabular-nums font-medium">{fmtMoney(r.principal)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">Interest</dt>
                      <dd className="tabular-nums font-medium">
                        {r.interest != null ? fmtMoney(r.interest) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">Total (per payment)</dt>
                      <dd className="tabular-nums font-medium">
                        {fmtMoney(r.payment_total)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">Original total</dt>
                      <dd className="tabular-nums">{fmtMoney(r.original_total)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">Start</dt>
                      <dd className="tabular-nums">{fmtMonthYear(r.start_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-3">Finish</dt>
                      <dd className="tabular-nums">{fmtMonthYear(r.finish_date)}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-zinc-400 transition-[width] dark:bg-zinc-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-ink-3">
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
        dialogClassName="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
      >
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-line px-4 py-3">
              <h2
                id="schedule-title"
                className="text-lg font-semibold text-ink"
              >
                {form.name.trim() || "Edit installment"}
              </h2>
              <button
                type="button"
                className={CLOSE_BUTTON_CLASSES}
                onClick={closeScheduleModal}
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <form
                onSubmit={submitCreate}
                className="grid gap-4 border-b border-line pb-5 sm:grid-cols-2"
              >
                <InstallmentFieldGrid
                  form={form}
                  setForm={setForm}
                  saving={saving}
                />
                {cardId != null && (
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={linkToCard}
                      onChange={(e) => setLinkToCard(e.target.checked)}
                      disabled={saving}
                    />
                    <span className="text-ink-2">
                      On my credit card
                    </span>
                  </label>
                )}
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className={PRIMARY_BUTTON_CLASSES}
                  >
                    {saving ? "Saving…" : "Update"}
                  </button>
                </div>
              </form>
              <div className="mt-5">
              {detailLoading && (
                <p className={LOADING_TEXT_CLASSES}>Loading schedule…</p>
              )}
              {!detailLoading && detail && detail.lines.length === 0 && (
                <p className="text-sm text-ink">
                  No monthly rows yet.
                </p>
              )}
              {!detailLoading && detail && detail.lines.length > 0 && (
                <div>
                <p className="mb-3 text-xs text-ink-2">
                  Drag a row to reorder payments. Due dates follow the new row order after you save.
                </p>
                <div className={`${TABLE_WRAPPER_CLASSES} overflow-x-auto`}>
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead>
                    <tr className={TABLE_HEAD_ROW_CLASSES}>
                      <th className={TABLE_HEAD_CELL_CLASSES}>#</th>
                      <th className={TABLE_HEAD_CELL_CLASSES}>Due</th>
                      <th className={TABLE_HEAD_CELL_CLASSES}>Principal</th>
                      <th className={TABLE_HEAD_CELL_CLASSES}>Interest</th>
                      <th className={TABLE_HEAD_CELL_CLASSES}>Total</th>
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
                          className={`cursor-grab active:cursor-grabbing ${TABLE_ROW_CLASSES} ${
                            isNext
                              ? "bg-indigo-50/80 hover:bg-indigo-50/80 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/30"
                              : ""
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
                          <td className={`${TABLE_CELL_CLASSES} font-mono`}>
                            {visPos}
                            {isNext && (
                              <span className="ml-1 text-[10px] font-sans text-indigo-600 dark:text-indigo-300">
                                (next)
                              </span>
                            )}
                          </td>
                          <td className={TABLE_CELL_CLASSES}>
                            {fmtMonthYearFromDate(
                              dueMonthForSeq(
                                detail.installment.start_date,
                                visPos,
                              ),
                            )}
                          </td>
                          <td className={`${TABLE_CELL_CLASSES} cursor-auto`}>
                            <AmountInput
                              draggable={false}
                              className="w-28 cursor-text"
                              value={ed?.principal ?? String(ln.principal)}
                              onChange={(v) =>
                                setLineEdits((prev) => ({
                                  ...prev,
                                  [ln.id]: {
                                    principal: v,
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
                          <td className={`${TABLE_CELL_CLASSES} cursor-auto`}>
                            <AmountInput
                              draggable={false}
                              className="w-24 cursor-text"
                              value={
                                ed?.interest ??
                                (ln.interest != null ? String(ln.interest) : "")
                              }
                              onChange={(v) =>
                                setLineEdits((prev) => ({
                                  ...prev,
                                  [ln.id]: {
                                    principal:
                                      prev[ln.id]?.principal ??
                                      String(ln.principal),
                                    interest: v,
                                  },
                                }))
                              }
                            />
                          </td>
                          <td className={TABLE_CELL_CLASSES}>
                            {fmtMoney(rowTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                </div>
              )}
              </div>
            </div>
            {!detailLoading && detail && detail.lines.length > 0 && (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-4 py-3">
                <button
                  type="button"
                  disabled={savingSchedule || !scheduleHasChanges}
                  className={PRIMARY_BUTTON_CLASSES}
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
        dialogClassName="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-line px-4 py-3">
          <h2
            id="payments-title"
            className="text-lg font-semibold text-ink"
          >
            Payments by month
          </h2>
          <button
            type="button"
            className={CLOSE_BUTTON_CLASSES}
            onClick={closePayments}
          >
            Close
          </button>
        </div>

        {!paymentsLoading && (
          <div className="grid shrink-0 grid-cols-3 gap-2 border-b border-line px-4 py-3 text-center">
            <div>
              <p className="text-[11px] font-medium uppercase text-ink-3">Done</p>
              <p className={`mt-0.5 text-base ${AMOUNT_POSITIVE_CLASSES}`}>
                {fmtMoney(paymentsByMonth.grandDone)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase text-ink-3">
                To be made
              </p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                {fmtMoney(paymentsByMonth.grandToPay)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase text-ink-3">Total</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-ink">
                {fmtMoney(paymentsByMonth.grandTotal)}
              </p>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {paymentsLoading && (
            <p className={LOADING_TEXT_CLASSES}>Loading payments…</p>
          )}
          {!paymentsLoading && paymentsByMonth.years.length === 0 && (
            <p className="text-sm text-ink">
              No scheduled payments.
            </p>
          )}
          {!paymentsLoading && paymentsByMonth.years.length > 0 && (
            <div className="flex flex-col gap-6">
              {paymentsByMonth.years.map((year) => (
                <div key={year}>
                  <h3 className="mb-2 text-sm font-semibold tabular-nums text-ink">
                    {year}
                  </h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {MONTH_NAMES_SHORT.map((abbr, m) => {
                      const g = paymentsByMonth.map.get(year * 12 + m);
                      if (!g) {
                        return (
                          <div
                            key={m}
                            className="flex min-h-[5rem] flex-col rounded-lg border border-dashed border-line px-2 py-2 text-ink-4"
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
                            <span className="text-xs font-semibold text-ink-2">
                              {abbr}
                            </span>
                            <span className="text-xs font-semibold tabular-nums text-ink">
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
                                <span className="shrink-0 tabular-nums text-ink-2">
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
    </div>
  );
}
