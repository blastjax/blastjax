"use client";

import { confirmDialog } from "@/components/ConfirmDialog";
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
import { ErrorAlert } from "@/components/ErrorAlert";
import {
  DANGER_TEXT_BUTTON_CLASSES,
  DIALOG_BODY_CLASSES,
  DIALOG_CLASSES,
  DIALOG_FOOTER_CLASSES,
  ModalHeader,
  TEXT_BUTTON_CLASSES,
} from "@/components/FinanceUI";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/Icons";
import {
  DELETE_BUTTON_CLASSES,
  ICON_BUTTON_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
  alertClasses,
} from "@/lib/ui";

const TITLE_ID = "payslip-modal-title";

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
  handleDelete: (id: string) => void | Promise<void>;
  onPdfChange: (id: string, hasPdf: boolean) => void;
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
      ariaLabelledBy={TITLE_ID}
      dialogClassName={`${DIALOG_CLASSES} max-w-5xl lg:max-w-6xl`}
    >
            {nav.screen === "detail" && (() => {
              const row = rows.find((r) => r.id === nav.row.id) ?? nav.row;
              const detailFlags = companyColumnFlags(companies, row.company);
              const { older, newer } = detailPayslipNeighbors(rows, row.id);
              return (
              <>
                <ModalHeader
                  id={TITLE_ID}
                  title="Details"
                  subtitle={fmtPayPeriod(row.period_year, row.period_month, row.period_half)}
                  actions={
                    <>
                      <button
                        type="button"
                        className={ICON_BUTTON_CLASSES}
                        aria-label="Older payslip"
                        data-tooltip="Older payslip"
                        disabled={!older}
                        onClick={() => older && setNav({ screen: "detail", row: older })}
                      >
                        <ChevronLeftIcon className="size-5" />
                      </button>
                      <button
                        type="button"
                        className={ICON_BUTTON_CLASSES}
                        aria-label="Newer payslip"
                        data-tooltip="Newer payslip"
                        disabled={!newer}
                        onClick={() => newer && setNav({ screen: "detail", row: newer })}
                      >
                        <ChevronRightIcon className="size-5" />
                      </button>
                    </>
                  }
                  onClose={() => setNav(null)}
                />
                <div className={DIALOG_BODY_CLASSES}>
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
                      <p className={`mb-4 ${alertClasses("info")}`}>
                        {n} entries in this half — use ‹ › or arrow keys for other
                        payslips, or close and open that calendar slot to see the full
                        list.
                      </p>
                    );
                  })()}
                  <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,17.5rem)] lg:items-start lg:gap-8">
                    <div className="min-w-0">
                      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 font-mono tabular-nums">
                        {detailFlags.show_total && (
                          <>
                            <div>
                              <dt className="text-xs text-ink-3">Gross total</dt>
                              <dd className="font-medium text-ink">
                                {fmtNum(grossTotalFromRow(row))}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs text-ink-3">Net total</dt>
                              <dd className="font-medium text-ink">
                                {fmtNum(row.total)}
                              </dd>
                            </div>
                          </>
                        )}
                        {detailFlags.show_basic_salary && (
                          <div>
                            <dt className="text-xs text-ink-3">Basic salary</dt>
                            <dd className="text-ink-2">
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
                            <dd className="text-ink-2">
                              {fmtNum(row[k])}
                            </dd>
                          </div>
                        ))}
                        {detailFlags.show_thirteenth_month &&
                          row.period_month === 11 &&
                          row.period_half === 2 && (
                          <div>
                            <dt className="text-xs text-ink-3">13th Month</dt>
                            <dd className="text-ink-2">
                              {fmtNum(row.thirteenth_month)}
                            </dd>
                          </div>
                        )}
                      </dl>
                      {row.notes && (
                        <div className="mt-3">
                          <dt className="text-xs text-ink-3">Notes</dt>
                          <dd className="mt-1 whitespace-pre-wrap text-sm text-ink-2">
                            {row.notes}
                          </dd>
                        </div>
                      )}
                    </div>
                    <aside className="flex min-w-0 flex-col gap-4 rounded-lg bg-surface-inset p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                        Deductions
                      </p>
                      <dl className="flex flex-col gap-3 text-sm font-mono tabular-nums">
                        {detailFlags.show_withholding_tax && (
                          <div>
                            <dt className="text-xs text-ink-3">
                              Withholding tax
                            </dt>
                            <dd className="text-danger-text">
                              {fmtNum(row.withholding_tax)}
                            </dd>
                          </div>
                        )}
                        {detailFlags.show_sss_contribution && (
                          <div>
                            <dt className="text-xs text-ink-3">
                              SSS contribution
                            </dt>
                            <dd className="text-danger-text">
                              {fmtNum(row.sss_contribution)}
                            </dd>
                          </div>
                        )}
                        {detailFlags.show_philhealth && (
                          <div>
                            <dt className="text-xs text-ink-3">Philhealth</dt>
                            <dd className="text-danger-text">
                              {fmtNum(row.philhealth)}
                            </dd>
                          </div>
                        )}
                        {detailFlags.show_pag_ibig && (
                          <div>
                            <dt className="text-xs text-ink-3">
                              Pag-ibig (Employee HDMF)
                            </dt>
                            <dd className="text-danger-text">
                              {fmtNum(row.pag_ibig)}
                            </dd>
                          </div>
                        )}
                        {detailFlags.show_mp2 && (
                          <div>
                            <dt className="text-xs text-ink-3">MP2</dt>
                            <dd className="text-danger-text">
                              {fmtNum(row.mp2)}
                            </dd>
                          </div>
                        )}
                        {detailFlags.show_bereavement_asst && (
                          <div>
                            <dt className="text-xs text-ink-3">Bereavement asst</dt>
                            <dd className="text-danger-text">
                              {fmtNum(row.bereavement_asst)}
                            </dd>
                          </div>
                        )}
                        <div className="mt-1 border-t border-line pt-3">
                          <dt className="text-xs font-semibold text-ink-2">
                            Deductions total
                          </dt>
                          <dd className="mt-0.5 text-sm font-semibold text-danger-text">
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
                </div>
                <div className={DIALOG_FOOTER_CLASSES}>
                  <button
                    type="button"
                    className={DANGER_TEXT_BUTTON_CLASSES}
                    onClick={() => void handleDelete(row.id)}
                  >
                    Delete
                  </button>
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
                </div>
              </>
              );
            })()}

            {nav.screen === "edit" && (() => {
              const { period_year: y, period_month: m, period_half: h } = nav.row;
              const scheduled = y != null && Number.isFinite(y) && m != null && m >= 1 && m <= 12 && (h === 1 || h === 2);
              return (
              <>
                <ModalHeader
                  id={TITLE_ID}
                  title={scheduled ? `Edit · ${slotTitle(y, m, h)}` : "Edit payslip"}
                  subtitle={scheduled ? undefined : fmtPayPeriod(y, m, h)}
                  onClose={onCloseDialog}
                />
                <form
                  className="flex min-h-0 flex-1 flex-col"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveEdit();
                  }}
                >
                  <div className={DIALOG_BODY_CLASSES}>
                    <PayslipFormFields
                      form={modalForm}
                      setForm={setModalForm}
                      companies={companies}
                      disabled={saving}
                      flags={flags}
                    />
                    {error && <ErrorAlert className="mt-3">{error}</ErrorAlert>}
                  </div>
                  <div className={DIALOG_FOOTER_CLASSES}>
                    <button type="button" className={`mr-auto ${TEXT_BUTTON_CLASSES}`} onClick={goBack}>
                      <ChevronLeftIcon className="size-4" />
                      Back
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
                    <button type="submit" className={PRIMARY_BUTTON_CLASSES} disabled={saving}>
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </form>
              </>
              );
            })()}

            {nav.screen === "add" && (
              <>
                <ModalHeader
                  id={TITLE_ID}
                  title={nav.freeform ? "New payslip" : `New · ${slotTitle(nav.year, nav.month, nav.half)}`}
                  onClose={onCloseDialog}
                />
                <form
                  className="flex min-h-0 flex-1 flex-col"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveAddInModal();
                  }}
                >
                  <div className={DIALOG_BODY_CLASSES}>
                    <PayslipFormFields
                      form={modalForm}
                      setForm={setModalForm}
                      companies={companies}
                      disabled={saving}
                      lockPeriod={!nav.freeform}
                      lockCompany
                      flags={flags}
                    />
                    {error && <ErrorAlert className="mt-3">{error}</ErrorAlert>}
                  </div>
                  <div className={DIALOG_FOOTER_CLASSES}>
                    <button type="button" className={SECONDARY_BUTTON_CLASSES} onClick={goBack}>
                      Back
                    </button>
                    <button type="submit" className={PRIMARY_BUTTON_CLASSES} disabled={saving}>
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </form>
              </>
            )}

    </Modal>
  );
}

function PayslipPdfPanel({
  payslipId,
  initialHasPdf,
  onPdfChange,
}: {
  payslipId: string;
  initialHasPdf: boolean;
  onPdfChange: (id: string, hasPdf: boolean) => void;
}) {
  const [hasPdf, setHasPdf] = useState(initialHasPdf);
  const [showing, setShowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    if (!(await confirmDialog("Remove the attached PDF from this payslip?", "Remove"))) return;
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
              className={SECONDARY_BUTTON_CLASSES}
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
            className={SECONDARY_BUTTON_CLASSES}
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
            e.target.value = "";
            if (f) void handleUpload(f);
          }}
        />
      </div>
      {err && (
        <p className="mt-2 text-xs text-danger-text">{err}</p>
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
              className="h-[75vh] w-full bg-page"
            />
          </div>
        </div>
      )}
    </div>
  );
}
