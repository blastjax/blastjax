"use client";

import { AmountInput } from "@/components/AmountInput";
import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import {
  createHousePayment,
  createHousePaymentEntry,
  deleteHousePayment,
  deleteHousePaymentEntry,
  getHousePayment,
  getHousePayments,
  updateHousePayment,
  updateHousePaymentEntry,
  type HousePaymentDetailResponse,
  type HousePaymentEntry,
  type HousePaymentRow,
} from "@/lib/api";
import { formatAmountNumber, parseFormNumber } from "@/lib/parseFormNumber";
import { formatDate as fmtDate } from "@/lib/dateFormat";
import { fmtAmountOrDash, fmtCount } from "@/lib/formatNumber";
import {
  AMOUNT_POSITIVE_CLASSES,
  CLOSE_BUTTON_CLASSES,
  DASHED_EMPTY_CLASSES,
  DELETE_BUTTON_CLASSES,
  EDIT_BUTTON_CLASSES,
  ERROR_ALERT_CLASSES,
  INPUT_CLASSES,
  LOADING_TEXT_CLASSES,
  PAGE_CONTAINER_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
  TABLE_CELL_CLASSES,
  TABLE_HEAD_CELL_CLASSES,
  TABLE_HEAD_ROW_CLASSES,
  TABLE_ROW_CLASSES,
  TABLE_WRAPPER_CLASSES,
  alertClasses,
} from "@/lib/ui";

const fmtMoney = fmtAmountOrDash;

/** Today as `yyyy-MM-dd` for default form value. */
function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

type PlanForm = { name: string; notes: string };
const emptyPlanForm: PlanForm = { name: "", notes: "" };

type EntryForm = { paid_on: string; amount: string };
const emptyEntryForm = (): EntryForm => ({ paid_on: todayIso(), amount: "" });

export default function HousePaymentsClient() {
  const [rows, setRows] = useState<HousePaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [planForm, setPlanForm] = useState<PlanForm>(emptyPlanForm);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [planModalOpen, setPlanModalOpen] = useState(false);

  const [entriesModalId, setEntriesModalId] = useState<number | null>(null);
  const [detail, setDetail] = useState<HousePaymentDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [entryForm, setEntryForm] = useState<EntryForm>(emptyEntryForm());
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [savingEntry, setSavingEntry] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await getHousePayments(500);
      setRows(r.house_payments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Summary card values derive directly from ``rows`` so we don't have
   * to re-fetch the whole list (and its server-side aggregates) after
   * every save. ``rows`` is patched in place by the create / update /
   * delete handlers below.
   */
  const summary = useMemo(
    () => ({
      sum_total_paid: rows.reduce((s, r) => s + (r.total_paid || 0), 0),
      total_entries: rows.reduce((s, r) => s + (r.entry_count || 0), 0),
      plan_count: rows.length,
    }),
    [rows],
  );

  const upsertRow = useCallback((row: HousePaymentRow) => {
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

  const closePlanModal = useCallback(() => {
    setPlanModalOpen(false);
    setEditingPlanId(null);
    setPlanForm(emptyPlanForm);
  }, []);

  const closeEntriesModal = useCallback(() => {
    setEntriesModalId(null);
    setDetail(null);
    setEntryForm(emptyEntryForm());
    setEditingEntryId(null);
  }, []);

  const openEntries = async (id: number) => {
    setEntriesModalId(id);
    setDetail(null);
    setDetailLoading(true);
    setEntryForm(emptyEntryForm());
    setEditingEntryId(null);
    setError(null);
    try {
      const d = await getHousePayment(id);
      setDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load entries");
      setDetail(null);
      setEntriesModalId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  /** Apply a fresh detail response to the modal + the matching list row. */
  const applyDetail = useCallback(
    (d: HousePaymentDetailResponse) => {
      setDetail(d);
      upsertRow(d.house_payment);
    },
    [upsertRow],
  );

  const submitPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const name = planForm.name.trim();
      if (!name) throw new Error("Name is required.");
      const body = {
        name,
        notes: planForm.notes.trim() === "" ? null : planForm.notes.trim(),
      };
      const fresh =
        editingPlanId != null
          ? await updateHousePayment(editingPlanId, body)
          : await createHousePayment(body);
      upsertRow(fresh);
      setPlanModalOpen(false);
      setEditingPlanId(null);
      setPlanForm(emptyPlanForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const startEditPlan = (r: HousePaymentRow) => {
    setEditingPlanId(r.id);
    setPlanForm({ name: r.name, notes: r.notes ?? "" });
    setPlanModalOpen(true);
  };

  const onDeletePlan = async (id: number) => {
    if (!confirm("Delete this house payment plan and all its payments?")) return;
    setSaving(true);
    setError(null);
    try {
      await deleteHousePayment(id);
      if (entriesModalId === id) closeEntriesModal();
      removeRow(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const submitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (entriesModalId == null) return;
    setSavingEntry(true);
    setError(null);
    try {
      const amt = parseFormNumber(entryForm.amount);
      if (amt == null || amt < 0) {
        throw new Error("Amount must be a non-negative number.");
      }
      const paid_on = entryForm.paid_on.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paid_on)) {
        throw new Error("Date must be a valid yyyy-mm-dd value.");
      }
      const body = { paid_on, amount: amt };
      const fresh =
        editingEntryId != null
          ? await updateHousePaymentEntry(entriesModalId, editingEntryId, body)
          : await createHousePaymentEntry(entriesModalId, body);
      applyDetail(fresh);
      setEntryForm(emptyEntryForm());
      setEditingEntryId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingEntry(false);
    }
  };

  const startEditEntry = (entry: HousePaymentEntry) => {
    setEditingEntryId(entry.id);
    setEntryForm({
      paid_on: entry.paid_on.slice(0, 10),
      amount: formatAmountNumber(entry.amount),
    });
  };

  const cancelEntryEdit = () => {
    setEditingEntryId(null);
    setEntryForm(emptyEntryForm());
  };

  const onDeleteEntry = async (entryId: number) => {
    if (entriesModalId == null) return;
    if (!confirm("Delete this payment?")) return;
    setSavingEntry(true);
    setError(null);
    try {
      const fresh = await deleteHousePaymentEntry(entriesModalId, entryId);
      if (editingEntryId === entryId) cancelEntryEdit();
      applyDetail(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSavingEntry(false);
    }
  };

  const detailTotalPaid = useMemo(() => {
    if (!detail) return 0;
    return detail.entries.reduce((s, e) => s + Number(e.amount || 0), 0);
  }, [detail]);

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="House Payments"
        description={
          <>
            Track payments made toward a house, with the date each payment was made.
          </>
        }
      />

      {error && (
        <div className={ERROR_ALERT_CLASSES} role="alert">
          {error}
        </div>
      )}

      {!loading && (
        <section>
          <div className={`${alertClasses("success")} !p-4`}>
            <p className="text-xs font-medium uppercase text-success-text">
              Total amount paid
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-success-text">
              {fmtMoney(summary.sum_total_paid)}
            </p>
            <p className="mt-1 text-xs text-success-text/80">
              Across {fmtCount(summary.plan_count)} plan
              {summary.plan_count === 1 ? "" : "s"} ·{" "}
              {fmtCount(summary.total_entries)} payment
              {summary.total_entries === 1 ? "" : "s"} recorded
            </p>
          </div>
        </section>
      )}

      <Modal
        open={planModalOpen}
        onClose={closePlanModal}
        ariaLabelledBy="house-plan-title"
        dialogClassName="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-pop"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2
            id="house-plan-title"
            className="text-lg font-semibold text-ink"
          >
            {editingPlanId != null ? "Edit house payment" : "Add house payment"}
          </h2>
          <button
            type="button"
            className={CLOSE_BUTTON_CLASSES}
            onClick={closePlanModal}
          >
            Close
          </button>
        </div>
        <form onSubmit={submitPlan} className="grid gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">Name</span>
            <input
              required
              className={INPUT_CLASSES}
              value={planForm.name}
              onChange={(e) =>
                setPlanForm((f) => ({ ...f, name: e.target.value }))
              }
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">
              Notes (optional)
            </span>
            <textarea
              rows={3}
              className={INPUT_CLASSES}
              value={planForm.notes}
              onChange={(e) =>
                setPlanForm((f) => ({ ...f, notes: e.target.value }))
              }
              disabled={saving}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className={PRIMARY_BUTTON_CLASSES}
            >
              {saving ? "Saving…" : editingPlanId != null ? "Update" : "Add"}
            </button>
            <button
              type="button"
              disabled={saving}
              className={SECONDARY_BUTTON_CLASSES}
              onClick={closePlanModal}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <section>
        <h2 className="text-lg font-medium text-ink">Plans</h2>
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {!loading && (
            <li>
              <button
                type="button"
                onClick={() => {
                  setEditingPlanId(null);
                  setPlanForm(emptyPlanForm);
                  setPlanModalOpen(true);
                }}
                className="flex min-h-[8rem] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong p-3 text-center text-sm text-ink-3 transition-colors duration-150 hover:border-brand hover:text-brand sm:p-4"
              >
                <span className="text-lg font-medium">+</span>
                <span className="font-medium">Add house payment</span>
              </button>
            </li>
          )}
          {!loading &&
            rows.map((r) => (
              <li
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => void openEntries(r.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void openEntries(r.id);
                  }
                }}
                className="min-w-0 cursor-pointer rounded-lg border border-line bg-surface p-3 transition-colors duration-150 hover:ring-2 hover:ring-brand/30 sm:p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-ink sm:text-base">
                      {r.name}
                    </h3>
                    <p className="mt-1 text-xs text-ink-2 sm:text-sm">
                      {r.entry_count} payment{r.entry_count === 1 ? "" : "s"}
                      {r.last_paid_on && (
                        <>
                          {" "}· last on{" "}
                          <span className="font-mono tabular-nums">
                            {fmtDate(r.last_paid_on)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      className={EDIT_BUTTON_CLASSES}
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditPlan(r);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      className={DELETE_BUTTON_CLASSES}
                      onClick={(e) => {
                        e.stopPropagation();
                        void onDeletePlan(r.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <dl className="mt-3 grid gap-2 text-xs sm:mt-4 sm:gap-3 sm:text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-ink-3">Total paid</dt>
                    <dd className={AMOUNT_POSITIVE_CLASSES}>
                      {fmtMoney(r.total_paid)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-3">Last payment</dt>
                    <dd className="tabular-nums">{fmtDate(r.last_paid_on)}</dd>
                  </div>
                  {r.notes && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-ink-3">Notes</dt>
                      <dd className="whitespace-pre-line text-ink-2">
                        {r.notes}
                      </dd>
                    </div>
                  )}
                </dl>
              </li>
            ))}
          {!loading && rows.length === 0 && (
            <li className={`col-span-full ${DASHED_EMPTY_CLASSES}`}>
              No house payment plans yet.
            </li>
          )}
        </ul>
      </section>

      <Modal
        open={entriesModalId != null}
        onClose={closeEntriesModal}
        ariaLabelledBy="house-entries-title"
        backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
        dialogClassName="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
      >
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <h2
                  id="house-entries-title"
                  className="truncate text-lg font-semibold text-ink"
                >
                  {detail?.house_payment.name ?? "Payments"}
                </h2>
                {detail && (
                  <p className="mt-0.5 text-xs text-ink-2">
                    {detail.entries.length} payment
                    {detail.entries.length === 1 ? "" : "s"} · total{" "}
                    <span className="font-mono tabular-nums">
                      {fmtMoney(detailTotalPaid)}
                    </span>
                  </p>
                )}
              </div>
              <button
                type="button"
                className={CLOSE_BUTTON_CLASSES}
                onClick={closeEntriesModal}
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {detailLoading && (
                <p className={LOADING_TEXT_CLASSES}>Loading payments…</p>
              )}
              {!detailLoading && detail && (
                <>
                  <form
                    onSubmit={submitEntry}
                    className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-line p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                  >
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-ink-2">
                        Date paid
                      </span>
                      <input
                        required
                        type="date"
                        className={INPUT_CLASSES}
                        value={entryForm.paid_on}
                        onChange={(e) =>
                          setEntryForm((f) => ({ ...f, paid_on: e.target.value }))
                        }
                        disabled={savingEntry}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-ink-2">Amount</span>
                      <AmountInput
                        required
                        value={entryForm.amount}
                        onChange={(v) => setEntryForm((f) => ({ ...f, amount: v }))}
                        disabled={savingEntry}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={savingEntry}
                        className={PRIMARY_BUTTON_CLASSES}
                      >
                        {savingEntry
                          ? "Saving…"
                          : editingEntryId != null
                            ? "Update"
                            : "Add payment"}
                      </button>
                      {editingEntryId != null && (
                        <button
                          type="button"
                          disabled={savingEntry}
                          className={SECONDARY_BUTTON_CLASSES}
                          onClick={cancelEntryEdit}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>

                  {detail.entries.length === 0 ? (
                    <p className="text-sm text-ink">
                      No payments yet. Add the first one above.
                    </p>
                  ) : (
                    <div className={`${TABLE_WRAPPER_CLASSES} overflow-x-auto`}>
                      <table className="w-full min-w-[28rem] text-left text-sm">
                        <thead>
                          <tr className={TABLE_HEAD_ROW_CLASSES}>
                            <th className={TABLE_HEAD_CELL_CLASSES}>Date paid</th>
                            <th className={`${TABLE_HEAD_CELL_CLASSES} text-right`}>Amount</th>
                            <th className={`${TABLE_HEAD_CELL_CLASSES} text-right`}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.entries.map((entry) => {
                            const isEditing = editingEntryId === entry.id;
                            return (
                              <tr
                                key={entry.id}
                                className={`${TABLE_ROW_CLASSES} ${
                                  isEditing
                                    ? "bg-brand-soft hover:bg-brand-soft"
                                    : ""
                                }`}
                              >
                                <td className={TABLE_CELL_CLASSES}>
                                  {fmtDate(entry.paid_on)}
                                </td>
                                <td className={`${TABLE_CELL_CLASSES} text-right font-medium`}>
                                  {fmtMoney(entry.amount)}
                                </td>
                                <td className={`${TABLE_CELL_CLASSES} text-right`}>
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      type="button"
                                      disabled={savingEntry}
                                      className={EDIT_BUTTON_CLASSES}
                                      onClick={() => startEditEntry(entry)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      disabled={savingEntry}
                                      className={DELETE_BUTTON_CLASSES}
                                      onClick={() => void onDeleteEntry(entry.id)}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
      </Modal>
    </div>
  );
}
