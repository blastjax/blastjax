"use client";

import { AmountInput } from "@/components/AmountInput";
import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import {
  DANGER_TEXT_BUTTON_CLASSES,
  DIALOG_BODY_CLASSES,
  DIALOG_CLASSES,
  DIALOG_FOOTER_CLASSES,
  LoadingBlocks,
  Metric,
  Meter,
  ModalHeader,
  Pill,
  StatStrip,
  TEXT_BUTTON_CLASSES,
} from "@/components/FinanceUI";
import { CheckIcon, ChevronDownIcon, PlusIcon } from "@/components/Icons";
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
import { fmtAmountOrDash } from "@/lib/formatNumber";
import {
  ADD_BUTTON_CLASSES,
  EDIT_BUTTON_CLASSES,
  ERROR_ALERT_CLASSES,
  PAGE_CONTAINER_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
  SEGMENTED_BUTTON_ACTIVE_CLASSES,
  SEGMENTED_BUTTON_CLASSES,
  SEGMENTED_BUTTON_INACTIVE_CLASSES,
  SEGMENTED_WRAPPER_CLASSES,
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
  const [detailTab, setDetailTab] = useState<"schedule" | "details">("schedule");
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
    setDetailTab("schedule");
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
  const now = new Date();
  const currentMonthKey = now.getFullYear() * 12 + now.getMonth();
  const doneTotal = doneRows.reduce((s, r) => s + (r.original_total || 0), 0);

  /** Payment #1's amounts copied onto every row of the Add form's schedule. */
  const copyFirstRowToAll = () => {
    const first = lineDrafts[1];
    if (!first) return;
    setLineDrafts(
      Object.fromEntries(Array.from({ length: draftTotal }, (_, i) => [i + 1, { ...first }])),
    );
  };

  const openAdd = () => {
    setError(null);
    setForm(emptyForm);
    setLinkToCard(false);
    setLineDrafts({});
    setAddModalOpen(true);
  };

  const anyModalOpen = addModalOpen || scheduleModalId != null || paymentsModalOpen;

  const errorBox = error && (
    <div className={`sm:col-span-2 ${ERROR_ALERT_CLASSES}`} role="alert">
      {error}
    </div>
  );

  const linkToCardToggle = cardId != null && (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5 transition-colors duration-150 hover:bg-surface-2/60 sm:col-span-2">
      <input
        type="checkbox"
        className="mt-0.5 size-4"
        checked={linkToCard}
        onChange={(e) => setLinkToCard(e.target.checked)}
        disabled={saving}
      />
      <span className="text-sm">
        <span className="block font-medium text-ink">Charged to my credit card</span>
        <span className="text-ink-3">Counts toward the card&apos;s monthly dues.</span>
      </span>
    </label>
  );

  const deletePlanButton = scheduleModalId != null && (
    <button
      type="button"
      disabled={saving}
      className={DANGER_TEXT_BUTTON_CLASSES}
      onClick={() => void onDelete(scheduleModalId)}
    >
      Delete plan
    </button>
  );

  const TH = "px-3 py-2.5 text-left text-xs font-medium text-ink-3";
  const TD = "px-3 py-2 text-sm tabular-nums text-ink-2";

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="Installments"
        description="Payment plans, what's due this month, and what's left to pay."
        actions={
          <>
            <button
              type="button"
              disabled={loading || rows.length === 0}
              className={SECONDARY_BUTTON_CLASSES}
              onClick={() => void openPayments()}
            >
              Payment calendar
            </button>
            <button type="button" className={PRIMARY_BUTTON_CLASSES} onClick={openAdd}>
              <PlusIcon className="size-4" />
              Add plan
            </button>
          </>
        }
      />

      {!anyModalOpen && errorBox}

      {loading ? (
        <LoadingBlocks label="Loading installments…" />
      ) : (
        <>
          <StatStrip className="grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Due this month"
              value={fmtMoney(summary.due_this_month)}
              hint={`${dueIds.size} plan${dueIds.size === 1 ? "" : "s"} due`}
              tone="brand"
              size="lg"
            />
            <Metric label="Left to pay" value={fmtMoney(summary.sum_remaining)} hint="Across active plans" />
            <Metric label="Active plans total" value={fmtMoney(summary.sum_original_total)} hint="Original amounts" />
            <Metric label="Active plans" value={activeRows.length} hint={`${doneRows.length} paid off`} />
          </StatStrip>

          {activeRows.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
              <p className="font-medium text-ink">
                {doneRows.length > 0 ? "Everything is paid off." : "No installment plans yet"}
              </p>
              <p className="mt-1 text-sm text-ink-3">Add a plan to track its payments month by month.</p>
              <button type="button" className={`mt-4 ${PRIMARY_BUTTON_CLASSES}`} onClick={openAdd}>
                <PlusIcon className="size-4" />
                Add plan
              </button>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {activeRows.map((r) => {
                const due = dueIds.has(r.id);
                const paid = Math.max(0, Math.min(r.installment_current - 1, r.installment_total));
                return (
                  <li key={r.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => void openDetail(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void openDetail(r.id);
                        }
                      }}
                      className={`flex h-full cursor-pointer flex-col rounded-2xl border bg-surface p-5 shadow-xs transition duration-150 hover:shadow-md ${
                        due ? "border-brand/40" : "border-line hover:border-line-strong"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-ink">{r.name}</h3>
                          <p className="mt-0.5 text-xs text-ink-3">
                            Next due {fmtMonthYearFromDate(nextDueDate(r))}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                          {r.credit_card_id != null && <Pill>Card</Pill>}
                          {due && <Pill tone="brand">Due this month</Pill>}
                        </div>
                      </div>
                      <p className="mt-4 flex items-baseline gap-1.5">
                        <span className="text-2xl font-semibold tabular-nums tracking-tight text-ink">
                          {fmtMoney(r.due_payment ?? r.payment_total)}
                        </span>
                        <span className="text-sm text-ink-3">/ month</span>
                      </p>
                      <div className="mt-4">
                        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                          <span className="text-ink-3">
                            {paid} of {r.installment_total} paid
                          </span>
                          <span className="font-medium tabular-nums text-ink-2">{fmtMoney(r.remaining)} left</span>
                        </div>
                        <Meter value={installmentScheduleProgressPct(r) / 100} label={`${r.name} progress`} />
                      </div>
                      <div className="mt-auto pt-5">
                        <div className="flex items-center justify-between gap-2 border-t border-line-soft pt-3">
                          <span className="truncate text-xs text-ink-4">Ends {fmtMonthYear(r.finish_date)}</span>
                          <button
                            type="button"
                            disabled={saving}
                            className={due ? ADD_BUTTON_CLASSES : EDIT_BUTTON_CLASSES}
                            onClick={(e) => {
                              e.stopPropagation();
                              void onPay(r.id);
                            }}
                          >
                            <CheckIcon className="size-3.5" />
                            Mark #{r.installment_current} paid
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {doneRows.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
              <button
                type="button"
                aria-expanded={showArchived}
                onClick={() => setShowArchived((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors duration-150 hover:bg-surface-2/50 sm:px-6"
              >
                <span className="min-w-0">
                  <span className="font-semibold text-ink">Paid off</span>
                  <span className="ml-2 text-sm text-ink-3">
                    {doneRows.length} plan{doneRows.length === 1 ? "" : "s"} · {fmtMoney(doneTotal)}
                  </span>
                </span>
                <ChevronDownIcon
                  className={`size-5 shrink-0 text-ink-3 transition-transform duration-150 ${showArchived ? "rotate-180" : ""}`}
                />
              </button>
              {showArchived && (
                <ul className="divide-y divide-line-soft border-t border-line-soft">
                  {doneRows.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => void openDetail(r.id)}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors duration-150 hover:bg-surface-2/50 sm:px-6"
                      >
                        <CheckIcon className="size-4 shrink-0 text-success-text" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{r.name}</span>
                        <span className="hidden text-xs text-ink-3 sm:inline">
                          {r.installment_total} payments · ended {fmtMonthYear(r.finish_date)}
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-ink-2">
                          {fmtMoney(r.original_total)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <Modal
        open={addModalOpen}
        onClose={closeAddModal}
        ariaLabelledBy="installment-add-title"
        dialogClassName={`${DIALOG_CLASSES} max-w-3xl`}
      >
        <ModalHeader
          id="installment-add-title"
          title="New installment plan"
          subtitle="Each payment's amount is entered below, so they can differ month to month."
          onClose={closeAddModal}
        />
        <form onSubmit={submitCreate} className="flex min-h-0 flex-1 flex-col">
          <div className={`${DIALOG_BODY_CLASSES} grid gap-4 sm:grid-cols-2`}>
            <InstallmentFieldGrid form={form} setForm={setForm} saving={saving} hideAmounts />
            {linkToCardToggle}
            {draftTotal > 0 && (
              <div className="sm:col-span-2">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink-2">
                    Payment amounts <span className="font-normal text-ink-4">· {draftTotal} payments</span>
                  </p>
                  <button
                    type="button"
                    className={TEXT_BUTTON_CLASSES}
                    onClick={copyFirstRowToAll}
                    disabled={saving || !lineDrafts[1]?.principal}
                  >
                    Copy #1 to all rows
                  </button>
                </div>
                <div className="max-h-72 overflow-auto rounded-xl border border-line">
                  <table className="w-full min-w-[28rem]">
                    <thead className="sticky top-0 z-[1] bg-surface-2">
                      <tr>
                        <th className={TH}>#</th>
                        <th className={TH}>Due</th>
                        <th className={TH}>Principal</th>
                        <th className={TH}>Interest</th>
                        <th className={`${TH} text-right`}>Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-soft">
                      {Array.from({ length: draftTotal }, (_, i) => i + 1).map((seq) => {
                        const ld = lineDrafts[seq] ?? { principal: "", interest: "" };
                        const sdApi = monthToApiDate(form.start_date);
                        const due = sdApi ? dueMonthForSeq(sdApi, seq) : new Date(NaN);
                        const p = parseFormNumber(ld.principal);
                        const iRaw = ld.interest.trim() !== "" ? parseFormNumber(ld.interest) : 0;
                        const rowTotal = (p ?? 0) + (iRaw ?? 0);
                        return (
                          <tr key={seq}>
                            <td className={`${TD} font-mono text-ink-3`}>{seq}</td>
                            <td className={`${TD} whitespace-nowrap`}>{fmtMonthYearFromDate(due)}</td>
                            <td className={TD}>
                              <AmountInput
                                required
                                className="w-28"
                                value={ld.principal}
                                onChange={(v) =>
                                  setLineDrafts((prev) => ({
                                    ...prev,
                                    [seq]: { principal: v, interest: prev[seq]?.interest ?? "" },
                                  }))
                                }
                                disabled={saving}
                              />
                            </td>
                            <td className={TD}>
                              <AmountInput
                                className="w-24"
                                value={ld.interest}
                                onChange={(v) =>
                                  setLineDrafts((prev) => ({
                                    ...prev,
                                    [seq]: { principal: prev[seq]?.principal ?? "", interest: v },
                                  }))
                                }
                                disabled={saving}
                              />
                            </td>
                            <td className={`${TD} text-right font-medium text-ink`}>{fmtMoney(rowTotal)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-right text-xs tabular-nums text-ink-3">
                  Principal {fmtMoney(draftSums.principal)} + interest {fmtMoney(draftSums.interest)} ={" "}
                  <span className="font-semibold text-ink">{fmtMoney(draftSums.total)}</span>
                </p>
              </div>
            )}
            {errorBox}
          </div>
          <div className={DIALOG_FOOTER_CLASSES}>
            <button type="button" disabled={saving} className={SECONDARY_BUTTON_CLASSES} onClick={closeAddModal}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON_CLASSES}>
              {saving ? "Saving…" : "Create plan"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={scheduleModalId != null}
        onClose={closeScheduleModal}
        ariaLabelledBy="schedule-title"
        dialogClassName={`${DIALOG_CLASSES} max-w-3xl`}
      >
        <ModalHeader
          id="schedule-title"
          title={form.name.trim() || "Installment"}
          subtitle={
            detail
              ? detail.installment.installment_current > detail.installment.installment_total
                ? `All ${detail.installment.installment_total} payments made`
                : `Payment ${detail.installment.installment_current} of ${detail.installment.installment_total} next · ${fmtMoney(detail.installment.remaining)} left`
              : undefined
          }
          onClose={closeScheduleModal}
        />
        <div className="shrink-0 px-5 pt-4 sm:px-6">
          <div className={SEGMENTED_WRAPPER_CLASSES}>
            {(
              [
                ["schedule", "Schedule"],
                ["details", "Plan details"],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                aria-pressed={detailTab === tab}
                className={`${SEGMENTED_BUTTON_CLASSES} ${
                  detailTab === tab ? SEGMENTED_BUTTON_ACTIVE_CLASSES : SEGMENTED_BUTTON_INACTIVE_CLASSES
                }`}
                onClick={() => setDetailTab(tab)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {detailTab === "schedule" ? (
          <>
            <div className={`${DIALOG_BODY_CLASSES} space-y-3`}>
              {errorBox}
              {detailLoading && (
                <div className="h-56 animate-pulse rounded-xl bg-surface-2" role="status" aria-label="Loading schedule" />
              )}
              {!detailLoading && detail && detail.lines.length === 0 && (
                <p className="py-6 text-center text-sm text-ink-3">No payments scheduled.</p>
              )}
              {!detailLoading && detail && detail.lines.length > 0 && (
                <>
                  <p className="text-xs text-ink-3">
                    Edit amounts in place. Drag a row to reorder; due months follow the new order once saved.
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-line">
                    <table className="w-full min-w-[38rem]">
                      <thead className="bg-surface-2">
                        <tr>
                          <th className={TH}>#</th>
                          <th className={TH}>Due</th>
                          <th className={TH}>Principal</th>
                          <th className={TH}>Interest</th>
                          <th className={`${TH} text-right`}>Total</th>
                          <th className={`${TH} text-right`}>
                            <span className="sr-only">Status</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line-soft">
                        {orderedScheduleLines.map((ln, idx) => {
                          const ed = lineEdits[ln.id];
                          const visPos = idx + 1;
                          const p = ed ? (parseFormNumber(ed.principal) ?? NaN) : ln.principal;
                          const iRaw =
                            ed && ed.interest.trim() !== ""
                              ? (parseFormNumber(ed.interest) ?? NaN)
                              : ln.interest != null
                                ? ln.interest
                                : 0;
                          const rowTotal = (Number.isFinite(p) ? p : 0) + (Number.isFinite(iRaw) ? iRaw : 0);
                          const isNext = ln.seq === detail.installment.installment_current;
                          const isPaid = ln.seq < detail.installment.installment_current;
                          return (
                            <tr
                              key={ln.id}
                              draggable
                              title="Drag to reorder"
                              className={`cursor-grab transition-colors duration-150 active:cursor-grabbing ${
                                isNext ? "bg-brand-soft" : "hover:bg-surface-2/50"
                              }`}
                              onDragStart={(e) => {
                                const el = e.target as HTMLElement | null;
                                if (!el || el.closest("input, textarea, button, select, option")) {
                                  e.preventDefault();
                                  return;
                                }
                                e.dataTransfer.setData("text/plain", String(ln.id));
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                const fromId = Number(e.dataTransfer.getData("text/plain"));
                                if (!Number.isFinite(fromId) || fromId === ln.id) return;
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
                              <td className={`${TD} whitespace-nowrap`}>
                                <span aria-hidden className="mr-2 select-none text-ink-4">
                                  ⠿
                                </span>
                                <span className="font-mono">{visPos}</span>
                              </td>
                              <td className={`${TD} whitespace-nowrap ${isPaid ? "text-ink-4" : ""}`}>
                                {fmtMonthYearFromDate(dueMonthForSeq(detail.installment.start_date, visPos))}
                              </td>
                              <td className={`${TD} cursor-auto`}>
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
                                          prev[ln.id]?.interest ?? (ln.interest != null ? String(ln.interest) : ""),
                                      },
                                    }))
                                  }
                                />
                              </td>
                              <td className={`${TD} cursor-auto`}>
                                <AmountInput
                                  draggable={false}
                                  className="w-24 cursor-text"
                                  value={ed?.interest ?? (ln.interest != null ? String(ln.interest) : "")}
                                  onChange={(v) =>
                                    setLineEdits((prev) => ({
                                      ...prev,
                                      [ln.id]: {
                                        principal: prev[ln.id]?.principal ?? String(ln.principal),
                                        interest: v,
                                      },
                                    }))
                                  }
                                />
                              </td>
                              <td className={`${TD} text-right font-medium text-ink`}>{fmtMoney(rowTotal)}</td>
                              <td className={`${TD} text-right`}>
                                {isPaid ? <Pill tone="success">Paid</Pill> : isNext ? <Pill tone="brand">Next</Pill> : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            <div className={DIALOG_FOOTER_CLASSES}>
              {deletePlanButton}
              <button
                type="button"
                disabled={savingSchedule || !scheduleHasChanges}
                className={PRIMARY_BUTTON_CLASSES}
                onClick={() => void saveScheduleEdits()}
              >
                {savingSchedule ? "Saving…" : "Save schedule"}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submitCreate} className="flex min-h-0 flex-1 flex-col">
            <div className={`${DIALOG_BODY_CLASSES} grid gap-4 sm:grid-cols-2`}>
              <InstallmentFieldGrid form={form} setForm={setForm} saving={saving} />
              {linkToCardToggle}
              {errorBox}
            </div>
            <div className={DIALOG_FOOTER_CLASSES}>
              {deletePlanButton}
              <button type="submit" disabled={saving} className={PRIMARY_BUTTON_CLASSES}>
                {saving ? "Saving…" : "Save details"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={paymentsModalOpen}
        onClose={closePayments}
        ariaLabelledBy="payments-title"
        dialogClassName={`${DIALOG_CLASSES} max-w-4xl`}
      >
        <ModalHeader
          id="payments-title"
          title="Payment calendar"
          subtitle="Every scheduled installment payment, by the month it's due."
          onClose={closePayments}
        />
        {!paymentsLoading && (
          <div className="grid shrink-0 grid-cols-3 divide-x divide-line border-b border-line">
            <div className="px-5 py-3 sm:px-6">
              <Metric size="sm" label="Paid" value={fmtMoney(paymentsByMonth.grandDone)} tone="success" />
            </div>
            <div className="px-5 py-3 sm:px-6">
              <Metric size="sm" label="Still to pay" value={fmtMoney(paymentsByMonth.grandToPay)} tone="warning" />
            </div>
            <div className="px-5 py-3 sm:px-6">
              <Metric size="sm" label="Total" value={fmtMoney(paymentsByMonth.grandTotal)} />
            </div>
          </div>
        )}
        <div className={DIALOG_BODY_CLASSES}>
          {paymentsLoading && (
            <div className="h-64 animate-pulse rounded-xl bg-surface-2" role="status" aria-label="Loading payments" />
          )}
          {!paymentsLoading && paymentsByMonth.years.length === 0 && (
            <p className="py-6 text-center text-sm text-ink-3">No scheduled payments.</p>
          )}
          {!paymentsLoading && paymentsByMonth.years.length > 0 && (
            <div className="flex flex-col gap-6">
              {paymentsByMonth.years.map((year) => (
                <section key={year}>
                  <h3 className="mb-2 text-sm font-semibold tabular-nums text-ink">{year}</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {MONTH_NAMES_SHORT.map((abbr, m) => {
                      const key = year * 12 + m;
                      const g = paymentsByMonth.map.get(key);
                      const isNow = key === currentMonthKey;
                      const ring = isNow ? "ring-2 ring-brand" : "";
                      const monthLabel = (
                        <span className="text-xs font-semibold text-ink-2">
                          {abbr}
                          {isNow && <span className="ml-1 font-medium text-brand-text">· Now</span>}
                        </span>
                      );
                      if (!g) {
                        return (
                          <div key={m} className={`rounded-xl border border-dashed border-line p-3 opacity-60 ${ring}`}>
                            {monthLabel}
                          </div>
                        );
                      }
                      const allDone = g.toPayTotal <= 0;
                      return (
                        <div
                          key={m}
                          className={`flex min-h-[5.5rem] flex-col rounded-xl border border-line p-3 ${
                            allDone ? "bg-surface-2/60" : "bg-surface"
                          } ${ring}`}
                        >
                          <div className="flex items-baseline justify-between gap-1">
                            {monthLabel}
                            <span className="text-xs font-semibold tabular-nums text-ink">{fmtMoney(g.subtotal)}</span>
                          </div>
                          <ul className="mt-2 flex flex-col gap-1">
                            {g.items.map((it) => (
                              <li
                                key={`${it.planId}-${it.seq}`}
                                className="flex items-center gap-1.5 text-[11px] leading-tight"
                                title={`${it.planName} #${it.seq} · ${it.paid ? "Paid" : "To pay"}`}
                              >
                                <span
                                  className={`size-1.5 shrink-0 rounded-full ${it.paid ? "bg-success" : "bg-warning"}`}
                                />
                                <span
                                  className={`min-w-0 flex-1 truncate ${it.paid ? "text-ink-4 line-through" : "text-ink-2"}`}
                                >
                                  {it.planName}
                                </span>
                                <span className="shrink-0 tabular-nums text-ink-3">{fmtMoney(it.amount)}</span>
                              </li>
                            ))}
                          </ul>
                          {allDone && <p className="mt-auto pt-2 text-[11px] font-medium text-success-text">All paid</p>}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
