# Node web:components:HomeOverview: components/HomeOverview.tsx
Kind: module
Language: typescript, 209 lines of code, location: web/src/components/HomeOverview.tsx

Source excerpt: web/src/components/HomeOverview.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import Link from "next/link";
   4  import { useEffect, useState } from "react";
   5  import { useCurrentUser } from "@/components/AuthGate";
   6  import { LoadingBlocks, Metric, Panel, StatStrip, TEXT_BUTTON_CLASSES } from "@/components/FinanceUI";
   7  import {
   8    getBills,
   9    getBloodPressures,
  10    getCalendarDayOverrides,
  11    getCreditCards,
  12    getFixedExpenses,
  13    getMonthlyExpenses,
  14    getPayPeriodStartOverrides,
  15    getPayslips,
  16    getTravelTrips,
  17    type BloodPressureRow,
  18    type CreditCardRow,
  19    type TravelTripRow,
  20  } from "@/lib/api";
  21  import { addMonths, formatDate, monthKey, toIsoDateLocal } from "@/lib/dateFormat";
  22  import { fmtAmountOrDash } from "@/lib/formatNumber";
  23  import { isPageAllowed } from "@/lib/nav";
  24  import {
  25    addDaysIso,
  26    budgetToday,
  27    dueReminders,
  28    expenseDuesIn,
  29    isOffBudget,
  30    periodForDate,
  31    periodKey,
  32    type Reminder,
  33  } from "@/lib/payPeriods";
  34  
  35  const fmtMoney = fmtAmountOrDash;
  36  const COMING_UP_DAYS = 14;
  37  
  38  type Overview = {
  39    budget: ReturnType<typeof budgetToday>;
  40    comingUp: Reminder[];
  41    cards: CreditCardRow[];
  42    trip: TravelTripRow | null;
  43    reading: BloodPressureRow | null;
  44  };
  45  
  46  // Each page's data is optional here: a page that fails to load just drops out of the overview.
  47  async function loadOverview(today: string): Promise<Overview> {
  48    const quiet = <T,>(p: Promise<T>) => p.catch(() => null);
  49    const [starts, payslips, overrides, monthly, billData, cardData, trips, readings] = await Promise.all([
  50      quiet(getPayPeriodStartOverrides()),
  51      quiet(getPayslips(12)),
  52      quiet(getCalendarDayOverrides()),
  53      quiet(getMonthlyExpenses()),
  54      quiet(getBills()),
  55      quiet(getCreditCards()),
  56      quiet(getTravelTrips()),
  57      quiet(getBloodPressures(1)),
  58    ]);
  59    const startMap = new Map(
  60      starts?.overrides.map((o) => [periodKey(o.period_year, o.period_month, o.period_half), o.start_date]),
  61    );
  62    const period = periodForDate(startMap, today);
  63    const fixed = await quiet(getFixedExpenses(undefined, period.year, period.month));
  64  
  65    const expenses = monthly?.expenses ?? [];
  66    const bills = billData?.bills ?? [];
  67    const cards = cardData?.cards.map((b) => b.card) ?? [];
  68  
  69    const lastDay = addDaysIso(today, COMING_UP_DAYS);
  70    const next = addMonths(period.year, period.month, 1);
  71    const expenseDues = [{ y: period.year, m: period.month }, next].flatMap(({ y, m }) =>
  72      expenses
  73        .filter((e) => !isOffBudget(e, monthKey(y, m)))
  74        .flatMap((e) =>
  75          expenseDuesIn(e, startMap, y, m, bills).flatMap((d) =>
  76            d.due ? [{ day: d.due, name: e.name, amount: d.amount, href: "/monthly-expenses" }] : [],
  77          ),
  78        ),
  79    );
  80  
  81    return {
  82      budget: budgetToday(
  83        {
  84          starts: startMap,
  85          payslips: payslips?.payslips ?? [],
  86          fixed: fixed?.expenses ?? [],
  87          expenses,
  88          bills,
  89          overrides: overrides?.overrides ?? [],
  90        },
  91        today,
  92      ),
  93      comingUp: [...expenseDues, ...dueReminders(billData?.categories ?? [], bills, cards, expenses)]
  94        .filter((r) => r.day >= today && r.day <= lastDay)
  95        .sort((a, b) => a.day.localeCompare(b.day))
  96        .slice(0, 6),
  97      cards,
  98      trip:
  99        trips?.trips
 100          .map((t) => t.trip)
 101          .filter((t) => t.end_date >= today)
 102          .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null,
 103      reading: readings?.readings[0] ?? null,
 104    };
 105  }
 106  
 107  export function HomeOverview() {
 108    const user = useCurrentUser();
 109    const [overview, setOverview] = useState<Overview | null>(null);
 110  
 111    useEffect(() => {
 112      let cancelled = false;
 113      void loadOverview(toIsoDateLocal(new Date())).then((o) => {
 114        if (!cancelled) setOverview(o);
 115      });
 116      return () => {
 117        cancelled = true;
 118      };
 119    }, []);
 120  
 121    if (!overview) return <LoadingBlocks label="Loading your overview…" rows={1} />;
 122  
 123    const { budget, comingUp, cards, trip, reading } = overview;
 124    const money = isPageAllowed("/calendar", user);
 125    const showTrip = trip != null && isPageAllowed("/travels", user);
 126    const showReading = reading != null && isPageAllowed("/blood-pressure", user);
 127    const owed = cards.reduce((s, c) => s + c.current_balance, 0);
 128    const dues = cards.reduce((s, c) => s + (c.statement_paid ? 0 : c.monthly_dues), 0);
 129  
 130    return (
 131      <div className="flex flex-col gap-5">
 132        {money && (
 133          <StatStrip className="grid-cols-2 lg:grid-cols-4">
 134            <Metric
 135              label="Today's budget"
 136              value={budget ? fmtMoney(budget.today) : "–"}
 137              hint={budget ? undefined : "No payslip yet for this pay period"}
 138              tone="brand"
 139              size="lg"
 140            />
 141            <Metric
 142              label="Left to spend"
 143              value={budget ? fmtMoney(budget.left) : "–"}
 144              hint={budget ? `${budget.daysLeft} day${budget.daysLeft === 1 ? "" : "s"} left` : undefined}
 145            />
 146            <Metric label="On your cards" value={fmtMoney(owed)} hint={`${cards.length} card${cards.length === 1 ? "" : "s"}`} />
 147            <Metric label="Card dues this month" value={fmtMoney(dues)} hint="Not yet paid" tone={dues > 0 ? "danger" : "neutral"} />
 148          </StatStrip>
 149        )}
 150  
```

## Outgoing connections
- dispatch -> routers/bill.py (be:router:bill)
- dispatch -> routers/blood_pressure.py (be:router:blood_pressure)
- dispatch -> routers/calendar_day_override.py (be:router:calendar_day_override)
- dispatch -> routers/credit_card.py (be:router:credit_card)
- dispatch -> routers/fixed_expense.py (be:router:fixed_expense)
- dispatch -> routers/monthly_expense.py (be:router:monthly_expense)
- dispatch -> routers/pay_period_start_override.py (be:router:pay_period_start_override)
- dispatch -> routers/payslip.py (be:router:payslip)
- dispatch -> routers/travel.py (be:router:travel)
- call -> components/AuthGate.tsx (web:components:AuthGate)
- call -> components/FinanceUI.tsx (web:components:FinanceUI)
- call -> lib/api.ts (web:lib:api)
- call -> lib/dateFormat.ts (web:lib:dateFormat)
- call -> lib/formatNumber.ts (web:lib:formatNumber)
- call -> lib/nav.ts (web:lib:nav)
- call -> lib/payPeriods.ts (web:lib:payPeriods)

## Incoming connections
- Home page (web:home) -> call
