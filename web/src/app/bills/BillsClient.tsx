"use client";

import { confirmDialog } from "@/components/ConfirmDialog";
import { useCallback, useEffect, useState } from "react";
import { AmountInput } from "@/components/AmountInput";
import { DatePickerField } from "@/components/DatePickerField";
import { DateRangePickerField } from "@/components/DateRangePickerField";
import { ErrorAlert } from "@/components/ErrorAlert";
import {
  DANGER_TEXT_BUTTON_CLASSES,
  DIALOG_BODY_CLASSES,
  DIALOG_CLASSES,
  DIALOG_FOOTER_CLASSES,
  EmptyState,
  Field,
  LoadingBlocks,
  ModalHeader,
  Panel,
  Segmented,
  TEXT_BUTTON_CLASSES,
  TILE_BUTTON_CLASSES,
} from "@/components/FinanceUI";
import { PlusIcon, ReceiptIcon } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import {
  apiFetch,
  billPdfUrl,
  createBill,
  createBillCategory,
  deleteBill,
  deleteBillCategory,
  getBills,
  getMonthlyExpenses,
  getPayPeriodStartOverrides,
  readBillPdf,
  updateBill,
  updateBillCategory,
  uploadBillPdf,
  type BillBody,
  type BillCategoryBody,
  type BillCategoryRow,
  type BillDefaults,
  type BillPdfFields,
  type BillRow,
  type MonthlyExpenseRow,
  type RelativeDay,
} from "@/lib/api";
import { BillYearBlock } from "./BillYearBlock";
import { addMonths, formatMonthYear, parseDateOnlyLocal, toIsoDateLocal } from "@/lib/dateFormat";
import { fmtCount } from "@/lib/formatNumber";
import { formatAmountNumber, parseFormNumber } from "@/lib/parseFormNumber";
import { periodKey, spreadExpenseChanges } from "@/lib/payPeriods";
import {
  FILE_INPUT_CLASSES,
  INPUT_CLASSES,
  PAGE_CONTAINER_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SECONDARY_BUTTON_CLASSES,
} from "@/lib/ui";

type BillForm = {
  category_id: string;
  bill_date: string;
  due_date: string;
  period_start: string;
  period_end: string;
  amount: string;
  minimum_due: string;
};

type DateKey = "bill_date" | "due_date" | "period_start" | "period_end";

// `form` shows the defaults as dates for a bill added this month; `saved` is what they were when opened.
type CategoryDraft = { id: string | null; name: string; is_credit_card: boolean; saved: BillDefaults; form: BillForm };

// `preset` is what the category's defaults put in the form, so a PDF or another category may still replace it.
type BillDraft = {
  id: string | null;
  hasPdf: boolean;
  form: BillForm;
  file: File | null;
  note: string | null;
  preset: Partial<BillForm>;
  anchor?: Date; // the month a new bill's defaults are counted from
};

const plural = (n: number, word: string) => `${fmtCount(n)} ${word}${n === 1 ? "" : "s"}`;

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

const billMonth = (b: BillRow) => formatMonthYear(Number(b.bill_date.slice(0, 4)), Number(b.bill_date.slice(5, 7)));

const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

// Negative is fine: a credit card statement can carry a credit balance.
function parseAmount(s: string, label = "Amount"): number | null {
  const amount = parseFormNumber(s);
  if (s.trim() !== "" && amount == null) throw new Error(`${label} must be a number.`);
  return amount;
}

const billYear = (b: BillRow) => Number(b.bill_date.slice(0, 4));

// Each year that has bills (plus any in `include`), newest first, with how many it has.
function yearCounts(list: BillRow[], include: number[] = []): [number, number][] {
  const counts = new Map(include.map((y) => [y, 0]));
  for (const b of list) counts.set(billYear(b), (counts.get(billYear(b)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[0] - a[0]);
}

// A day past the end of its month lands on that month's last day.
function resolveDay(r: RelativeDay | null | undefined, today: Date): string {
  if (!r) return "";
  const { y, m } = addMonths(today.getFullYear(), today.getMonth() + 1, r.months);
  return toIsoDateLocal(new Date(y, m - 1, Math.min(r.day, new Date(y, m, 0).getDate())));
}

// A picked date as months from this month plus its day; a month's last day stays the last day.
function toRelativeDay(iso: string, today: Date): RelativeDay | null {
  const d = parseDateOnlyLocal(iso);
  if (!d) return null;
  const months = (d.getFullYear() - today.getFullYear()) * 12 + d.getMonth() - today.getMonth();
  if (Math.abs(months) > 2) throw new Error("Pick default dates within 2 months of this month.");
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return { months, day: d.getDate() === last ? 31 : d.getDate() };
}

function presetForm(categoryId: string, d: BillDefaults = {}, today = new Date()): BillForm {
  return {
    category_id: categoryId,
    bill_date: resolveDay(d.bill_date, today),
    due_date: resolveDay(d.due_date, today),
    period_start: resolveDay(d.period_start, today),
    period_end: resolveDay(d.period_end, today),
    amount: d.amount == null ? "" : formatAmountNumber(d.amount),
    minimum_due: "",
  };
}

function newBillDraft(c: BillCategoryRow, anchor = new Date()): BillDraft {
  const form = presetForm(c.id, c.defaults, anchor);
  return { id: null, hasPdf: false, file: null, note: null, form, preset: form, anchor };
}

// Empty, or still holding the category's default.
const untouched = (d: BillDraft, key: keyof BillForm) => !d.form[key].trim() || d.form[key] === d.preset[key];

// A new bill takes the picked category's defaults wherever it still holds the old one's.
function switchCategory(d: BillDraft, c: BillCategoryRow): BillDraft {
  const preset = d.id == null ? presetForm(c.id, c.defaults, d.anchor) : {};
  const form = { ...d.form };
  for (const [key, value] of Object.entries(preset) as [keyof BillForm, string][]) {
    if (untouched(d, key)) form[key] = value;
  }
  return { ...d, form: { ...form, category_id: c.id }, preset };
}

function toCategoryDraft(c: BillCategoryRow | null): CategoryDraft {
  const saved = c?.defaults ?? {};
  return {
    id: c?.id ?? null,
    name: c?.name ?? "",
    is_credit_card: c?.is_credit_card ?? false,
    saved,
    form: presetForm(c?.id ?? "", saved),
  };
}

function toCategoryBody(c: CategoryDraft): BillCategoryBody {
  const name = c.name.trim();
  if (!name) throw new Error("Name is required.");
  const today = new Date();
  // A date left as shown keeps its saved day, which this month may have cut short (the 31st shows as the 30th).
  const day = (key: DateKey) =>
    c.form[key] === resolveDay(c.saved[key], today) ? (c.saved[key] ?? null) : toRelativeDay(c.form[key], today);
  return {
    name,
    is_credit_card: c.is_credit_card,
    defaults: {
      bill_date: day("bill_date"),
      due_date: day("due_date"),
      period_start: day("period_start"),
      period_end: day("period_end"),
      amount: parseAmount(c.form.amount),
    },
  };
}

function BillDateFields({
  form,
  onChange,
  disabled,
  clearLabel,
  showMinimumDue,
}: {
  form: BillForm;
  onChange: (patch: Partial<BillForm>) => void;
  disabled: boolean;
  clearLabel?: string;
  showMinimumDue?: boolean;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bill date">
          <DatePickerField
            value={form.bill_date}
            onChange={(v) => onChange({ bill_date: v })}
            disabled={disabled}
            clearLabel={clearLabel}
          />
        </Field>
        <Field label="Due date">
          <DatePickerField
            value={form.due_date}
            onChange={(v) => onChange({ due_date: v })}
            disabled={disabled}
            clearLabel={clearLabel}
          />
        </Field>
      </div>
      <Field label="Billing period">
        <DateRangePickerField
          startValue={form.period_start}
          endValue={form.period_end}
          onChange={(start, end) => onChange({ period_start: start, period_end: end })}
          disabled={disabled}
          placeholder="First and last day"
          clearLabel={clearLabel}
        />
      </Field>
      <div className={showMinimumDue ? "grid gap-4 sm:grid-cols-2" : "grid"}>
        <Field label="Amount" hint="Optional">
          <AmountInput
            placeholder="0.00"
            value={form.amount}
            onChange={(v) => onChange({ amount: v })}
            disabled={disabled}
          />
        </Field>
        {showMinimumDue && (
          <Field label="Minimum amount due" hint="Optional">
            <AmountInput
              placeholder="0.00"
              value={form.minimum_due}
              onChange={(v) => onChange({ minimum_due: v })}
              disabled={disabled}
            />
          </Field>
        )}
      </div>
    </>
  );
}

function editBillDraft(b: BillRow): BillDraft {
  return {
    id: b.id,
    hasPdf: b.has_pdf,
    file: null,
    note: null,
    preset: {},
    form: {
      category_id: b.category_id,
      bill_date: b.bill_date,
      due_date: b.due_date,
      period_start: b.period_start,
      period_end: b.period_end,
      amount: b.amount == null ? "" : formatAmountNumber(b.amount),
      minimum_due: b.minimum_due == null ? "" : formatAmountNumber(b.minimum_due),
    },
  };
}

function toBillBody(f: BillForm, isCreditCard: boolean): BillBody {
  if (!f.bill_date) throw new Error("Pick the bill date.");
  if (!f.due_date) throw new Error("Pick the due date.");
  if (!f.period_start || !f.period_end) throw new Error("Pick the first and last day of the billing period.");
  return {
    category_id: f.category_id,
    bill_date: f.bill_date,
    due_date: f.due_date,
    period_start: f.period_start,
    period_end: f.period_end,
    amount: parseAmount(f.amount),
    minimum_due: isCreditCard ? parseMinimumDue(f.minimum_due) : null,
  };
}

function parseMinimumDue(s: string): number | null {
  const due = parseAmount(s, "Minimum amount due");
  if (due != null && due < 0) throw new Error("Minimum amount due can't be negative.");
  return due;
}

const PDF_FIELDS = [
  ["bill_date", "bill date"],
  ["due_date", "due date"],
  ["period_start", "billing period"],
  ["amount", "amount"],
] as const;
const AND_LIST = new Intl.ListFormat("en", { type: "conjunction" });
const OR_LIST = new Intl.ListFormat("en", { type: "disjunction" });

// Only fills fields that are empty or hold a category default, so nothing typed by hand gets overwritten.
function fillFromPdf(d: BillDraft, found: BillPdfFields): BillDraft {
  const f = d.form;
  const free = (key: keyof BillForm) => untouched(d, key);
  const period =
    free("period_start") && free("period_end") && found.period_start && found.period_end
      ? { period_start: found.period_start, period_end: found.period_end }
      : {};
  const form: BillForm = {
    ...f,
    ...period,
    bill_date: (free("bill_date") && found.bill_date) || f.bill_date,
    due_date: (free("due_date") && found.due_date) || f.due_date,
    amount: free("amount") && found.amount != null ? formatAmountNumber(found.amount) : f.amount,
    minimum_due:
      free("minimum_due") && found.minimum_due != null ? formatAmountNumber(found.minimum_due) : f.minimum_due,
  };
  const read = {
    bill_date: !!found.bill_date,
    due_date: !!found.due_date,
    period_start: "period_start" in period,
    amount: found.amount != null,
  };
  const filled: string[] = PDF_FIELDS.filter(([key]) => free(key) && read[key]).map(([, label]) => label);
  // Only card statements print a minimum due, so it's never reported missing.
  if (free("minimum_due") && found.minimum_due != null) filled.push("minimum amount due");
  const missing = PDF_FIELDS.filter(([key]) => free(key) && !read[key]).map(([, label]) => label);
  const kind = d.file && !isPdf(d.file) ? "photo" : "PDF";
  let note: string | null = null;
  if (filled.length > 0) {
    const gaps = missing.length > 0 ? `, but couldn't find the ${OR_LIST.format(missing)}` : "";
    note = `Filled in the ${AND_LIST.format(filled)} from the ${kind}${gaps}. Check before saving.`;
  } else if (missing.length > 0) {
    note = `Couldn't find the ${OR_LIST.format(missing)} in this ${kind}.`;
  }
  return { ...d, form, note };
}

function BillPdfModal({ bill, title, onClose }: { bill: BillRow; title: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [isImage, setIsImage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const res = await apiFetch(billPdfUrl(bill.id), { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load the file");
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setIsImage(blob.type.startsWith("image/"));
        setUrl(objectUrl);
      } catch (e) {
        if (!cancelled) setError(errorText(e, "Failed to load the file"));
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [bill.id]);

  return (
    <Modal open onClose={onClose} ariaLabelledBy="bill-pdf-title" dialogClassName={`${DIALOG_CLASSES} h-[90dvh] max-w-4xl`}>
      <ModalHeader id="bill-pdf-title" title={title} subtitle={billMonth(bill)} onClose={onClose} />
      <div className={`${DIALOG_BODY_CLASSES} flex flex-col`}>
        {error ? (
          <ErrorAlert>{error}</ErrorAlert>
        ) : url && isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob URL, nothing for next/image to optimise
          <img src={url} alt={`${title}, ${billMonth(bill)}`} className="mx-auto min-h-0 max-w-full flex-1 rounded-lg object-contain" />
        ) : url ? (
          <iframe src={url} title={`${title} PDF`} className="min-h-0 w-full flex-1 rounded-lg border border-line bg-surface-2" />
        ) : (
          <div role="status" aria-label="Loading PDF" className="flex-1 animate-pulse rounded-lg bg-surface-2" />
        )}
      </div>
      <div className={DIALOG_FOOTER_CLASSES}>
        <a
          href={url ?? undefined}
          target="_blank"
          rel="noreferrer"
          className={`${SECONDARY_BUTTON_CLASSES}${url ? "" : " pointer-events-none opacity-50"}`}
        >
          Open in new tab
        </a>
      </div>
    </Modal>
  );
}

export default function BillsClient() {
  const [categories, setCategories] = useState<BillCategoryRow[]>([]);
  const [bills, setBills] = useState<BillRow[]>([]);
  const [expenses, setExpenses] = useState<MonthlyExpenseRow[]>([]);
  const [payPeriodStarts, setPayPeriodStarts] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null);
  const [billDraft, setBillDraft] = useState<BillDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [pdfBill, setPdfBill] = useState<BillRow | null>(null);
  const [listView, setListView] = useState<{ categoryId: string; year: number | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, monthly, starts] = await Promise.all([
        getBills(),
        getMonthlyExpenses().catch(() => ({ expenses: [] })),
        getPayPeriodStartOverrides().catch(() => ({ overrides: [] })),
      ]);
      setCategories(r.categories);
      setBills(r.bills);
      setExpenses(monthly.expenses);
      setPayPeriodStarts(
        new Map(starts.overrides.map((o) => [periodKey(o.period_year, o.period_month, o.period_half), o.start_date])),
      );
      setError(null);
      return r.bills;
    } catch (e) {
      setError(errorText(e, "Failed to load bills"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closeCategory = useCallback(() => setCategoryDraft(null), []);
  const closeBill = useCallback(() => setBillDraft(null), []);
  const closePdf = useCallback(() => setPdfBill(null), []);
  const closeList = useCallback(() => setListView(null), []);

  const listCategory = listView && categories.find((c) => c.id === listView.categoryId);
  const listBills = listCategory ? bills.filter((b) => b.category_id === listCategory.id) : [];
  // The calendar always has this year, so its months can be filled in before it has a bill.
  const listYears = yearCounts(listBills, [new Date().getFullYear()]);
  // A year whose last bill was deleted falls back to every year.
  const listYear = listView?.year != null && listYears.some(([y]) => y === listView.year) ? listView.year : null;
  const shownBills = listYear == null ? listBills : listBills.filter((b) => billYear(b) === listYear);

  const openCategory = (draft: CategoryDraft) => {
    setModalError(null);
    setCategoryDraft(draft);
  };

  const openBill = (draft: BillDraft) => {
    setModalError(null);
    setBillDraft(draft);
  };

  const nameOf = (categoryId: string) => categories.find((c) => c.id === categoryId)?.name ?? "Bill";
  const isCreditCard = (categoryId: string) => !!categories.find((c) => c.id === categoryId)?.is_credit_card;

  // Refreshes from the server even when the action fails: a new bill may have saved before its PDF upload didn't.
  const submit = async (action: () => Promise<unknown>, close: () => void) => {
    setSaving(true);
    setModalError(null);
    try {
      await action();
      close();
    } catch (e) {
      setModalError(errorText(e, "Save failed"));
    } finally {
      setSaving(false);
    }
    const billsBefore = bills;
    const billsAfter = await load();
    // A real bill replaces a linked monthly expense's estimate, which moves the budget.
    if (billsAfter) {
      const linked = expenses.filter((x) => x.bill_category_id != null).map((x) => ({ before: x, after: x }));
      await spreadExpenseChanges(payPeriodStarts, linked, billsBefore, billsAfter).catch(() =>
        setError("The bill is saved, but the calendar's daily amounts didn't update. Use Even out on the calendar."),
      );
    }
  };

  const saveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryDraft) return;
    const draft = categoryDraft;
    void submit(async () => {
      const body = toCategoryBody(draft);
      await (draft.id == null ? createBillCategory(body) : updateBillCategory(draft.id, body));
    }, closeCategory);
  };

  const setCategoryForm = (patch: Partial<BillForm>) =>
    setCategoryDraft((d) => d && { ...d, form: { ...d.form, ...patch } });

  const removeCategory = async () => {
    const id = categoryDraft?.id;
    if (id == null) return;
    const count = bills.filter((b) => b.category_id === id).length;
    const name = nameOf(id);
    if (!(await confirmDialog(count > 0 ? `Delete ${name} and its ${plural(count, "bill")}?` : `Delete ${name}?`))) return;
    void submit(() => deleteBillCategory(id), closeCategory);
  };

  const saveBill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!billDraft) return;
    const { form, file } = billDraft;
    void submit(async () => {
      const body = toBillBody(form, isCreditCard(form.category_id));
      let id = billDraft.id;
      if (id == null) {
        id = (await createBill(body)).bill.id;
        // If the PDF upload below fails, retrying updates this bill instead of adding a second one.
        setBillDraft((d) => d && { ...d, id });
      } else {
        await updateBill(id, body);
      }
      if (file) await uploadBillPdf(id, file);
    }, closeBill);
  };

  const removeBill = async () => {
    const id = billDraft?.id;
    if (id == null || !(await confirmDialog("Delete this bill and its file?"))) return;
    void submit(() => deleteBill(id), closeBill);
  };

  const setForm = (patch: Partial<BillForm>) =>
    setBillDraft((d) => d && { ...d, form: { ...d.form, ...patch } });

  const readPdf = async (file: File, categoryId: string) => {
    setBillDraft((d) => d && { ...d, note: isPdf(file) ? "Reading the PDF…" : "Reading the photo…" });
    let apply: (d: BillDraft) => BillDraft;
    try {
      const found = await readBillPdf(file, categoryId);
      apply = (d) => fillFromPdf(d, found);
    } catch (e) {
      const note = errorText(e, "Couldn't read this file.");
      apply = (d) => ({ ...d, note });
    }
    // Ignore the result if the form was closed or another file was picked meanwhile.
    setBillDraft((d) => (d && d.file === file ? apply(d) : d));
  };

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="Bills"
        description="Every bill's PDF or photo, with its bill date, billing period and due date."
        actions={
          <>
            <button
              type="button"
              className={categories.length === 0 ? PRIMARY_BUTTON_CLASSES : SECONDARY_BUTTON_CLASSES}
              onClick={() => openCategory(toCategoryDraft(null))}
            >
              <PlusIcon className="size-4" />
              New category
            </button>
            {categories.length > 0 && (
              <button
                type="button"
                className={PRIMARY_BUTTON_CLASSES}
                onClick={() => openBill(newBillDraft(categories[0]))}
              >
                <PlusIcon className="size-4" />
                Add bill
              </button>
            )}
          </>
        }
      />

      {error && <ErrorAlert>{error}</ErrorAlert>}

      {loading ? (
        <LoadingBlocks label="Loading bills…" rows={2} />
      ) : categories.length === 0 ? (
        <EmptyState icon={<ReceiptIcon className="size-6" />} title="No categories yet">
          Add one for each kind of bill, like Electricity, Internet or Credit Card, with{" "}
          <strong className="font-medium text-ink-2">New category</strong>. Then add each bill under it.
        </EmptyState>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map((c) => {
            const list = bills.filter((b) => b.category_id === c.id);
            return (
              <Panel
                key={c.id}
                className="relative transition-colors duration-150 hover:bg-surface-2/60"
                title={
                  // Its overlay makes the whole card open the bills; the actions sit above it.
                  <button
                    type="button"
                    className={TILE_BUTTON_CLASSES}
                    onClick={() => setListView({ categoryId: c.id, year: null })}
                  >
                    {c.name}
                  </button>
                }
                actions={
                  <div className="relative flex items-center gap-2">
                    <button type="button" className={TEXT_BUTTON_CLASSES} onClick={() => openBill(newBillDraft(c))}>
                      <PlusIcon className="size-4" />
                      Add
                    </button>
                  </div>
                }
              >
                <p className="text-sm text-ink-3">
                  {list.length === 0 ? "No bills yet." : `${plural(list.length, "bill")} · latest ${billMonth(list[0])}`}
                </p>
              </Panel>
            );
          })}
        </div>
      )}

      <Modal
        open={listCategory != null}
        // Escape reaches every open modal; leave this one open under an edit or PDF on top of it.
        onClose={billDraft || pdfBill || categoryDraft ? () => {} : closeList}
        ariaLabelledBy="bill-list-title"
        dialogClassName={`${DIALOG_CLASSES} max-w-5xl`}
      >
        {listCategory && (
          <>
            <ModalHeader
              id="bill-list-title"
              title={listYear == null ? listCategory.name : `${listCategory.name} · ${listYear}`}
              subtitle={plural(shownBills.length, "bill")}
              onClose={closeList}
            />
            <div className={`${DIALOG_BODY_CLASSES} grid gap-5`}>
              <Segmented
                label="Year"
                className="max-w-full self-start overflow-x-auto"
                value={listYear ?? "all"}
                onChange={(y) => setListView({ categoryId: listCategory.id, year: y === "all" ? null : y })}
                options={[["all", listBills.length] as const, ...listYears].map(([y, n]) => ({
                  value: y,
                  label: (
                    <>
                      {y === "all" ? "All" : y}
                      <span className="tabular-nums opacity-70">{n}</span>
                    </>
                  ),
                }))}
              />
              {(listYear == null ? listYears.map(([y]) => y) : [listYear]).map((y) => (
                <BillYearBlock
                  key={y}
                  year={y}
                  bills={shownBills.filter((b) => billYear(b) === y)}
                  onAdd={(month) => openBill(newBillDraft(listCategory, new Date(y, month - 1, 1)))}
                  onEdit={(b) => openBill(editBillDraft(b))}
                  onView={setPdfBill}
                />
              ))}
            </div>
            <div className={DIALOG_FOOTER_CLASSES}>
              <button
                type="button"
                className={`mr-auto ${SECONDARY_BUTTON_CLASSES}`}
                onClick={() => openCategory(toCategoryDraft(listCategory))}
              >
                Edit category
              </button>
              <button
                type="button"
                className={PRIMARY_BUTTON_CLASSES}
                onClick={() => openBill(newBillDraft(listCategory))}
              >
                <PlusIcon className="size-4" />
                Add bill
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={categoryDraft != null}
        onClose={closeCategory}
        ariaLabelledBy="bill-category-title"
        dialogClassName={`${DIALOG_CLASSES} max-w-lg`}
      >
        {categoryDraft && (
          <>
            <ModalHeader
              id="bill-category-title"
              title={categoryDraft.id == null ? "New category" : "Edit category"}
              subtitle="A kind of bill, like Electricity, Internet or Credit Card."
              onClose={closeCategory}
            />
            <form onSubmit={saveCategory} className="flex min-h-0 flex-1 flex-col">
              <div className={`${DIALOG_BODY_CLASSES} grid gap-4`}>
                <Field label="Name">
                  <input
                    required
                    autoFocus
                    maxLength={100}
                    placeholder="e.g. Electricity"
                    className={INPUT_CLASSES}
                    value={categoryDraft.name}
                    onChange={(e) => setCategoryDraft({ ...categoryDraft, name: e.target.value })}
                    disabled={saving}
                  />
                </Field>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5 transition-colors duration-150 hover:bg-surface-2/60">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4"
                    checked={categoryDraft.is_credit_card}
                    onChange={(e) => setCategoryDraft({ ...categoryDraft, is_credit_card: e.target.checked })}
                    disabled={saving}
                  />
                  <span className="text-sm">
                    <span className="block font-medium text-ink">Credit card</span>
                    <span className="text-ink-3">Its bills also get a minimum amount due.</span>
                  </span>
                </label>
                <div className="grid gap-4 border-t border-line-soft pt-4">
                  <div>
                    <p className="text-sm font-medium text-ink">Defaults for new bills</p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {
                        "Optional. Pick them as they'd be for a bill added this month; later bills move by the same number of months. A month's last day stays the last day."
                      }
                    </p>
                  </div>
                  <BillDateFields form={categoryDraft.form} onChange={setCategoryForm} disabled={saving} clearLabel="Clear" />
                </div>
                {modalError && <ErrorAlert>{modalError}</ErrorAlert>}
              </div>
              <div className={DIALOG_FOOTER_CLASSES}>
                {categoryDraft.id != null && (
                  <button type="button" disabled={saving} className={DANGER_TEXT_BUTTON_CLASSES} onClick={removeCategory}>
                    Delete
                  </button>
                )}
                <button type="button" disabled={saving} className={SECONDARY_BUTTON_CLASSES} onClick={closeCategory}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} className={PRIMARY_BUTTON_CLASSES}>
                  {saving ? "Saving…" : categoryDraft.id == null ? "Create category" : "Save changes"}
                </button>
              </div>
            </form>
          </>
        )}
      </Modal>

      <Modal
        open={billDraft != null}
        onClose={closeBill}
        ariaLabelledBy="bill-title"
        dialogClassName={`${DIALOG_CLASSES} max-w-lg`}
      >
        {billDraft && (
          <>
            <ModalHeader
              id="bill-title"
              title={billDraft.id == null ? "Add bill" : "Edit bill"}
              onClose={closeBill}
            />
            <form onSubmit={saveBill} className="flex min-h-0 flex-1 flex-col">
              <div className={`${DIALOG_BODY_CLASSES} grid gap-4`}>
                <Field label="Category">
                  <select
                    className={INPUT_CLASSES}
                    value={billDraft.form.category_id}
                    onChange={(e) => {
                      const c = categories.find((x) => x.id === e.target.value);
                      if (c) setBillDraft((d) => d && switchCategory(d, c));
                    }}
                    disabled={saving}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="PDF or photo"
                  hint={
                    billDraft.note ??
                    (billDraft.hasPdf
                      ? "A file is attached. Choose another only to replace it."
                      : "Optional. Fills in the dates and amount it can read from a PDF, PNG or JPG.")
                  }
                >
                  <input
                    type="file"
                    accept="application/pdf,.pdf,image/png,.png,image/jpeg,.jpg,.jpeg"
                    className={FILE_INPUT_CLASSES}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setBillDraft((d) => d && { ...d, file, note: null });
                      if (file) void readPdf(file, billDraft.form.category_id);
                    }}
                    disabled={saving}
                  />
                </Field>
                <BillDateFields
                  form={billDraft.form}
                  onChange={setForm}
                  disabled={saving}
                  showMinimumDue={isCreditCard(billDraft.form.category_id)}
                />
                {modalError && <ErrorAlert>{modalError}</ErrorAlert>}
              </div>
              <div className={DIALOG_FOOTER_CLASSES}>
                {billDraft.id != null && (
                  <button type="button" disabled={saving} className={DANGER_TEXT_BUTTON_CLASSES} onClick={removeBill}>
                    Delete
                  </button>
                )}
                <button type="button" disabled={saving} className={SECONDARY_BUTTON_CLASSES} onClick={closeBill}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} className={PRIMARY_BUTTON_CLASSES}>
                  {saving ? "Saving…" : billDraft.id == null ? "Add bill" : "Save changes"}
                </button>
              </div>
            </form>
          </>
        )}
      </Modal>

      {pdfBill && <BillPdfModal bill={pdfBill} title={`${nameOf(pdfBill.category_id)} bill`} onClose={closePdf} />}
    </div>
  );
}
