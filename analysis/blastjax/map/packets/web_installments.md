# Node web:installments: /installments
Kind: module
Language: typescript, 1419 lines of code, location: web/src/app/installments

Files in this directory (largest first):
- web/src/app/installments/InstallmentsClient.tsx
- web/src/app/installments/installmentFieldGrid.tsx
- web/src/app/installments/page.tsx

Source excerpt: web/src/app/installments/InstallmentsClient.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import { confirmDialog } from "@/components/ConfirmDialog";
   4  import { AmountInput } from "@/components/AmountInput";
   5  import { PageHeader } from "@/components/PageHeader";
   6  import { useCallback, useEffect, useMemo, useState } from "react";
   7  import { Modal } from "@/components/Modal";
   8  import {
   9    ChargedToField,
  10    DANGER_TEXT_BUTTON_CLASSES,
  11    DIALOG_BODY_CLASSES,
  12    DIALOG_CLASSES,
  13    DIALOG_FOOTER_CLASSES,
  14    EmptyState,
  15    LoadingBlocks,
  16    Metric,
  17    Meter,
  18    ModalHeader,
  19    Pill,
  20    Segmented,
  21    StatStrip,
  22    TEXT_BUTTON_CLASSES,
  23  } from "@/components/FinanceUI";
  24  import { CheckIcon, ChevronDownIcon, LayersIcon, PlusIcon } from "@/components/Icons";
  25  import {
  26    createInstallment,
  27    deleteInstallment,
  28    getCreditCards,
  29    getInstallment,
  30    getInstallments,
  31    getInstallmentSchedules,
  32    recordInstallmentPayment,
  33    reorderInstallmentLines,
  34    updateInstallment,
  35    updateInstallmentLinesBulk,
  36    type CreditCardRow,
  37    type InstallmentCreateBody,
  38    type InstallmentDetailResponse,
  39    type InstallmentLineRow,
  40    type InstallmentRow,
  41  } from "@/lib/api";
  42  import { formatAmountNumber, parseFormNumber } from "@/lib/parseFormNumber";
  43  import { MONTH_NAMES_SHORT, formatMonthYear } from "@/lib/dateFormat";
  44  import { fmtAmountOrDash } from "@/lib/formatNumber";
  45  import { ErrorAlert } from "@/components/ErrorAlert";
  46  import {
  47    ADD_BUTTON_CLASSES,
  48    EDIT_BUTTON_CLASSES,
  49    PAGE_CONTAINER_CLASSES,
  50    PRIMARY_BUTTON_CLASSES,
  51    SECONDARY_BUTTON_CLASSES,
  52  } from "@/lib/ui";
  53  import { InstallmentFieldGrid } from "./installmentFieldGrid";
  54  
  55  const fmtMoney = fmtAmountOrDash;
  56  
  57  function addMonths(d: Date, months: number): Date {
  58    const x = new Date(d.getFullYear(), d.getMonth(), 1);
  59    x.setMonth(x.getMonth() + months);
  60    return x;
  61  }
  62  
  63  function startAsFirstOfMonth(iso: string): Date {
  64    const ymd = iso.slice(0, 10);
  65    const [y, m] = ymd.split("-").map(Number);
  66    if (!y || !m) return new Date(NaN);
  67    return new Date(y, m - 1, 1);
  68  }
  69  
  70  function nextDueDate(r: InstallmentRow): Date {
  71    const start = startAsFirstOfMonth(r.start_date);
  72    return addMonths(start, r.installment_current);
  73  }
  74  
  75  function dueMonthForSeq(startIso: string, seq: number): Date {
  76    const start = startAsFirstOfMonth(startIso);
  77    return addMonths(start, seq);
  78  }
  79  
  80  function fmtMonthYear(iso: string): string {
  81    const ymd = iso.slice(0, 10);
  82    const parts = ymd.split("-");
  83    if (parts.length < 2) return "—";
  84    const y = Number(parts[0]);
  85    const m = Number(parts[1]);
  86    if (!Number.isFinite(y) || !Number.isFinite(m)) return "—";
  87    return formatMonthYear(y, m);
  88  }
  89  
  90  function fmtMonthYearFromDate(d: Date): string {
  91    if (Number.isNaN(d.getTime())) return "—";
  92    return formatMonthYear(d.getFullYear(), d.getMonth() + 1);
  93  }
  94  
  95  function toInputMonth(iso: string): string {
  96    if (!iso) return "";
  97    const t = iso.trim();
  98    const ymd = t.slice(0, 10);
  99    const isoD = /^(\d{4})-(\d{2})-\d{2}$/.exec(ymd);
 100    if (isoD) return `${isoD[1]}-${isoD[2]}`;
 101    const my = /^(\d{1,2})-(\d{4})$/.exec(t);
 102    if (my) return `${my[2]}-${my[1].padStart(2, "0")}`;
 103    return t.slice(0, 7);
 104  }
 105  
 106  function monthToApiDate(ym: string): string {
 107    const t = ym.trim();
 108    if (!t) return "";
 109    const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
 110    if (full) return `${full[1]}-${full[2]}-01`;
 111    const isoMonth = /^(\d{4})-(\d{2})$/.exec(t);
 112    if (isoMonth) return `${isoMonth[1]}-${isoMonth[2]}-01`;
 113    const flipped = /^(\d{1,2})-(\d{4})$/.exec(t);
 114    if (flipped) {
 115      const mo = flipped[1].padStart(2, "0");
 116      return `${flipped[2]}-${mo}-01`;
 117    }
 118    return "";
 119  }
 120  
 121  function addMonthsToApiDate(apiDate: string, months: number): string {
 122    const [y, m] = apiDate.slice(0, 7).split("-").map(Number);
 123    if (!y || !m) return "";
 124    const d = addMonths(new Date(y, m - 1, 1), months);
 125    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
 126  }
 127  
 128  function isDueThisMonth(r: InstallmentRow): boolean {
 129    if (r.installment_current > r.installment_total || r.remaining <= 0) return false;
 130    const due = nextDueDate(r);
 131    const now = new Date();
 132    return (
 133      due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth()
 134    );
 135  }
 136  
 137  function installmentScheduleProgressPct(r: InstallmentRow): number {
 138    const tot = Number(r.installment_total);
 139    const cur = Number(r.installment_current);
 140    const rem = Number(r.remaining);
 141    if (!(tot > 0) || !Number.isFinite(tot) || !Number.isFinite(cur)) return 0;
 142    if (cur > tot || (Number.isFinite(rem) && rem <= 0)) return 100;
 143    return Math.min(
 144      100,
 145      Math.max(0, ((cur - 1) / tot) * 100),
 146    );
 147  }
 148  
 149  const emptyForm = {
 150    name: "",
```

## Outgoing connections
- dispatch -> routers/credit_card.py (be:router:credit_card)
- dispatch -> routers/installment.py (be:router:installment)
- call -> components/AmountInput.tsx (web:components:AmountInput)
- call -> components/ConfirmDialog.tsx (web:components:ConfirmDialog)
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
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- none
