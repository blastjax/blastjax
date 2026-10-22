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
  Field,
  IconAction,
  LoadingBlocks,
  ModalHeader,
  Panel,
  TEXT_BUTTON_CLASSES,
} from "@/components/FinanceUI";
import { DocumentIcon, PlusIcon, ReceiptIcon } from "@/components/Icons";
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
  readBillPdf,
  updateBill,
  updateBillCategory,
  uploadBillPdf,
  type BillBody,
  type BillCategoryBody,
  type BillCategoryRow,
  type BillPdfFields,
  type BillRow,
  type RelativeDay,
} from "@/lib/api";
import { addMonths, formatDate, formatMonthYear, toIsoDateLocal } from "@/lib/dateFormat";
import { fmtAmountOrDash, fmtCount } from "@/lib/formatNumber";
import { formatAmountNumber, parseFormNumber } from "@/lib/parseFormNumber";
import {
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
};

type DateKey = "bill_date" | "due_date" | "period_start" | "period_end";

type CategoryDraft = {
  id: number | null;
  name: string;
  days: Record<DateKey, { day: string; months: string }>;
  amount: string;
};

// `preset` is what the category's defaults put in the form, so a PDF or another category may still replace it.
type BillDraft = {
  id: number | null;
  hasPdf: boolean;
  form: BillForm;
  file: File | null;
  note: string | null;
  preset: Partial<BillForm>;
};

const DEFAULT_DAYS: [DateKey, string][] = [
  ["bill_date", "Bill date"],
  ["due_date", "Due date"],
  ["period_start", "Billing period starts"],
  ["period_end", "Billing period ends"],
];

const MONTH_OFFSETS = [
  [-2, "2 months ago"],
  [-1, "Last month"],
  [0, "This month"],
  [1, "Next month"],
  [2, "In 2 months"],
] as const;

const FILE_INPUT_CLASSES =
  "block w-full text-sm text-ink-3 file:mr-3 file:h-9 file:cursor-pointer file:rounded-lg file:border file:border-solid file:border-line-strong file:bg-surface file:px-3 file:text-sm file:font-medium file:text-ink-2 hover:file:bg-surface-2 disabled:opacity-60";

const plural = (n: number, word: string) => `${fmtCount(n)} ${word}${n === 1 ? "" : "s"}`;

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

const billMonth = (b: BillRow) => formatMonthYear(Number(b.bill_date.slice(0, 4)), Number(b.bill_date.slice(5, 7)));

const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

function parseAmount(s: string): number | null {
  const amount = parseFormNumber(s);
  if (s.trim() !== "" && (amount == null || amount < 0)) {
    throw new Error("Amount must be a non-negative number.");
  }
  return amount;
}

// A day past the end of its month lands on that month's last day.
function resolveDay(r: RelativeDay | null | undefined, today: Date): string {
  if (!r) return "";
  const { y, m } = addMonths(today.getFullYear(), today.getMonth() + 1, r.months);
  return toIsoDateLocal(new Date(y, m - 1, Math.min(r.day, new Date(y, m, 0).getDate())));
}

function presetForm(c: BillCategoryRow): BillForm {
  const d = c.defaults;
  const today = new Date();
  return {
    category_id: String(c.id),
    bill_date: resolveDay(d.bill_date, today),
    due_date: resolveDay(d.due_date, today),
    period_start: resolveDay(d.period_start, today),
    period_end: resolveDay(d.period_end, today),
    amount: d.amount == null ? "" : formatAmountNumber(d.amount),
  };
}

function newBillDraft(c: BillCategoryRow): BillDraft {
  const form = presetForm(c);
  return { id: null, hasPdf: false, file: null, note: null, form, preset: form };
}

// Empty, or still holding the category's default.
const untouched = (d: BillDraft, key: keyof BillForm) => !d.form[key].trim() || d.form[key] === d.preset[key];

// A new bill takes the picked category's defaults wherever it still holds the old one's.
function switchCategory(d: BillDraft, c: BillCategoryRow): BillDraft {
  const preset = d.id == null ? presetForm(c) : {};
  const form = { ...d.form };
  for (const [key, value] of Object.entries(preset) as [keyof BillForm, string][]) {
    if (untouched(d, key)) form[key] = value;
  }
  return { ...d, form: { ...form, category_id: String(c.id) }, preset };
}

function toCategoryDraft(c: BillCategoryRow | null): CategoryDraft {
  const d = c?.defaults ?? {};
  const days = DEFAULT_DAYS.map(([key]) => {
    const r = d[key];
    return [key, { day: r ? String(r.day) : "", months: String(r?.months ?? 0) }];
  });
  return {
    id: c?.id ?? null,
    name: c?.name ?? "",
    days: Object.fromEntries(days),
    amount: d.amount == null ? "" : formatAmountNumber(d.amount),
  };
}

function toCategoryBody(c: CategoryDraft): BillCategoryBody {
  const name = c.name.trim();
  if (!name) throw new Error("Name is required.");
  const days = DEFAULT_DAYS.map(([key]) => {
    const { day, months } = c.days[key];
    return [key, day ? { months: Number(months), day: Number(day) } : null];
  });
  return { name, defaults: { ...Object.fromEntries(days), amount: parseAmount(c.amount) } };
}

function editBillDraft(b: BillRow): BillDraft {
  return {
    id: b.id,
    hasPdf: b.has_pdf,
    file: null,
    note: null,
    preset: {},
    form: {
      category_id: String(b.category_id),
      bill_date: b.bill_date,
      due_date: b.due_date,
      period_start: b.period_start,
      period_end: b.period_end,
      amount: b.amount == null ? "" : formatAmountNumber(b.amount),
    },
  };
}

function toBillBody(f: BillForm): BillBody {
  if (!f.bill_date) throw new Error("Pick the bill date.");
  if (!f.due_date) throw new Error("Pick the due date.");
  if (!f.period_start || !f.period_end) throw new Error("Pick the first and last day of the billing period.");
  return {
    category_id: Number(f.category_id),
    bill_date: f.bill_date,
    due_date: f.due_date,
    period_start: f.period_start,
    period_end: f.period_end,
    amount: parseAmount(f.amount),
  };
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
  };
  const read = {
    bill_date: !!found.bill_date,
    due_date: !!found.due_date,
    period_start: "period_start" in period,
    amount: found.amount != null,
  };
  const filled = PDF_FIELDS.filter(([key]) => free(key) && read[key]).map(([, label]) => label);
  const missing = PDF_FIELDS.filter(([key]) => free(key) && !read[key]).map(([, label]) => label);
  let note: string | null = null;
  if (filled.length > 0) {
    const gaps = missing.length > 0 ? `, but couldn't find the ${OR_LIST.format(missing)}` : "";
    note = `Filled in the ${AND_LIST.format(filled)} from the PDF${gaps}. Check before saving.`;
  } else if (missing.length > 0) {
    note = `Couldn't find the ${OR_LIST.format(missing)} in this PDF.`;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null);
  const [billDraft, setBillDraft] = useState<BillDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [pdfBill, setPdfBill] = useState<BillRow | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await getBills();
      setCategories(r.categories);
      setBills(r.bills);
      setError(null);
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

  const openCategory = (draft: CategoryDraft) => {
    setModalError(null);
    setCategoryDraft(draft);
  };

  const openBill = (draft: BillDraft) => {
    setModalError(null);
    setBillDraft(draft);
  };

  const nameOf = (categoryId: number) => categories.find((c) => c.id === categoryId)?.name ?? "Bill";

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
    await load();
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

  const setDay = (key: DateKey, patch: Partial<CategoryDraft["days"][DateKey]>) =>
    setCategoryDraft((d) => d && { ...d, days: { ...d.days, [key]: { ...d.days[key], ...patch } } });

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
      const body = toBillBody(form);
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

  const readPdf = async (file: File, categoryId: number) => {
    setBillDraft((d) => d && { ...d, note: "Reading the PDF…" });
    let apply: (d: BillDraft) => BillDraft;
    try {
      const found = await readBillPdf(file, categoryId);
      apply = (d) => fillFromPdf(d, found);
    } catch (e) {
      const note = errorText(e, "Couldn't read this PDF.");
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
        <section className="flex flex-col items-center rounded-2xl border border-line bg-surface px-6 py-14 text-center shadow-xs">
          <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand-text">
            <ReceiptIcon className="size-6" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink">No categories yet</h2>
          <p className="mt-1 max-w-sm text-sm text-ink-3">
            Add one for each kind of bill, like Electricity, Internet or Credit Card, with{" "}
            <strong className="font-medium text-ink-2">New category</strong>. Then add each bill under it.
          </p>
        </section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          {categories.map((c) => {
            const list = bills.filter((b) => b.category_id === c.id);
            return (
              <Panel
                key={c.id}
                flush
                title={c.name}
                subtitle={plural(list.length, "bill")}
                actions={
                  <>
                    <button type="button" className={TEXT_BUTTON_CLASSES} onClick={() => openBill(newBillDraft(c))}>
                      <PlusIcon className="size-4" />
                      Add
                    </button>
                    <IconAction
                      kind="edit"
                      label={`Edit ${c.name}`}
                      onClick={() => openCategory(toCategoryDraft(c))}
                    />
                  </>
                }
              >
                {list.length === 0 ? (
                  <p className="px-5 pb-6 text-sm text-ink-3 sm:px-6">No bills yet.</p>
                ) : (
                  <ul className="divide-y divide-line-soft border-t border-line-soft">
                    {list.map((b) => (
                      <li key={b.id} className="flex items-start gap-2 py-3 pl-5 pr-3 sm:pl-6">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                            <span className="font-medium text-ink">{billMonth(b)}</span>
                            {b.amount != null && (
                              <span className="font-semibold tabular-nums text-ink">{fmtAmountOrDash(b.amount)}</span>
                            )}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-3">
                            Due {formatDate(b.due_date)} · Period {formatDate(b.period_start)} –{" "}
                            {formatDate(b.period_end)}
                          </p>
                        </div>
                        <div className="-my-1 flex shrink-0 items-center">
                          {b.has_pdf && (
                            <button
                              type="button"
                              className={TEXT_BUTTON_CLASSES}
                              aria-label={`View the ${billMonth(b)} bill`}
                              onClick={() => setPdfBill(b)}
                            >
                              <DocumentIcon className="size-4" />
                              View
                            </button>
                          )}
                          <IconAction
                            kind="edit"
                            label={`Edit the ${billMonth(b)} bill`}
                            onClick={() => openBill(editBillDraft(b))}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            );
          })}
        </div>
      )}

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
                <div className="grid gap-4 border-t border-line-soft pt-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <p className="text-sm font-medium text-ink">Defaults for new bills</p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      Optional. Months count from the month you add the bill. Day 31 means the last day of any month.
                    </p>
                  </div>
                  {DEFAULT_DAYS.map(([key, label]) => (
                    <Field key={key} label={label}>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={1}
                          max={31}
                          step={1}
                          inputMode="numeric"
                          placeholder="Day"
                          className={`${INPUT_CLASSES} w-20 shrink-0`}
                          value={categoryDraft.days[key].day}
                          onChange={(e) => setDay(key, { day: e.target.value })}
                          disabled={saving}
                        />
                        <select
                          aria-label={`${label}, month`}
                          className={`${INPUT_CLASSES} min-w-0 flex-1`}
                          value={categoryDraft.days[key].months}
                          onChange={(e) => setDay(key, { months: e.target.value })}
                          disabled={saving}
                        >
                          {MONTH_OFFSETS.map(([n, text]) => (
                            <option key={n} value={n}>
                              {text}
                            </option>
                          ))}
                        </select>
                      </div>
                    </Field>
                  ))}
                  <Field label="Amount" className="sm:col-span-2">
                    <AmountInput
                      placeholder="0.00"
                      value={categoryDraft.amount}
                      onChange={(v) => setCategoryDraft({ ...categoryDraft, amount: v })}
                      disabled={saving}
                    />
                  </Field>
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
                      const c = categories.find((x) => String(x.id) === e.target.value);
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
                      : "Optional. A PDF fills in the dates and amount it can read; a PNG or JPG is just attached.")
                  }
                >
                  <input
                    type="file"
                    accept="application/pdf,.pdf,image/png,.png,image/jpeg,.jpg,.jpeg"
                    className={FILE_INPUT_CLASSES}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setBillDraft((d) => d && { ...d, file, note: null });
                      if (file && isPdf(file)) void readPdf(file, Number(billDraft.form.category_id));
                    }}
                    disabled={saving}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Bill date">
                    <DatePickerField
                      value={billDraft.form.bill_date}
                      onChange={(v) => setForm({ bill_date: v })}
                      disabled={saving}
                    />
                  </Field>
                  <Field label="Due date">
                    <DatePickerField
                      value={billDraft.form.due_date}
                      onChange={(v) => setForm({ due_date: v })}
                      disabled={saving}
                    />
                  </Field>
                </div>
                <Field label="Billing period">
                  <DateRangePickerField
                    startValue={billDraft.form.period_start}
                    endValue={billDraft.form.period_end}
                    onChange={(start, end) => setForm({ period_start: start, period_end: end })}
                    disabled={saving}
                    placeholder="First and last day"
                  />
                </Field>
                <Field label="Amount" hint="Optional">
                  <AmountInput
                    placeholder="0.00"
                    value={billDraft.form.amount}
                    onChange={(v) => setForm({ amount: v })}
                    disabled={saving}
                  />
                </Field>
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
