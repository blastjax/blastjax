"use client";

import { confirmDialog } from "@/components/ConfirmDialog";
import { AmountInput } from "@/components/AmountInput";
import { DatePickerField } from "@/components/DatePickerField";
import { MonthPickerField } from "@/components/MonthPickerField";
import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Modal } from "@/components/Modal";
import {
  DANGER_TEXT_BUTTON_CLASSES,
  DIALOG_BODY_CLASSES,
  DIALOG_CLASSES,
  DIALOG_FOOTER_CLASSES,
  Field,
  IconAction,
  LoadingBlocks,
  Metric,
  ModalHeader,
  MonthStepper,
  Panel,
  Pill,
  StatStrip,
  TEXT_BUTTON_CLASSES,
} from "@/components/FinanceUI";
import { PlusIcon } from "@/components/Icons";
import {
  createMonthlyExpense,
  deleteMonthlyExpense,
  getMonthlyExpenses,
  getPayPeriodStartOverrides,
  updateMonthlyExpense,
  type MonthlyExpenseRow,
} from "@/lib/api";
import { addMonths, formatDate, formatMonthYear, formatMonthYearShort, monthKey, parseMonthKey } from "@/lib/dateFormat";
import { fmtAmount } from "@/lib/formatNumber";
import { formatAmountNumber, parseFormNumber } from "@/lib/parseFormNumber";
import {
  billDayIso,
  compareDue,
  periodForDate,
  periodKey,
  periodRangeLabel,
  type PeriodHalf,
} from "@/lib/payPeriods";
import { ErrorAlert } from "@/components/ErrorAlert";
import {
  INPUT_CLASSES,
  PAGE_CONTAINER_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
  SEGMENTED_BUTTON_ACTIVE_CLASSES,
  SEGMENTED_BUTTON_CLASSES,
  SEGMENTED_BUTTON_INACTIVE_CLASSES,
  SEGMENTED_WRAPPER_CLASSES,
  TOGGLE_ACTIVE_BUTTON_CLASSES,
  TOGGLE_INACTIVE_BUTTON_CLASSES,
} from "@/lib/ui";

const HALF: Record<PeriodHalf, { label: string; days: string }> = {
  1: { label: "1st half", days: "Paid end of month" },
  2: { label: "2nd half", days: "Paid mid-month" },
};

const fmtMoney = fmtAmount;

const ORDINAL = new Intl.PluralRules("en-US", { type: "ordinal" });
const ORDINAL_SUFFIX: Record<string, string> = { one: "st", two: "nd", few: "rd", other: "th" };
const ordinal = (n: number) => `${n}${ORDINAL_SUFFIX[ORDINAL.select(n)]}`;

type ExpenseForm = {
  name: string;
  description: string;
  amount: string;
  period_half: PeriodHalf;
  month: string;
  is_recurring: boolean;
  date: string;
};
const emptyForm = (defaultMonth: string, half: PeriodHalf = 1): ExpenseForm => ({
  name: "",
  description: "",
  amount: "",
  period_half: half,
  month: defaultMonth,
  is_recurring: false,
  date: "",
});

export default function MonthlyExpensesClient() {
  const today = useMemo(() => new Date(), []);
  const currentMonthKey = useMemo(
    () => monthKey(today.getFullYear(), today.getMonth() + 1),
    [today],
  );

  const [expenses, setExpenses] = useState<MonthlyExpenseRow[]>([]);
  const [payPeriodStarts, setPayPeriodStarts] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [month, setMonth] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() + 1 }));
  const [showAll, setShowAll] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm(currentMonthKey));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [r, starts] = await Promise.all([
        getMonthlyExpenses(),
        getPayPeriodStartOverrides().catch(() => ({ overrides: [] })),
      ]);
      setExpenses(r.expenses);
      setPayPeriodStarts(
        new Map(starts.overrides.map((o) => [periodKey(o.period_year, o.period_month, o.period_half), o.start_date])),
      );
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
    const dated: Record<PeriodHalf, [string | null, MonthlyExpenseRow][]> = { 1: [], 2: [] };
    const prev = addMonths(month.y, month.m, -1);
    for (const e of expenses) {
      if (e.expense_date && !showAll) {
        // Dated bills count in whichever of this month's pay periods their date lands in.
        const days = e.is_recurring ? [billDayIso(e, prev.y, prev.m), billDayIso(e, month.y, month.m)] : [e.expense_date];
        for (const iso of days) {
          const p = iso ? periodForDate(payPeriodStarts, iso) : null;
          if (p && p.year === month.y && p.month === month.m) dated[p.half].push([iso, e]);
        }
      } else if (
        (showAll || e.is_recurring || (e.period_year === month.y && e.period_month === month.m)) &&
        (e.period_half === 1 || e.period_half === 2)
      ) {
        dated[e.period_half].push([e.expense_date, e]);
      }
    }
    const byDate = (half: PeriodHalf) => dated[half].sort(([a], [b]) => compareDue(a, b)).map(([, e]) => e);
    return { 1: byDate(1), 2: byDate(2) };
  }, [expenses, month, showAll, payPeriodStarts]);

  const visible = useMemo(() => [...new Set([...byHalf[1], ...byHalf[2]])], [byHalf]);

  const totalFor = (half: PeriodHalf) => byHalf[half].reduce((s, e) => s + e.amount, 0);
  const recurring = visible.filter((e) => e.is_recurring);

  const openModal = useCallback(
    (half: PeriodHalf = 1) => {
      setFormError(null);
      setEditingId(null);
      setForm(emptyForm(showAll ? currentMonthKey : monthKey(month.y, month.m), half));
      setModalOpen(true);
    },
    [currentMonthKey, month, showAll],
  );

  const openEditModal = useCallback(
    (exp: MonthlyExpenseRow) => {
      const dated = exp.expense_date ? periodForDate(payPeriodStarts, exp.expense_date) : null;
      setFormError(null);
      setEditingId(exp.id);
      setForm({
        name: exp.name,
        description: exp.description ?? "",
        amount: formatAmountNumber(exp.amount),
        period_half: dated?.half ?? (exp.period_half === 2 ? 2 : 1),
        month: dated ? monthKey(dated.year, dated.month) : monthKey(exp.period_year, exp.period_month),
        is_recurring: exp.is_recurring,
        date: exp.expense_date ?? "",
      });
      setModalOpen(true);
    },
    [payPeriodStarts],
  );

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
          expense_date: form.date || null,
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
      if (!(await confirmDialog("Delete this monthly expense?"))) return;
      setError(null);
      try {
        await deleteMonthlyExpense(id);
        closeModal();
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete expense");
      }
    },
    [load, closeModal],
  );

  const scopeLabel = showAll ? "All months" : formatMonthYear(month.y, month.m);
  const halfRange = (half: PeriodHalf, at: { y: number; m: number } | null = showAll ? null : month) =>
    at ? periodRangeLabel(payPeriodStarts, at.y, at.m, half) : HALF[half].days;

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="Monthly Expenses"
        description="Bills taken out of your calendar budget, by pay period."
        actions={
          <>
            <MonthStepper
              year={month.y}
              month={month.m}
              onPrev={() => setMonth((v) => addMonths(v.y, v.m, -1))}
              onNext={() => setMonth((v) => addMonths(v.y, v.m, 1))}
              disabled={showAll}
            />
            <button
              type="button"
              aria-pressed={showAll}
              className={showAll ? TOGGLE_ACTIVE_BUTTON_CLASSES : TOGGLE_INACTIVE_BUTTON_CLASSES}
              onClick={() => setShowAll((v) => !v)}
            >
              All months
            </button>
            <button type="button" className={PRIMARY_BUTTON_CLASSES} onClick={() => openModal(1)}>
              <PlusIcon className="size-4" />
              Add expense
            </button>
          </>
        }
      />

      {error && (
        <ErrorAlert>
          {error}
        </ErrorAlert>
      )}

      {loading ? (
        <LoadingBlocks label="Loading monthly expenses…" />
      ) : (
        <>
          <StatStrip className="grid-cols-2 lg:grid-cols-4">
            <Metric
              label={`Total · ${scopeLabel}`}
              value={fmtMoney(totalFor(1) + totalFor(2))}
              hint={`${visible.length} expense${visible.length === 1 ? "" : "s"}`}
              tone="danger"
              size="lg"
            />
            <Metric label={`1st half · ${halfRange(1)}`} value={fmtMoney(totalFor(1))} hint={`${byHalf[1].length} items`} />
            <Metric label={`2nd half · ${halfRange(2)}`} value={fmtMoney(totalFor(2))} hint={`${byHalf[2].length} items`} />
            <Metric
              label="Recurring"
              value={fmtMoney(recurring.reduce((s, e) => s + e.amount, 0))}
              hint={`${recurring.length} every month`}
            />
          </StatStrip>

          <div className="grid gap-5 lg:grid-cols-2">
            {([1, 2] as const).map((half) => (
              <Panel
                key={half}
                flush
                title={HALF[half].label}
                subtitle={`${halfRange(half)} · ${scopeLabel}`}
                actions={
                  <span className="text-lg font-semibold tabular-nums text-danger-text">
                    −{fmtMoney(totalFor(half))}
                  </span>
                }
              >
                {byHalf[half].length === 0 ? (
                  <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                    <button
                      type="button"
                      onClick={() => openModal(half)}
                      className="flex w-full flex-col items-center gap-1 rounded-xl border border-dashed border-line-strong px-4 py-10 text-sm text-ink-3 transition-colors duration-150 hover:border-brand hover:text-brand-text"
                    >
                      <span>Nothing deducted from the {HALF[half].label}.</span>
                      <span className="font-medium">+ Add an expense</span>
                    </button>
                  </div>
                ) : (
                  <>
                    <ul className="divide-y divide-line-soft border-t border-line-soft">
                      {byHalf[half].map((exp) => (
                        <li key={exp.id}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => openEditModal(exp)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openEditModal(exp);
                              }
                            }}
                            className="flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-surface-2/60 sm:px-6"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                <p className="truncate text-sm font-medium text-ink">{exp.name}</p>
                                {exp.is_recurring ? (
                                  <Pill tone="brand">
                                    {exp.expense_date ? `Every ${ordinal(Number(exp.expense_date.slice(8, 10)))}` : "Recurring"}
                                  </Pill>
                                ) : exp.expense_date ? (
                                  <Pill>{formatDate(exp.expense_date)}</Pill>
                                ) : (
                                  showAll && <Pill>{formatMonthYearShort(exp.period_year, exp.period_month)}</Pill>
                                )}
                              </div>
                              {exp.description && (
                                <p className="mt-0.5 truncate text-xs text-ink-3">{exp.description}</p>
                              )}
                            </div>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                              {fmtMoney(exp.amount)}
                            </span>
                            <IconAction kind="delete" label={`Delete ${exp.name}`} onClick={() => void onDelete(exp.id)} />
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="border-t border-line-soft px-3 py-2 sm:px-4">
                      <button type="button" onClick={() => openModal(half)} className={TEXT_BUTTON_CLASSES}>
                        <PlusIcon className="size-4" />
                        Add to {HALF[half].label}
                      </button>
                    </div>
                  </>
                )}
              </Panel>
            ))}
          </div>
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        ariaLabelledBy="monthly-expense-title"
        dialogClassName={`${DIALOG_CLASSES} max-w-md`}
      >
        <ModalHeader
          id="monthly-expense-title"
          title={editingId != null ? "Edit expense" : "New expense"}
          subtitle="Subtracted from that half's daily budget on the calendar."
          onClose={closeModal}
        />
        <form onSubmit={submitForm} className="flex min-h-0 flex-1 flex-col">
          <div className={`${DIALOG_BODY_CLASSES} grid gap-4`}>
            <Field label="Name">
              <input
                required
                autoFocus
                type="text"
                placeholder="e.g. Internet"
                className={INPUT_CLASSES}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                disabled={saving}
              />
            </Field>
            <Field label="Amount">
              <AmountInput
                required
                placeholder="0.00"
                value={form.amount}
                onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
                disabled={saving}
              />
            </Field>
            <Field label="Note" hint="Optional">
              <input
                type="text"
                className={INPUT_CLASSES}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                disabled={saving}
              />
            </Field>
            <Field
              label="Date"
              hint={`Optional · shows on that day${form.is_recurring ? " of every month" : ""} in the calendar`}
            >
              <DatePickerField
                value={form.date}
                onChange={(iso) => {
                  const p = iso ? periodForDate(payPeriodStarts, iso) : null;
                  setForm((f) =>
                    p ? { ...f, date: iso, month: monthKey(p.year, p.month), period_half: p.half } : { ...f, date: "" },
                  );
                }}
                placeholder="No specific date"
                clearLabel="Clear date"
                disabled={saving}
              />
            </Field>

            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-ink-2">
                Deduct from
                {form.date && (
                  <span className="font-normal text-ink-3">
                    {" "}· set by the date{form.is_recurring ? ", each month" : ""}
                  </span>
                )}
              </span>
              <div className={`${SEGMENTED_WRAPPER_CLASSES} w-full`}>
                {([1, 2] as const).map((half) => (
                  <button
                    key={half}
                    type="button"
                    aria-pressed={form.period_half === half}
                    className={`flex-1 ${SEGMENTED_BUTTON_CLASSES} ${
                      form.period_half === half ? SEGMENTED_BUTTON_ACTIVE_CLASSES : SEGMENTED_BUTTON_INACTIVE_CLASSES
                    }`}
                    onClick={() => setForm((f) => ({ ...f, period_half: half }))}
                    disabled={saving || !!form.date}
                  >
                    {HALF[half].label}
                    <span className="ml-1.5 text-xs opacity-70">{halfRange(half, parseMonthKey(form.month))}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5 transition-colors duration-150 hover:bg-surface-2/60">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={form.is_recurring}
                onChange={(e) => setForm((f) => ({ ...f, is_recurring: e.target.checked }))}
                disabled={saving}
              />
              <span className="text-sm">
                <span className="block font-medium text-ink">Repeats every month</span>
                <span className="text-ink-3">Deducted in every month on the calendar.</span>
              </span>
            </label>

            {!form.is_recurring && !form.date && (
              <Field label="Month">
                <MonthPickerField
                  value={form.month}
                  onChange={(v) => setForm((f) => ({ ...f, month: v }))}
                  disabled={saving}
                />
              </Field>
            )}

            {formError && (
              <ErrorAlert>
                {formError}
              </ErrorAlert>
            )}
          </div>
          <div className={DIALOG_FOOTER_CLASSES}>
            {editingId != null && (
              <button
                type="button"
                disabled={saving}
                className={DANGER_TEXT_BUTTON_CLASSES}
                onClick={() => void onDelete(editingId)}
              >
                Delete
              </button>
            )}
            <button type="button" disabled={saving} className={SECONDARY_BUTTON_CLASSES} onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON_CLASSES}>
              {saving ? "Saving…" : editingId != null ? "Save changes" : "Add expense"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
