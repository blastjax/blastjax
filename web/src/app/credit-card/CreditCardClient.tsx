"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { FloatingAddButton } from "@/components/FloatingAddButton";
import { Modal } from "@/components/Modal";
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
import { formatAmountOnBlur, parseFormNumber } from "@/lib/parseFormNumber";
import {
  CARD_CLASSES,
  DASHED_EMPTY_CLASSES,
  ERROR_ALERT_CLASSES,
  INPUT_CLASSES,
  LOADING_TEXT_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
  SEGMENTED_BUTTON_ACTIVE_CLASSES,
  SEGMENTED_BUTTON_CLASSES,
  SEGMENTED_BUTTON_INACTIVE_CLASSES,
  SEGMENTED_WRAPPER_CLASSES,
} from "@/lib/ui";

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function todayInputDate(): string {
  return new Date().toISOString().slice(0, 10);
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
        credit_limit: formatAmountOnBlur(String(card.credit_limit)) ?? String(card.credit_limit),
        last_statement_balance:
          formatAmountOnBlur(String(card.last_statement_balance)) ??
          String(card.last_statement_balance),
        minimum_due:
          formatAmountOnBlur(String(card.minimum_due)) ?? String(card.minimum_due),
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
    setError(null);
    try {
      await deleteCreditCard(card.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove credit card");
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
    setBalanceForm(formatAmountOnBlur(String(card.available_limit)) ?? String(card.available_limit));
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

  const projections = useMemo(() => {
    if (!card) return null;
    const rate = card.interest_rate / 100;
    const halfRemaining = Math.max(card.current_balance / 2, 0);
    const halfInterest = halfRemaining * rate;
    const minRemaining = Math.max(card.current_balance - card.minimum_due, 0);
    const minInterest = minRemaining * rate;
    return {
      half: {
        remaining: halfRemaining,
        interest: halfInterest,
        nextStatement: halfRemaining + halfInterest,
      },
      minimum: {
        remaining: minRemaining,
        interest: minInterest,
        nextStatement: minRemaining + minInterest,
      },
    };
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
  const anyModalOpen = cardModalOpen || paymentModalOpen || balanceModalOpen;

  return (
    <div className="relative mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-8 px-4 pb-28 py-8 sm:px-6">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Credit Card
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Track your limit, statement balance, and payments. Installments carried on this card
          are managed on the{" "}
          <Link href="/installments" className="underline hover:no-underline">
            Installments
          </Link>{" "}
          page.
        </p>
      </header>

      {error && (
        <div className={ERROR_ALERT_CLASSES} role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className={LOADING_TEXT_CLASSES}>Loading credit card…</p>
      ) : !card ? (
        <div className={DASHED_EMPTY_CLASSES}>
          <p>No credit card set up yet.</p>
          <button
            type="button"
            className={`mt-4 ${PRIMARY_BUTTON_CLASSES}`}
            onClick={openCardModal}
          >
            Add credit card
          </button>
        </div>
      ) : (
        <>
          <section className={CARD_CLASSES}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
                {card.name}
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={SECONDARY_BUTTON_CLASSES}
                  onClick={openCardModal}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-300"
                  onClick={() => void onRemoveCard()}
                >
                  Remove
                </button>
              </div>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-zinc-500">Credit limit</dt>
                <dd className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                  {fmtMoney(card.credit_limit)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Last statement balance</dt>
                <dd className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                  {fmtMoney(card.last_statement_balance)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Current balance</dt>
                <dd className="tabular-nums font-semibold text-amber-800 dark:text-amber-200">
                  {fmtMoney(card.current_balance)}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-zinc-500">
                  Available limit
                  <button
                    type="button"
                    className="text-indigo-600 underline hover:no-underline dark:text-indigo-400"
                    onClick={openBalanceModal}
                  >
                    Edit
                  </button>
                </dt>
                <dd className="tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">
                  {fmtMoney(card.available_limit)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Minimum due</dt>
                <dd className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                  {fmtMoney(card.minimum_due)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Interest rate</dt>
                <dd className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                  {card.interest_rate}%/month
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Statement date</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">{fmtDate(card.statement_date)}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Due date</dt>
                <dd className="text-zinc-800 dark:text-zinc-200">{fmtDate(card.due_date)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
              Editing this to record a new statement resets the current balance to the new
              statement balance.
            </p>
          </section>

          <section className={CARD_CLASSES}>
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Monthly dues</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-zinc-500">Minimum due</dt>
                <dd className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                  {fmtMoney(card.minimum_due)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Installments due this month</dt>
                <dd className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                  {fmtMoney(installmentDues)}
                </dd>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                <dt className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
                  Total this month
                </dt>
                <dd className="tabular-nums font-semibold text-emerald-900 dark:text-emerald-100">
                  {fmtMoney(card.monthly_dues)}
                </dd>
              </div>
            </dl>
          </section>

          <section className={CARD_CLASSES}>
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              If you don&apos;t pay in full
            </h2>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Estimate only — assumes no new purchases and a flat monthly rate. Your bank likely
              uses an average daily balance, so the real finance charge may differ.
            </p>
            {projections && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                  <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    Pay half the balance
                  </h3>
                  <dl className="mt-3 grid gap-2 text-sm">
                    <div className="flex items-baseline justify-between">
                      <dt className="text-xs text-zinc-500">Remaining after payment</dt>
                      <dd className="tabular-nums font-medium">
                        {fmtMoney(projections.half.remaining)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <dt className="text-xs text-zinc-500">Est. interest</dt>
                      <dd className="tabular-nums font-medium text-amber-800 dark:text-amber-200">
                        {fmtMoney(projections.half.interest)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <dt className="text-xs text-zinc-500">Est. next statement</dt>
                      <dd className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                        {fmtMoney(projections.half.nextStatement)}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                  <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    Pay only the minimum
                  </h3>
                  <dl className="mt-3 grid gap-2 text-sm">
                    <div className="flex items-baseline justify-between">
                      <dt className="text-xs text-zinc-500">Remaining after payment</dt>
                      <dd className="tabular-nums font-medium">
                        {fmtMoney(projections.minimum.remaining)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <dt className="text-xs text-zinc-500">Est. interest</dt>
                      <dd className="tabular-nums font-medium text-amber-800 dark:text-amber-200">
                        {fmtMoney(projections.minimum.interest)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <dt className="text-xs text-zinc-500">Est. next statement</dt>
                      <dd className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                        {fmtMoney(projections.minimum.nextStatement)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}
          </section>

          <section className={CARD_CLASSES}>
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Payoff calculator
            </h2>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Estimate only, based on your current balance ({fmtMoney(card.current_balance)}) and{" "}
              {card.interest_rate}%/month interest, assuming no new purchases.
            </p>

            {card.current_balance <= 0 ? (
              <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-300">
                Your balance is already paid off — nothing to calculate.
              </p>
            ) : (
              <>
                <div className={`mt-4 inline-flex ${SEGMENTED_WRAPPER_CLASSES}`}>
                  <button
                    type="button"
                    className={`${SEGMENTED_BUTTON_CLASSES} ${
                      calcMode === "payment"
                        ? SEGMENTED_BUTTON_ACTIVE_CLASSES
                        : SEGMENTED_BUTTON_INACTIVE_CLASSES
                    }`}
                    onClick={() => setCalcMode("payment")}
                  >
                    By monthly payment
                  </button>
                  <button
                    type="button"
                    className={`${SEGMENTED_BUTTON_CLASSES} ${
                      calcMode === "months"
                        ? SEGMENTED_BUTTON_ACTIVE_CLASSES
                        : SEGMENTED_BUTTON_INACTIVE_CLASSES
                    }`}
                    onClick={() => setCalcMode("months")}
                  >
                    By target months
                  </button>
                </div>

                {calcMode === "payment" ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        How much can you pay per month?
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className={INPUT_CLASSES}
                        placeholder="e.g. 5000"
                        value={calcPaymentInput}
                        onChange={(e) => setCalcPaymentInput(e.target.value)}
                      />
                    </label>
                    <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
                      {calcPaymentInput.trim() === "" ? (
                        <p className="text-zinc-500">
                          Enter a monthly payment to see how long it&apos;ll take.
                        </p>
                      ) : payoffByPayment == null ? (
                        <p className="text-red-700 dark:text-red-300">
                          Enter a valid amount greater than zero.
                        </p>
                      ) : !payoffByPayment.reachable ? (
                        <p className="text-red-700 dark:text-red-300">
                          That payment doesn&apos;t cover the monthly interest, so the balance
                          would never be paid off. Try a higher amount.
                        </p>
                      ) : (
                        <dl className="grid gap-2">
                          <div className="flex items-baseline justify-between">
                            <dt className="text-xs text-zinc-500">Time to pay off</dt>
                            <dd className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                              {payoffByPayment.months}{" "}
                              {payoffByPayment.months === 1 ? "month" : "months"}
                            </dd>
                          </div>
                          <div className="flex items-baseline justify-between">
                            <dt className="text-xs text-zinc-500">Total interest</dt>
                            <dd className="tabular-nums font-medium text-amber-800 dark:text-amber-200">
                              {fmtMoney(payoffByPayment.totalInterest)}
                            </dd>
                          </div>
                          <div className="flex items-baseline justify-between">
                            <dt className="text-xs text-zinc-500">Total paid</dt>
                            <dd className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                              {fmtMoney(payoffByPayment.totalPaid)}
                            </dd>
                          </div>
                        </dl>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Pay it off in how many months?
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className={INPUT_CLASSES}
                        placeholder="e.g. 6"
                        value={calcMonthsInput}
                        onChange={(e) => setCalcMonthsInput(e.target.value)}
                      />
                    </label>
                    <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
                      {calcMonthsInput.trim() === "" ? (
                        <p className="text-zinc-500">
                          Enter a number of months to see the required payment.
                        </p>
                      ) : payoffByMonths == null ? (
                        <p className="text-red-700 dark:text-red-300">
                          Enter a valid number of months greater than zero.
                        </p>
                      ) : (
                        <dl className="grid gap-2">
                          <div className="flex items-baseline justify-between">
                            <dt className="text-xs text-zinc-500">Required monthly payment</dt>
                            <dd className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                              {fmtMoney(payoffByMonths.payment)}
                            </dd>
                          </div>
                          <div className="flex items-baseline justify-between">
                            <dt className="text-xs text-zinc-500">Total interest</dt>
                            <dd className="tabular-nums font-medium text-amber-800 dark:text-amber-200">
                              {fmtMoney(payoffByMonths.totalInterest)}
                            </dd>
                          </div>
                          <div className="flex items-baseline justify-between">
                            <dt className="text-xs text-zinc-500">Total paid</dt>
                            <dd className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                              {fmtMoney(payoffByMonths.totalPaid)}
                            </dd>
                          </div>
                        </dl>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <section className={CARD_CLASSES}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
                Installments on this card
              </h2>
              <Link
                href="/installments"
                className="text-sm text-indigo-600 underline hover:no-underline dark:text-indigo-400"
              >
                Manage on Installments page →
              </Link>
            </div>
            {installments.length === 0 ? (
              <p className={`mt-4 ${DASHED_EMPTY_CLASSES}`}>
                No installments are linked to this card yet.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {installments.map((ins) => (
                  <li
                    key={ins.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {ins.name}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                        Installment {ins.installment_current}/{ins.installment_total}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-amber-800 dark:text-amber-200">
                      {fmtMoney(ins.remaining)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={CARD_CLASSES}>
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Payments</h2>
            {payments.length === 0 ? (
              <p className={`mt-4 ${DASHED_EMPTY_CLASSES}`}>No payments recorded yet.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {fmtDate(p.payment_date)}
                      </p>
                      {p.note && (
                        <p className="mt-0.5 truncate text-xs text-zinc-600 dark:text-zinc-400">
                          {p.note}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                        {fmtMoney(p.amount)}
                      </span>
                      <button
                        type="button"
                        className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:text-red-300"
                        onClick={() => void onDeletePayment(p.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <Modal
        open={cardModalOpen}
        onClose={closeCardModal}
        ariaLabelledBy="credit-card-title"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2
            id="credit-card-title"
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
          >
            {card ? "Edit credit card" : "Add credit card"}
          </h2>
          <button
            type="button"
            className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
            onClick={closeCardModal}
          >
            Close
          </button>
        </div>
        <form onSubmit={submitCardForm} className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-zinc-600 dark:text-zinc-400">Name</span>
            <input
              required
              type="text"
              className={INPUT_CLASSES}
              value={cardForm.name}
              onChange={(e) => setCardForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. UnionBank Rewards"
              disabled={cardSaving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Credit limit</span>
            <input
              required
              type="text"
              inputMode="decimal"
              className={INPUT_CLASSES}
              value={cardForm.credit_limit}
              onChange={(e) => setCardForm((f) => ({ ...f, credit_limit: e.target.value }))}
              onBlur={(e) => {
                const formatted = formatAmountOnBlur(e.target.value);
                if (formatted != null) setCardForm((f) => ({ ...f, credit_limit: formatted }));
              }}
              disabled={cardSaving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Last statement balance</span>
            <input
              required
              type="text"
              inputMode="decimal"
              className={INPUT_CLASSES}
              value={cardForm.last_statement_balance}
              onChange={(e) =>
                setCardForm((f) => ({ ...f, last_statement_balance: e.target.value }))
              }
              disabled={cardSaving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Minimum amount due</span>
            <input
              required
              type="text"
              inputMode="decimal"
              className={INPUT_CLASSES}
              value={cardForm.minimum_due}
              onChange={(e) => setCardForm((f) => ({ ...f, minimum_due: e.target.value }))}
              disabled={cardSaving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Interest rate (%/month)</span>
            <input
              required
              type="text"
              inputMode="decimal"
              className={INPUT_CLASSES}
              value={cardForm.interest_rate}
              onChange={(e) => setCardForm((f) => ({ ...f, interest_rate: e.target.value }))}
              disabled={cardSaving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Statement date (optional)</span>
            <input
              type="date"
              className={INPUT_CLASSES}
              value={cardForm.statement_date}
              onChange={(e) => setCardForm((f) => ({ ...f, statement_date: e.target.value }))}
              disabled={cardSaving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Due date (optional)</span>
            <input
              type="date"
              className={INPUT_CLASSES}
              value={cardForm.due_date}
              onChange={(e) => setCardForm((f) => ({ ...f, due_date: e.target.value }))}
              disabled={cardSaving}
            />
          </label>

          {cardFormError && (
            <div className={`sm:col-span-2 ${ERROR_ALERT_CLASSES}`} role="alert">
              {cardFormError}
            </div>
          )}

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" disabled={cardSaving} className={PRIMARY_BUTTON_CLASSES}>
              {cardSaving ? "Saving…" : card ? "Save statement" : "Add"}
            </button>
            <button
              type="button"
              disabled={cardSaving}
              className={SECONDARY_BUTTON_CLASSES}
              onClick={closeCardModal}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={paymentModalOpen}
        onClose={closePaymentModal}
        ariaLabelledBy="credit-card-payment-title"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2
            id="credit-card-payment-title"
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Record payment
          </h2>
          <button
            type="button"
            className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
            onClick={closePaymentModal}
          >
            Close
          </button>
        </div>
        <form onSubmit={submitPaymentForm} className="grid gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Amount</span>
            <input
              required
              type="text"
              inputMode="decimal"
              className={INPUT_CLASSES}
              value={paymentForm.amount}
              onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
              disabled={paymentSaving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Date</span>
            <input
              required
              type="date"
              className={INPUT_CLASSES}
              value={paymentForm.payment_date}
              onChange={(e) => setPaymentForm((f) => ({ ...f, payment_date: e.target.value }))}
              disabled={paymentSaving}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Note (optional)</span>
            <input
              type="text"
              className={INPUT_CLASSES}
              value={paymentForm.note}
              onChange={(e) => setPaymentForm((f) => ({ ...f, note: e.target.value }))}
              disabled={paymentSaving}
            />
          </label>

          {paymentFormError && (
            <div className={ERROR_ALERT_CLASSES} role="alert">
              {paymentFormError}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={paymentSaving} className={PRIMARY_BUTTON_CLASSES}>
              {paymentSaving ? "Saving…" : "Record payment"}
            </button>
            <button
              type="button"
              disabled={paymentSaving}
              className={SECONDARY_BUTTON_CLASSES}
              onClick={closePaymentModal}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={balanceModalOpen}
        onClose={closeBalanceModal}
        ariaLabelledBy="credit-card-balance-title"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2
            id="credit-card-balance-title"
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Edit available credit
          </h2>
          <button
            type="button"
            className="rounded border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
            onClick={closeBalanceModal}
          >
            Close
          </button>
        </div>
        <p className="mb-4 text-xs text-zinc-600 dark:text-zinc-400">
          Use this to match what your bank actually shows, e.g. if you&apos;ve made purchases or
          other transactions this app hasn&apos;t recorded. This overwrites the current balance
          shown above without touching your statement details.
        </p>
        <form onSubmit={submitBalanceForm} className="grid gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Available credit</span>
            <input
              required
              type="text"
              inputMode="decimal"
              className={INPUT_CLASSES}
              value={balanceForm}
              onChange={(e) => setBalanceForm(e.target.value)}
              onBlur={(e) => {
                const formatted = formatAmountOnBlur(e.target.value);
                if (formatted != null) setBalanceForm(formatted);
              }}
              disabled={balanceSaving}
            />
          </label>

          {balanceFormError && (
            <div className={ERROR_ALERT_CLASSES} role="alert">
              {balanceFormError}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={balanceSaving} className={PRIMARY_BUTTON_CLASSES}>
              {balanceSaving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={balanceSaving}
              className={SECONDARY_BUTTON_CLASSES}
              onClick={closeBalanceModal}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <FloatingAddButton
        hidden={anyModalOpen || !card}
        onClick={openPaymentModal}
        ariaLabel="Record payment"
      />
    </div>
  );
}
