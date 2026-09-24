"use client";

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
  Field,
  IconAction,
  LoadingBlocks,
  Metric,
  Meter,
  ModalHeader,
  Panel,
  Pill,
  TEXT_BUTTON_CLASSES,
} from "@/components/FinanceUI";
import { CreditCardIcon, PlusIcon } from "@/components/Icons";
import {
  adjustCreditCardBalance,
  createCreditCard,
  createCreditCardPayment,
  deleteCreditCard,
  deleteCreditCardPayment,
  getCreditCard,
  updateCreditCard,
  type CreditCardPaymentRow,
  type CreditCardRow,
  type InstallmentRow,
} from "@/lib/api";
import { formatAmountNumber, parseFormNumber } from "@/lib/parseFormNumber";
import { formatDate, parseDateOnlyLocal, toIsoDateLocal } from "@/lib/dateFormat";
import { fmtAmountOrDash } from "@/lib/formatNumber";
import {
  ERROR_ALERT_CLASSES,
  INPUT_CLASSES,
  PAGE_CONTAINER_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
  SEGMENTED_BUTTON_ACTIVE_CLASSES,
  SEGMENTED_BUTTON_CLASSES,
  SEGMENTED_BUTTON_INACTIVE_CLASSES,
  SEGMENTED_WRAPPER_CLASSES,
} from "@/lib/ui";

const fmtMoney = fmtAmountOrDash;

/**
 * `statement_date` / `due_date` are date-only columns, so this is exactly the
 * shared date-only formatter — it was the last call site still building its own
 * `Intl` options per call (and the last one varying with the reader's locale
 * instead of the pinned `en-US` the rest of the app uses).
 */
const fmtDate = formatDate;

/** Today in *local* time — `toISOString()` is UTC and gives yesterday before 8am in UTC+8. */
function todayInputDate(): string {
  return toIsoDateLocal(new Date());
}

/** "In 3 days" / "Due today" / "5 days ago" for a date-only value. */
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

/**
 * Simulate month-by-month compounding (interest, then payment) until the
 * balance is cleared, capped so a payment that never covers interest can't
 * loop forever.
 */
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

/** Standard amortization formula: the level payment that clears ``balance`` in exactly ``months``. */
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
};

const emptyCardForm = (): CardForm => ({
  name: "",
  credit_limit: "",
  last_statement_balance: "",
  minimum_due: "",
  interest_rate: "3.5",
  statement_date: "",
  due_date: "",
});

type PaymentForm = { amount: string; payment_date: string; note: string };

const emptyPaymentForm = (): PaymentForm => ({
  amount: "",
  payment_date: todayInputDate(),
  note: "",
});

/** One label/value line in a definition list. */
function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="flex items-center gap-2 text-sm font-medium tabular-nums text-ink">{children}</dd>
    </div>
  );
}

export default function CreditCardClient() {
  const [card, setCard] = useState<CreditCardRow | null>(null);
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [payments, setPayments] = useState<CreditCardPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [cardForm, setCardForm] = useState<CardForm>(emptyCardForm());
  const [cardSaving, setCardSaving] = useState(false);
  const [cardFormError, setCardFormError] = useState<string | null>(null);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(emptyPaymentForm());
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentFormError, setPaymentFormError] = useState<string | null>(null);

  const [balanceModalOpen, setBalanceModalOpen] = useState(false);
  const [balanceForm, setBalanceForm] = useState("");
  const [balanceSaving, setBalanceSaving] = useState(false);
  const [balanceFormError, setBalanceFormError] = useState<string | null>(null);

  const [calcMode, setCalcMode] = useState<"payment" | "months">("payment");
  const [calcPaymentInput, setCalcPaymentInput] = useState("");
  const [calcMonthsInput, setCalcMonthsInput] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await getCreditCard();
      setCard(r.card);
      setInstallments(r.installments);
      setPayments(r.payments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load credit card");
      setCard(null);
      setInstallments([]);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCardModal = useCallback(() => {
    setCardFormError(null);
    if (card) {
      setCardForm({
        name: card.name,
        credit_limit: formatAmountNumber(card.credit_limit),
        last_statement_balance: formatAmountNumber(card.last_statement_balance),
        minimum_due: formatAmountNumber(card.minimum_due),
        interest_rate: String(card.interest_rate),
        statement_date: card.statement_date ? card.statement_date.slice(0, 10) : "",
        due_date: card.due_date ? card.due_date.slice(0, 10) : "",
      });
    } else {
      setCardForm(emptyCardForm());
    }
    setCardModalOpen(true);
  }, [card]);

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
      const lastStatementBalance = parseFormNumber(cardForm.last_statement_balance);
      if (lastStatementBalance == null || lastStatementBalance < 0) {
        setCardFormError("Enter a valid last statement balance.");
        return;
      }
      const minimumDue = parseFormNumber(cardForm.minimum_due);
      if (minimumDue == null || minimumDue < 0) {
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
          last_statement_balance: lastStatementBalance,
          minimum_due: minimumDue,
          interest_rate: interestRate,
          statement_date: cardForm.statement_date || null,
          due_date: cardForm.due_date || null,
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
    if (!confirm("Remove this credit card? Linked installments will be unlinked.")) return;
    setCardFormError(null);
    try {
      await deleteCreditCard(card.id);
      setCardModalOpen(false);
      await load();
    } catch (err) {
      setCardFormError(err instanceof Error ? err.message : "Failed to remove credit card");
    }
  }, [card, load]);

  const openPaymentModal = useCallback(() => {
    setPaymentFormError(null);
    setPaymentForm(emptyPaymentForm());
    setPaymentModalOpen(true);
  }, []);

  const closePaymentModal = useCallback(() => {
    setPaymentModalOpen(false);
  }, []);

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
        await createCreditCardPayment(card.id, {
          amount,
          payment_date: paymentForm.payment_date,
          note: paymentForm.note.trim() || null,
        });
        setPaymentModalOpen(false);
        await load();
      } catch (err) {
        setPaymentFormError(err instanceof Error ? err.message : "Failed to record payment");
      } finally {
        setPaymentSaving(false);
      }
    },
    [card, paymentForm, load],
  );

  const onDeletePayment = useCallback(
    async (id: number) => {
      if (!confirm("Delete this payment? The card balance goes back up by its amount.")) return;
      setError(null);
      try {
        await deleteCreditCardPayment(id);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete payment");
      }
    },
    [load],
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

  /** Pay-in-full / half / minimum, as rows of one comparison table. */
  const scenarios = useMemo(() => {
    if (!card) return [];
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
    if (!card) return null;
    const payment = parseFormNumber(calcPaymentInput);
    if (payment == null || payment <= 0) return null;
    return payoffMonthsForPayment(card.current_balance, card.interest_rate / 100, payment);
  }, [card, calcPaymentInput]);

  const payoffByMonths = useMemo(() => {
    if (!card) return null;
    const months = parseFormNumber(calcMonthsInput);
    if (months == null || months < 1) return null;
    return paymentForMonths(card.current_balance, card.interest_rate / 100, Math.round(months));
  }, [card, calcMonthsInput]);

  const installmentDues = card ? Math.max(card.monthly_dues - card.minimum_due, 0) : 0;
  const used = card && card.credit_limit > 0 ? card.current_balance / card.credit_limit : 0;
  const due = card ? dueCountdown(card.due_date) : null;

  /** The calculator's answer as [label, value] cells, or an error line. */
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
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="Credit Card"
        description={
          <>
            Balance, statement and payments. Installments on the card live on the{" "}
            <Link href="/installments" className="font-medium text-brand-text hover:underline">
              Installments
            </Link>{" "}
            page.
          </>
        }
        actions={
          card && (
            <>
              <button type="button" className={SECONDARY_BUTTON_CLASSES} onClick={openCardModal}>
                Update statement
              </button>
              <button type="button" className={PRIMARY_BUTTON_CLASSES} onClick={openPaymentModal}>
                <PlusIcon className="size-4" />
                Record payment
              </button>
            </>
          )
        }
      />

      {error && (
        <div className={ERROR_ALERT_CLASSES} role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingBlocks label="Loading credit card…" />
      ) : !card ? (
        <Panel>
          <div className="flex flex-col items-center py-10 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-brand-soft text-brand-text">
              <CreditCardIcon className="size-7" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-ink">No credit card yet</h2>
            <p className="mt-1 max-w-sm text-sm text-ink-3">
              Add your card&apos;s limit and latest statement to track your balance, what&apos;s due,
              and how long it takes to pay off.
            </p>
            <button type="button" className={`mt-5 ${PRIMARY_BUTTON_CLASSES}`} onClick={openCardModal}>
              <PlusIcon className="size-4" />
              Add credit card
            </button>
          </div>
        </Panel>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            {/* The card itself: balance front and center, limit usage beneath. */}
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
                    onClick={openBalanceModal}
                    className="rounded-md px-1.5 py-0.5 font-medium text-white transition-colors hover:bg-white/15"
                    title="Match what your bank shows"
                  >
                    {fmtMoney(card.available_limit)} available · Adjust
                  </button>
                </div>
              </div>
            </div>

            <Panel title="Statement" actions={due && <Pill tone={due.tone}>{due.text}</Pill>}>
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
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="border-y border-line-soft text-xs text-ink-3">
                      <th className="px-5 py-2.5 text-left font-medium sm:px-6">If you…</th>
                      <th className="px-3 py-2.5 text-right font-medium">Pay now</th>
                      <th className="px-3 py-2.5 text-right font-medium">Carried over</th>
                      <th className="px-3 py-2.5 text-right font-medium">Interest</th>
                      <th className="px-5 py-2.5 text-right font-medium sm:px-6">Next statement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft tabular-nums">
                    {scenarios.map((s) => (
                      <tr key={s.label}>
                        <td className="px-5 py-3 font-medium text-ink sm:px-6">{s.label}</td>
                        <td className="px-3 py-3 text-right text-ink-2">{fmtMoney(s.pay)}</td>
                        <td className="px-3 py-3 text-right text-ink-2">{fmtMoney(s.remaining)}</td>
                        <td className={`px-3 py-3 text-right font-medium ${s.interest > 0 ? "text-danger-text" : "text-success-text"}`}>
                          {s.interest > 0 ? `+${fmtMoney(s.interest)}` : "None"}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-ink sm:px-6">{fmtMoney(s.nextStatement)}</td>
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
                  <div className={`${SEGMENTED_WRAPPER_CLASSES} w-full`}>
                    {(
                      [
                        ["payment", "By payment"],
                        ["months", "By months"],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={calcMode === mode}
                        className={`flex-1 ${SEGMENTED_BUTTON_CLASSES} ${
                          calcMode === mode ? SEGMENTED_BUTTON_ACTIVE_CLASSES : SEGMENTED_BUTTON_INACTIVE_CLASSES
                        }`}
                        onClick={() => setCalcMode(mode)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
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
                <button type="button" className={TEXT_BUTTON_CLASSES} onClick={openPaymentModal}>
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
                    <li key={p.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">{fmtDate(p.payment_date)}</p>
                        {p.note && <p className="mt-0.5 truncate text-xs text-ink-3">{p.note}</p>}
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-success-text">
                        −{fmtMoney(p.amount)}
                      </span>
                      <IconAction kind="delete" label="Delete payment" onClick={() => void onDeletePayment(p.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}

      <Modal
        open={cardModalOpen}
        onClose={closeCardModal}
        ariaLabelledBy="credit-card-title"
        dialogClassName={`${DIALOG_CLASSES} max-w-xl`}
      >
        <ModalHeader
          id="credit-card-title"
          title={card ? "Update statement" : "Add credit card"}
          subtitle={card ? "Saving resets the current balance to the new statement balance." : undefined}
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

            {cardFormError && (
              <div className={`sm:col-span-2 ${ERROR_ALERT_CLASSES}`} role="alert">
                {cardFormError}
              </div>
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
              {cardSaving ? "Saving…" : card ? "Save statement" : "Add card"}
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
          title="Record payment"
          subtitle={card ? `Current balance ${fmtMoney(card.current_balance)}` : undefined}
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
            <Field label="Date">
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
              <div className={ERROR_ALERT_CLASSES} role="alert">
                {paymentFormError}
              </div>
            )}
          </div>
          <div className={DIALOG_FOOTER_CLASSES}>
            <button type="button" disabled={paymentSaving} className={SECONDARY_BUTTON_CLASSES} onClick={closePaymentModal}>
              Cancel
            </button>
            <button type="submit" disabled={paymentSaving} className={PRIMARY_BUTTON_CLASSES}>
              {paymentSaving ? "Saving…" : "Record payment"}
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
              <div className={ERROR_ALERT_CLASSES} role="alert">
                {balanceFormError}
              </div>
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
