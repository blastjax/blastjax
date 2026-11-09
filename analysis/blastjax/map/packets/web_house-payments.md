# Node web:house-payments: /house-payments
Kind: module
Language: typescript, 636 lines of code, location: web/src/app/house-payments

Files in this directory (largest first):
- web/src/app/house-payments/HousePaymentsClient.tsx
- web/src/app/house-payments/page.tsx

Source excerpt: web/src/app/house-payments/HousePaymentsClient.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import { confirmDialog } from "@/components/ConfirmDialog";
   4  import { AmountInput } from "@/components/AmountInput";
   5  import { DatePickerField } from "@/components/DatePickerField";
   6  import { PageHeader } from "@/components/PageHeader";
   7  import { useCallback, useEffect, useMemo, useState } from "react";
   8  import { Modal } from "@/components/Modal";
   9  import {
  10    DANGER_TEXT_BUTTON_CLASSES,
  11    DIALOG_BODY_CLASSES,
  12    DIALOG_CLASSES,
  13    DIALOG_FOOTER_CLASSES,
  14    EmptyState,
  15    Field,
  16    LoadingBlocks,
  17    Metric,
  18    ModalHeader,
  19    Panel,
  20    StatStrip,
  21  } from "@/components/FinanceUI";
  22  import { CheckIcon, HomeIcon, PlusIcon } from "@/components/Icons";
  23  import {
  24    createHousePayment,
  25    createHousePaymentEntry,
  26    deleteHousePayment,
  27    deleteHousePaymentEntry,
  28    getHousePayment,
  29    getHousePayments,
  30    updateHousePayment,
  31    updateHousePaymentEntry,
  32    type HousePaymentDetailResponse,
  33    type HousePaymentEntry,
  34    type HousePaymentRow,
  35  } from "@/lib/api";
  36  import { formatAmountNumber, parseFormNumber } from "@/lib/parseFormNumber";
  37  import { formatDate as fmtDate, toIsoDateLocal } from "@/lib/dateFormat";
  38  import { fmtAmountOrDash, fmtCount } from "@/lib/formatNumber";
  39  import { ErrorAlert } from "@/components/ErrorAlert";
  40  import {
  41    INPUT_CLASSES,
  42    PAGE_CONTAINER_CLASSES,
  43    PRIMARY_BUTTON_CLASSES,
  44    SECONDARY_BUTTON_CLASSES,
  45    SECTION_LABEL_CLASSES,
  46  } from "@/lib/ui";
  47  
  48  const fmtMoney = fmtAmountOrDash;
  49  
  50  type PlanForm = { name: string; notes: string };
  51  const emptyPlanForm: PlanForm = { name: "", notes: "" };
  52  
  53  type EntryForm = { paid_on: string; amount: string };
  54  const emptyEntryForm = (): EntryForm => ({ paid_on: toIsoDateLocal(new Date()), amount: "" });
  55  
  56  function toEntryBody(f: EntryForm) {
  57    const amount = parseFormNumber(f.amount);
  58    if (amount == null || amount < 0) throw new Error("Amount must be a non-negative number.");
  59    const paid_on = f.paid_on.trim();
  60    if (!/^\d{4}-\d{2}-\d{2}$/.test(paid_on)) throw new Error("Pick the date the payment was made.");
  61    return { paid_on, amount };
  62  }
  63  
  64  const plural = (n: number, word: string) => `${fmtCount(n)} ${word}${n === 1 ? "" : "s"}`;
  65  
  66  const ENTRY_GRID_CLASSES =
  67    "grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end";
  68  
  69  export default function HousePaymentsClient() {
  70    const [rows, setRows] = useState<HousePaymentRow[]>([]);
  71    const [loading, setLoading] = useState(true);
  72    const [saving, setSaving] = useState(false);
  73    const [error, setError] = useState<string | null>(null);
  74  
  75    const [planForm, setPlanForm] = useState<PlanForm>(emptyPlanForm);
  76    const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  77    const [planModalOpen, setPlanModalOpen] = useState(false);
  78  
  79    const [payPlanId, setPayPlanId] = useState<string | null>(null);
  80    const [payForm, setPayForm] = useState<EntryForm>(emptyEntryForm());
  81    const [paying, setPaying] = useState(false);
  82    const [payError, setPayError] = useState<string | null>(null);
  83    const [lastAdded, setLastAdded] = useState<string | null>(null);
  84  
  85    const [entriesModalId, setEntriesModalId] = useState<string | null>(null);
  86    const [detail, setDetail] = useState<HousePaymentDetailResponse | null>(null);
  87    const [detailLoading, setDetailLoading] = useState(false);
  88  
  89    const [entryForm, setEntryForm] = useState<EntryForm>(emptyEntryForm());
  90    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  91    const [savingEntry, setSavingEntry] = useState(false);
  92  
  93    const load = useCallback(async () => {
  94      setError(null);
  95      try {
  96        const r = await getHousePayments(500);
  97        setRows(r.house_payments);
  98      } catch (e) {
  99        setError(e instanceof Error ? e.message : "Failed to load");
 100        setRows([]);
 101      } finally {
 102        setLoading(false);
 103      }
 104    }, []);
 105  
 106    const summary = useMemo(
 107      () => ({
 108        sum_total_paid: rows.reduce((s, r) => s + (r.total_paid || 0), 0),
 109        total_entries: rows.reduce((s, r) => s + (r.entry_count || 0), 0),
 110        plan_count: rows.length,
 111        last_paid_on: rows.reduce<string | null>(
 112          (m, r) => (r.last_paid_on && (!m || r.last_paid_on > m) ? r.last_paid_on : m),
 113          null,
 114        ),
 115      }),
 116      [rows],
 117    );
 118  
 119    const payPlan =
 120      rows.find((r) => r.id === payPlanId) ??
 121      rows.find((r) => r.last_paid_on === summary.last_paid_on) ??
 122      rows[0];
 123  
 124    const upsertRow = useCallback((row: HousePaymentRow) => {
 125      setRows((rs) => {
 126        const i = rs.findIndex((r) => r.id === row.id);
 127        if (i === -1) return [row, ...rs];
 128        const out = rs.slice();
 129        out[i] = row;
 130        return out;
 131      });
 132    }, []);
 133  
 134    const removeRow = useCallback((id: string) => {
 135      setRows((rs) => rs.filter((r) => r.id !== id));
 136    }, []);
 137  
 138    useEffect(() => {
 139      void load();
 140    }, [load]);
 141  
 142    const openNewPlan = () => {
 143      setError(null);
 144      setEditingPlanId(null);
 145      setPlanForm(emptyPlanForm);
 146      setPlanModalOpen(true);
 147    };
 148  
 149    const closePlanModal = useCallback(() => {
 150      setPlanModalOpen(false);
```

## Outgoing connections
- dispatch -> routers/house_payment.py (be:router:house_payment)
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
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- none
