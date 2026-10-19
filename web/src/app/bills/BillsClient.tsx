"use client";

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
  type BillCategoryRow,
  type BillPdfFields,
  type BillRow,
} from "@/lib/api";
import { formatDate } from "@/lib/dateFormat";
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

type CategoryDraft = { id: number | null; name: string };
type BillDraft = { id: number | null; hasPdf: boolean; form: BillForm; file: File | null; note: string | null };

const FILE_INPUT_CLASSES =
  "block w-full text-sm text-ink-3 file:mr-3 file:h-9 file:cursor-pointer file:rounded-lg file:border file:border-solid file:border-line-strong file:bg-surface file:px-3 file:text-sm file:font-medium file:text-ink-2 hover:file:bg-surface-2 disabled:opacity-60";

const plural = (n: number, word: string) => `${fmtCount(n)} ${word}${n === 1 ? "" : "s"}`;

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

function newBillDraft(categoryId: number): BillDraft {
  return {
    id: null,
    hasPdf: false,
    file: null,
    note: null,
    form: {
      category_id: String(categoryId),
      bill_date: "",
      due_date: "",
      period_start: "",
      period_end: "",
      amount: "",
    },
  };
}

function editBillDraft(b: BillRow): BillDraft {
  return {
    id: b.id,
    hasPdf: b.has_pdf,
    file: null,
    note: null,
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
  const amount = parseFormNumber(f.amount);
  if (f.amount.trim() !== "" && (amount == null || amount < 0)) {
    throw new Error("Amount must be a non-negative number.");
  }
  return {
    category_id: Number(f.category_id),
    bill_date: f.bill_date,
    due_date: f.due_date,
    period_start: f.period_start,
    period_end: f.period_end,
    amount,
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

// Only fills fields that are still empty, so nothing typed by hand gets overwritten.
function fillFromPdf(d: BillDraft, found: BillPdfFields): BillDraft {
  const f = d.form;
  const period =
    !f.period_start && !f.period_end && found.period_start && found.period_end
      ? { period_start: found.period_start, period_end: found.period_end }
      : {};
  const form: BillForm = {
    ...f,
    ...period,
    bill_date: f.bill_date || (found.bill_date ?? ""),
    due_date: f.due_date || (found.due_date ?? ""),
    amount: f.amount.trim() || (found.amount == null ? "" : formatAmountNumber(found.amount)),
  };
  const filled = PDF_FIELDS.filter(([key]) => !f[key] && form[key]).map(([, label]) => label);
  const missing = PDF_FIELDS.filter(([key]) => !form[key]).map(([, label]) => label);
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const res = await apiFetch(billPdfUrl(bill.id), { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load the PDF");
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (e) {
        if (!cancelled) setError(errorText(e, "Failed to load the PDF"));
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [bill.id]);

  return (
    <Modal open onClose={onClose} ariaLabelledBy="bill-pdf-title" dialogClassName={`${DIALOG_CLASSES} h-[90dvh] max-w-4xl`}>
      <ModalHeader id="bill-pdf-title" title={title} subtitle={`Due ${formatDate(bill.due_date)}`} onClose={onClose} />
      <div className={`${DIALOG_BODY_CLASSES} flex flex-col`}>
        {error ? (
          <ErrorAlert>{error}</ErrorAlert>
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
    const id = categoryDraft.id;
    const name = categoryDraft.name.trim();
    void submit(async () => {
      if (!name) throw new Error("Name is required.");
      await (id == null ? createBillCategory(name) : updateBillCategory(id, name));
    }, closeCategory);
  };

  const removeCategory = () => {
    const id = categoryDraft?.id;
    if (id == null) return;
    const count = bills.filter((b) => b.category_id === id).length;
    const name = nameOf(id);
    if (!confirm(count > 0 ? `Delete ${name} and its ${plural(count, "bill")}?` : `Delete ${name}?`)) return;
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

  const removeBill = () => {
    const id = billDraft?.id;
    if (id == null || !confirm("Delete this bill and its PDF?")) return;
    void submit(() => deleteBill(id), closeBill);
  };

  const setForm = (patch: Partial<BillForm>) =>
    setBillDraft((d) => d && { ...d, form: { ...d.form, ...patch } });

  const readPdf = async (file: File) => {
    setBillDraft((d) => d && { ...d, note: "Reading the PDF…" });
    let apply: (d: BillDraft) => BillDraft;
    try {
      const found = await readBillPdf(file);
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
        description="Every bill's PDF, with its bill date, billing period and due date."
        actions={
          <>
            <button
              type="button"
              className={categories.length === 0 ? PRIMARY_BUTTON_CLASSES : SECONDARY_BUTTON_CLASSES}
              onClick={() => openCategory({ id: null, name: "" })}
            >
              <PlusIcon className="size-4" />
              New category
            </button>
            {categories.length > 0 && (
              <button
                type="button"
                className={PRIMARY_BUTTON_CLASSES}
                onClick={() => openBill(newBillDraft(categories[0].id))}
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
                    <button type="button" className={TEXT_BUTTON_CLASSES} onClick={() => openBill(newBillDraft(c.id))}>
                      <PlusIcon className="size-4" />
                      Add
                    </button>
                    <IconAction
                      kind="edit"
                      label={`Edit ${c.name}`}
                      onClick={() => openCategory({ id: c.id, name: c.name })}
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
                            <span className="font-medium text-ink">Due {formatDate(b.due_date)}</span>
                            {b.amount != null && (
                              <span className="font-semibold tabular-nums text-ink">{fmtAmountOrDash(b.amount)}</span>
                            )}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-3">
                            Billed {formatDate(b.bill_date)} · Period {formatDate(b.period_start)} –{" "}
                            {formatDate(b.period_end)}
                          </p>
                        </div>
                        <div className="-my-1 flex shrink-0 items-center">
                          {b.has_pdf && (
                            <button
                              type="button"
                              className={TEXT_BUTTON_CLASSES}
                              aria-label={`View PDF of the bill due ${formatDate(b.due_date)}`}
                              onClick={() => setPdfBill(b)}
                            >
                              <DocumentIcon className="size-4" />
                              PDF
                            </button>
                          )}
                          <IconAction
                            kind="edit"
                            label={`Edit the bill due ${formatDate(b.due_date)}`}
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
        dialogClassName={`${DIALOG_CLASSES} max-w-md`}
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
                    onChange={(e) => setForm({ category_id: e.target.value })}
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
                  label="PDF"
                  hint={
                    billDraft.note ??
                    (billDraft.hasPdf
                      ? "A PDF is attached. Choose a file only to replace it."
                      : "Optional. The dates and amount fill in from it when they can be read.")
                  }
                >
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className={FILE_INPUT_CLASSES}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setBillDraft((d) => d && { ...d, file, note: null });
                      if (file) void readPdf(file);
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
