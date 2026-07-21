"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getPayslips, type PayslipRow } from "@/lib/api";
import { formatMonthYear } from "@/lib/dateFormat";
import { ERROR_ALERT_CLASSES, LOADING_TEXT_CLASSES } from "@/lib/ui";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Semi-monthly payroll: 1st–15th, then 16th–end of month (13–16 days depending on the month). */
const FIRST_HALF_DAYS = 15;

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type DayCell = {
  day: number;
  isPast: boolean;
  isToday: boolean;
  dailyBudget: number | null;
};

export default function CalendarClient() {
  const [lastSalary, setLastSalary] = useState<number | null>(null);
  const [lastFirstHalfPayslip, setLastFirstHalfPayslip] = useState<PayslipRow | null>(null);
  const [lastSecondHalfPayslip, setLastSecondHalfPayslip] = useState<PayslipRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await getPayslips(12);
      const withSalary = r.payslips.find((p) => p.basic_salary != null);
      setLastSalary(withSalary?.basic_salary ?? null);
      setLastFirstHalfPayslip(r.payslips.find((p) => p.period_half === 1) ?? null);
      setLastSecondHalfPayslip(r.payslips.find((p) => p.period_half === 2) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load last salary");
      setLastSalary(null);
      setLastFirstHalfPayslip(null);
      setLastSecondHalfPayslip(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = useMemo(() => new Date(), []);
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const todayDate = today.getDate();

  const daysInMonth = new Date(year, month, 0).getDate();
  const secondHalfDays = daysInMonth - FIRST_HALF_DAYS;

  const firstHalfBudget = lastSalary != null ? lastSalary / FIRST_HALF_DAYS : null;
  const secondHalfBudget = lastSalary != null ? lastSalary / secondHalfDays : null;

  const cells = useMemo(() => {
    const firstWeekday = new Date(year, month - 1, 1).getDay();
    const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    const result: (DayCell | null)[] = [];
    for (let i = 0; i < totalCells; i++) {
      const day = i - firstWeekday + 1;
      if (day < 1 || day > daysInMonth) {
        result.push(null);
        continue;
      }
      result.push({
        day,
        isPast: day < todayDate,
        isToday: day === todayDate,
        dailyBudget: day <= FIRST_HALF_DAYS ? firstHalfBudget : secondHalfBudget,
      });
    }
    return result;
  }, [year, month, daysInMonth, todayDate, firstHalfBudget, secondHalfBudget]);

  return (
    <div className="box-border flex w-full min-w-0 flex-col gap-10 px-4 pb-28 pt-10 sm:px-6 lg:px-8">
      <header className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Calendar
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {formatMonthYear(year, month)} — approximate daily budget from your last salary, split
          across the semi-monthly pay periods.
        </p>
      </header>

      {error && (
        <div className={ERROR_ALERT_CLASSES} role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className={LOADING_TEXT_CLASSES}>Loading last salary…</p>
      ) : (
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Last net pay
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Most recent recorded payslip total for each pay period.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  1st–{FIRST_HALF_DAYS}th
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-800 dark:text-emerald-200">
                  {lastFirstHalfPayslip?.total != null ? fmtMoney(lastFirstHalfPayslip.total) : "–"}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {lastFirstHalfPayslip?.period_year != null && lastFirstHalfPayslip?.period_month != null
                    ? `From ${formatMonthYear(lastFirstHalfPayslip.period_year, lastFirstHalfPayslip.period_month)}`
                    : "No payslip recorded yet"}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  16th–end of month
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-800 dark:text-emerald-200">
                  {lastSecondHalfPayslip?.total != null ? fmtMoney(lastSecondHalfPayslip.total) : "–"}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {lastSecondHalfPayslip?.period_year != null && lastSecondHalfPayslip?.period_month != null
                    ? `From ${formatMonthYear(lastSecondHalfPayslip.period_year, lastSecondHalfPayslip.period_month)}`
                    : "No payslip recorded yet"}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              Semi-monthly daily budget
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Last recorded salary divided evenly across each pay period&apos;s days.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/90 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  1st–{FIRST_HALF_DAYS}th ({FIRST_HALF_DAYS} days)
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
                  {firstHalfBudget != null ? fmtMoney(firstHalfBudget) : "–"}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">per day</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/90 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  16th–{daysInMonth} ({secondHalfDays} days)
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
                  {secondHalfBudget != null ? fmtMoney(secondHalfBudget) : "–"}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">per day</p>
              </div>
            </div>
          </section>

          <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
              {formatMonthYear(year, month)}
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Past days are greyed out; today is highlighted.
            </p>

            <div className="mt-5 grid grid-cols-7 gap-1.5 sm:gap-2">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="px-1 pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="mt-1.5 grid flex-1 grid-cols-7 gap-1.5 sm:gap-2">
              {cells.map((cell, idx) => {
                if (!cell) {
                  return <div key={`blank-${idx}`} />;
                }
                const { day, isPast, isToday, dailyBudget } = cell;
                return (
                  <div
                    key={day}
                    className={`flex min-h-[5rem] min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-2 text-center sm:min-h-[7rem] ${
                      isToday
                        ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/40 dark:border-indigo-400 dark:bg-indigo-950/50"
                        : isPast
                          ? "border-dashed border-zinc-200 bg-zinc-50/60 opacity-60 dark:border-zinc-800 dark:bg-zinc-900/30"
                          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                    }`}
                  >
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        isToday
                          ? "text-indigo-900 dark:text-indigo-100"
                          : isPast
                            ? "text-zinc-400 dark:text-zinc-600"
                            : "text-zinc-800 dark:text-zinc-100"
                      }`}
                    >
                      {day}
                    </span>
                    <span
                      className={`min-w-0 truncate text-xs tabular-nums leading-tight ${
                        isToday
                          ? "font-semibold text-indigo-700 dark:text-indigo-300"
                          : isPast
                            ? "text-zinc-400 dark:text-zinc-600"
                            : "text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {dailyBudget != null ? fmtMoney(dailyBudget) : "–"}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
