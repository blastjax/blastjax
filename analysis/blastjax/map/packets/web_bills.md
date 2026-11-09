# Node web:bills: /bills
Kind: module
Language: typescript, 852 lines of code, location: web/src/app/bills

Files in this directory (largest first):
- web/src/app/bills/BillsClient.tsx
- web/src/app/bills/BillYearBlock.tsx
- web/src/app/bills/page.tsx

Source excerpt: web/src/app/bills/BillsClient.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import { confirmDialog } from "@/components/ConfirmDialog";
   4  import { useCallback, useEffect, useState } from "react";
   5  import { AmountInput } from "@/components/AmountInput";
   6  import { DatePickerField } from "@/components/DatePickerField";
   7  import { DateRangePickerField } from "@/components/DateRangePickerField";
   8  import { ErrorAlert } from "@/components/ErrorAlert";
   9  import {
  10    DANGER_TEXT_BUTTON_CLASSES,
  11    DIALOG_BODY_CLASSES,
  12    DIALOG_CLASSES,
  13    DIALOG_FOOTER_CLASSES,
  14    EmptyState,
  15    Field,
  16    LoadingBlocks,
  17    ModalHeader,
  18    Panel,
  19    Segmented,
  20    TEXT_BUTTON_CLASSES,
  21    TILE_BUTTON_CLASSES,
  22  } from "@/components/FinanceUI";
  23  import { PlusIcon, ReceiptIcon } from "@/components/Icons";
  24  import { Modal } from "@/components/Modal";
  25  import { PageHeader } from "@/components/PageHeader";
  26  import {
  27    apiFetch,
  28    billPdfUrl,
  29    createBill,
  30    createBillCategory,
  31    deleteBill,
  32    deleteBillCategory,
  33    getBills,
  34    getMonthlyExpenses,
  35    getPayPeriodStartOverrides,
  36    readBillPdf,
  37    updateBill,
  38    updateBillCategory,
  39    uploadBillPdf,
  40    type BillBody,
  41    type BillCategoryBody,
  42    type BillCategoryRow,
  43    type BillDefaults,
  44    type BillPdfFields,
  45    type BillRow,
  46    type MonthlyExpenseRow,
  47    type RelativeDay,
  48  } from "@/lib/api";
  49  import { BillYearBlock } from "./BillYearBlock";
  50  import { addMonths, formatMonthYear, parseDateOnlyLocal, toIsoDateLocal } from "@/lib/dateFormat";
  51  import { fmtCount } from "@/lib/formatNumber";
  52  import { formatAmountNumber, parseFormNumber } from "@/lib/parseFormNumber";
  53  import { periodKey, spreadExpenseChanges } from "@/lib/payPeriods";
  54  import {
  55    FILE_INPUT_CLASSES,
  56    INPUT_CLASSES,
  57    PAGE_CONTAINER_CLASSES,
  58    PRIMARY_BUTTON_CLASSES,
  59    SECONDARY_BUTTON_CLASSES,
  60  } from "@/lib/ui";
  61  
  62  type BillForm = {
  63    category_id: string;
  64    bill_date: string;
  65    due_date: string;
  66    period_start: string;
  67    period_end: string;
  68    amount: string;
  69    minimum_due: string;
  70  };
  71  
  72  type DateKey = "bill_date" | "due_date" | "period_start" | "period_end";
  73  
  74  // `form` shows the defaults as dates for a bill added this month; `saved` is what they were when opened.
  75  type CategoryDraft = { id: string | null; name: string; is_credit_card: boolean; saved: BillDefaults; form: BillForm };
  76  
  77  // `preset` is what the category's defaults put in the form, so a PDF or another category may still replace it.
  78  type BillDraft = {
  79    id: string | null;
  80    hasPdf: boolean;
  81    form: BillForm;
  82    file: File | null;
  83    note: string | null;
  84    preset: Partial<BillForm>;
  85    anchor?: Date; // the month a new bill's defaults are counted from
  86  };
  87  
  88  const plural = (n: number, word: string) => `${fmtCount(n)} ${word}${n === 1 ? "" : "s"}`;
  89  
  90  const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
  91  
  92  const billMonth = (b: BillRow) => formatMonthYear(Number(b.bill_date.slice(0, 4)), Number(b.bill_date.slice(5, 7)));
  93  
  94  const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  95  
  96  // Negative is fine: a credit card statement can carry a credit balance.
  97  function parseAmount(s: string, label = "Amount"): number | null {
  98    const amount = parseFormNumber(s);
  99    if (s.trim() !== "" && amount == null) throw new Error(`${label} must be a number.`);
 100    return amount;
 101  }
 102  
 103  const billYear = (b: BillRow) => Number(b.bill_date.slice(0, 4));
 104  
 105  // Each year that has bills (plus any in `include`), newest first, with how many it has.
 106  function yearCounts(list: BillRow[], include: number[] = []): [number, number][] {
 107    const counts = new Map(include.map((y) => [y, 0]));
 108    for (const b of list) counts.set(billYear(b), (counts.get(billYear(b)) ?? 0) + 1);
 109    return [...counts].sort((a, b) => b[0] - a[0]);
 110  }
 111  
 112  // A day past the end of its month lands on that month's last day.
 113  function resolveDay(r: RelativeDay | null | undefined, today: Date): string {
 114    if (!r) return "";
 115    const { y, m } = addMonths(today.getFullYear(), today.getMonth() + 1, r.months);
 116    return toIsoDateLocal(new Date(y, m - 1, Math.min(r.day, new Date(y, m, 0).getDate())));
 117  }
 118  
 119  // A picked date as months from this month plus its day; a month's last day stays the last day.
 120  function toRelativeDay(iso: string, today: Date): RelativeDay | null {
 121    const d = parseDateOnlyLocal(iso);
 122    if (!d) return null;
 123    const months = (d.getFullYear() - today.getFullYear()) * 12 + d.getMonth() - today.getMonth();
 124    if (Math.abs(months) > 2) throw new Error("Pick default dates within 2 months of this month.");
 125    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
 126    return { months, day: d.getDate() === last ? 31 : d.getDate() };
 127  }
 128  
 129  function presetForm(categoryId: string, d: BillDefaults = {}, today = new Date()): BillForm {
 130    return {
 131      category_id: categoryId,
 132      bill_date: resolveDay(d.bill_date, today),
 133      due_date: resolveDay(d.due_date, today),
 134      period_start: resolveDay(d.period_start, today),
 135      period_end: resolveDay(d.period_end, today),
 136      amount: d.amount == null ? "" : formatAmountNumber(d.amount),
 137      minimum_due: "",
 138    };
 139  }
 140  
 141  function newBillDraft(c: BillCategoryRow, anchor = new Date()): BillDraft {
 142    const form = presetForm(c.id, c.defaults, anchor);
 143    return { id: null, hasPdf: false, file: null, note: null, form, preset: form, anchor };
 144  }
 145  
 146  // Empty, or still holding the category's default.
 147  const untouched = (d: BillDraft, key: keyof BillForm) => !d.form[key].trim() || d.form[key] === d.preset[key];
 148  
 149  // A new bill takes the picked category's defaults wherever it still holds the old one's.
 150  function switchCategory(d: BillDraft, c: BillCategoryRow): BillDraft {
```

## Outgoing connections
- dispatch -> routers/bill.py (be:router:bill)
- dispatch -> routers/monthly_expense.py (be:router:monthly_expense)
- dispatch -> routers/pay_period_start_override.py (be:router:pay_period_start_override)
- call -> components/AmountInput.tsx (web:components:AmountInput)
- call -> components/ConfirmDialog.tsx (web:components:ConfirmDialog)
- call -> components/DatePickerField.tsx (web:components:DatePickerField)
- call -> components/DateRangePickerField.tsx (web:components:DateRangePickerField)
- call -> components/ErrorAlert.tsx (web:components:ErrorAlert)
- call -> components/FinanceUI.tsx (web:components:FinanceUI)
- call -> components/Icons.tsx (web:components:Icons)
- call -> components/Modal.tsx (web:components:Modal)
- call -> components/PageHeader.tsx (web:components:PageHeader)
- call -> components/YearMonthGrid.tsx (web:components:YearMonthGrid)
- call -> lib/api.ts (web:lib:api)
- call -> lib/dateFormat.ts (web:lib:dateFormat)
- call -> lib/formatNumber.ts (web:lib:formatNumber)
- call -> lib/parseFormNumber.ts (web:lib:parseFormNumber)
- call -> lib/payPeriods.ts (web:lib:payPeriods)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- none
