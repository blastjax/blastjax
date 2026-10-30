"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/components/AuthGate";
import { LoadingBlocks, Metric, Panel, StatStrip, TEXT_BUTTON_CLASSES } from "@/components/FinanceUI";
import {
  getBills,
  getBloodPressures,
  getCalendarDayOverrides,
  getCreditCards,
  getFixedExpenses,
  getMonthlyExpenses,
  getPayPeriodStartOverrides,
  getPayslips,
  getTravelTrips,
  type BloodPressureRow,
  type CreditCardRow,
  type TravelTripRow,
} from "@/lib/api";
import { addMonths, formatDate, monthKey, toIsoDateLocal } from "@/lib/dateFormat";
import { fmtAmountOrDash } from "@/lib/formatNumber";
import { isPageAllowed } from "@/lib/nav";
import {
  addDaysIso,
  budgetToday,
  dueReminders,
  expenseDuesIn,
  isOffBudget,
  periodForDate,
  periodKey,
  type Reminder,
} from "@/lib/payPeriods";

const fmtMoney = fmtAmountOrDash;
const COMING_UP_DAYS = 14;

type Overview = {
  budget: ReturnType<typeof budgetToday>;
  comingUp: Reminder[];
  cards: CreditCardRow[];
  trip: TravelTripRow | null;
  reading: BloodPressureRow | null;
};

// Each page's data is optional here: a page that fails to load just drops out of the overview.
async function loadOverview(today: string): Promise<Overview> {
  const quiet = <T,>(p: Promise<T>) => p.catch(() => null);
  const [starts, payslips, overrides, monthly, billData, cardData, trips, readings] = await Promise.all([
    quiet(getPayPeriodStartOverrides()),
    quiet(getPayslips(12)),
    quiet(getCalendarDayOverrides()),
    quiet(getMonthlyExpenses()),
    quiet(getBills()),
    quiet(getCreditCards()),
    quiet(getTravelTrips()),
    quiet(getBloodPressures(1)),
  ]);
  const startMap = new Map(
    starts?.overrides.map((o) => [periodKey(o.period_year, o.period_month, o.period_half), o.start_date]),
  );
  const period = periodForDate(startMap, today);
  const fixed = await quiet(getFixedExpenses(undefined, period.year, period.month));

  const expenses = monthly?.expenses ?? [];
  const bills = billData?.bills ?? [];
  const cards = cardData?.cards.map((b) => b.card) ?? [];

  const lastDay = addDaysIso(today, COMING_UP_DAYS);
  const next = addMonths(period.year, period.month, 1);
  const expenseDues = [{ y: period.year, m: period.month }, next].flatMap(({ y, m }) =>
    expenses
      .filter((e) => !isOffBudget(e, monthKey(y, m)))
      .flatMap((e) =>
        expenseDuesIn(e, startMap, y, m, bills).flatMap((d) =>
          d.due ? [{ day: d.due, name: e.name, amount: d.amount, href: "/monthly-expenses" }] : [],
        ),
      ),
  );

  return {
    budget: budgetToday(
      {
        starts: startMap,
        payslips: payslips?.payslips ?? [],
        fixed: fixed?.expenses ?? [],
        expenses,
        bills,
        overrides: overrides?.overrides ?? [],
      },
      today,
    ),
    comingUp: [...expenseDues, ...dueReminders(billData?.categories ?? [], bills, cards, expenses)]
      .filter((r) => r.day >= today && r.day <= lastDay)
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(0, 6),
    cards,
    trip:
      trips?.trips
        .map((t) => t.trip)
        .filter((t) => t.end_date >= today)
        .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null,
    reading: readings?.readings[0] ?? null,
  };
}

export function HomeOverview() {
  const user = useCurrentUser();
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadOverview(toIsoDateLocal(new Date())).then((o) => {
      if (!cancelled) setOverview(o);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!overview) return <LoadingBlocks label="Loading your overview…" rows={1} />;

  const { budget, comingUp, cards, trip, reading } = overview;
  const money = isPageAllowed("/calendar", user);
  const showTrip = trip != null && isPageAllowed("/travels", user);
  const showReading = reading != null && isPageAllowed("/blood-pressure", user);
  const owed = cards.reduce((s, c) => s + c.current_balance, 0);
  const dues = cards.reduce((s, c) => s + (c.statement_paid ? 0 : c.monthly_dues), 0);

  return (
    <div className="flex flex-col gap-5">
      {money && (
        <StatStrip className="grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Today's budget"
            value={budget ? fmtMoney(budget.today) : "–"}
            hint={budget ? undefined : "No payslip yet for this pay period"}
            tone="brand"
            size="lg"
          />
          <Metric
            label="Left to spend"
            value={budget ? fmtMoney(budget.left) : "–"}
            hint={budget ? `${budget.daysLeft} day${budget.daysLeft === 1 ? "" : "s"} left` : undefined}
          />
          <Metric label="On your cards" value={fmtMoney(owed)} hint={`${cards.length} card${cards.length === 1 ? "" : "s"}`} />
          <Metric label="Card dues this month" value={fmtMoney(dues)} hint="Not yet paid" tone={dues > 0 ? "danger" : "neutral"} />
        </StatStrip>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {money && (
          <Panel
            flush
            title="Coming up"
            subtitle={`The next ${COMING_UP_DAYS} days.`}
            actions={
              <Link href="/calendar" className={TEXT_BUTTON_CLASSES}>
                Calendar →
              </Link>
            }
          >
            {comingUp.length === 0 ? (
              <p className="px-5 pb-6 text-sm text-ink-3 sm:px-6">Nothing due in the next {COMING_UP_DAYS} days.</p>
            ) : (
              <ul className="divide-y divide-line-soft border-t border-line-soft">
                {comingUp.map((r) => (
                  <li key={`${r.href}:${r.day}:${r.name}`}>
                    <Link
                      href={r.href}
                      className="flex items-baseline justify-between gap-3 px-5 py-3 transition-colors duration-150 hover:bg-surface-2/60 sm:px-6"
                    >
                      <span className="min-w-0 truncate text-sm font-medium text-ink">{r.name}</span>
                      <span className="shrink-0 text-sm tabular-nums text-ink-3">
                        {formatDate(r.day)}
                        {r.amount != null && <span className="ml-3 font-semibold text-ink">{fmtMoney(r.amount)}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {(showTrip || showReading) && (
          <div className="flex flex-col gap-5">
            {showTrip && (
              <Panel
                title={trip.start_date > toIsoDateLocal(new Date()) ? "Next trip" : "On a trip"}
                actions={
                  <Link href="/travels" className={TEXT_BUTTON_CLASSES}>
                    Travels →
                  </Link>
                }
              >
                <p className="text-sm font-medium text-ink">{trip.title}</p>
                <p className="mt-0.5 text-sm text-ink-3">
                  {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
                </p>
              </Panel>
            )}
            {showReading && (
              <Panel
                title="Latest reading"
                actions={
                  <Link href="/blood-pressure" className={TEXT_BUTTON_CLASSES}>
                    Health →
                  </Link>
                }
              >
                <p className="text-sm font-medium tabular-nums text-ink">
                  {reading.systolic ?? "–"}/{reading.diastolic ?? "–"}
                  {reading.pulse != null && <span className="ml-2 font-normal text-ink-3">{reading.pulse} bpm</span>}
                </p>
                <p className="mt-0.5 text-sm text-ink-3">{formatDate(reading.created_at.slice(0, 10))}</p>
              </Panel>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
