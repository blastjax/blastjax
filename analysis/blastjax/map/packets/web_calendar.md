# Node web:calendar: /calendar
Kind: module
Language: typescript, 2154 lines of code, location: web/src/app/calendar

Files in this directory (largest first):
- web/src/app/calendar/CalendarClient.tsx
- web/src/app/calendar/page.tsx

Source excerpt: web/src/app/calendar/CalendarClient.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import { confirmDialog } from "@/components/ConfirmDialog";
   4  import { AmountInput } from "@/components/AmountInput";
   5  import { DatePickerField } from "@/components/DatePickerField";
   6  import { PageHeader } from "@/components/PageHeader";
   7  import {
   8    memo,
   9    useCallback,
  10    useEffect,
  11    useMemo,
  12    useRef,
  13    useState,
  14    type DragEvent,
  15    type FormEvent,
  16  } from "react";
  17  import Link from "next/link";
  18  import { Modal } from "@/components/Modal";
  19  import {
  20    DANGER_TEXT_BUTTON_CLASSES,
  21    DIALOG_BODY_CLASSES,
  22    DIALOG_CLASSES,
  23    DIALOG_FOOTER_CLASSES,
  24    Field,
  25    LoadingBlocks,
  26    Metric,
  27    Meter,
  28    ModalHeader,
  29    MonthStepper,
  30    Panel,
  31    Pill,
  32    StatStrip,
  33    TEXT_BUTTON_CLASSES,
  34  } from "@/components/FinanceUI";
  35  import { CalendarIcon, ChevronRightIcon, PlusIcon } from "@/components/Icons";
  36  import {
  37    bulkUpsertCalendarDayOverrides,
  38    createFixedExpense,
  39    deleteFixedExpense,
  40    updateFixedExpense,
  41    deletePayPeriodStartOverride,
  42    getBills,
  43    getCalendarDayOverrides,
  44    getCreditCards,
  45    getFixedExpenses,
  46    getMonthlyExpenses,
  47    getPayPeriodStartOverrides,
  48    getPayslips,
  49    getTravelTrips,
  50    upsertPayPeriodStartOverride,
  51    type BillCategoryRow,
  52    type BillRow as RealBill,
  53    type CalendarDayOverrideRow,
  54    type CreditCardRow,
  55    type FixedExpenseRow,
  56    type MonthlyExpenseRow,
  57    type PayslipRow,
  58    type TravelTripRow,
  59  } from "@/lib/api";
  60  import {
  61    MONTH_NAMES_SHORT,
  62    formatMonthDayShort,
  63    formatMonthYear,
  64    formatWeekdayMonthDay,
  65    monthKey,
  66  } from "@/lib/dateFormat";
  67  import { fmtAmount, fmtCompactMoney } from "@/lib/formatNumber";
  68  import {
  69    evaluateAmountExpression,
  70    formatAmountNumber,
  71    parseFormNumber,
  72  } from "@/lib/parseFormNumber";
  73  import { ErrorAlert } from "@/components/ErrorAlert";
  74  import {
  75    INPUT_CLASSES,
  76    PAGE_CONTAINER_CLASSES,
  77    PRIMARY_BUTTON_CLASSES,
  78    SECONDARY_BUTTON_CLASSES,
  79  } from "@/lib/ui";
  80  import { useWheelStep } from "@/lib/useWheelStep";
  81  import {
  82    addDaysIso,
  83    compareDue,
  84    dateIso,
  85    dueReminders,
  86    effectiveHalfStartIso,
  87    expenseDuesIn,
  88    fundingPeriodFor,
  89    isOffBudget,
  90    latestHalfStartIso,
  91    periodEndIso,
  92    periodForDate,
  93    periodKey,
  94    payslipHalfFor,
  95    spreadCentsEvenly,
  96    tripReminders,
  97    type OverrideWrite,
  98    type PeriodHalf,
  99    type Reminder,
 100  } from "@/lib/payPeriods";
 101  
 102  const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
 103  
 104  const DAY_DND_MIME = "text/x-calendar-day";
 105  
 106  const CARRY_OVER_LABEL = "Carry over";
 107  
 108  const NOTHING_TO_EVEN_OUT =
 109    "Nothing to even out: these pay periods have no days left, or no payslip yet";
 110  
 111  function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
 112    const zeroBased = month - 1 + delta;
 113    const y = year + Math.floor(zeroBased / 12);
 114    const m = (((zeroBased % 12) + 12) % 12) + 1;
 115    return { year: y, month: m };
 116  }
 117  
 118  function adjacentPeriodFor(
 119    year: number,
 120    month: number,
 121    half: PeriodHalf,
 122  ): { year: number; month: number; half: PeriodHalf } {
 123    if (half === 1) return { year, month, half: 2 };
 124    const next = addMonths(year, month, 1);
 125    return { year: next.year, month: next.month, half: 1 };
 126  }
 127  
 128  function daysBetweenInclusive(startIso: string, endIso: string): number {
 129    const [sy, sm, sd] = startIso.split("-").map(Number);
 130    const [ey, em, ed] = endIso.split("-").map(Number);
 131    const start = new Date(sy, sm - 1, sd).getTime();
 132    const end = new Date(ey, em - 1, ed).getTime();
 133    return Math.round((end - start) / 86_400_000) + 1;
 134  }
 135  
 136  function periodDayCount(
 137    overrides: Map<string, string>,
 138    year: number,
 139    month: number,
 140    half: PeriodHalf,
 141  ): number {
 142    return daysBetweenInclusive(
 143      effectiveHalfStartIso(overrides, year, month, half),
 144      periodEndIso(overrides, year, month, half),
 145    );
 146  }
 147  
 148  function roundCents(n: number): number {
 149    return Math.round(n * 100) / 100;
 150  }
```

## Outgoing connections
- dispatch -> routers/bill.py (be:router:bill)
- dispatch -> routers/calendar_day_override.py (be:router:calendar_day_override)
- dispatch -> routers/credit_card.py (be:router:credit_card)
- dispatch -> routers/fixed_expense.py (be:router:fixed_expense)
- dispatch -> routers/monthly_expense.py (be:router:monthly_expense)
- dispatch -> routers/pay_period_start_override.py (be:router:pay_period_start_override)
- dispatch -> routers/payslip.py (be:router:payslip)
- dispatch -> routers/travel.py (be:router:travel)
- call -> components/AmountInput.tsx (web:components:AmountInput)
- call -> components/ConfirmDialog.tsx (web:components:ConfirmDialog)
- call -> components/DatePickerField.tsx (web:components:DatePickerField)
- call -> components/ErrorAlert.tsx (web:components:ErrorAlert)
- call -> components/FinanceUI.tsx (web:components:FinanceUI)
- call -> components/Icons.tsx (web:components:Icons)
- call -> components/Modal.tsx (web:components:Modal)
- call -> components/PageHeader.tsx (web:components:PageHeader)
- call -> lib/api.ts (web:lib:api)
- call -> lib/dateFormat.ts (web:lib:dateFormat)
- call -> lib/formatNumber.ts (web:lib:formatNumber)
- call -> lib/parseFormNumber.ts (web:lib:parseFormNumber)
- call -> lib/payPeriods.ts (web:lib:payPeriods)
- call -> lib/ui.ts (web:lib:ui)
- call -> lib/useWheelStep.ts (web:lib:useWheelStep)

## Incoming connections
- none
