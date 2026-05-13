"use client";

import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import type { PayslipRow } from "@/lib/api";
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

export function PayslipClientModal({
  nav,
  setNav,
  rows,
  modalForm,
  setModalForm,
  saving,
  modalFormRef,
  goBack,
  saveEdit,
  saveAddInModal,
  saveManualAdd,
  handleDelete,
}: {
  nav: Nav;
  setNav: Dispatch<SetStateAction<Nav | null>>;
  rows: PayslipRow[];
  modalForm: FormState;
  setModalForm: Dispatch<SetStateAction<FormState>>;
  saving: boolean;
  modalFormRef: MutableRefObject<FormState>;
  goBack: () => void;
  saveEdit: () => void | Promise<void>;
  saveAddInModal: () => void | Promise<void>;
  saveManualAdd: () => void | Promise<void>;
  handleDelete: (id: number) => void | Promise<void>;
}) {
  return (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-5 sm:items-center sm:p-6"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (
              nav.screen === "edit" ||
              nav.screen === "add" ||
              nav.screen === "manual"
            ) {
              stashPayslipModalDraft(nav, modalFormRef.current);
            }
            setNav(null);
          }}
        >
          <div
            className="max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl sm:p-8 lg:max-w-6xl dark:border-zinc-700 dark:bg-zinc-950"
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
                      {items.length === 0 && (
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
                      )}
                    </>
                  );
                })()}
              </>
            )}

            {nav.screen === "detail" && (
              <>
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                    {(() => {
                      const { older, newer } = detailPayslipNeighbors(
                        rows,
                        nav.row.id,
                      );
                      const btnCls =
                        "flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";
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
                          <h2 className="min-w-0 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
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
                    className="shrink-0 rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
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
                      {n} entries in this half — use ‹ › or arrow keys for other
                      payslips, or close and open that calendar slot to see the full
                      list.
                    </p>
                  );
                })()}
                <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,17.5rem)] lg:items-start lg:gap-8">
                  <div className="min-w-0">
                    <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-zinc-500">Gross total</dt>
                        <dd className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
                          {fmtNum(grossTotalFromRow(nav.row))}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">Net total</dt>
                        <dd className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
                          {fmtNum(nav.row.total)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">Basic salary</dt>
                        <dd className="tabular-nums text-zinc-900 dark:text-zinc-100">
                          {fmtNum(nav.row.basic_salary)}
                        </dd>
                      </div>
                      {(
                        [
                          ["commission", "Commission"],
                          ["reimbursement", "Reimbursement"],
                          ["medical_reimbursement", "Medical reimbursement"],
                          ["others", "Others"],
                          ["allowances", "Allowances"],
                          ["thirteenth_month", "13th Month"],
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
                  </div>
                  <aside className="flex min-w-0 flex-col gap-4 rounded-lg border border-zinc-200 bg-zinc-50/90 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/50">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Deductions
                    </p>
                    <dl className="flex flex-col gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-zinc-500">
                          Withholding tax
                        </dt>
                        <dd className="tabular-nums text-red-600 dark:text-red-400">
                          {fmtNum(nav.row.withholding_tax)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">
                          SSS contribution
                        </dt>
                        <dd className="tabular-nums text-red-600 dark:text-red-400">
                          {fmtNum(nav.row.sss_contribution)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">Philhealth</dt>
                        <dd className="tabular-nums text-red-600 dark:text-red-400">
                          {fmtNum(nav.row.philhealth)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">
                          Pag-ibig (Employee HDMF)
                        </dt>
                        <dd className="tabular-nums text-red-600 dark:text-red-400">
                          {fmtNum(nav.row.pag_ibig)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">MP2</dt>
                        <dd className="tabular-nums text-red-600 dark:text-red-400">
                          {fmtNum(nav.row.mp2)}
                        </dd>
                      </div>
                      <div className="mt-1 border-t border-zinc-200 pt-3 dark:border-zinc-600">
                        <dt className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                          Deductions total
                        </dt>
                        <dd className="mt-0.5 text-sm font-semibold tabular-nums text-red-700 dark:text-red-300">
                          {fmtNum(deductionsTotalFromRow(nav.row))}
                        </dd>
                      </div>
                    </dl>
                  </aside>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
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
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
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
                        <p className="mt-1 text-sm font-normal text-zinc-600 dark:text-zinc-400">
                          {fmtPayPeriod(y, m, h)}
                        </p>
                      );
                    })()}
                  </div>
                  <button
                    type="button"
                    className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
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
                    disabled={saving}
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
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
                    disabled={saving}
                    lockPeriod
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </form>
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
                    onClick={() => {
                      stashPayslipModalDraft(nav, modalFormRef.current);
                      setNav(null);
                    }}
                  >
                    Close
                  </button>
                </div>
                <form
                  className="min-w-0"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveManualAdd();
                  }}
                >
                  <PayslipFormFields
                    form={modalForm}
                    setForm={setModalForm}
                    disabled={saving}
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
                      onClick={() => {
                        clearPayslipModalDraft(nav);
                        setNav(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
  );
}
