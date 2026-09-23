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
  PAYSLIP_BG_0,
  PAYSLIP_BG_4,
  PAYSLIP_BORDER,
  PAYSLIP_BORDER_STRONG,
  PAYSLIP_DANGER_BUTTON,
  PAYSLIP_DANGER_TEXT,
  PAYSLIP_ERROR_ALERT,
  PAYSLIP_FONT_CLASS,
  PAYSLIP_ICON_BUTTON,
  PAYSLIP_MONO,
  PAYSLIP_PRIMARY_BUTTON,
  PAYSLIP_SECONDARY_BUTTON,
  PAYSLIP_TEXT_2,
  PAYSLIP_TEXT_DIM,
  PAYSLIP_TEXT_INK,
} from "./payslipTheme";

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
      dialogClassName={`${PAYSLIP_FONT_CLASS} max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-xl border ${PAYSLIP_BORDER_STRONG} ${PAYSLIP_BG_0} p-6 shadow-pop sm:p-8 lg:max-w-6xl`}
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
                      return (
                        <>
                          <button
                            type="button"
                            className={PAYSLIP_ICON_BUTTON}
                            aria-label="Older payslip"
                            disabled={!older}
                            onClick={() =>
                              older &&
                              setNav({ screen: "detail", row: older })
                            }
                          >
                            ‹
                          </button>
                          <h2 className={`min-w-0 text-lg font-semibold ${PAYSLIP_TEXT_INK}`}>
                            Details
                          </h2>
                          <button
                            type="button"
                            className={PAYSLIP_ICON_BUTTON}
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
                    className={`shrink-0 ${PAYSLIP_SECONDARY_BUTTON}`}
                    onClick={() => setNav(null)}
                  >
                    Close
                  </button>
                </div>
                <p className={`mb-4 text-sm ${PAYSLIP_TEXT_2}`}>
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
                    <p className={`mb-4 rounded-md border ${PAYSLIP_BORDER_STRONG} bg-[oklch(0.72_0.11_195/0.1)] px-3 py-2 text-xs ${PAYSLIP_TEXT_2}`}>
                      {n} entries in this half — use ‹ › or arrow keys for other
                      payslips, or close and open that calendar slot to see the full
                      list.
                    </p>
                  );
                })()}
                <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,17.5rem)] lg:items-start lg:gap-8">
                  <div className="min-w-0">
                    <dl className={`grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 ${PAYSLIP_MONO}`}>
                      {detailFlags.show_total && (
                        <>
                          <div>
                            <dt className={`text-xs ${PAYSLIP_TEXT_DIM}`}>Gross total</dt>
                            <dd className={`font-medium ${PAYSLIP_TEXT_INK}`}>
                              {fmtNum(grossTotalFromRow(row))}
                            </dd>
                          </div>
                          <div>
                            <dt className={`text-xs ${PAYSLIP_TEXT_DIM}`}>Net total</dt>
                            <dd className={`font-medium ${PAYSLIP_TEXT_INK}`}>
                              {fmtNum(row.total)}
                            </dd>
                          </div>
                        </>
                      )}
                      {detailFlags.show_basic_salary && (
                        <div>
                          <dt className={`text-xs ${PAYSLIP_TEXT_DIM}`}>Basic salary</dt>
                          <dd className={PAYSLIP_TEXT_2}>
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
                          <dt className={`text-xs ${PAYSLIP_TEXT_DIM}`}>{lab}</dt>
                          <dd className={PAYSLIP_TEXT_2}>
                            {fmtNum(row[k])}
                          </dd>
                        </div>
                      ))}
                      {detailFlags.show_thirteenth_month &&
                        row.period_month === 11 &&
                        row.period_half === 2 && (
                        <div>
                          <dt className={`text-xs ${PAYSLIP_TEXT_DIM}`}>13th Month</dt>
                          <dd className={PAYSLIP_TEXT_2}>
                            {fmtNum(row.thirteenth_month)}
                          </dd>
                        </div>
                      )}
                    </dl>
                    {row.notes && (
                      <div className="mt-3">
                        <dt className={`text-xs ${PAYSLIP_TEXT_DIM}`}>Notes</dt>
                        <dd className={`mt-1 whitespace-pre-wrap text-sm ${PAYSLIP_TEXT_2}`}>
                          {row.notes}
                        </dd>
                      </div>
                    )}
                  </div>
                  <aside className={`flex min-w-0 flex-col gap-4 rounded-lg ${PAYSLIP_BG_4} p-4`}>
                    <p className={`text-xs font-semibold uppercase tracking-wide ${PAYSLIP_TEXT_DIM}`}>
                      Deductions
                    </p>
                    <dl className={`flex flex-col gap-3 text-sm ${PAYSLIP_MONO}`}>
                      {detailFlags.show_withholding_tax && (
                        <div>
                          <dt className={`text-xs ${PAYSLIP_TEXT_DIM}`}>
                            Withholding tax
                          </dt>
                          <dd className={PAYSLIP_DANGER_TEXT}>
                            {fmtNum(row.withholding_tax)}
                          </dd>
                        </div>
                      )}
                      {detailFlags.show_sss_contribution && (
                        <div>
                          <dt className={`text-xs ${PAYSLIP_TEXT_DIM}`}>
                            SSS contribution
                          </dt>
                          <dd className={PAYSLIP_DANGER_TEXT}>
                            {fmtNum(row.sss_contribution)}
                          </dd>
                        </div>
                      )}
                      {detailFlags.show_philhealth && (
                        <div>
                          <dt className={`text-xs ${PAYSLIP_TEXT_DIM}`}>Philhealth</dt>
                          <dd className={PAYSLIP_DANGER_TEXT}>
                            {fmtNum(row.philhealth)}
                          </dd>
                        </div>
                      )}
                      {detailFlags.show_pag_ibig && (
                        <div>
                          <dt className={`text-xs ${PAYSLIP_TEXT_DIM}`}>
                            Pag-ibig (Employee HDMF)
                          </dt>
                          <dd className={PAYSLIP_DANGER_TEXT}>
                            {fmtNum(row.pag_ibig)}
                          </dd>
                        </div>
                      )}
                      {detailFlags.show_mp2 && (
                        <div>
                          <dt className={`text-xs ${PAYSLIP_TEXT_DIM}`}>MP2</dt>
                          <dd className={PAYSLIP_DANGER_TEXT}>
                            {fmtNum(row.mp2)}
                          </dd>
                        </div>
                      )}
                      <div className={`mt-1 border-t ${PAYSLIP_BORDER} pt-3`}>
                        <dt className={`text-xs font-semibold ${PAYSLIP_TEXT_2}`}>
                          Deductions total
                        </dt>
                        <dd className={`mt-0.5 text-sm font-semibold ${PAYSLIP_DANGER_TEXT}`}>
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
                    className={PAYSLIP_PRIMARY_BUTTON}
                    onClick={() => {
                      setModalForm(formFromRow(row));
                      setNav({ screen: "edit", row });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={PAYSLIP_DANGER_BUTTON}
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
                    <h2 className={`text-lg font-semibold leading-snug ${PAYSLIP_TEXT_INK}`}>
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
                        <p className={`mt-1 text-sm font-normal ${PAYSLIP_TEXT_2}`}>
                          {fmtPayPeriod(y, m, h)}
                        </p>
                      );
                    })()}
                  </div>
                  <button
                    type="button"
                    className={PAYSLIP_SECONDARY_BUTTON}
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
                    <p className={`mt-3 ${PAYSLIP_ERROR_ALERT}`} role="alert">
                      {error}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className={PAYSLIP_PRIMARY_BUTTON}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                    <button
                      type="button"
                      className={PAYSLIP_SECONDARY_BUTTON}
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
                  <h2 className={`text-lg font-semibold ${PAYSLIP_TEXT_INK}`}>
                    {nav.freeform
                      ? "New payslip"
                      : `New · ${slotTitle(nav.year, nav.month, nav.half)}`}
                  </h2>
                  <button
                    type="button"
                    className={PAYSLIP_SECONDARY_BUTTON}
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
                    <p className={`mt-3 ${PAYSLIP_ERROR_ALERT}`} role="alert">
                      {error}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className={PAYSLIP_PRIMARY_BUTTON}
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
    <div className={`mt-6 border-t ${PAYSLIP_BORDER} pt-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`mr-1 text-xs font-semibold uppercase tracking-wide ${PAYSLIP_TEXT_DIM}`}>
          Payslip PDF
        </span>
        {hasPdf ? (
          <>
            <button
              type="button"
              className={PAYSLIP_PRIMARY_BUTTON}
              onClick={() => setShowing((s) => !s)}
            >
              {showing ? "Hide payslip" : "Show payslip"}
            </button>
            <a
              className={`${PAYSLIP_SECONDARY_BUTTON}${blobUrl ? "" : " pointer-events-none opacity-50"}`}
              href={blobUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
            >
              Open in new tab
            </a>
            <button
              type="button"
              className={PAYSLIP_SECONDARY_BUTTON}
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              {busy ? "Working…" : "Replace"}
            </button>
            <button
              type="button"
              className={PAYSLIP_DANGER_BUTTON}
              onClick={() => void handleRemove()}
              disabled={busy}
            >
              Remove
            </button>
          </>
        ) : (
          <button
            type="button"
            className={PAYSLIP_SECONDARY_BUTTON}
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
        <p className={`mt-2 text-xs ${PAYSLIP_DANGER_TEXT}`}>{err}</p>
      )}
      {hasPdf && blobUrl && (
        <div className={`mt-3${showing ? "" : " hidden"}`}>
          <p className={`mb-1.5 text-xs ${PAYSLIP_TEXT_DIM}`}>
            Preview
          </p>
          <div className={`overflow-hidden rounded-lg border ${PAYSLIP_BORDER}`}>
            <iframe
              key={blobUrl}
              src={blobUrl}
              title="Payslip PDF"
              className={`h-[75vh] w-full ${PAYSLIP_BG_0}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
