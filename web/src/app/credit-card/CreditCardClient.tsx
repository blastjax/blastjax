"use client";

import { confirmDialog } from "@/components/ConfirmDialog";
import { AmountInput } from "@/components/AmountInput";
import { DatePickerField } from "@/components/DatePickerField";
import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "@/components/Modal";
import {
  DANGER_TEXT_BUTTON_CLASSES,
  DIALOG_BODY_CLASSES,
  DIALOG_CLASSES,
  DIALOG_FOOTER_CLASSES,
  EmptyState,
  Field,
  LoadingBlocks,
  Metric,
  Meter,
  ModalHeader,
  Panel,
  Pill,
  Segmented,
  TEXT_BUTTON_CLASSES,
  TILE_BUTTON_CLASSES,
} from "@/components/FinanceUI";
import { CreditCardIcon, PlusIcon } from "@/components/Icons";
import {
  adjustCreditCardBalance,
  createCreditCard,
  createCreditCardPayment,
  deleteCreditCard,
  deleteCreditCardPayment,
  getBills,
  getCreditCards,
  getPayPeriodStartOverrides,
  updateCreditCard,
  updateCreditCardPayment,
  type BillCategoryRow,
  type BudgetChange,
  type CreditCardBundle,
  type CreditCardPaymentRow,
  type CreditCardRow,
} from "@/lib/api";
import { formatAmountNumber, parseFormNumber } from "@/lib/parseFormNumber";
import { formatDate, parseDateOnlyLocal, toIsoDateLocal } from "@/lib/dateFormat";
import { fmtAmountOrDash } from "@/lib/formatNumber";
import {
  payslipHalfFor,
  periodForDate,
  periodKey,
  periodRangeLabel,
  spreadBudgetChanges,
  type PeriodHalf,
} from "@/lib/payPeriods";
import { ErrorAlert } from "@/components/ErrorAlert";
import {
  INPUT_CLASSES,
  PAGE_CONTAINER_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
  TABLE_CELL_CLASSES,
  TABLE_HEAD_CELL_CLASSES,
  TABLE_HEAD_ROW_CLASSES,
  TABLE_ROW_CLASSES,
} from "@/lib/ui";

const fmtMoney = fmtAmountOrDash;

const fmtDate = formatDate;

function todayInputDate(): string {
  return toIsoDateLocal(new Date());
}

function dueCountdown(iso: string | null): { text: string; tone: "neutral" | "warning" | "danger" } | null {
  const d = iso ? parseDateOnlyLocal(iso) : null;
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const n = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (n < 0) return { text: `${-n} day${n === -1 ? "" : "s"} ago`, tone: "neutral" };
  if (n === 0) return { text: "Due today", tone: "danger" };
  return { text: `In ${n} day${n === 1 ? "" : "s"}`, tone: n <= 7 ? "warning" : "neutral" };
}

type PayoffByPayment = {
  months: number;
  totalPaid: number;
  totalInterest: number;
  reachable: boolean;
};

function payoffMonthsForPayment(
  balance: number,
  monthlyRate: number,
  payment: number,
  maxMonths = 1200,
): PayoffByPayment {
  if (balance <= 0) return { months: 0, totalPaid: 0, totalInterest: 0, reachable: true };
  let bal = balance;
  let months = 0;
  let totalPaid = 0;
  let totalInterest = 0;
  while (bal > 0.005 && months < maxMonths) {
    const interest = bal * monthlyRate;
    bal += interest;
    const pay = Math.min(payment, bal);
    bal -= pay;
    totalPaid += pay;
    totalInterest += interest;
    months += 1;
  }
  return { months, totalPaid, totalInterest, reachable: bal <= 0.005 };
}

type PayoffByMonths = { payment: number; totalPaid: number; totalInterest: number };

function paymentForMonths(balance: number, monthlyRate: number, months: number): PayoffByMonths {
  if (balance <= 0 || months <= 0) return { payment: 0, totalPaid: 0, totalInterest: 0 };
  const payment =
    monthlyRate <= 0
      ? balance / months
      : (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
  const totalPaid = payment * months;
  return { payment, totalPaid, totalInterest: totalPaid - balance };
}

type CardForm = {
  name: string;
  credit_limit: string;
  last_statement_balance: string;
  minimum_due: string;
  interest_rate: string;
  statement_date: string;
  due_date: string;
  bill_category_id: string; // "" when the statement is typed in
};

const emptyCardForm = (): CardForm => ({
  name: "",
  credit_limit: "",
  last_statement_balance: "",
  minimum_due: "",
  interest_rate: "3.5",
  statement_date: "",
  due_date: "",
  bill_category_id: "",
});

type PaymentForm = { amount: string; payment_date: string; note: string };

const emptyPaymentForm = (): PaymentForm => ({
  amount: "",
  payment_date: todayInputDate(),
  note: "",
});

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="flex items-center gap-2 text-sm font-medium tabular-nums text-ink">{children}</dd>
    </div>
  );
}

function CardDetails({
  bundle: { card, installments, payments },
  linkedCategory,
  onAdjustBalance,
  onRecordPayment,
  onEditPayment,
}: {
  bundle: CreditCardBundle;
  linkedCategory: BillCategoryRow | undefined;
  onAdjustBalance: () => void;
  onRecordPayment: () => void;
  onEditPayment: (p: CreditCardPaymentRow) => void;
}) {
  const [calcMode, setCalcMode] = useState<"payment" | "months">("payment");
  const [calcPaymentInput, setCalcPaymentInput] = useState("");
  const [calcMonthsInput, setCalcMonthsInput] = useState("");

  const scenarios = useMemo(() => {
    const rate = card.interest_rate / 100;
    const row = (label: string, remaining: number) => {
      const interest = remaining * rate;
      return {
        label,
        pay: card.current_balance - remaining,
        remaining,
        interest,
        nextStatement: remaining + interest,
      };
    };
    return [
      row("Pay in full", 0),
      row("Pay half", Math.max(card.current_balance / 2, 0)),
      row("Pay the minimum", Math.max(card.current_balance - card.minimum_due, 0)),
    ];
  }, [card]);

  const payoffByPayment = useMemo(() => {
    const payment = parseFormNumber(calcPaymentInput);
    if (payment == null || payment <= 0) return null;
    return payoffMonthsForPayment(card.current_balance, card.interest_rate / 100, payment);
  }, [card, calcPaymentInput]);

  const payoffByMonths = useMemo(() => {
    const months = parseFormNumber(calcMonthsInput);
    if (months == null || months < 1) return null;
    return paymentForMonths(card.current_balance, card.interest_rate / 100, Math.round(months));
  }, [card, calcMonthsInput]);

  const installmentDues = Math.max(card.monthly_dues - card.minimum_due, 0);
  const used = card.credit_limit > 0 ? card.current_balance / card.credit_limit : 0;
  const due = dueCountdown(card.due_date);

  const calcInput = calcMode === "payment" ? calcPaymentInput : calcMonthsInput;
  let calcResult: { error: string } | { cells: [string, string][] } | null = null;
  if (calcInput.trim() !== "") {
    if (calcMode === "payment") {
      calcResult =
        payoffByPayment == null
          ? { error: "Enter an amount greater than zero." }
          : !payoffByPayment.reachable
            ? { error: "That doesn't cover the monthly interest, so the balance never clears. Try more." }
            : {
                cells: [
                  ["Paid off in", `${payoffByPayment.months} month${payoffByPayment.months === 1 ? "" : "s"}`],
                  ["Total interest", fmtMoney(payoffByPayment.totalInterest)],
                  ["Total paid", fmtMoney(payoffByPayment.totalPaid)],
                ],
              };
    } else {
      calcResult =
        payoffByMonths == null
          ? { error: "Enter a number of months greater than zero." }
          : {
              cells: [
                ["Pay each month", fmtMoney(payoffByMonths.payment)],
                ["Total interest", fmtMoney(payoffByMonths.totalInterest)],
                ["Total paid", fmtMoney(payoffByMonths.totalPaid)],
              ],
            };
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="relative flex min-h-[15rem] flex-col justify-between overflow-hidden rounded-2xl bg-linear-to-br from-indigo-600 via-indigo-700 to-indigo-950 p-6 text-white shadow-md sm:p-7">
          <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-white/10" />
          <span aria-hidden className="pointer-events-none absolute -bottom-28 right-16 size-60 rounded-full bg-white/5" />
          <div className="relative flex items-start justify-between gap-3">
            <p className="truncate text-sm font-semibold tracking-wide text-white/85">{card.name}</p>
            <CreditCardIcon className="size-7 shrink-0 text-white/70" />
          </div>
          <div className="relative mt-6">
            <p className="text-xs font-medium uppercase tracking-wider text-white/60">Current balance</p>
            <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
              {fmtMoney(card.current_balance)}
            </p>
          </div>
          <div className="relative mt-6">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-500"
                style={{ width: `${Math.max(0, Math.min(1, used)) * 100}%` }}
              />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-white/75">
              <span>
                <span className="font-semibold text-white">{Math.round(used * 100)}%</span> of{" "}
                {fmtMoney(card.credit_limit)} limit used
              </span>
              <button
                type="button"
                onClick={onAdjustBalance}
                className="rounded-md px-1.5 py-0.5 font-medium text-white transition-colors hover:bg-white/15"
                data-tooltip="Match what your bank shows"
              >
                {fmtMoney(card.available_limit)} available · Adjust
              </button>
            </div>
          </div>
        </div>

        <Panel
          title="Statement"
          subtitle={
            linkedCategory && (
              <>
                Latest{" "}
                <Link href="/bills" className="font-medium text-brand-text hover:underline">
                  {linkedCategory.name}
                </Link>{" "}
                bill
              </>
            )
          }
          actions={due && <Pill tone={due.tone}>{due.text}</Pill>}
        >
          <dl className="-my-2.5 divide-y divide-line-soft">
            <Row label="Statement balance">{fmtMoney(card.last_statement_balance)}</Row>
            <Row label="Minimum due">{fmtMoney(card.minimum_due)}</Row>
            <Row label="Statement date">{fmtDate(card.statement_date)}</Row>
            <Row label="Due date">{fmtDate(card.due_date)}</Row>
            <Row label="Interest">{card.interest_rate}% / month</Row>
          </dl>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Panel title="Due this month" subtitle="What to set aside for this card.">
          <dl className="-my-2.5 divide-y divide-line-soft">
            <Row label="Minimum due">{fmtMoney(card.minimum_due)}</Row>
            <Row label={`Installments (${installments.length})`}>{fmtMoney(installmentDues)}</Row>
          </dl>
          <div className="mt-4 flex items-end justify-between gap-3 rounded-xl bg-brand-soft px-4 py-3.5">
            <span className="text-sm font-medium text-brand-text">Total this month</span>
            <span className="text-2xl font-semibold tabular-nums text-brand-text">
              {fmtMoney(card.monthly_dues)}
            </span>
          </div>
        </Panel>

        <Panel
          flush
          title="If you don't pay in full"
          subtitle="Estimate at a flat monthly rate, no new purchases. Your bank's average-daily-balance charge may differ."
        >
          {/* Phones: stacked rows, since 5 amount columns can't fit. */}
          <ul className="divide-y divide-line-soft border-t border-line-soft text-sm tabular-nums sm:hidden">
            {scenarios.map((s) => (
              <li key={s.label} className="px-5 py-3">
                <p className="font-medium text-ink">{s.label}</p>
                <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt className="text-ink-3">Pay now</dt>
                  <dd className="text-right text-ink-2">{fmtMoney(s.pay)}</dd>
                  <dt className="text-ink-3">Carried over</dt>
                  <dd className="text-right text-ink-2">{fmtMoney(s.remaining)}</dd>
                  <dt className="text-ink-3">Interest</dt>
                  <dd className={`text-right font-medium ${s.interest > 0 ? "text-danger-text" : "text-success-text"}`}>
                    {s.interest > 0 ? `+${fmtMoney(s.interest)}` : "None"}
                  </dd>
                  <dt className="text-ink-3">Next statement</dt>
                  <dd className="text-right font-semibold text-ink">{fmtMoney(s.nextStatement)}</dd>
                </dl>
              </li>
            ))}
          </ul>
          <div className="overflow-x-auto max-sm:hidden">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className={TABLE_HEAD_ROW_CLASSES}>
                  <th className={`${TABLE_HEAD_CELL_CLASSES} text-left`}>If you…</th>
                  <th className={`${TABLE_HEAD_CELL_CLASSES} text-right`}>Pay now</th>
                  <th className={`${TABLE_HEAD_CELL_CLASSES} text-right`}>Carried over</th>
                  <th className={`${TABLE_HEAD_CELL_CLASSES} text-right`}>Interest</th>
                  <th className={`${TABLE_HEAD_CELL_CLASSES} text-right`}>Next statement</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.label} className={TABLE_ROW_CLASSES}>
                    <td className={`${TABLE_CELL_CLASSES} font-medium text-ink`}>{s.label}</td>
                    <td className={`${TABLE_CELL_CLASSES} text-right`}>{fmtMoney(s.pay)}</td>
                    <td className={`${TABLE_CELL_CLASSES} text-right`}>{fmtMoney(s.remaining)}</td>
                    <td
                      className={`${TABLE_CELL_CLASSES} text-right font-medium ${s.interest > 0 ? "text-danger-text" : "text-success-text"}`}
                    >
                      {s.interest > 0 ? `+${fmtMoney(s.interest)}` : "None"}
                    </td>
                    <td className={`${TABLE_CELL_CLASSES} text-right font-semibold text-ink`}>
                      {fmtMoney(s.nextStatement)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel
        title="Payoff calculator"
        subtitle={`From your ${fmtMoney(card.current_balance)} balance at ${card.interest_rate}% a month, no new purchases.`}
      >
        {card.current_balance <= 0 ? (
          <p className="rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success-text">
            Nothing to pay off. Your balance is clear.
          </p>
        ) : (
          <div className="grid gap-5 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:items-start">
            <div className="flex flex-col gap-3">
              <Segmented
                label="Calculate by"
                options={[
                  { value: "payment", label: "By payment" },
                  { value: "months", label: "By months" },
                ]}
                value={calcMode}
                onChange={setCalcMode}
                fill
              />
              {calcMode === "payment" ? (
                <Field label="I can pay each month">
                  <AmountInput placeholder="0.00" value={calcPaymentInput} onChange={setCalcPaymentInput} />
                </Field>
              ) : (
                <Field label="Paid off in (months)">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="12"
                    className={INPUT_CLASSES}
                    value={calcMonthsInput}
                    onChange={(e) => setCalcMonthsInput(e.target.value)}
                  />
                </Field>
              )}
            </div>
            <div
              className="flex min-h-[6.5rem] items-center rounded-xl border border-line bg-surface-2/50 p-4"
              aria-live="polite"
            >
              {calcResult == null ? (
                <p className="text-sm text-ink-3">
                  {calcMode === "payment"
                    ? "Enter a monthly amount to see how long payoff takes."
                    : "Enter a number of months to see the payment needed."}
                </p>
              ) : "error" in calcResult ? (
                <p className="text-sm font-medium text-danger-text">{calcResult.error}</p>
              ) : (
                <div className="grid w-full gap-4 sm:grid-cols-3">
                  {calcResult.cells.map(([label, value], i) => (
                    <Metric
                      key={label}
                      label={label}
                      value={value}
                      tone={i === 0 ? "brand" : i === 1 ? "danger" : "neutral"}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          flush
          title="Installments on this card"
          actions={
            <Link href="/installments" className={TEXT_BUTTON_CLASSES}>
              Manage →
            </Link>
          }
        >
          {installments.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-ink-3 sm:px-6">No installments are linked to this card.</p>
          ) : (
            <ul className="divide-y divide-line-soft border-t border-line-soft">
              {installments.map((ins) => {
                const done = Math.max(0, Math.min(ins.installment_current - 1, ins.installment_total));
                return (
                  <li key={ins.id} className="px-5 py-3.5 sm:px-6">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-medium text-ink">{ins.name}</p>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                        {fmtMoney(ins.remaining)}
                        <span className="ml-1 text-xs font-normal text-ink-4">left</span>
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <Meter
                        className="flex-1"
                        value={ins.installment_total > 0 ? done / ins.installment_total : 0}
                        label={`${ins.name} progress`}
                      />
                      <span className="shrink-0 text-xs tabular-nums text-ink-3">
                        {done}/{ins.installment_total} paid
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          flush
          title="Payments"
          actions={
            <button type="button" className={TEXT_BUTTON_CLASSES} onClick={onRecordPayment}>
              <PlusIcon className="size-4" />
              Record
            </button>
          }
        >
          {payments.length === 0 ? (
            <p className="px-5 pb-6 text-sm text-ink-3 sm:px-6">No payments recorded yet.</p>
          ) : (
            <ul className="divide-y divide-line-soft border-t border-line-soft">
              {payments.map((p) => (
                <li
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  data-tooltip="Double-click to edit or delete"
                  onDoubleClick={() => onEditPayment(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onEditPayment(p);
                    }
                  }}
                  className="flex cursor-pointer select-none items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-surface-2/60 sm:px-6"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{fmtDate(p.payment_date)}</p>
                    {p.note && <p className="mt-0.5 truncate text-xs text-ink-3">{p.note}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-success-text">
                    −{fmtMoney(p.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function CreditCardClient() {
  const [cards, setCards] = useState<CreditCardBundle[]>([]);
  const [billCategories, setBillCategories] = useState<BillCategoryRow[]>([]);
  const [payPeriodStarts, setPayPeriodStarts] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The card the details, edit, payment and balance modals act on.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const selected = cards.find((b) => b.card.id === selectedId);
  const card = selected?.card ?? null;

  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [cardForm, setCardForm] = useState<CardForm>(emptyCardForm());
  const [cardSaving, setCardSaving] = useState(false);
  const [cardFormError, setCardFormError] = useState<string | null>(null);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(emptyPaymentForm());
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentFormError, setPaymentFormError] = useState<string | null>(null);

  const [balanceModalOpen, setBalanceModalOpen] = useState(false);
  const [balanceForm, setBalanceForm] = useState("");
  const [balanceSaving, setBalanceSaving] = useState(false);
  const [balanceFormError, setBalanceFormError] = useState<string | null>(null);


  const load = useCallback(async () => {
    setError(null);
    try {
      // Bills only name where a linked statement comes from; the cards work without them.
      const [r, bills, starts] = await Promise.all([
        getCreditCards(),
        getBills().catch(() => null),
        getPayPeriodStartOverrides().catch(() => ({ overrides: [] })),
      ]);
      setCards(r.cards);
      setBillCategories(bills?.categories ?? []);
      setPayPeriodStarts(
        new Map(starts.overrides.map((o) => [periodKey(o.period_year, o.period_month, o.period_half), o.start_date])),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load credit cards");
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetails = useCallback((id: string) => {
    setSelectedId(id);
    setDetailsOpen(true);
  }, []);

  const closeDetails = useCallback(() => {
    setDetailsOpen(false);
  }, []);

  const openCardModal = useCallback((target: CreditCardRow | null) => {
    setCardFormError(null);
    setSelectedId(target?.id ?? null);
    if (target) {
      setCardForm({
        name: target.name,
        credit_limit: formatAmountNumber(target.credit_limit),
        last_statement_balance: formatAmountNumber(target.last_statement_balance),
        minimum_due: formatAmountNumber(target.minimum_due),
        interest_rate: String(target.interest_rate),
        statement_date: target.statement_date ? target.statement_date.slice(0, 10) : "",
        due_date: target.due_date ? target.due_date.slice(0, 10) : "",
        bill_category_id: target.bill_category_id ?? "",
      });
    } else {
      setCardForm(emptyCardForm());
    }
    setCardModalOpen(true);
  }, []);

  const closeCardModal = useCallback(() => {
    setCardModalOpen(false);
  }, []);

  const submitCardForm = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const name = cardForm.name.trim();
      if (!name) {
        setCardFormError("Enter a name for the card.");
        return;
      }
      const creditLimit = parseFormNumber(cardForm.credit_limit);
      if (creditLimit == null || creditLimit <= 0) {
        setCardFormError("Enter a valid credit limit greater than zero.");
        return;
      }
      // A linked card's statement comes from its bills, so only a typed-in one is checked here.
      const linked = cardForm.bill_category_id !== "";
      const lastStatementBalance = parseFormNumber(cardForm.last_statement_balance);
      if (!linked && lastStatementBalance == null) {
        setCardFormError("Enter a valid last statement balance.");
        return;
      }
      const minimumDue = parseFormNumber(cardForm.minimum_due);
      if (!linked && (minimumDue == null || minimumDue < 0)) {
        setCardFormError("Enter a valid minimum amount due.");
        return;
      }
      const interestRate = parseFormNumber(cardForm.interest_rate);
      if (interestRate == null || interestRate < 0) {
        setCardFormError("Enter a valid monthly interest rate.");
        return;
      }
      setCardFormError(null);
      setCardSaving(true);
      try {
        const body = {
          name,
          credit_limit: creditLimit,
          last_statement_balance: lastStatementBalance ?? 0,
          minimum_due: minimumDue ?? 0,
          interest_rate: interestRate,
          statement_date: cardForm.statement_date || null,
          due_date: cardForm.due_date || null,
          bill_category_id: linked ? cardForm.bill_category_id : null,
        };
        if (card) {
          await updateCreditCard(card.id, body);
        } else {
          await createCreditCard(body);
        }
        setCardModalOpen(false);
        await load();
      } catch (err) {
        setCardFormError(err instanceof Error ? err.message : "Failed to save credit card");
      } finally {
        setCardSaving(false);
      }
    },
    [cardForm, card, load],
  );

  const onRemoveCard = useCallback(async () => {
    if (!card) return;
    const prompt = `Remove ${card.name} and its payments? Linked installments will be unlinked.`;
    if (!(await confirmDialog(prompt, "Remove"))) return;
    setCardFormError(null);
    try {
      await deleteCreditCard(card.id);
      setCardModalOpen(false);
      setDetailsOpen(false);
      await load();
    } catch (err) {
      setCardFormError(err instanceof Error ? err.message : "Failed to remove credit card");
    }
  }, [card, load]);

  const openPaymentModal = useCallback((target: CreditCardRow) => {
    setPaymentFormError(null);
    setSelectedId(target.id);
    setEditingPaymentId(null);
    setPaymentForm(emptyPaymentForm());
    setPaymentModalOpen(true);
  }, []);

  const openEditPayment = useCallback((p: CreditCardPaymentRow) => {
    setPaymentFormError(null);
    setEditingPaymentId(p.id);
    setPaymentForm({
      amount: formatAmountNumber(p.amount),
      payment_date: p.payment_date.slice(0, 10),
      note: p.note ?? "",
    });
    setPaymentModalOpen(true);
  }, []);

  const closePaymentModal = useCallback(() => {
    setPaymentModalOpen(false);
  }, []);

  const spreadOverCalendar = useCallback(
    async (changes: BudgetChange[]) => {
      try {
        await spreadBudgetChanges(
          payPeriodStarts,
          changes.map((c) => ({
            year: c.period_year,
            month: c.period_month,
            half: payslipHalfFor(c.period_half as PeriodHalf),
            delta: c.delta,
          })),
        );
      } catch {
        setError("The payment is saved, but the calendar's daily amounts didn't update. Use Even out on the calendar.");
      }
    },
    [payPeriodStarts],
  );

  const submitPaymentForm = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!card) return;
      const amount = parseFormNumber(paymentForm.amount);
      if (amount == null || amount <= 0) {
        setPaymentFormError("Enter a valid amount greater than zero.");
        return;
      }
      if (!paymentForm.payment_date) {
        setPaymentFormError("Pick a payment date.");
        return;
      }
      setPaymentFormError(null);
      setPaymentSaving(true);
      try {
        const period = periodForDate(payPeriodStarts, paymentForm.payment_date);
        const body = {
          amount,
          payment_date: paymentForm.payment_date,
          note: paymentForm.note.trim() || null,
          period_half: payslipHalfFor(period.half),
          period_year: period.year,
          period_month: period.month,
        };
        const { payment } = await (editingPaymentId != null
          ? updateCreditCardPayment(editingPaymentId, body)
          : createCreditCardPayment(card.id, body));
        setPaymentModalOpen(false);
        await load();
        await spreadOverCalendar(payment.budget_changes);
      } catch (err) {
        setPaymentFormError(err instanceof Error ? err.message : "Failed to save payment");
      } finally {
        setPaymentSaving(false);
      }
    },
    [card, paymentForm, editingPaymentId, load, payPeriodStarts, spreadOverCalendar],
  );

  const onDeletePayment = useCallback(
    async (id: string) => {
      if (!(await confirmDialog("Delete this payment? The card balance and your calendar budget both go back."))) return;
      setPaymentFormError(null);
      setPaymentSaving(true);
      try {
        const { budget_changes } = await deleteCreditCardPayment(id);
        setPaymentModalOpen(false);
        await load();
        await spreadOverCalendar(budget_changes);
      } catch (err) {
        setPaymentFormError(err instanceof Error ? err.message : "Failed to delete payment");
      } finally {
        setPaymentSaving(false);
      }
    },
    [load, spreadOverCalendar],
  );

  const openBalanceModal = useCallback(() => {
    if (!card) return;
    setBalanceFormError(null);
    setBalanceForm(formatAmountNumber(card.available_limit));
    setBalanceModalOpen(true);
  }, [card]);

  const closeBalanceModal = useCallback(() => {
    setBalanceModalOpen(false);
  }, []);

  const submitBalanceForm = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!card) return;
      const availableLimit = parseFormNumber(balanceForm);
      if (availableLimit == null) {
        setBalanceFormError("Enter a valid available credit amount.");
        return;
      }
      setBalanceFormError(null);
      setBalanceSaving(true);
      try {
        await adjustCreditCardBalance(card.id, availableLimit);
        setBalanceModalOpen(false);
        await load();
      } catch (err) {
        setBalanceFormError(err instanceof Error ? err.message : "Failed to update balance");
      } finally {
        setBalanceSaving(false);
      }
    },
    [card, balanceForm, load],
  );


  const linkedCategory = billCategories.find((c) => c.id === card?.bill_category_id);
  // A bill category feeds one card, so those other cards already read from aren't offered.
  const statementSources = billCategories.filter(
    (c) =>
      (c.is_credit_card || c === linkedCategory) &&
      !cards.some((b) => b.card.id !== card?.id && b.card.bill_category_id === c.id),
  );
  const formLinked = cardForm.bill_category_id !== "";

  const paidIn = paymentForm.payment_date ? periodForDate(payPeriodStarts, paymentForm.payment_date) : null;
  const paymentPeriod =
    editingPaymentId == null && paidIn && periodRangeLabel(payPeriodStarts, paidIn.year, paidIn.month, paidIn.half);

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="Credit Cards"
        description={
          <>
            Each card&apos;s balance, statement and payments. Installments on a card live on the{" "}
            <Link href="/installments" className="font-medium text-brand-text hover:underline">
              Installments
            </Link>{" "}
            page.
          </>
        }
        actions={
          cards.length > 0 && (
            <button type="button" className={PRIMARY_BUTTON_CLASSES} onClick={() => openCardModal(null)}>
              <PlusIcon className="size-4" />
              Add card
            </button>
          )
        }
      />

      {error && (
        <ErrorAlert>
          {error}
        </ErrorAlert>
      )}

      {loading ? (
        <LoadingBlocks label="Loading credit cards…" rows={2} />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<CreditCardIcon className="size-6" />}
          title="No credit cards yet"
          action={
            <button type="button" className={PRIMARY_BUTTON_CLASSES} onClick={() => openCardModal(null)}>
              <PlusIcon className="size-4" />
              Add credit card
            </button>
          }
        >
          Add a card&apos;s limit and latest statement to track its balance, what&apos;s due, and how long it takes
          to pay off.
        </EmptyState>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ card: c }) => (
            <Panel
              key={c.id}
              className="relative transition-colors duration-150 hover:bg-surface-2/60"
              title={
                // Its overlay makes the whole tile open the card; the action sits above it.
                <button type="button" className={TILE_BUTTON_CLASSES} onClick={() => openDetails(c.id)}>
                  {c.name}
                </button>
              }
              actions={
                <div className="relative flex items-center gap-2">
                  <button type="button" className={TEXT_BUTTON_CLASSES} onClick={() => openPaymentModal(c)}>
                    <PlusIcon className="size-4" />
                    Payment
                  </button>
                </div>
              }
            >
              <p className="text-sm text-ink-3">
                {fmtMoney(c.current_balance)} balance
                {c.due_date && ` · due ${fmtDate(c.due_date)}`}
              </p>
            </Panel>
          ))}
        </div>
      )}

      <Modal
        open={detailsOpen && selected != null}
        // Escape reaches every open modal; leave this one open under a form on top of it.
        onClose={cardModalOpen || paymentModalOpen || balanceModalOpen ? () => {} : closeDetails}
        ariaLabelledBy="credit-card-details-title"
        dialogClassName={`${DIALOG_CLASSES} max-w-5xl`}
      >
        {selected && (
          <>
            <ModalHeader id="credit-card-details-title" title={selected.card.name} onClose={closeDetails} />
            <div className={DIALOG_BODY_CLASSES}>
              <CardDetails
                bundle={selected}
                linkedCategory={linkedCategory}
                onAdjustBalance={openBalanceModal}
                onRecordPayment={() => openPaymentModal(selected.card)}
                onEditPayment={openEditPayment}
              />
            </div>
            <div className={DIALOG_FOOTER_CLASSES}>
              <button
                type="button"
                className={`mr-auto ${SECONDARY_BUTTON_CLASSES}`}
                onClick={() => openCardModal(selected.card)}
              >
                Edit card
              </button>
              <button
                type="button"
                className={PRIMARY_BUTTON_CLASSES}
                onClick={() => openPaymentModal(selected.card)}
              >
                <PlusIcon className="size-4" />
                Record payment
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={cardModalOpen}
        onClose={closeCardModal}
        ariaLabelledBy="credit-card-title"
        dialogClassName={`${DIALOG_CLASSES} max-w-xl`}
      >
        <ModalHeader
          id="credit-card-title"
          title={card ? "Edit card" : "Add credit card"}
          subtitle={card && !formLinked ? "Changing the statement balance resets the current balance to it." : undefined}
          onClose={closeCardModal}
        />
        <form onSubmit={submitCardForm} className="flex min-h-0 flex-1 flex-col">
          <div className={`${DIALOG_BODY_CLASSES} grid gap-4 sm:grid-cols-2`}>
            <Field label="Card name" className="sm:col-span-2">
              <input
                required
                type="text"
                className={INPUT_CLASSES}
                value={cardForm.name}
                onChange={(e) => setCardForm((f) => ({ ...f, name: e.target.value }))}
                disabled={cardSaving}
              />
            </Field>
            <Field label="Credit limit">
              <AmountInput
                required
                value={cardForm.credit_limit}
                onChange={(v) => setCardForm((f) => ({ ...f, credit_limit: v }))}
                disabled={cardSaving}
              />
            </Field>
            <Field label="Interest rate" hint="% per month">
              <input
                required
                type="text"
                inputMode="decimal"
                className={INPUT_CLASSES}
                value={cardForm.interest_rate}
                onChange={(e) => setCardForm((f) => ({ ...f, interest_rate: e.target.value }))}
                disabled={cardSaving}
              />
            </Field>
            {statementSources.length > 0 && (
              <Field
                label="Statement"
                hint={
                  formLinked
                    ? "Read from the latest bill there, so each new bill updates it. The current balance stays as you adjusted it."
                    : "Typed in below, or read from a credit card's bills."
                }
                className="sm:col-span-2"
              >
                <select
                  className={INPUT_CLASSES}
                  value={cardForm.bill_category_id}
                  onChange={(e) => setCardForm((f) => ({ ...f, bill_category_id: e.target.value }))}
                  disabled={cardSaving}
                >
                  <option value="">Typed in here</option>
                  {statementSources.map((c) => (
                    <option key={c.id} value={c.id}>
                      From the {c.name} bills
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {!formLinked && (
              <>
                <Field label="Statement balance">
                  <AmountInput
                    required
                    value={cardForm.last_statement_balance}
                    onChange={(v) => setCardForm((f) => ({ ...f, last_statement_balance: v }))}
                    disabled={cardSaving}
                  />
                </Field>
                <Field label="Minimum due">
                  <AmountInput
                    required
                    value={cardForm.minimum_due}
                    onChange={(v) => setCardForm((f) => ({ ...f, minimum_due: v }))}
                    disabled={cardSaving}
                  />
                </Field>
                <Field label="Statement date" hint="Optional">
                  <DatePickerField
                    value={cardForm.statement_date}
                    onChange={(v) => setCardForm((f) => ({ ...f, statement_date: v }))}
                    disabled={cardSaving}
                    clearLabel="Clear"
                  />
                </Field>
                <Field label="Due date" hint="Optional">
                  <DatePickerField
                    value={cardForm.due_date}
                    onChange={(v) => setCardForm((f) => ({ ...f, due_date: v }))}
                    disabled={cardSaving}
                    clearLabel="Clear"
                  />
                </Field>
              </>
            )}

            {cardFormError && (
              <ErrorAlert className="sm:col-span-2">
                {cardFormError}
              </ErrorAlert>
            )}
          </div>
          <div className={DIALOG_FOOTER_CLASSES}>
            {card && (
              <button
                type="button"
                disabled={cardSaving}
                className={DANGER_TEXT_BUTTON_CLASSES}
                onClick={() => void onRemoveCard()}
              >
                Remove card
              </button>
            )}
            <button type="button" disabled={cardSaving} className={SECONDARY_BUTTON_CLASSES} onClick={closeCardModal}>
              Cancel
            </button>
            <button type="submit" disabled={cardSaving} className={PRIMARY_BUTTON_CLASSES}>
              {cardSaving ? "Saving…" : card ? "Save changes" : "Add card"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={paymentModalOpen}
        onClose={closePaymentModal}
        ariaLabelledBy="credit-card-payment-title"
        dialogClassName={`${DIALOG_CLASSES} max-w-md`}
      >
        <ModalHeader
          id="credit-card-payment-title"
          title={editingPaymentId != null ? "Edit payment" : "Record payment"}
          subtitle={card ? `${card.name} · current balance ${fmtMoney(card.current_balance)}` : undefined}
          onClose={closePaymentModal}
        />
        <form onSubmit={submitPaymentForm} className="flex min-h-0 flex-1 flex-col">
          <div className={`${DIALOG_BODY_CLASSES} grid gap-4`}>
            <div className="flex flex-col gap-2">
              <Field label="Amount">
                <AmountInput
                  required
                  autoFocus
                  placeholder="0.00"
                  value={paymentForm.amount}
                  onChange={(v) => setPaymentForm((f) => ({ ...f, amount: v }))}
                  disabled={paymentSaving}
                />
              </Field>
              {card && (
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["Minimum", card.minimum_due],
                      ["This month", card.monthly_dues],
                      ["Full balance", card.current_balance],
                    ] as const
                  )
                    .filter(([, v]) => v > 0)
                    .map(([label, v]) => (
                      <button
                        key={label}
                        type="button"
                        disabled={paymentSaving}
                        className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 transition-colors duration-150 hover:border-brand hover:text-brand-text"
                        onClick={() => setPaymentForm((f) => ({ ...f, amount: formatAmountNumber(v) }))}
                      >
                        {label} · <span className="tabular-nums">{fmtMoney(v)}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
            <Field
              label="Date"
              hint={paymentPeriod && `Comes out of the ${paymentPeriod} budget on the calendar.`}
            >
              <DatePickerField
                value={paymentForm.payment_date}
                onChange={(v) => setPaymentForm((f) => ({ ...f, payment_date: v }))}
                disabled={paymentSaving}
              />
            </Field>
            <Field label="Note" hint="Optional">
              <input
                type="text"
                className={INPUT_CLASSES}
                value={paymentForm.note}
                onChange={(e) => setPaymentForm((f) => ({ ...f, note: e.target.value }))}
                disabled={paymentSaving}
              />
            </Field>

            {paymentFormError && (
              <ErrorAlert>
                {paymentFormError}
              </ErrorAlert>
            )}
          </div>
          <div className={DIALOG_FOOTER_CLASSES}>
            {editingPaymentId != null && (
              <button
                type="button"
                disabled={paymentSaving}
                className={DANGER_TEXT_BUTTON_CLASSES}
                onClick={() => void onDeletePayment(editingPaymentId)}
              >
                Delete
              </button>
            )}
            <button type="button" disabled={paymentSaving} className={SECONDARY_BUTTON_CLASSES} onClick={closePaymentModal}>
              Cancel
            </button>
            <button type="submit" disabled={paymentSaving} className={PRIMARY_BUTTON_CLASSES}>
              {paymentSaving ? "Saving…" : editingPaymentId != null ? "Save changes" : "Record payment"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={balanceModalOpen}
        onClose={closeBalanceModal}
        ariaLabelledBy="credit-card-balance-title"
        dialogClassName={`${DIALOG_CLASSES} max-w-md`}
      >
        <ModalHeader
          id="credit-card-balance-title"
          title="Adjust available credit"
          subtitle="Match what your bank shows, e.g. after purchases this app doesn't track. Statement details stay as they are."
          onClose={closeBalanceModal}
        />
        <form onSubmit={submitBalanceForm} className="flex min-h-0 flex-1 flex-col">
          <div className={`${DIALOG_BODY_CLASSES} grid gap-4`}>
            <Field label="Available credit">
              <AmountInput
                required
                autoFocus
                value={balanceForm}
                onChange={setBalanceForm}
                disabled={balanceSaving}
              />
            </Field>

            {balanceFormError && (
              <ErrorAlert>
                {balanceFormError}
              </ErrorAlert>
            )}
          </div>
          <div className={DIALOG_FOOTER_CLASSES}>
            <button type="button" disabled={balanceSaving} className={SECONDARY_BUTTON_CLASSES} onClick={closeBalanceModal}>
              Cancel
            </button>
            <button type="submit" disabled={balanceSaving} className={PRIMARY_BUTTON_CLASSES}>
              {balanceSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
