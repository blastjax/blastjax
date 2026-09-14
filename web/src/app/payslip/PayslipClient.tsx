"use client";

import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiFetch,
  companyColumnFlags,
  createPayslip,
  deletePayslip,
  getCompanies,
  getPayslips,
  payslipPdfUrl,
  updatePayslip,
  type CompanyRow,
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
  loadPayslipDefaultsBundle,
  payslipDefaultsFormForSlotHalf,
  PAYSLIP_DEFAULTS_SAVED_EVENT,
  refreshPayslipDefaultsBundle,
  tryParseFormStateJson,
  type FormState,
  type PayslipDefaultsBundle,
} from "./payslipModalForm";
import type { Nav } from "./payslipNav";
import { PayslipClientModal } from "./PayslipClientModal";
import { PayslipYearStatsSection } from "./PayslipYearStatsSection";
import { YearPayslipBlock } from "./YearPayslipBlock";
import { Modal } from "@/components/Modal";
import {
  ACTION_BUTTON_CLASSES,
  CARD_CLASSES,
  CLOSE_BUTTON_CLASSES,
  DELETE_BUTTON_CLASSES,
  DETAIL_BUTTON_CLASSES,
  EDIT_BUTTON_CLASSES,
  ERROR_ALERT_CLASSES,
  ICON_BUTTON_CLASSES,
  PAGE_CONTAINER_CLASSES,
} from "@/lib/ui";
import { PdfBulkUploadClient } from "./pdfs/PdfBulkUploadClient";

/** localStorage key for the show/hide-gross toggle on the calendar. */
const LS_PAYSLIP_SHOW_GROSS = "blastjax:payslip:showGross";

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

export default function PayslipClient({ company = "Sophos" }: { company?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PayslipRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nav, setNav] = useState<Nav | null>(null);
  const [modalForm, setModalForm] = useState<FormState>(emptyForm());
  const [showGross, setShowGross] = useState(true);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  // Bulk/less-common actions tucked behind one toggle instead of competing
  // with the page's actual content for attention (same pattern as Lotto).
  const [showDataTools, setShowDataTools] = useState(false);
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
      const r = await getPayslips(2000, company);
      setRows(r.payslips);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payslips");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [company]);

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

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    getCompanies()
      .then((r) => setCompanies(r.companies))
      .catch(() => {
        /* the company select just falls back to showing the row's own
         * value (see PayslipFormFields) if this never loads */
      });
  }, []);

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

  const openSlot = (year: number, month: number, half: 1 | 2) => {
    const items = rowsForSlot(rows, year, month, half);
    if (items.length === 0) {
      setNav({ screen: "add", year, month, half });
    } else {
      setNav({ screen: "detail", row: items[0] });
    }
  };

  /** Data tools' "+ Add payslip" — opens the add modal without a calendar
   * slot to anchor it to, so period year/month/half start editable (today's
   * date is just a starting point, not a lock). */
  const openAddPayslipFreeform = () => {
    const today = new Date();
    const half: 1 | 2 = today.getDate() <= 15 ? 1 : 2;
    setNav({
      screen: "add",
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      half,
      freeform: true,
    });
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
      // The period fields are editable when the modal was opened freeform
      // (Data tools), so what actually gets saved can differ from the slot
      // the modal was opened for — check for a collision, and navigate back,
      // against what's in the form rather than the original nav.
      const year = body.period_year ?? nav.year;
      const month = body.period_month ?? nav.month;
      const half = (body.period_half ?? nav.half) as 1 | 2;
      const existing = rowsForSlot(rows, year, month, half)[0];
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
      setNav({ screen: "detail", row: fresh });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  /** Prefill form for the "add" nav screen given a defaults bundle; `null` for any other screen. */
  const formForNavDefaults = useCallback(
    (n: Nav, b: PayslipDefaultsBundle): FormState | null => {
      if (n.screen === "add") {
        return initialAddPayslipForm(
          n.year,
          n.month,
          n.half,
          payslipDefaultsFormForSlotHalf(b, n.half),
          company,
        );
      }
      return null;
    },
    [company],
  );

  // Sync modal form when entering edit/add (restore session draft if present)
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
    } else {
      const f = formForNavDefaults(nav, loadPayslipDefaultsBundle(company));
      if (f) setModalForm(f);
    }
  }, [nav, formForNavDefaults, company]);

  // The in-memory defaults cache starts out as builtin fallback values until
  // this resolves — fetch once on mount and re-apply to an already-open
  // add modal so it doesn't stay stuck showing the fallback.
  useEffect(() => {
    void refreshPayslipDefaultsBundle(company).then((b) => {
      const n = navRef.current;
      if (!n) return;
      const f = formForNavDefaults(n, b);
      if (f) setModalForm(f);
    });
  }, [formForNavDefaults, company]);

  useEffect(() => {
    const onDefaultsSaved = () => {
      const n = navRef.current;
      if (!n || n.screen !== "add") return;
      const f = formForNavDefaults(n, loadPayslipDefaultsBundle(company));
      if (!f) return;
      clearPayslipModalDraft(n);
      setModalForm(f);
    };
    window.addEventListener(PAYSLIP_DEFAULTS_SAVED_EVENT, onDefaultsSaved);
    return () => {
      window.removeEventListener(
        PAYSLIP_DEFAULTS_SAVED_EVENT,
        onDefaultsSaved,
      );
    };
  }, [formForNavDefaults, company]);

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
  const flags = companyColumnFlags(companies, company);

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <header>
        <PageHeader
          title={`${company} Payslip`}
          description={
            <>
              Browse payslips by year and month, split by pay period.
            </>
          }
          actions={
            <button
              type="button"
              className={ACTION_BUTTON_CLASSES}
              aria-expanded={showDataTools}
              onClick={() => setShowDataTools((v) => !v)}
            >
              Data tools <span aria-hidden>{showDataTools ? "▴" : "▾"}</span>
            </button>
          }
        />

        {showDataTools && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={`${ACTION_BUTTON_CLASSES} px-3 py-1.5 text-sm`}
              onClick={openAddPayslipFreeform}
              title="Add a payslip for any year/month, without picking a calendar slot first"
            >
              + Add payslip
            </button>
          </div>
        )}
      </header>

      {error && (
        <div className={ERROR_ALERT_CLASSES} role="alert">
          {error}
        </div>
      )}

      <section className={CARD_CLASSES}>
        <div className="mb-8 flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium text-ink">
            Pay period calendar
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPdfModalOpen(true)}
              className={`flex h-9 items-center gap-1.5 ${ACTION_BUTTON_CLASSES}`}
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
              className={`${ICON_BUTTON_CLASSES} shrink-0 border-2 border-line-strong`}
            >
              {showGross ? <EyeIcon /> : <EyeOffIcon />}
            </button>
          </div>
        </div>

        {!loading && (
          <PayslipYearStatsSection index={index} flags={flags} />
        )}

        {!loading && (
          <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2">
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
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-zinc-50/80 px-3 py-2 text-sm dark:bg-zinc-900/50"
                >
                  <span className="tabular-nums text-ink">
                    #{r.id} · Total {fmtNum(r.total)}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={DETAIL_BUTTON_CLASSES}
                      onClick={() =>
                        setNav({ screen: "detail", row: r })
                      }
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      className={EDIT_BUTTON_CLASSES}
                      onClick={() => {
                        setModalForm(formFromRow(r));
                        setNav({ screen: "edit", row: r });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={DELETE_BUTTON_CLASSES}
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
          companies={companies}
          saving={saving}
          error={error}
          modalFormRef={modalFormRef}
          goBack={goBack}
          saveEdit={saveEdit}
          saveAddInModal={saveAddInModal}
          handleDelete={handleDelete}
          onPdfChange={setRowPdfFlag}
        />
      )}

      {pdfModalOpen && (
        <Modal
          open
          onClose={() => setPdfModalOpen(false)}
          backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-5 backdrop-blur-sm sm:items-center sm:p-6"
          dialogClassName="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-line bg-surface p-6 sm:p-8 shadow-pop"
        >
          <div className="mb-5 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink">
              Upload Payslip PDFs
            </h2>
            <button
              type="button"
              className={CLOSE_BUTTON_CLASSES}
              onClick={() => setPdfModalOpen(false)}
            >
              Close
            </button>
          </div>
          <PdfBulkUploadClient />
        </Modal>
      )}
    </div>
  );
}
