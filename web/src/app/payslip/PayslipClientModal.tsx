"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { Modal } from "@/components/Modal";
import {
  apiFetch,
  companyColumnFlags,
  deletePayslipPdf,
  payslipPdfUrl,
  uploadPayslipPdf,
  type CompanyRow,
  type PayslipRow,
} from "@/lib/api";
import { PayslipFormFields } from "./PayslipFormFields";
import {
  clearPayslipModalDraft,
  formFromRow,
  stashPayslipModalDraft,
} from "./payslipDraft";
import {
  detailPayslipNeighbors,
  deductionsTotalFromRow,
  grossTotalFromRow,
  rowsForSlot,
} from "./payslipAggregates";
import { fmtNum, fmtPayPeriod, slotTitle } from "./payslipDisplay";
import type { FormState } from "./payslipModalForm";
import type { Nav } from "./payslipNav";
import {
  ACTION_BUTTON_CLASSES,
  CLOSE_BUTTON_CLASSES,
  DELETE_BUTTON_CLASSES,
  ERROR_ALERT_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
} from "@/lib/ui";

export function PayslipClientModal({
  nav,
  setNav,
  rows,
  modalForm,
  setModalForm,
  companies,
  saving,
  error,
  modalFormRef,
  goBack,
  saveEdit,
  saveAddInModal,
  handleDelete,
  onPdfChange,
}: {
  nav: Nav;
  setNav: Dispatch<SetStateAction<Nav | null>>;
  rows: PayslipRow[];
  modalForm: FormState;
  setModalForm: Dispatch<SetStateAction<FormState>>;
  companies: CompanyRow[];
  saving: boolean;
  error: string | null;
  modalFormRef: MutableRefObject<FormState>;
  goBack: () => void;
  saveEdit: () => void | Promise<void>;
  saveAddInModal: () => void | Promise<void>;
  handleDelete: (id: number) => void | Promise<void>;
  onPdfChange: (id: number, hasPdf: boolean) => void;
}) {
  const onCloseDialog = () => {
    if (nav.screen === "edit" || nav.screen === "add") {
      stashPayslipModalDraft(nav, modalFormRef.current);
    }
    setNav(null);
  };
  const flags = companyColumnFlags(companies, modalForm.company);
  return (
    <Modal
      open
      onClose={onCloseDialog}
      backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-5 backdrop-blur-sm sm:items-center sm:p-6"
      dialogClassName="max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-pop sm:p-8 lg:max-w-6xl"
    >
            {nav.screen === "detail" && (() => {
              const row = rows.find((r) => r.id === nav.row.id) ?? nav.row;
              const detailFlags = companyColumnFlags(companies, row.company);
              return (
              <>
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                    {(() => {
                      const { older, newer } = detailPayslipNeighbors(
                        rows,
                        row.id,
                      );
                      const btnCls =
                        "flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-md border border-line-strong bg-surface text-sm font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40";
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
                          <h2 className="min-w-0 text-lg font-semibold text-ink">
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
                    className={`shrink-0 ${CLOSE_BUTTON_CLASSES}`}
                    onClick={() => setNav(null)}
                  >
                    Close
                  </button>
                </div>
                <p className="mb-4 text-sm text-ink-2">
                  {fmtPayPeriod(
                    row.period_year,
                    row.period_month,
                    row.period_half,
                  )}
                </p>
                {(() => {
                  const y = row.period_year;
                  const m = row.period_month;
                  const h = row.period_half;
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
                      {detailFlags.show_total && (
                        <>
                          <div>
                            <dt className="text-xs text-ink-3">Gross total</dt>
                            <dd className="tabular-nums font-medium text-ink">
                              {fmtNum(grossTotalFromRow(row))}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-ink-3">Net total</dt>
                            <dd className="tabular-nums font-medium text-ink">
                              {fmtNum(row.total)}
                            </dd>
                          </div>
                        </>
                      )}
                      {detailFlags.show_basic_salary && (
                        <div>
                          <dt className="text-xs text-ink-3">Basic salary</dt>
                          <dd className="tabular-nums text-ink">
                            {fmtNum(row.basic_salary)}
                          </dd>
                        </div>
                      )}
                      {(
                        [
                          ["commission", "Commission"],
                          ["reimbursement", "Reimbursement"],
                          ["medical_reimbursement", "Medical reimbursement"],
                          ["others", "Others"],
                          ["allowances", "Allowances"],
                        ] as const
                      )
                      .filter(([k]) => k !== "commission" || row.period_half === 2)
                      .filter(([k]) => {
                        if (k === "commission") return detailFlags.show_commission;
                        if (k === "reimbursement") return detailFlags.show_reimbursement;
                        if (k === "medical_reimbursement") {
                          return detailFlags.show_medical_reimbursement;
                        }
                        if (k === "others") return detailFlags.show_others;
                        if (k === "allowances") return detailFlags.show_allowances;
                        return true;
                      })
                      .map(([k, lab]) => (
                        <div key={k}>
                          <dt className="text-xs text-ink-3">{lab}</dt>
                          <dd className="tabular-nums text-ink">
                            {fmtNum(row[k])}
                          </dd>
                        </div>
                      ))}
                      {detailFlags.show_thirteenth_month &&
                        row.period_month === 11 &&
                        row.period_half === 2 && (
                        <div>
                          <dt className="text-xs text-ink-3">13th Month</dt>
                          <dd className="tabular-nums text-ink">
                            {fmtNum(row.thirteenth_month)}
                          </dd>
                        </div>
                      )}
                    </dl>
                    {row.notes && (
                      <div className="mt-3">
                        <dt className="text-xs text-ink-3">Notes</dt>
                        <dd className="mt-1 whitespace-pre-wrap text-sm text-ink">
                          {row.notes}
                        </dd>
                      </div>
                    )}
                  </div>
                  <aside className="flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-zinc-50/90 p-4 dark:bg-zinc-900/50">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                      Deductions
                    </p>
                    <dl className="flex flex-col gap-3 text-sm">
                      {detailFlags.show_withholding_tax && (
                        <div>
                          <dt className="text-xs text-ink-3">
                            Withholding tax
                          </dt>
                          <dd className="tabular-nums text-red-600 dark:text-red-400">
                            {fmtNum(row.withholding_tax)}
                          </dd>
                        </div>
                      )}
                      {detailFlags.show_sss_contribution && (
                        <div>
                          <dt className="text-xs text-ink-3">
                            SSS contribution
                          </dt>
                          <dd className="tabular-nums text-red-600 dark:text-red-400">
                            {fmtNum(row.sss_contribution)}
                          </dd>
                        </div>
                      )}
                      {detailFlags.show_philhealth && (
                        <div>
                          <dt className="text-xs text-ink-3">Philhealth</dt>
                          <dd className="tabular-nums text-red-600 dark:text-red-400">
                            {fmtNum(row.philhealth)}
                          </dd>
                        </div>
                      )}
                      {detailFlags.show_pag_ibig && (
                        <div>
                          <dt className="text-xs text-ink-3">
                            Pag-ibig (Employee HDMF)
                          </dt>
                          <dd className="tabular-nums text-red-600 dark:text-red-400">
                            {fmtNum(row.pag_ibig)}
                          </dd>
                        </div>
                      )}
                      {detailFlags.show_mp2 && (
                        <div>
                          <dt className="text-xs text-ink-3">MP2</dt>
                          <dd className="tabular-nums text-red-600 dark:text-red-400">
                            {fmtNum(row.mp2)}
                          </dd>
                        </div>
                      )}
                      {detailFlags.show_trust_fund && (
                        <div>
                          <dt className="text-xs text-ink-3">Trust Fund</dt>
                          <dd className="tabular-nums text-red-600 dark:text-red-400">
                            {fmtNum(row.trust_fund)}
                          </dd>
                        </div>
                      )}
                      <div className="mt-1 border-t border-line pt-3 dark:border-zinc-600">
                        <dt className="text-xs font-semibold text-ink-2">
                          Deductions total
                        </dt>
                        <dd className="mt-0.5 text-sm font-semibold tabular-nums text-red-700 dark:text-red-300">
                          {fmtNum(deductionsTotalFromRow(row))}
                        </dd>
                      </div>
                    </dl>
                  </aside>
                </div>
                <PayslipPdfPanel
                  payslipId={row.id}
                  initialHasPdf={!!row.has_pdf}
                  onPdfChange={onPdfChange}
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className={PRIMARY_BUTTON_CLASSES}
                    onClick={() => {
                      setModalForm(formFromRow(row));
                      setNav({ screen: "edit", row });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={DELETE_BUTTON_CLASSES}
                    onClick={() => void handleDelete(row.id)}
                  >
                    Delete
                  </button>
                </div>
              </>
              );
            })()}

            {nav.screen === "edit" && (
              <>
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold leading-snug text-ink">
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
                              Edit · {slotTitle(y, m, h)}
                            </>
                          );
                        }
                        return "Edit payslip";
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
                        <p className="mt-1 text-sm font-normal text-ink-2">
                          {fmtPayPeriod(y, m, h)}
                        </p>
                      );
                    })()}
                  </div>
                  <button
                    type="button"
                    className={CLOSE_BUTTON_CLASSES}
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
                    companies={companies}
                    disabled={saving}
                    flags={flags}
                  />
                  {error && (
                    <p className={`mt-3 ${ERROR_ALERT_CLASSES}`} role="alert">
                      {error}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className={PRIMARY_BUTTON_CLASSES}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                    <button
                      type="button"
                      className={SECONDARY_BUTTON_CLASSES}
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
                  <h2 className="text-lg font-semibold text-ink">
                    {nav.freeform
                      ? "New payslip"
                      : `New · ${slotTitle(nav.year, nav.month, nav.half)}`}
                  </h2>
                  <button
                    type="button"
                    className={CLOSE_BUTTON_CLASSES}
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
                    companies={companies}
                    disabled={saving}
                    lockPeriod={!nav.freeform}
                    lockCompany
                    flags={flags}
                  />
                  {error && (
                    <p className={`mt-3 ${ERROR_ALERT_CLASSES}`} role="alert">
                      {error}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className={PRIMARY_BUTTON_CLASSES}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </form>
              </>
            )}

    </Modal>
  );
}


/**
 * PDF attachment for a single payslip entry: one PDF per entry. Shows an
 * upload control when none is attached, and a "Show payslip" toggle that
 * renders the stored PDF inline once one exists. Keeps its own state so it can
 * refresh the embedded viewer after an upload/replace without a full reload.
 */
function PayslipPdfPanel({
  payslipId,
  initialHasPdf,
  onPdfChange,
}: {
  payslipId: number;
  initialHasPdf: boolean;
  onPdfChange: (id: number, hasPdf: boolean) => void;
}) {
  const [hasPdf, setHasPdf] = useState(initialHasPdf);
  const [showing, setShowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Bumped on upload/replace so the blob fetch below re-runs instead of
  // showing a cached copy of the previous PDF.
  const [version, setVersion] = useState(0);
  // The PDF route requires the session header, which a plain <iframe>/<a>
  // src can't carry — so it's fetched through apiFetch and rendered from a
  // blob: URL instead of pointing straight at the API URL.
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset when the modal navigates to a different payslip.
  useEffect(() => {
    setHasPdf(initialHasPdf);
    setShowing(false);
    setErr(null);
    setVersion(0);
  }, [payslipId, initialHasPdf]);

  useEffect(() => {
    if (!hasPdf) {
      setBlobUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const res = await apiFetch(`${payslipPdfUrl(payslipId)}?v=${version}`);
        if (!res.ok) throw new Error("Failed to load PDF");
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load PDF");
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [hasPdf, payslipId, version]);

  const handleUpload = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      await uploadPayslipPdf(payslipId, file);
      setHasPdf(true);
      setVersion((v) => v + 1);
      setShowing(true);
      onPdfChange(payslipId, true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm("Remove the attached PDF from this payslip?")) return;
    setBusy(true);
    setErr(null);
    try {
      await deletePayslipPdf(payslipId);
      setHasPdf(false);
      setShowing(false);
      onPdfChange(payslipId, false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
          Payslip PDF
        </span>
        {hasPdf ? (
          <>
            <button
              type="button"
              className={PRIMARY_BUTTON_CLASSES}
              onClick={() => setShowing((s) => !s)}
            >
              {showing ? "Hide payslip" : "Show payslip"}
            </button>
            <a
              className={`${SECONDARY_BUTTON_CLASSES}${blobUrl ? "" : " pointer-events-none opacity-50"}`}
              href={blobUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
            >
              Open in new tab
            </a>
            <button
              type="button"
              className={ACTION_BUTTON_CLASSES}
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              {busy ? "Working…" : "Replace"}
            </button>
            <button
              type="button"
              className={DELETE_BUTTON_CLASSES}
              onClick={() => void handleRemove()}
              disabled={busy}
            >
              Remove
            </button>
          </>
        ) : (
          <button
            type="button"
            className={ACTION_BUTTON_CLASSES}
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? "Uploading…" : "Upload payslip PDF"}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            // Clear so re-picking the same file still fires onChange.
            e.target.value = "";
            if (f) void handleUpload(f);
          }}
        />
      </div>
      {err && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{err}</p>
      )}
      {hasPdf && blobUrl && (
        <div className={`mt-3${showing ? "" : " hidden"}`}>
          <p className="mb-1.5 text-xs text-ink-3">
            Preview
          </p>
          <div className="overflow-hidden rounded-lg border border-line">
            <iframe
              key={blobUrl}
              src={blobUrl}
              title="Payslip PDF"
              className="h-[75vh] w-full bg-surface"
            />
          </div>
        </div>
      )}
    </div>
  );
}
