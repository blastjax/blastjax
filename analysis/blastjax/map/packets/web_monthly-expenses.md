# Node web:monthly-expenses: /monthly-expenses
Kind: module
Language: typescript, 704 lines of code, location: web/src/app/monthly-expenses

Files in this directory (largest first):
- web/src/app/monthly-expenses/MonthlyExpensesClient.tsx
- web/src/app/monthly-expenses/page.tsx

Source excerpt: web/src/app/monthly-expenses/MonthlyExpensesClient.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import { confirmDialog } from "@/components/ConfirmDialog";
   4  import { AmountInput } from "@/components/AmountInput";
   5  import { DatePickerField } from "@/components/DatePickerField";
   6  import { MonthPickerField } from "@/components/MonthPickerField";
   7  import { PageHeader } from "@/components/PageHeader";
   8  import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
   9  import { Modal } from "@/components/Modal";
  10  import {
  11    ChargedToField,
  12    DANGER_TEXT_BUTTON_CLASSES,
  13    DIALOG_BODY_CLASSES,
  14    DIALOG_CLASSES,
  15    DIALOG_FOOTER_CLASSES,
  16    Field,
  17    LoadingBlocks,
  18    Metric,
  19    ModalHeader,
  20    MonthStepper,
  21    Panel,
  22    Pill,
  23    Segmented,
  24    StatStrip,
  25    TEXT_BUTTON_CLASSES,
  26  } from "@/components/FinanceUI";
  27  import { PlusIcon } from "@/components/Icons";
  28  import {
  29    createHousePaymentEntry,
  30    createMonthlyExpense,
  31    deleteHousePaymentEntry,
  32    deleteMonthlyExpense,
  33    getBills,
  34    getCreditCards,
  35    getHousePayment,
  36    getHousePayments,
  37    getMonthlyExpenses,
  38    getPayPeriodStartOverrides,
  39    updateMonthlyExpense,
  40    type BillCategoryRow,
  41    type BillRow,
  42    type CreditCardRow,
  43    type HousePaymentEntry,
  44    type HousePaymentRow,
  45    type MonthlyExpenseRow,
  46  } from "@/lib/api";
  47  import {
  48    addMonths,
  49    formatDate,
  50    formatMonthYear,
  51    formatMonthYearShort,
  52    monthKey,
  53    parseMonthKey,
  54    toIsoDateLocal,
  55  } from "@/lib/dateFormat";
  56  import { fmtAmount } from "@/lib/formatNumber";
  57  import { formatAmountNumber, parseFormNumber } from "@/lib/parseFormNumber";
  58  import {
  59    chargedCardIn,
  60    chargeFrom,
  61    compareDue,
  62    effectiveHalfStartIso,
  63    expenseDuesIn,
  64    periodForDate,
  65    periodKey,
  66    periodRangeLabel,
  67    spreadExpenseChanges,
  68    type PeriodHalf,
  69  } from "@/lib/payPeriods";
  70  import { ErrorAlert } from "@/components/ErrorAlert";
  71  import {
  72    INPUT_CLASSES,
  73    PAGE_CONTAINER_CLASSES,
  74    PRIMARY_BUTTON_CLASSES,
  75    SECONDARY_BUTTON_CLASSES,
  76    TOGGLE_ACTIVE_BUTTON_CLASSES,
  77    TOGGLE_INACTIVE_BUTTON_CLASSES,
  78  } from "@/lib/ui";
  79  
  80  const HALF: Record<PeriodHalf, { label: string; days: string }> = {
  81    1: { label: "1st half", days: "Paid end of month" },
  82    2: { label: "2nd half", days: "Paid mid-month" },
  83  };
  84  
  85  const fmtMoney = fmtAmount;
  86  
  87  const ORDINAL = new Intl.PluralRules("en-US", { type: "ordinal" });
  88  const ORDINAL_SUFFIX: Record<string, string> = { one: "st", two: "nd", few: "rd", other: "th" };
  89  const ordinal = (n: number) => `${n}${ORDINAL_SUFFIX[ORDINAL.select(n)]}`;
  90  
  91  const SPREAD_FAILED = "The expense is saved, but the calendar's daily amounts didn't update. Use Even out on the calendar.";
  92  
  93  // An expense as the viewed month has it: `amount` stays the estimate, and `shown` is a real bill's when there is one.
  94  type Listed = MonthlyExpenseRow & { shown: number; fromBill: boolean };
  95  
  96  type ExpenseForm = {
  97    name: string;
  98    description: string;
  99    amount: string;
 100    period_half: PeriodHalf;
 101    month: string;
 102    is_recurring: boolean;
 103    date: string;
 104    skipped_months: string[];
 105    charged_months: MonthlyExpenseRow["charged_months"];
 106    bill_category_id: string; // "" when it has no bills to read
 107    house_payment_id: string; // "" when it isn't one
 108    paid: boolean;
 109  };
 110  const emptyForm = (defaultMonth: string, half: PeriodHalf = 1): ExpenseForm => ({
 111    name: "",
 112    description: "",
 113    amount: "",
 114    period_half: half,
 115    month: defaultMonth,
 116    is_recurring: false,
 117    date: "",
 118    skipped_months: [],
 119    charged_months: {},
 120    bill_category_id: "",
 121    house_payment_id: "",
 122    paid: false,
 123  });
 124  
 125  export default function MonthlyExpensesClient() {
 126    const today = useMemo(() => new Date(), []);
 127    const currentMonthKey = useMemo(
 128      () => monthKey(today.getFullYear(), today.getMonth() + 1),
 129      [today],
 130    );
 131  
 132    const [expenses, setExpenses] = useState<MonthlyExpenseRow[]>([]);
 133    const [cards, setCards] = useState<CreditCardRow[]>([]);
 134    const [bills, setBills] = useState<BillRow[]>([]);
 135    const [billCategories, setBillCategories] = useState<BillCategoryRow[]>([]);
 136    const [houses, setHouses] = useState<HousePaymentRow[]>([]);
 137    const [houseEntries, setHouseEntries] = useState<Map<string, HousePaymentEntry[]>>(new Map());
 138    const [payPeriodStarts, setPayPeriodStarts] = useState<Map<string, string>>(new Map());
 139    const [loading, setLoading] = useState(true);
 140    const [error, setError] = useState<string | null>(null);
 141  
 142    const [month, setMonth] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() + 1 }));
 143    const [showAll, setShowAll] = useState(false);
 144  
 145    const [modalOpen, setModalOpen] = useState(false);
 146    const [editingId, setEditingId] = useState<string | null>(null);
 147    const [form, setForm] = useState<ExpenseForm>(emptyForm(currentMonthKey));
 148    const [saving, setSaving] = useState(false);
 149    const [formError, setFormError] = useState<string | null>(null);
 150  
```

## Outgoing connections
- dispatch -> routers/bill.py (be:router:bill)
- dispatch -> routers/credit_card.py (be:router:credit_card)
- dispatch -> routers/house_payment.py (be:router:house_payment)
- dispatch -> routers/monthly_expense.py (be:router:monthly_expense)
- dispatch -> routers/pay_period_start_override.py (be:router:pay_period_start_override)
- call -> components/AmountInput.tsx (web:components:AmountInput)
- call -> components/ConfirmDialog.tsx (web:components:ConfirmDialog)
- call -> components/DatePickerField.tsx (web:components:DatePickerField)
- call -> components/ErrorAlert.tsx (web:components:ErrorAlert)
- call -> components/FinanceUI.tsx (web:components:FinanceUI)
- call -> components/Icons.tsx (web:components:Icons)
- call -> components/Modal.tsx (web:components:Modal)
- call -> components/MonthPickerField.tsx (web:components:MonthPickerField)
- call -> components/PageHeader.tsx (web:components:PageHeader)
- call -> lib/api.ts (web:lib:api)
- call -> lib/dateFormat.ts (web:lib:dateFormat)
- call -> lib/formatNumber.ts (web:lib:formatNumber)
- call -> lib/parseFormNumber.ts (web:lib:parseFormNumber)
- call -> lib/payPeriods.ts (web:lib:payPeriods)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- none
