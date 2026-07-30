"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { FloatingAddButton } from "@/components/FloatingAddButton";
import { Modal } from "@/components/Modal";
import {
  createMonthlyExpense,
  deleteMonthlyExpense,
  getMonthlyExpenses,
  updateMonthlyExpense,
  type MonthlyExpenseRow,
} from "@/lib/api";
import { formatMonthYearShort, monthKey, parseMonthKey } from "@/lib/dateFormat";
import { parseFormNumber } from "@/lib/parseFormNumber";
import {
  DASHED_EMPTY_CLASSES,
  ERROR_ALERT_CLASSES,
  INPUT_CLASSES,
  LOADING_TEXT_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
  SEGMENTED_BUTTON_ACTIVE_CLASSES,
  SEGMENTED_BUTTON_INACTIVE_CLASSES,
  SEGMENTED_WRAPPER_CLASSES,
} from "@/lib/ui";

type PeriodHalf = 1 | 2;

const HALF_LABEL: Record<PeriodHalf, string> = {
  1: "1st half",
  2: "2nd half",
};

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type ExpenseForm = {
  name: string;
  description: string;
  amount: string;
  period_half: PeriodHalf;
  month: string;
  is_recurring: boolean;
};
const emptyForm = (defaultMonth: string): ExpenseForm => ({
  name: "",
  description: "",
  amount: "",
  period_half: 1,
  month: defaultMonth,
  is_recurring: false,
});

export default function MonthlyExpensesClient() {
  const today = useMemo(() => new Date(), []);
  const currentMonthKey = useMemo(
    () => monthKey(today.getFullYear(), today.getMonth() + 1),
    [today],
  );

  const [expenses, setExpenses] = useState<MonthlyExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm(currentMonthKey));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await getMonthlyExpenses();
      setExpenses(r.expenses);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load monthly expenses");
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byHalf = useMemo(() => {
    const map: Record<PeriodHalf, MonthlyExpenseRow[]> = { 1: [], 2: [] };
    for (const e of expenses) {
      if (e.period_half === 1 || e.period_half === 2) map[e.period_half].push(e);
    }
    return map;
  }, [expenses]);

  const totalFor = useCallback(
    (half: PeriodHalf) => byHalf[half].reduce((s, e) => s + e.amount, 0),
    [byHalf],
  );

  const openModal = useCallback(() => {
    setFormError(null);
    setEditingId(null);
    setForm(emptyForm(currentMonthKey));
    setModalOpen(true);
  }, [currentMonthKey]);

  const openEditModal = useCallback((exp: MonthlyExpenseRow) => {
    setFormError(null);
    setEditingId(exp.id);
    setForm({
      name: exp.name,
      description: exp.description ?? "",
      amount: String(exp.amount),
      period_half: exp.period_half === 2 ? 2 : 1,
      month: monthKey(exp.period_year, exp.period_month),
      is_recurring: exp.is_recurring,
    });
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingId(null);
  }, []);

  const submitForm = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const name = form.name.trim();
      if (!name) {
        setFormError("Enter a name.");
        return;
      }
      const amount = parseFormNumber(form.amount);
      if (amount == null || amount <= 0) {
        setFormError("Enter a valid amount greater than zero.");
        return;
      }
      const period = parseMonthKey(form.month);
      if (!period) {
        setFormError("Pick a valid month.");
        return;
      }
      setFormError(null);
      setSaving(true);
      try {
        const body = {
          name,
          description: form.description.trim() || null,
          amount,
          period_half: form.period_half,
          period_year: period.y,
          period_month: period.m,
          is_recurring: form.is_recurring,
        };
        if (editingId != null) {
          await updateMonthlyExpense(editingId, body);
        } else {
          await createMonthlyExpense(body);
        }
        setModalOpen(false);
        setEditingId(null);
        await load();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Failed to save expense");
      } finally {
        setSaving(false);
      }
    },
    [form, editingId, load],
  );

  const onDelete = useCallback(
    async (id: number) => {
      setError(null);
      try {
        await deleteMonthlyExpense(id);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete expense");
      }
    },
    [load],
  );

  return (
    <div className="relative mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-8 px-4 pb-28 py-8 sm:px-6">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Monthly Expenses
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          All monthly expenses, split by pay period half. Each one applies only to the month
          you pick for it — the calendar page only shows it for that month.
        </p>
      </header>

      {error && (
        <div className={ERROR_ALERT_CLASSES} role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className={LOADING_TEXT_CLASSES}>Loading monthly expenses…</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {([1, 2] as const).map((half) => (
            <section
              key={half}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
                  {HALF_LABEL[half]}
                </h2>
                <p className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">
                  −{fmtMoney(totalFor(half))}
                </p>
              </div>

              {byHalf[half].length === 0 ? (
                <p className={`mt-4 ${DASHED_EMPTY_CLASSES}`}>No monthly expenses yet.</p>
              ) : (
                <ul className="mt-4 flex flex-col gap-2">
                  {byHalf[half].map((exp) => (
                    <li
                      key={exp.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEditModal(exp)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openEditModal(exp);
                        }
                      }}
                      className="flex cursor-pointer items-start justify-between gap-2 rounded-lg border border-zinc-200 p-3 transition hover:ring-2 hover:ring-indigo-300/60 dark:border-zinc-800 dark:hover:ring-indigo-700/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                          {exp.name}
                        </p>
                        {exp.description && (
                          <p className="mt-0.5 truncate text-xs text-zinc-600 dark:text-zinc-400">
                            {exp.description}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-indigo-600 dark:text-indigo-400">
                          {exp.is_recurring
                            ? "Recurring every month"
                            : formatMonthYearShort(exp.period_year, exp.period_month)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
                          {fmtMoney(exp.amount)}
                        </span>
                        <button
                          type="button"
                          className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:text-red-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            void onDelete(exp.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        ariaLabelledBy="monthly-expense-title"
        dialogClassName="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2
              id="monthly-expense-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              {editingId != null ? "Edit monthly expense" : "Add monthly expense"}
            </h2>
          </div>
          <button
            type="button"
            className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
            onClick={closeModal}
          >
            Close
          </button>
        </div>
        <form onSubmit={submitForm} className="grid gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Name</span>
            <input
              required
              type="text"
              className={INPUT_CLASSES}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Netflix"
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Description (optional)</span>
            <input
              type="text"
              className={INPUT_CLASSES}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Amount</span>
            <input
              required
              type="text"
              inputMode="decimal"
              className={INPUT_CLASSES}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              disabled={saving}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_recurring}
              onChange={(e) => setForm((f) => ({ ...f, is_recurring: e.target.checked }))}
              disabled={saving}
            />
            <span className="text-zinc-600 dark:text-zinc-400">
              Recurring — always show in the calendar&apos;s deductions, every month
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">
              Month{form.is_recurring ? " (ignored while recurring)" : ""}
            </span>
            <input
              required
              type="month"
              className={INPUT_CLASSES}
              value={form.month}
              onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}
              disabled={saving || form.is_recurring}
            />
          </label>
          <div className="flex flex-col items-center gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Half of the month</span>
            <div className={`${SEGMENTED_WRAPPER_CLASSES} w-full`}>
              {([1, 2] as const).map((half) => (
                <button
                  key={half}
                  type="button"
                  className={`flex-1 rounded-md px-4 py-3 text-base font-medium transition ${
                    form.period_half === half
                      ? SEGMENTED_BUTTON_ACTIVE_CLASSES
                      : SEGMENTED_BUTTON_INACTIVE_CLASSES
                  }`}
                  onClick={() => setForm((f) => ({ ...f, period_half: half }))}
                  disabled={saving}
                >
                  {HALF_LABEL[half]}
                </button>
              ))}
            </div>
          </div>

          {formError && (
            <div className={ERROR_ALERT_CLASSES} role="alert">
              {formError}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON_CLASSES}>
              {saving ? "Saving…" : editingId != null ? "Update" : "Add"}
            </button>
            <button
              type="button"
              disabled={saving}
              className={SECONDARY_BUTTON_CLASSES}
              onClick={closeModal}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <FloatingAddButton hidden={modalOpen} onClick={openModal} ariaLabel="Add monthly expense" />
    </div>
  );
}
