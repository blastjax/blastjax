"use client";

import { AmountInput } from "@/components/AmountInput";
import { DatePickerField } from "@/components/DatePickerField";
import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import {
  DIALOG_BODY_CLASSES,
  DIALOG_CLASSES,
  DIALOG_FOOTER_CLASSES,
  Field,
  IconAction,
  LoadingBlocks,
  Metric,
  ModalHeader,
  Panel,
  StatStrip,
} from "@/components/FinanceUI";
import { CheckIcon, HomeIcon, PlusIcon } from "@/components/Icons";
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
import { formatDate as fmtDate, toIsoDateLocal } from "@/lib/dateFormat";
import { fmtAmountOrDash, fmtCount } from "@/lib/formatNumber";
import { ErrorAlert } from "@/components/ErrorAlert";
import {
  INPUT_CLASSES,
  PAGE_CONTAINER_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
  SECTION_LABEL_CLASSES,
} from "@/lib/ui";

const fmtMoney = fmtAmountOrDash;

type PlanForm = { name: string; notes: string };
const emptyPlanForm: PlanForm = { name: "", notes: "" };

type EntryForm = { paid_on: string; amount: string };
const emptyEntryForm = (): EntryForm => ({ paid_on: toIsoDateLocal(new Date()), amount: "" });

/** Validate an entry form into an API body; throws a user-facing message. */
function toEntryBody(f: EntryForm) {
  const amount = parseFormNumber(f.amount);
  if (amount == null || amount < 0) throw new Error("Amount must be a non-negative number.");
  const paid_on = f.paid_on.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paid_on)) throw new Error("Pick the date the payment was made.");
  return { paid_on, amount };
}

const plural = (n: number, word: string) => `${fmtCount(n)} ${word}${n === 1 ? "" : "s"}`;

/** Date · amount · action row, shared by the page's add form and the modal's inline edit. */
const ENTRY_GRID_CLASSES =
  "grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end";

export default function HousePaymentsClient() {
  const [rows, setRows] = useState<HousePaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [planForm, setPlanForm] = useState<PlanForm>(emptyPlanForm);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [planModalOpen, setPlanModalOpen] = useState(false);

  const [payPlanId, setPayPlanId] = useState<number | null>(null);
  const [payForm, setPayForm] = useState<EntryForm>(emptyEntryForm());
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

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
      last_paid_on: rows.reduce<string | null>(
        (m, r) => (r.last_paid_on && (!m || r.last_paid_on > m) ? r.last_paid_on : m),
        null,
      ),
    }),
    [rows],
  );

  /** The add form's target: the user's pick, else the most recently paid plan. */
  const payPlan =
    rows.find((r) => r.id === payPlanId) ??
    rows.find((r) => r.last_paid_on === summary.last_paid_on) ??
    rows[0];

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

  const openNewPlan = () => {
    setError(null);
    setEditingPlanId(null);
    setPlanForm(emptyPlanForm);
    setPlanModalOpen(true);
  };

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
      // A plan just created is almost certainly the one about to be paid.
      if (editingPlanId == null) setPayPlanId(fresh.id);
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
    setError(null);
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

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payPlan) return;
    setPaying(true);
    setPayError(null);
    setLastAdded(null);
    try {
      const body = toEntryBody(payForm);
      const fresh = await createHousePaymentEntry(payPlan.id, body);
      upsertRow(fresh.house_payment);
      setPayPlanId(payPlan.id);
      // Keep plan + date so a run of back-dated payments is quick to enter.
      setPayForm((f) => ({ ...f, amount: "" }));
      setLastAdded(`Added ${fmtMoney(body.amount)} to ${payPlan.name} for ${fmtDate(body.paid_on)}.`);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPaying(false);
    }
  };

  const submitEntryEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (entriesModalId == null || editingEntryId == null) return;
    setSavingEntry(true);
    setError(null);
    try {
      const fresh = await updateHousePaymentEntry(entriesModalId, editingEntryId, toEntryBody(entryForm));
      applyDetail(fresh);
      cancelEntryEdit();
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

  /** Entries arrive newest first; bucket them by year with a subtotal each. */
  const entriesByYear = useMemo(() => {
    const groups: { year: string; total: number; entries: HousePaymentEntry[] }[] = [];
    for (const e of detail?.entries ?? []) {
      const year = e.paid_on.slice(0, 4);
      let g = groups[groups.length - 1];
      if (!g || g.year !== year) {
        g = { year, total: 0, entries: [] };
        groups.push(g);
      }
      g.entries.push(e);
      g.total += Number(e.amount || 0);
    }
    return groups;
  }, [detail]);

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="House Payments"
        description="Every payment made toward a house, and when it was made."
        actions={
          // Filled only while it's the page's one job; once plans exist, "Add payment" owns the fill.
          <button
            type="button"
            className={rows.length === 0 ? PRIMARY_BUTTON_CLASSES : SECONDARY_BUTTON_CLASSES}
            onClick={openNewPlan}
          >
            <PlusIcon className="size-4" />
            New plan
          </button>
        }
      />

      {error && !planModalOpen && entriesModalId == null && (
        <ErrorAlert>
          {error}
        </ErrorAlert>
      )}

      {loading ? (
        <LoadingBlocks label="Loading house payments…" rows={2} />
      ) : rows.length === 0 ? (
        <section className="flex flex-col items-center rounded-2xl border border-line bg-surface px-6 py-14 text-center shadow-xs">
          <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand-text">
            <HomeIcon className="size-6" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink">No plans yet</h2>
          <p className="mt-1 max-w-sm text-sm text-ink-3">
            Create a plan for the property or loan you&apos;re paying toward with <strong className="font-medium text-ink-2">New plan</strong>. Then log each payment right here.
          </p>
        </section>
      ) : (
        <>
          <StatStrip className="grid-cols-2 lg:grid-cols-4">
            <Metric label="Total paid" value={fmtMoney(summary.sum_total_paid)} tone="brand" size="lg" />
            <Metric label="Payments" value={fmtCount(summary.total_entries)} />
            <Metric label="Plans" value={fmtCount(summary.plan_count)} />
            <Metric label="Last payment" value={fmtDate(summary.last_paid_on)} />
          </StatStrip>

          {payPlan && (
            <Panel
              title="Add a payment"
              subtitle={rows.length === 1 ? `Toward ${payPlan.name}` : "Pick the plan, then when and how much."}
            >
              <form onSubmit={submitPayment} className="flex flex-col gap-4">
                {rows.length > 1 && (
                  <fieldset className="min-w-0">
                    <legend className="mb-2 text-sm font-medium text-ink-2">Plan</legend>
                    <div className="flex flex-wrap gap-2">
                      {rows.map((r) => (
                        <label
                          key={r.id}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-surface py-1.5 pl-2.5 pr-3.5 text-sm font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 has-checked:border-brand has-checked:bg-brand-soft has-checked:text-brand-text has-focus-visible:ring-4 has-focus-visible:ring-brand/20"
                        >
                          <input
                            type="radio"
                            name="pay-plan"
                            className="sr-only"
                            checked={r.id === payPlan.id}
                            onChange={() => setPayPlanId(r.id)}
                            disabled={paying}
                          />
                          <HomeIcon className="size-4" />
                          <span className="max-w-[16rem] truncate">{r.name}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <div className={ENTRY_GRID_CLASSES}>
                  <Field label="Date paid">
                    <DatePickerField
                      value={payForm.paid_on}
                      onChange={(v) => setPayForm((f) => ({ ...f, paid_on: v }))}
                      disabled={paying}
                    />
                  </Field>
                  <Field label="Amount">
                    <AmountInput
                      required
                      placeholder="0.00"
                      value={payForm.amount}
                      onChange={(v) => {
                        setLastAdded(null);
                        setPayForm((f) => ({ ...f, amount: v }));
                      }}
                      disabled={paying}
                    />
                  </Field>
                  <button type="submit" disabled={paying} className={PRIMARY_BUTTON_CLASSES}>
                    <PlusIcon className="size-4" />
                    {paying ? "Adding…" : "Add payment"}
                  </button>
                </div>
                {payError && <ErrorAlert>{payError}</ErrorAlert>}
                <p role="status" className="empty:hidden flex items-center gap-2 text-sm font-medium text-success-text">
                  {lastAdded && (
                    <>
                      <CheckIcon className="size-4 shrink-0" />
                      {lastAdded}
                    </>
                  )}
                </p>
              </form>
            </Panel>
          )}

          <section className="flex flex-col gap-3">
            <h2 className={SECTION_LABEL_CLASSES}>Plans</h2>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((r) => (
                <li key={r.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => void openEntries(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void openEntries(r.id);
                      }
                    }}
                    className="group flex h-full cursor-pointer flex-col rounded-2xl border border-line bg-surface p-5 shadow-xs transition duration-150 hover:border-line-strong hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-text">
                        <HomeIcon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold text-ink">{r.name}</h3>
                        <p className="mt-0.5 text-xs text-ink-3">{plural(r.entry_count, "payment")}</p>
                      </div>
                      <div className="-mr-2 -mt-1 flex">
                        <IconAction kind="edit" label={`Edit ${r.name}`} disabled={saving} onClick={() => startEditPlan(r)} />
                        <IconAction
                          kind="delete"
                          label={`Delete ${r.name}`}
                          disabled={saving}
                          onClick={() => void onDeletePlan(r.id)}
                        />
                      </div>
                    </div>
                    {r.notes && <p className="mt-3 line-clamp-2 whitespace-pre-line text-sm text-ink-3">{r.notes}</p>}
                    <div className="mt-auto pt-5">
                      <p className="text-xs font-medium text-ink-3">Total paid</p>
                      <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-ink">
                        {fmtMoney(r.total_paid)}
                      </p>
                      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line-soft pt-3 text-xs">
                        <span className="text-ink-3">
                          {r.last_paid_on ? `Last paid ${fmtDate(r.last_paid_on)}` : "No payments yet"}
                        </span>
                        <span className="font-medium text-brand-text group-hover:underline">History →</span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <Modal
        open={planModalOpen}
        onClose={closePlanModal}
        ariaLabelledBy="house-plan-title"
        dialogClassName={`${DIALOG_CLASSES} max-w-md`}
      >
        <ModalHeader
          id="house-plan-title"
          title={editingPlanId != null ? "Edit plan" : "New plan"}
          subtitle="A property or loan you're paying toward."
          onClose={closePlanModal}
        />
        <form onSubmit={submitPlan} className="flex min-h-0 flex-1 flex-col">
          <div className={`${DIALOG_BODY_CLASSES} grid gap-4`}>
            <Field label="Name">
              <input
                required
                autoFocus
                placeholder="e.g. Condo unit 12B"
                className={INPUT_CLASSES}
                value={planForm.name}
                onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))}
                disabled={saving}
              />
            </Field>
            <Field label="Notes" hint="Optional">
              <textarea
                rows={3}
                className={INPUT_CLASSES}
                value={planForm.notes}
                onChange={(e) => setPlanForm((f) => ({ ...f, notes: e.target.value }))}
                disabled={saving}
              />
            </Field>
            {error && (
              <ErrorAlert>
                {error}
              </ErrorAlert>
            )}
          </div>
          <div className={DIALOG_FOOTER_CLASSES}>
            <button type="button" disabled={saving} className={SECONDARY_BUTTON_CLASSES} onClick={closePlanModal}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON_CLASSES}>
              {saving ? "Saving…" : editingPlanId != null ? "Save changes" : "Create plan"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={entriesModalId != null}
        onClose={closeEntriesModal}
        ariaLabelledBy="house-entries-title"
        dialogClassName={`${DIALOG_CLASSES} max-w-2xl`}
      >
        <ModalHeader
          id="house-entries-title"
          title={detail?.house_payment.name ?? "Payments"}
          subtitle={
            detail
              ? `${plural(detail.entries.length, "payment")} · ${fmtMoney(detailTotalPaid)} paid`
              : undefined
          }
          onClose={closeEntriesModal}
        />
        <div className={DIALOG_BODY_CLASSES}>
          {detailLoading && (
            <div className="h-40 animate-pulse rounded-xl bg-surface-2" role="status" aria-label="Loading payments" />
          )}
          {!detailLoading && detail && (
            <div className="flex flex-col gap-5">
              {error && (
                <ErrorAlert>
                  {error}
                </ErrorAlert>
              )}

              {detail.entries.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-3">No payments yet.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {entriesByYear.map((g) => (
                    <section key={g.year}>
                      <div className="mb-1.5 flex items-baseline justify-between px-1">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-3">{g.year}</h3>
                        <span className="text-xs font-semibold tabular-nums text-ink-2">{fmtMoney(g.total)}</span>
                      </div>
                      <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line">
                        {g.entries.map((entry) =>
                          entry.id === editingEntryId ? (
                            <li key={entry.id} className="bg-brand-soft p-3">
                              <form onSubmit={submitEntryEdit} className={ENTRY_GRID_CLASSES}>
                                <Field label="Date paid">
                                  <DatePickerField
                                    value={entryForm.paid_on}
                                    onChange={(v) => setEntryForm((f) => ({ ...f, paid_on: v }))}
                                    disabled={savingEntry}
                                  />
                                </Field>
                                <Field label="Amount">
                                  <AmountInput
                                    required
                                    autoFocus
                                    placeholder="0.00"
                                    value={entryForm.amount}
                                    onChange={(v) => setEntryForm((f) => ({ ...f, amount: v }))}
                                    disabled={savingEntry}
                                  />
                                </Field>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    disabled={savingEntry}
                                    className={`flex-1 ${SECONDARY_BUTTON_CLASSES}`}
                                    onClick={cancelEntryEdit}
                                  >
                                    Cancel
                                  </button>
                                  <button type="submit" disabled={savingEntry} className={`flex-1 ${PRIMARY_BUTTON_CLASSES}`}>
                                    {savingEntry ? "Saving…" : "Save"}
                                  </button>
                                </div>
                              </form>
                            </li>
                          ) : (
                            <li key={entry.id} className="flex items-center gap-3 py-1.5 pl-4 pr-2">
                              <span className="flex-1 text-sm text-ink-2">{fmtDate(entry.paid_on)}</span>
                              <span className="text-sm font-semibold tabular-nums text-ink">{fmtMoney(entry.amount)}</span>
                              <div className="flex">
                                <IconAction
                                  kind="edit"
                                  label="Edit payment"
                                  disabled={savingEntry || editingEntryId != null}
                                  onClick={() => startEditEntry(entry)}
                                />
                                <IconAction
                                  kind="delete"
                                  label="Delete payment"
                                  disabled={savingEntry}
                                  onClick={() => void onDeleteEntry(entry.id)}
                                />
                              </div>
                            </li>
                          ),
                        )}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
