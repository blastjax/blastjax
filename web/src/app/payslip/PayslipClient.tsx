"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FloatingAddButton } from "@/components/FloatingAddButton";
import {
  apiFetch,
  createPayslip,
  deletePayslip,
  getPayslips,
  payslipPdfUrl,
  updatePayslip,
  type PayslipCreateBody,
  type PayslipRow,
} from "@/lib/api";
import {
  clearPayslipModalDraft,
  formFromRow,
  formToCreateBody,
  payslipDraftKeyEdit,
  stashPayslipModalDraft,
} from "./payslipDraft";
import {
  buildPayslipIndex,
  detailPayslipNeighbors,
  rowsForSlot,
  yearSlotsFromIndex,
} from "./payslipAggregates";
import { fmtNum } from "./payslipDisplay";
import {
  emptyForm,
  initialAddPayslipForm,
  initialManualPayslipForm,
  loadPayslipDefaultsBundle,
  payslipDefaultsFormForSlotHalf,
  PAYSLIP_DEFAULTS_SAVED_EVENT,
  tryParseFormStateJson,
  type FormState,
} from "./payslipModalForm";
import type { Nav } from "./payslipNav";
import { PayslipClientModal } from "./PayslipClientModal";
import { PayslipYearStatsSection } from "./PayslipYearStatsSection";
import { YearPayslipBlock } from "./YearPayslipBlock";
import { Modal } from "@/components/Modal";
import { CARD_CLASSES, ERROR_ALERT_CLASSES } from "@/lib/ui";
import { PdfBulkUploadClient } from "./pdfs/PdfBulkUploadClient";

/** localStorage key for the show/hide-gross toggle on the calendar. */
const LS_PAYSLIP_SHOW_GROSS = "budgetapp:payslip:showGross";

function PdfUploadIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M12 18v-6" />
      <path d="m9 15 3-3 3 3" />
    </svg>
  );
}

/** Outline eye icon (visible state). */
function EyeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Outline eye-with-slash icon (hidden state). */
function EyeOffIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export default function PayslipClient() {
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PayslipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nav, setNav] = useState<Nav | null>(null);
  const [modalForm, setModalForm] = useState<FormState>(emptyForm());
  const [showGross, setShowGross] = useState(true);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const modalFormRef = useRef(modalForm);
  modalFormRef.current = modalForm;
  const navRef = useRef(nav);
  navRef.current = nav;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_PAYSLIP_SHOW_GROSS);
      if (raw === "0" || raw === "false") setShowGross(false);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_PAYSLIP_SHOW_GROSS, showGross ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [showGross]);

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

  /**
   * Patch the in-memory ``rows`` list instead of re-fetching all 2000 rows
   * after every save. Updates keep their current array position; new rows
   * are prepended (matches the server's newest-first ordering for fresh
   * inserts). Callers should pass the row exactly as the server returned
   * it, including its server-set ``created_at``.
   */
  const upsertRow = useCallback((row: PayslipRow) => {
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

  /** Keep the in-memory row's `has_pdf` flag current after a PDF upload/remove. */
  const setRowPdfFlag = useCallback((id: number, hasPdf: boolean) => {
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, has_pdf: hasPdf } : r)),
    );
  }, []);

  const scheduledSlotFromBody = (
    body: PayslipCreateBody,
  ): { year: number; month: number; half: 1 | 2 } | null => {
    const { period_year: year, period_month: month, period_half: half } = body;
    if (
      year == null ||
      !Number.isFinite(year) ||
      month == null ||
      month < 1 ||
      month > 12 ||
      (half !== 1 && half !== 2)
    ) {
      return null;
    }
    return {
      year: Math.trunc(year),
      month: Math.trunc(month),
      half: half === 1 ? 1 : 2,
    };
  };

  const existingScheduledRowForBody = (body: PayslipCreateBody) => {
    const slot = scheduledSlotFromBody(body);
    if (!slot) return null;
    return rowsForSlot(rows, slot.year, slot.month, slot.half)[0] ?? null;
  };

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Warm each payslip's PDF (browser HTTP cache + backend Redis cache) as
   * soon as the list loads, so opening a payslip's detail modal later
   * doesn't wait on the first fetch. Fire-and-forget; dedup by id so
   * re-renders (e.g. `setRowPdfFlag`) don't re-warm the same PDF.
   */
  const warmedPdfIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    for (const row of rows) {
      if (!row.has_pdf || warmedPdfIdsRef.current.has(row.id)) continue;
      warmedPdfIdsRef.current.add(row.id);
      void apiFetch(payslipPdfUrl(row.id)).catch(() => {
        warmedPdfIdsRef.current.delete(row.id);
      });
    }
  }, [rows]);

  const saveManualAdd = async () => {
    if (nav?.screen !== "manual") return;
    setSaving(true);
    setError(null);
    try {
      const body = formToCreateBody(modalForm);
      const existing = existingScheduledRowForBody(body);
      if (existing) {
        const updated = await updatePayslip(existing.id, body);
        upsertRow(updated);
        clearPayslipModalDraft(nav);
        setNav({ screen: "detail", row: updated });
        return;
      }
      const fresh = await createPayslip(body);
      upsertRow(fresh);
      clearPayslipModalDraft(nav);
      setNav(null);
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

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this payslip row?")) return;
    setSaving(true);
    setError(null);
    try {
      await deletePayslip(id);
      removeRow(id);
      setNav((n) => {
        if (n?.screen === "detail" && n.row.id === id) return null;
        if (n?.screen === "edit" && n.row.id === id) return null;
        return n;
      });
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
      const updated = await updatePayslip(id, formToCreateBody(modalForm));
      upsertRow(updated);
      clearPayslipModalDraft(nav);
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
      const body = formToCreateBody(modalForm);
      const existing = rowsForSlot(rows, nav.year, nav.month, nav.half)[0];
      if (existing) {
        const updated = await updatePayslip(existing.id, body);
        upsertRow(updated);
        clearPayslipModalDraft(nav);
        setNav({ screen: "detail", row: updated });
        return;
      }
      const fresh = await createPayslip(body);
      upsertRow(fresh);
      clearPayslipModalDraft(nav);
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

  const index = useMemo(() => buildPayslipIndex(rows), [rows]);
  const years = index.years;
  const unsorted = index.unscheduled;

  return (
    <div className="box-border flex w-full min-w-0 flex-col gap-12 px-4 pb-28 pt-10 sm:px-6 lg:px-8">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Payslip
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Browse payslips by year and month, split by pay period.
        </p>
      </header>

      {error && (
        <div className={ERROR_ALERT_CLASSES} role="alert">
          {error}
        </div>
      )}

      <section className={CARD_CLASSES}>
        <div className="mb-8 flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
            Pay period calendar
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPdfModalOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <PdfUploadIcon className="h-4 w-4" />
              Upload PDFs
            </button>
            <button
              type="button"
              onClick={() => setShowGross((v) => !v)}
              aria-pressed={showGross}
              aria-label={
                showGross
                  ? "Hide gross amounts in calendar"
                  : "Show gross amounts in calendar"
              }
              title={
                showGross
                  ? "Hide gross amounts in calendar"
                  : "Show gross amounts in calendar"
              }
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {showGross ? <EyeIcon /> : <EyeOffIcon />}
            </button>
          </div>
        </div>

        {!loading && <PayslipYearStatsSection index={index} />}

        {!loading && (
          <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {years.map((year) => (
              <div key={year} className="min-w-0">
                <YearPayslipBlock
                  year={year}
                  yearSlots={yearSlotsFromIndex(index, year)}
                  saving={saving}
                  showGross={showGross}
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
                      className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs hover:bg-white dark:border-zinc-600 sm:px-3 sm:text-sm dark:hover:bg-zinc-800"
                      onClick={() =>
                        setNav({ screen: "detail", row: r })
                      }
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs hover:bg-white dark:border-zinc-600 sm:px-3 sm:text-sm dark:hover:bg-zinc-800"
                      onClick={() => {
                        setModalForm(formFromRow(r));
                        setNav({ screen: "edit", row: r });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-red-200 px-2 py-1.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 sm:px-3 sm:text-sm dark:hover:bg-red-950/40"
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
        <PayslipClientModal
          nav={nav}
          setNav={setNav}
          rows={rows}
          modalForm={modalForm}
          setModalForm={setModalForm}
          saving={saving}
          error={error}
          modalFormRef={modalFormRef}
          goBack={goBack}
          saveEdit={saveEdit}
          saveAddInModal={saveAddInModal}
          saveManualAdd={saveManualAdd}
          handleDelete={handleDelete}
          onPdfChange={setRowPdfFlag}
        />
      )}

      {pdfModalOpen && (
        <Modal
          open
          onClose={() => setPdfModalOpen(false)}
          backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-5 sm:items-center sm:p-6"
          dialogClassName="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl sm:p-8 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="mb-5 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Upload Payslip PDFs
            </h2>
            <button
              type="button"
              className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
              onClick={() => setPdfModalOpen(false)}
            >
              Close
            </button>
          </div>
          <PdfBulkUploadClient />
        </Modal>
      )}

      <FloatingAddButton
        hidden={!!nav}
        onClick={() => setNav({ screen: "manual" })}
      />
    </div>
  );
}
