"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createRecurringRule,
  deleteRecurringRule,
  getRecurringRules,
  postDueRecurringRules,
  type RecurringRuleRow,
  updateRecurringRule,
} from "@/lib/api";
import { parseFormNumber } from "@/lib/parseFormNumber";
import {
  btnPrimary,
  btnSmallDangerOutline,
  btnSmallSecondary,
  fieldLabelText,
  inputClass,
} from "@/lib/ui";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type RepeatFrequency = "monthly" | "weekly" | "quarterly" | "yearly";

function formatRuleSchedule(r: RecurringRuleRow): string {
  if (r.frequency === "monthly") {
    return `Monthly on day ${r.day_of_month ?? "?"}`;
  }
  if (r.frequency === "weekly") {
    return `Weekly on ${WEEKDAYS[r.weekday ?? 0] ?? "?"}`;
  }
  if (r.frequency === "quarterly") {
    return `Every 3 months on day ${r.day_of_month ?? "?"} (Jan / Apr / Jul / Oct)`;
  }
  const m = r.month_of_year;
  const d = r.day_of_month;
  if (m == null || d == null) {
    return "Yearly (set month and day)";
  }
  const label = MONTHS[Math.min(Math.max(m, 1), 12) - 1] ?? "?";
  return `Yearly on ${label} ${d}`;
}

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function RepeatTransactionsSettings() {
  const [rules, setRules] = useState<RecurringRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [frequency, setFrequency] = useState<RepeatFrequency>("monthly");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [weekday, setWeekday] = useState("0");
  const [monthOfYear, setMonthOfYear] = useState("1");
  const [amount, setAmount] = useState("");
  const [accounts, setAccounts] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [currency, setCurrency] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await getRecurringRules();
      setRules(r.rules);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load repeat rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFormNumber(amount);
    if (!label.trim() || amt == null) return;
    setSaving(true);
    setErr(null);
    setSuccess(null);
    try {
      await createRecurringRule({
        label: label.trim(),
        kind,
        frequency,
        day_of_month:
          frequency === "weekly"
            ? null
            : parseInt(dayOfMonth.replace(/,/g, ""), 10),
        weekday: frequency === "weekly"
          ? parseInt(weekday.replace(/,/g, ""), 10)
          : null,
        month_of_year:
          frequency === "yearly"
            ? parseInt(monthOfYear.replace(/,/g, ""), 10)
            : null,
        accounts: accounts.trim() || null,
        category: category.trim() || null,
        subcategory: subcategory.trim() || null,
        description: description.trim() || null,
        note: note.trim() || null,
        amount: amt,
        currency: currency.trim() || null,
      });
      setLabel("");
      setAmount("");
      setDescription("");
      setNote("");
      setSuccess("Rule saved.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save rule");
    } finally {
      setSaving(false);
    }
  };

  const onPostDue = async () => {
    setPosting(true);
    setErr(null);
    setSuccess(null);
    try {
      const r = await postDueRecurringRules();
      await load();
      if (r.posted.length === 0) {
        setSuccess(
          "Nothing due: every active rule already has a row for the current month, week, quarter, or year.",
        );
      } else {
        setSuccess(
          `Posted ${r.posted.length} transaction(s) to the budget.`,
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not post due transactions");
    } finally {
      setPosting(false);
    }
  };

  const toggleActive = async (rule: RecurringRuleRow) => {
    setErr(null);
    try {
      await updateRecurringRule(rule.id, { is_active: !rule.is_active });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    }
  };

  const removeRule = async (id: number) => {
    if (!window.confirm("Remove this repeat rule? Past transactions stay in the budget."))
      return;
    setErr(null);
    try {
      await deleteRecurringRule(id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Subscriptions, rent, and other fixed repeats. Add a rule here, then use{" "}
        <strong>Post due transactions</strong> to create budget rows for the
        current month, calendar week, calendar quarter, or calendar year,
        depending on the rule. Each period is only posted once.
      </p>

      {err && (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">
          {err}
        </p>
      )}
      {success && (
        <p className="mt-3 text-sm text-emerald-800 dark:text-emerald-200">
          {success}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={posting || loading}
          onClick={() => void onPostDue()}
        >
          {posting ? "Posting…" : "Post due transactions"}
        </button>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="mt-6 grid gap-4 rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/40"
      >
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Add repeat rule
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`flex flex-col gap-1 ${fieldLabelText}`}>
            Name
            <input
              required
              className={inputClass}
              placeholder="e.g. Rent, Netflix"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label className={`flex flex-col gap-1 ${fieldLabelText}`}>
            Amount
            <input
              required
              type="text"
              inputMode="decimal"
              className={inputClass}
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className={`flex flex-col gap-1 ${fieldLabelText}`}>
            Type
            <select
              className={inputClass}
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as "expense" | "income")
              }
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label className={`flex flex-col gap-1 ${fieldLabelText}`}>
            Frequency
            <select
              className={inputClass}
              value={frequency}
              onChange={(e) =>
                setFrequency(e.target.value as RepeatFrequency)
              }
            >
              <option value="monthly">Monthly (e.g. rent on the 1st)</option>
              <option value="weekly">Weekly (e.g. every Monday)</option>
              <option value="quarterly">
                Every 3 months (quarterly — Jan / Apr / Jul / Oct)
              </option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          {frequency === "weekly" ? (
            <label className={`flex flex-col gap-1 ${fieldLabelText}`}>
              Weekday
              <select
                className={inputClass}
                value={weekday}
                onChange={(e) => setWeekday(e.target.value)}
              >
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={String(i)}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          ) : frequency === "yearly" ? (
            <>
              <label className={`flex flex-col gap-1 ${fieldLabelText}`}>
                Month
                <select
                  className={inputClass}
                  value={monthOfYear}
                  onChange={(e) => setMonthOfYear(e.target.value)}
                >
                  {MONTHS.map((name, i) => (
                    <option key={name} value={String(i + 1)}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`flex flex-col gap-1 ${fieldLabelText}`}>
                Day of month (1–31)
                <input
                  type="number"
                  min={1}
                  max={31}
                  required
                  className={inputClass}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                />
              </label>
            </>
          ) : (
            <label className={`flex flex-col gap-1 ${fieldLabelText}`}>
              {frequency === "quarterly" ? (
                <>
                  Day of month (1–31) — due in Jan, Apr, Jul, Oct
                </>
              ) : (
                <>Day of month (1–31)</>
              )}
              <input
                type="number"
                min={1}
                max={31}
                required
                className={inputClass}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
              />
            </label>
          )}
          <label className={`flex flex-col gap-1 ${fieldLabelText}`}>
            Accounts (optional)
            <input
              className={inputClass}
              value={accounts}
              onChange={(e) => setAccounts(e.target.value)}
            />
          </label>
          <label className={`flex flex-col gap-1 ${fieldLabelText}`}>
            Category (optional)
            <input
              className={inputClass}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
          <label className={`flex flex-col gap-1 ${fieldLabelText}`}>
            Subcategory (optional)
            <input
              className={inputClass}
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
            />
          </label>
          <label className={`flex flex-col gap-1 ${fieldLabelText}`}>
            Currency (optional)
            <input
              className={inputClass}
              placeholder="PHP"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </label>
          <label
            className={`sm:col-span-2 flex flex-col gap-1 ${fieldLabelText}`}
          >
            Note (optional)
            <input
              className={inputClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label
            className={`sm:col-span-2 flex flex-col gap-1 ${fieldLabelText}`}
          >
            Description (optional)
            <input
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={saving}
          className={`w-fit ${btnPrimary}`}
        >
          {saving ? "Saving…" : "Save rule"}
        </button>
      </form>

      <div className="mt-8">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Your repeat rules
        </h3>
        {loading ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
        ) : rules.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            No rules yet.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {rules.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {r.label}
                  </span>
                  <span className="ml-2 text-zinc-500">
                    {r.kind === "income" ? "Income" : "Expense"} ·{" "}
                    {formatRuleSchedule(r)}
                  </span>
                  <div className="mt-0.5 tabular-nums text-zinc-800 dark:text-zinc-200">
                    {fmtMoney(r.amount)}
                    {r.currency ? ` ${r.currency}` : ""}
                    {r.last_posted_period ? (
                      <span className="ml-2 text-xs text-zinc-500">
                        Last posted: {r.last_posted_period}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnSmallSecondary}
                    onClick={() => void toggleActive(r)}
                  >
                    {r.is_active ? "Pause" : "Resume"}
                  </button>
                  <button
                    type="button"
                    className={btnSmallDangerOutline}
                    onClick={() => void removeRule(r.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
