# Node web:credit-card: /credit-card
Kind: module
Language: typescript, 1263 lines of code, location: web/src/app/credit-card

Files in this directory (largest first):
- web/src/app/credit-card/CreditCardClient.tsx
- web/src/app/credit-card/page.tsx

Source excerpt: web/src/app/credit-card/CreditCardClient.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import { confirmDialog } from "@/components/ConfirmDialog";
   4  import { AmountInput } from "@/components/AmountInput";
   5  import { DatePickerField } from "@/components/DatePickerField";
   6  import { PageHeader } from "@/components/PageHeader";
   7  import Link from "next/link";
   8  import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
   9  import { Modal } from "@/components/Modal";
  10  import {
  11    DANGER_TEXT_BUTTON_CLASSES,
  12    DIALOG_BODY_CLASSES,
  13    DIALOG_CLASSES,
  14    DIALOG_FOOTER_CLASSES,
  15    EmptyState,
  16    Field,
  17    LoadingBlocks,
  18    Metric,
  19    Meter,
  20    ModalHeader,
  21    Panel,
  22    Pill,
  23    Segmented,
  24    TEXT_BUTTON_CLASSES,
  25    TILE_BUTTON_CLASSES,
  26  } from "@/components/FinanceUI";
  27  import { CreditCardIcon, PlusIcon } from "@/components/Icons";
  28  import {
  29    adjustCreditCardBalance,
  30    createCreditCard,
  31    createCreditCardPayment,
  32    deleteCreditCard,
  33    deleteCreditCardPayment,
  34    getBills,
  35    getCreditCards,
  36    getMonthlyExpenses,
  37    getPayPeriodStartOverrides,
  38    recordInstallmentPayment,
  39    updateCreditCard,
  40    updateCreditCardPayment,
  41    type BillCategoryRow,
  42    type BillRow,
  43    type BudgetChange,
  44    type CreditCardBundle,
  45    type CreditCardPaymentRow,
  46    type CreditCardRow,
  47    type MonthlyExpenseRow,
  48  } from "@/lib/api";
  49  import { formatAmountNumber, parseFormNumber } from "@/lib/parseFormNumber";
  50  import { formatDate, formatMonthYear, monthKey, parseDateOnlyLocal, toIsoDateLocal } from "@/lib/dateFormat";
  51  import { fmtAmountOrDash } from "@/lib/formatNumber";
  52  import {
  53    chargedCardIn,
  54    expenseDuesIn,
  55    payslipHalfFor,
  56    periodForDate,
  57    periodKey,
  58    periodRangeLabel,
  59    spreadBudgetChanges,
  60    type PeriodHalf,
  61  } from "@/lib/payPeriods";
  62  import { ErrorAlert } from "@/components/ErrorAlert";
  63  import {
  64    INPUT_CLASSES,
  65    PAGE_CONTAINER_CLASSES,
  66    PRIMARY_BUTTON_CLASSES,
  67    SECONDARY_BUTTON_CLASSES,
  68    TABLE_CELL_CLASSES,
  69    TABLE_HEAD_CELL_CLASSES,
  70    TABLE_HEAD_ROW_CLASSES,
  71    TABLE_ROW_CLASSES,
  72  } from "@/lib/ui";
  73  
  74  const fmtMoney = fmtAmountOrDash;
  75  
  76  const fmtDate = formatDate;
  77  
  78  function todayInputDate(): string {
  79    return toIsoDateLocal(new Date());
  80  }
  81  
  82  function dueCountdown(iso: string | null): { text: string; tone: "neutral" | "warning" | "danger" } | null {
  83    const d = iso ? parseDateOnlyLocal(iso) : null;
  84    if (!d) return null;
  85    const today = new Date();
  86    today.setHours(0, 0, 0, 0);
  87    const n = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  88    if (n < 0) return { text: `${-n} day${n === -1 ? "" : "s"} ago`, tone: "neutral" };
  89    if (n === 0) return { text: "Due today", tone: "danger" };
  90    return { text: `In ${n} day${n === 1 ? "" : "s"}`, tone: n <= 7 ? "warning" : "neutral" };
  91  }
  92  
  93  type PayoffByPayment = {
  94    months: number;
  95    totalPaid: number;
  96    totalInterest: number;
  97    reachable: boolean;
  98  };
  99  
 100  function payoffMonthsForPayment(
 101    balance: number,
 102    monthlyRate: number,
 103    payment: number,
 104    maxMonths = 1200,
 105  ): PayoffByPayment {
 106    if (balance <= 0) return { months: 0, totalPaid: 0, totalInterest: 0, reachable: true };
 107    let bal = balance;
 108    let months = 0;
 109    let totalPaid = 0;
 110    let totalInterest = 0;
 111    while (bal > 0.005 && months < maxMonths) {
 112      const interest = bal * monthlyRate;
 113      bal += interest;
 114      const pay = Math.min(payment, bal);
 115      bal -= pay;
 116      totalPaid += pay;
 117      totalInterest += interest;
 118      months += 1;
 119    }
 120    return { months, totalPaid, totalInterest, reachable: bal <= 0.005 };
 121  }
 122  
 123  type PayoffByMonths = { payment: number; totalPaid: number; totalInterest: number };
 124  
 125  function paymentForMonths(balance: number, monthlyRate: number, months: number): PayoffByMonths {
 126    if (balance <= 0 || months <= 0) return { payment: 0, totalPaid: 0, totalInterest: 0 };
 127    const payment =
 128      monthlyRate <= 0
 129        ? balance / months
 130        : (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
 131    const totalPaid = payment * months;
 132    return { payment, totalPaid, totalInterest: totalPaid - balance };
 133  }
 134  
 135  type CardForm = {
 136    name: string;
 137    credit_limit: string;
 138    last_statement_balance: string;
 139    minimum_due: string;
 140    interest_rate: string;
 141    statement_date: string;
 142    due_date: string;
 143    bill_category_id: string; // "" when the statement is typed in
 144  };
 145  
 146  const emptyCardForm = (): CardForm => ({
 147    name: "",
 148    credit_limit: "",
 149    last_statement_balance: "",
 150    minimum_due: "",
```

## Outgoing connections
- dispatch -> routers/bill.py (be:router:bill)
- dispatch -> routers/credit_card.py (be:router:credit_card)
- dispatch -> routers/installment.py (be:router:installment)
- dispatch -> routers/monthly_expense.py (be:router:monthly_expense)
- dispatch -> routers/pay_period_start_override.py (be:router:pay_period_start_override)
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

## Incoming connections
- none
