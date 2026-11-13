"use client";

import { confirmDialog } from "@/components/ConfirmDialog";
import { AmountInput } from "@/components/AmountInput";
import { DatePickerField } from "@/components/DatePickerField";
import { MonthPickerField } from "@/components/MonthPickerField";
import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Modal } from "@/components/Modal";
import {
  ChargedToField,
  CheckOption,
  DANGER_TEXT_BUTTON_CLASSES,
  DIALOG_BODY_CLASSES,
  DIALOG_FOOTER_CLASSES,
  Field,
  LoadingBlocks,
  Metric,
  ModalHeader,
  MonthStepper,
  Panel,
  Pill,
  Segmented,
  Select,
  StatStrip,
  DIALOG_FORM_CLASSES,
} from "@/components/FinanceUI";
import { PlusIcon } from "@/components/Icons";
import { MonthCard, MonthEntry } from "@/components/YearMonthGrid";
import { useWheelStep } from "@/lib/useWheelStep";
import {
  createHousePaymentEntry,
  createMonthlyExpense,
  deleteHousePaymentEntry,
  deleteMonthlyExpense,
  updateMonthlyExpense,
  type BillCategoryRow,
  type BillRow,
  type CreditCardRow,
  type HousePaymentEntry,
  type HousePaymentRow,
  type MonthlyExpenseRow,
  errorMessage,
} from "@/lib/api";
import { queries } from "@/lib/queries";
import { getQueryClient } from "@/lib/queryClient";
import {
  addMonths,
  formatDate,
  formatWeekdayMonthDay,
  formatMonthYear,
  formatMonthYearShort,
  monthKey,
  parseMonthKey,
  toIsoDateLocal,
} from "@/lib/dateFormat";
import { fmtAmount } from "@/lib/formatNumber";
import { formatAmountNumber, parseFormNumber } from "@/lib/parseFormNumber";
import {
  chargedCardIn,
  chargeFrom,
  compareDue,
  effectiveHalfStartIso,
  expenseDuesIn,
  periodForDate,
  periodKey,
  periodRangeLabel,
  spreadExpenseChanges,
  type PeriodHalf,
} from "@/lib/payPeriods";
import { ErrorAlert } from "@/components/ErrorAlert";
import {
  INPUT_CLASSES,
  PAGE_CONTAINER_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
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

const SPREAD_FAILED = "The expense is saved, but the calendar's daily amounts didn't update. Use Even out on the calendar.";

// An expense as the viewed month has it: `amount` stays the estimate, and `shown` is a real bill's when there is one.
// `period` is the pay-period month it's deducted in, which keys skipping, cards and house payments.
type Listed = MonthlyExpenseRow & { shown: number; fromBill: boolean; period: string };

type ExpenseForm = {
  name: string;
  description: string;
  amount: string;
  period_half: PeriodHalf;
  month: string;
  is_recurring: boolean;
  date: string;
  skipped_months: string[];
  charged_months: MonthlyExpenseRow["charged_months"];
  bill_category_id: string; // "" when it has no bills to read
  house_payment_id: string; // "" when it isn't one
  paid: boolean;
};
const emptyForm = (defaultMonth: string): ExpenseForm => ({
  name: "",
  description: "",
  amount: "",
  period_half: 1,
  month: defaultMonth,
  is_recurring: false,
  date: "",
  skipped_months: [],
  charged_months: {},
  bill_category_id: "",
  house_payment_id: "",
  paid: false,
});

export default function MonthlyExpensesClient() {
  const today = useMemo(() => new Date(), []);
  const currentMonthKey = useMemo(
    () => monthKey(today.getFullYear(), today.getMonth() + 1),
    [today],
  );

  const [expenses, setExpenses] = useState<MonthlyExpenseRow[]>([]);
  const [cards, setCards] = useState<CreditCardRow[]>([]);
  const [bills, setBills] = useState<BillRow[]>([]);
  const [billCategories, setBillCategories] = useState<BillCategoryRow[]>([]);
  const [houses, setHouses] = useState<HousePaymentRow[]>([]);
  const [houseEntries, setHouseEntries] = useState<Map<string, HousePaymentEntry[]>>(new Map());
  const [payPeriodStarts, setPayPeriodStarts] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [month, setMonth] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() + 1 }));
  const [showAll, setShowAll] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPeriod, setEditPeriod] = useState(currentMonthKey); // the edited one's pay-period month
  const [form, setForm] = useState<ExpenseForm>(emptyForm(currentMonthKey));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [r, starts, onCards, billData, houseData] = await Promise.all([
        getQueryClient().fetchQuery(queries.monthlyExpenses()),
        getQueryClient().fetchQuery(queries.payPeriodStarts()).catch(() => ({ overrides: [] })),
        getQueryClient().fetchQuery(queries.creditCards()).catch(() => ({ cards: [] })),
        getQueryClient().fetchQuery(queries.bills()).catch(() => ({ categories: [], bills: [] })),
        getQueryClient().fetchQuery(queries.housePayments()).catch(() => ({ house_payments: [] })),
      ]);
      const details = await Promise.all(houseData.house_payments.map((h) => getQueryClient().fetchQuery(queries.housePayment(h.id)).catch(() => null)));
      setExpenses(r.expenses);
      setCards(onCards.cards.map((b) => b.card));
      setBills(billData.bills);
      setBillCategories(billData.categories);
      setHouses(houseData.house_payments);
      setHouseEntries(new Map(details.flatMap((d) => (d ? [[d.house_payment.id, d.entries] as const] : []))));
      setPayPeriodStarts(
        new Map(starts.overrides.map((o) => [periodKey(o.period_year, o.period_month, o.period_half), o.start_date])),
      );
    } catch (e) {
      setError(errorMessage(e, "Failed to load monthly expenses"));
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Grouped by due date, earliest first; undated ones last. A calendar month's dates fall in its own pay-period month
  // or the next one (that starts a few days before the month ends); undated ones go by the pay period they're filed in.
  const byDate = useMemo(() => {
    const dated: [string | null, Listed][] = [];
    const inMonth = monthKey(month.y, month.m);
    const periods = [month, addMonths(month.y, month.m, 1)];
    for (const e of expenses) {
      if (!showAll) {
        periods.forEach((p, i) => {
          const period = monthKey(p.y, p.m);
          for (const { due, amount, fromBill } of expenseDuesIn(e, payPeriodStarts, p.y, p.m, bills)) {
            if (due ? due.slice(0, 7) !== inMonth : i > 0) continue;
            dated.push([due, { ...e, shown: amount, fromBill, period }]);
          }
        });
      } else if (e.period_half === 1 || e.period_half === 2) {
        const period = monthKey(e.period_year, e.period_month);
        dated.push([e.expense_date, { ...e, shown: e.amount, fromBill: false, period }]);
      }
    }
    const groups = new Map<string | null, Listed[]>();
    for (const [due, e] of dated.sort(([a], [b]) => compareDue(a, b))) groups.set(due, [...(groups.get(due) ?? []), e]);
    return [...groups];
  }, [expenses, month, showAll, payPeriodStarts, bills]);

  const listed = byDate.flatMap(([, items]) => items);
  const visible = [...new Map(listed.map((e) => [e.id, e])).values()];

  const isSkipped = (e: Listed) => !showAll && e.skipped_months.includes(e.period);
  const chargedCard = (e: Listed) => (showAll ? null : chargedCardIn(e.charged_months, e.period));
  const offBudget = (e: Listed) => isSkipped(e) || chargedCard(e) != null;
  const totalOf = (items: Listed[]) => items.reduce((s, e) => s + (offBudget(e) ? 0 : e.shown), 0);
  const onCardsOf = (items: Listed[]) =>
    items.reduce((s, e) => s + (!isSkipped(e) && chargedCard(e) != null ? e.shown : 0), 0);
  const recurring = visible.filter((e) => e.is_recurring && !offBudget(e));

  // A saved recurring expense changes card from the month it was opened in; anything else has only its own month.
  const chargeMonth = form.is_recurring && editingId != null ? editPeriod : form.month;
  const chargePeriod = parseMonthKey(chargeMonth);
  const editMonth = parseMonthKey(editPeriod) ?? month;

  const paidEntry = useCallback(
    (houseId: string | null, key: string) =>
      houseEntries.get(houseId ?? "")?.find((x) => {
        const p = periodForDate(payPeriodStarts, x.paid_on);
        return monthKey(p.year, p.month) === key;
      }),
    [houseEntries, payPeriodStarts],
  );

  const openModal = useCallback(() => {
    setFormError(null);
    setEditingId(null);
    setForm(emptyForm(showAll ? currentMonthKey : monthKey(month.y, month.m)));
    setModalOpen(true);
  }, [currentMonthKey, month, showAll]);

  const openEditModal = useCallback(
    (exp: Listed) => {
      const dated = exp.expense_date ? periodForDate(payPeriodStarts, exp.expense_date) : null;
      setFormError(null);
      setEditingId(exp.id);
      setEditPeriod(exp.period);
      setForm({
        name: exp.name,
        description: exp.description ?? "",
        amount: formatAmountNumber(exp.amount),
        period_half: dated?.half ?? (exp.period_half === 2 ? 2 : 1),
        month: dated ? monthKey(dated.year, dated.month) : monthKey(exp.period_year, exp.period_month),
        is_recurring: exp.is_recurring,
        date: exp.expense_date ?? "",
        skipped_months: exp.skipped_months,
        charged_months: exp.charged_months,
        bill_category_id: exp.bill_category_id ?? "",
        house_payment_id: exp.house_payment_id ?? "",
        paid: paidEntry(exp.house_payment_id, exp.period) != null,
      });
      setModalOpen(true);
    },
    [payPeriodStarts, paidEntry],
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
          skipped_months: form.skipped_months,
          charged_months: form.charged_months,
          bill_category_id: form.bill_category_id || null,
          house_payment_id: form.house_payment_id || null,
        };
        const before = expenses.find((x) => x.id === editingId) ?? null;
        const { expense } = await (editingId != null
          ? updateMonthlyExpense(editingId, body)
          : createMonthlyExpense(body));

        // Logging it on House Payments deducts nothing more: this expense already does.
        const house = expense.house_payment_id;
        const logged = paidEntry(house, chargeMonth);
        if (house && chargePeriod && form.paid && !logged) {
          const [due] = expenseDuesIn(expense, payPeriodStarts, chargePeriod.y, chargePeriod.m, bills);
          const today = toIsoDateLocal(new Date());
          const now = periodForDate(payPeriodStarts, today);
          const paid_on =
            monthKey(now.year, now.month) === chargeMonth
              ? today
              : (due?.due ?? effectiveHalfStartIso(payPeriodStarts, chargePeriod.y, chargePeriod.m, due?.half ?? 1));
          await createHousePaymentEntry(house, { paid_on, amount: due?.amount ?? amount });
        } else if (house && !form.paid && logged) {
          await deleteHousePaymentEntry(house, logged.id);
        }

        setModalOpen(false);
        setEditingId(null);
        await load();
        await spreadExpenseChanges(payPeriodStarts, [{ before, after: expense }], bills).catch(() =>
          setError(SPREAD_FAILED),
        );
      } catch (err) {
        setFormError(errorMessage(err, "Failed to save expense"));
      } finally {
        setSaving(false);
      }
    },
    [form, editingId, load, expenses, chargeMonth, chargePeriod, payPeriodStarts, bills, paidEntry],
  );

  const onDelete = useCallback(
    async (id: string) => {
      if (!(await confirmDialog("Delete this monthly expense?"))) return;
      setError(null);
      try {
        const before = expenses.find((x) => x.id === id) ?? null;
        await deleteMonthlyExpense(id);
        closeModal();
        await load();
        await spreadExpenseChanges(payPeriodStarts, [{ before, after: null }], bills).catch(() => setError(SPREAD_FAILED));
      } catch (err) {
        setError(errorMessage(err, "Failed to delete expense"));
      }
    },
    [load, closeModal, expenses, payPeriodStarts, bills],
  );

  const billSources = billCategories.filter((c) => !c.is_credit_card || c.id === form.bill_category_id);
  const scopeLabel = showAll ? "All months" : formatMonthYear(month.y, month.m);
  const halfRange = (half: PeriodHalf, at: { y: number; m: number } | null) =>
    at ? periodRangeLabel(payPeriodStarts, at.y, at.m, half) : HALF[half].days;
  const dueLabel = (due: string | null) => (!due ? "No date" : showAll ? formatDate(due) : formatWeekdayMonthDay(due));
  const wheelRef = useWheelStep(showAll ? null : (dir) => setMonth((v) => addMonths(v.y, v.m, dir)));

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="Monthly Expenses"
        description="Bills taken out of your calendar budget, by date."
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
            <button type="button" className={PRIMARY_BUTTON_CLASSES} onClick={openModal}>
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
          <StatStrip className="grid-cols-2">
            <Metric
              label={`Total · ${scopeLabel}`}
              value={fmtMoney(totalOf(listed))}
              hint={`${visible.length} expense${visible.length === 1 ? "" : "s"} · ${fmtMoney(onCardsOf(listed))} on cards`}
              tone="danger"
              size="lg"
            />
            <Metric
              label="Recurring"
              value={fmtMoney(recurring.reduce((s, e) => s + e.shown, 0))}
              hint={`${recurring.length} every month · ${fmtMoney(onCardsOf(visible.filter((e) => e.is_recurring)))} on cards`}
            />
          </StatStrip>

          <Panel ref={wheelRef} title={scopeLabel} subtitle={showAll ? undefined : "Scroll here to change month"}>
            {byDate.length === 0 ? (
              <button
                type="button"
                onClick={openModal}
                className="flex w-full flex-col items-center gap-1 rounded-xl border border-dashed border-line-strong px-4 py-10 text-sm text-ink-3 transition-colors duration-150 hover:border-brand hover:text-brand-text"
              >
                <span>Nothing deducted in {scopeLabel}.</span>
                <span className="font-medium">+ Add an expense</span>
              </button>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {byDate.map(([due, items]) => (
                  <MonthCard key={due ?? "undated"} name={dueLabel(due)} total={fmtMoney(totalOf(items))}>
                    {items.map((exp) => (
                      <MonthEntry key={exp.id} ariaLabel={`Edit ${exp.name}`} onClick={() => openEditModal(exp)}>
                        <div className={`flex items-baseline justify-between gap-2 ${offBudget(exp) ? "opacity-60" : ""}`}>
                          <span className="truncate text-sm font-medium text-ink">{exp.name}</span>
                          <span
                            className={`shrink-0 font-mono text-sm font-semibold tabular-nums text-ink ${
                              offBudget(exp) ? "line-through" : ""
                            }`}
                          >
                            {fmtMoney(exp.shown)}
                          </span>
                        </div>
                        {exp.description && <div className="mt-0.5 truncate text-xs text-ink-3">{exp.description}</div>}
                        <div className="mt-2 flex flex-wrap gap-1 empty:hidden">
                          {isSkipped(exp) && <Pill tone="warning">Skipped this month</Pill>}
                          {chargedCard(exp) != null && (
                            <Pill>On {cards.find((c) => c.id === chargedCard(exp))?.name ?? "a card"}</Pill>
                          )}
                          {exp.fromBill && <Pill>Actual bill</Pill>}
                          {!showAll && paidEntry(exp.house_payment_id, exp.period) && (
                            <Pill tone="success">Paid</Pill>
                          )}
                          {exp.is_recurring ? (
                            <Pill tone="brand">
                              {exp.expense_date ? `Every ${ordinal(Number(exp.expense_date.slice(8, 10)))}` : "Recurring"}
                            </Pill>
                          ) : (
                            showAll && !exp.expense_date && (
                              <Pill>{formatMonthYearShort(exp.period_year, exp.period_month)}</Pill>
                            )
                          )}
                        </div>
                      </MonthEntry>
                    ))}
                  </MonthCard>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        ariaLabelledBy="monthly-expense-title"
        size="md"
      >
        <ModalHeader
          id="monthly-expense-title"
          title={editingId != null ? "Edit expense" : "New expense"}
          subtitle="Subtracted from that half's daily budget on the calendar."
          onClose={closeModal}
        />
        <form onSubmit={submitForm} className={DIALOG_FORM_CLASSES}>
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
              <Segmented
                label="Pay period"
                options={([1, 2] as const).map((half) => ({
                  value: half,
                  label: (
                    <>
                      {HALF[half].label}
                      <span className="text-xs opacity-70">{halfRange(half, parseMonthKey(form.month))}</span>
                    </>
                  ),
                }))}
                value={form.period_half}
                onChange={(half) => setForm((f) => ({ ...f, period_half: half }))}
                disabled={saving || !!form.date}
                fill
              />
            </div>

            <CheckOption
              title="Repeats every month"
              checked={form.is_recurring}
              onChange={(e) => setForm((f) => ({ ...f, is_recurring: e.target.checked }))}
              disabled={saving}
            >
              Deducted in every month on the calendar.
            </CheckOption>

            {editingId != null && !showAll && (
              <CheckOption
                title="Skip this month"
                checked={form.skipped_months.includes(editPeriod)}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    skipped_months: e.target.checked
                      ? [...f.skipped_months, editPeriod]
                      : f.skipped_months.filter((k) => k !== editPeriod),
                  }))
                }
                disabled={saving}
              >
                Not deducted from the {formatMonthYear(editMonth.y, editMonth.m)} pay period. Other months stay as they are.
              </CheckOption>
            )}

            {!form.is_recurring && !form.date && (
              <Field label="Month">
                <MonthPickerField
                  value={form.month}
                  onChange={(v) => setForm((f) => ({ ...f, month: v }))}
                  disabled={saving}
                />
              </Field>
            )}

            {cards.length > 0 && !(showAll && editingId != null && form.is_recurring) && (
              <ChargedToField
                cards={cards}
                value={chargedCardIn(form.charged_months, chargeMonth) ?? ""}
                onChange={(cardId) =>
                  setForm((f) => ({ ...f, charged_months: chargeFrom(f.charged_months, chargeMonth, cardId || null) }))
                }
                hint={
                  form.is_recurring && chargePeriod
                    ? `${formatMonthYear(chargePeriod.y, chargePeriod.m)} onward: a card keeps it out of the calendar budget. Earlier months don't change.`
                    : "A card keeps it out of the calendar budget."
                }
                disabled={saving}
              />
            )}

            {billSources.length > 0 && (
              <Field label="Real bills from" hint="Once a month's bill is in, it replaces the amount and date above for that month.">
                <Select
                  value={form.bill_category_id}
                  onChange={(id) => setForm((f) => ({ ...f, bill_category_id: id }))}
                  disabled={saving}
                  options={[
                    { value: "", label: "Not linked to bills" },
                    ...billSources.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </Field>
            )}

            {houses.length > 0 && (
              <Field label="House payment">
                <Select
                  value={form.house_payment_id}
                  onChange={(id) => setForm((f) => ({ ...f, house_payment_id: id }))}
                  disabled={saving}
                  options={[
                    { value: "", label: "Not a house payment" },
                    ...houses.map((h) => ({ value: h.id, label: h.name })),
                  ]}
                />
              </Field>
            )}

            {form.house_payment_id && chargePeriod && !showAll && (
              <CheckOption
                title={`Paid for ${formatMonthYear(chargePeriod.y, chargePeriod.m)}`}
                checked={form.paid}
                onChange={(e) => setForm((f) => ({ ...f, paid: e.target.checked }))}
                disabled={saving}
              >
                Logs it on House Payments. Nothing extra comes out of your budget.
              </CheckOption>
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
